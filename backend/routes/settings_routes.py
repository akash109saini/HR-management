"""
Settings routes - Master Password management for Super Admin
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/settings", tags=["settings"])


class MasterPasswordSet(BaseModel):
    new_password: str
    confirm_password: str


class MasterPasswordChange(BaseModel):
    current_master_password: str
    new_password: str
    confirm_password: str


@router.get("/master-password")
async def get_master_password_status(request: Request):
    """Check if master password is configured (super admin only)."""
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    setting = await db.settings.find_one({"key": "master_password"}, {"_id": 0})
    is_set = bool(setting and setting.get("value"))
    return {
        "is_set": is_set,
        "last_updated": setting.get("updated_at") if setting else None,
    }


@router.post("/master-password")
async def set_master_password(req: MasterPasswordSet, request: Request):
    """Set master password for the first time (super admin only)."""
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    # Ensure not already set
    existing = await db.settings.find_one({"key": "master_password"})
    if existing and existing.get("value"):
        raise HTTPException(
            status_code=400,
            detail="Master password is already set. Use PUT to change it.",
        )

    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Master password must be at least 8 characters")

    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    hashed = hash_password(req.new_password)
    now = datetime.now(timezone.utc).isoformat()

    await db.settings.update_one(
        {"key": "master_password"},
        {"$set": {"key": "master_password", "value": hashed, "updated_at": now, "set_by": user["email"]}},
        upsert=True,
    )
    return {"message": "Master password set successfully"}


@router.put("/master-password")
async def change_master_password(req: MasterPasswordChange, request: Request):
    """Change existing master password (super admin only)."""
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    existing = await db.settings.find_one({"key": "master_password"})
    if not existing or not existing.get("value"):
        raise HTTPException(status_code=400, detail="Master password is not set yet. Use POST to set it.")

    # Verify current master password
    if not verify_password(req.current_master_password, existing["value"]):
        raise HTTPException(status_code=400, detail="Current master password is incorrect")

    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New master password must be at least 8 characters")

    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")

    hashed = hash_password(req.new_password)
    now = datetime.now(timezone.utc).isoformat()

    await db.settings.update_one(
        {"key": "master_password"},
        {"$set": {"value": hashed, "updated_at": now, "set_by": user["email"]}},
    )
    return {"message": "Master password changed successfully"}


@router.delete("/master-password")
async def remove_master_password(request: Request):
    """Disable / remove master password (super admin only)."""
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    await db.settings.update_one(
        {"key": "master_password"},
        {"$set": {"value": None, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Master password disabled"}
