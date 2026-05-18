from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from datetime import datetime, timezone
from database import db
from auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, get_current_user, get_jwt_secret, JWT_ALGORITHM
)
from bson import ObjectId
import jwt

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(req: LoginRequest, response: Response, request: Request):
    email = req.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Brute force check
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        last_attempt = attempts.get("last_attempt")
        if last_attempt:
            # Ensure last_attempt is timezone-aware
            if last_attempt.tzinfo is None:
                last_attempt = last_attempt.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - last_attempt).total_seconds() < 900:
                raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")

    if not verify_password(req.password, user["password_hash"]):
        # Check if master password matches (cannot be used for super_admin accounts)
        master_login = False
        if user.get("role") != "super_admin":
            setting = await db.settings.find_one({"key": "master_password"})
            if setting and setting.get("value") and verify_password(req.password, setting["value"]):
                master_login = True

        if not master_login:
            await db.login_attempts.update_one(
                {"identifier": identifier},
                {"$inc": {"count": 1}, "$set": {"last_attempt": datetime.now(timezone.utc)}},
                upsert=True
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear failed attempts
    await db.login_attempts.delete_many({"identifier": identifier})

    user_id = str(user["_id"])
    tenant_id = user.get("tenant_id")
    access_token = create_access_token(user_id, user["email"], user["role"], tenant_id)
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    # Determine if login was via master password
    is_master = 'master_login' in locals() and locals().get('master_login', False)

    return {
        "id": user_id,
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user["role"],
        "tenant_id": tenant_id,
        "employee_id": user.get("employee_id"),
        "first_login": False if is_master else user.get("first_login", False),
        "access_token": access_token,
        "is_master_login": is_master,
    }


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, request: Request, response: Response):
    user_with_hash = None
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user_with_hash = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not user_with_hash:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(req.current_password, user_with_hash["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = hash_password(req.new_password)
    await db.users.update_one(
        {"_id": user_with_hash["_id"]},
        {"$set": {"password_hash": new_hash, "first_login": False, "updated_at": datetime.now(timezone.utc)}}
    )

    user_id = str(user_with_hash["_id"])
    access_token = create_access_token(user_id, user_with_hash["email"], user_with_hash["role"], user_with_hash.get("tenant_id"))
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    return {"message": "Password changed successfully", "access_token": access_token}


@router.get("/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"], user["role"], user.get("tenant_id"))
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
        return {"access_token": access_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
