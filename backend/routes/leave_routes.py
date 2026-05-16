from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(prefix="/api/leaves", tags=["leaves"])


class LeaveRequest(BaseModel):
    leave_type: str  # casual, sick, earned, maternity, paternity
    start_date: str
    end_date: str
    reason: str


class LeaveAction(BaseModel):
    status: str  # approved or rejected
    reviewer_note: Optional[str] = ""


@router.post("")
async def apply_leave(req: LeaveRequest, request: Request):
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Not applicable")

    leave = {
        "id": str(uuid.uuid4()),
        "user_id": user.get("employee_id", user["email"]),
        "user_name": user.get("name", ""),
        "tenant_id": user.get("tenant_id"),
        "leave_type": req.leave_type,
        "start_date": req.start_date,
        "end_date": req.end_date,
        "reason": req.reason,
        "status": "pending",
        "reviewed_by": None,
        "reviewer_note": "",
        "reviewed_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leaves.insert_one(leave)
    leave.pop("_id", None)
    return leave


@router.get("")
async def list_leaves(request: Request):
    user = await get_current_user(request)
    query = {}
    if user["role"] == "employee":
        query["user_id"] = user.get("employee_id", user["email"])
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    status_filter = request.query_params.get("status")
    if status_filter:
        query["status"] = status_filter
    leaves = await db.leaves.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return leaves


@router.put("/{leave_id}")
async def review_leave(leave_id: str, req: LeaveAction, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    leave = await db.leaves.find_one({"id": leave_id})
    if not leave:
        raise HTTPException(status_code=404, detail="Leave not found")

    await db.leaves.update_one(
        {"id": leave_id},
        {"$set": {
            "status": req.status,
            "reviewed_by": user.get("name", user["email"]),
            "reviewer_note": req.reviewer_note,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Update leave balance if approved
    if req.status == "approved":
        from datetime import timedelta
        start = datetime.strptime(leave["start_date"], "%Y-%m-%d")
        end = datetime.strptime(leave["end_date"], "%Y-%m-%d")
        days = (end - start).days + 1
        leave_type = leave["leave_type"]
        await db.users.update_one(
            {"employee_id": leave["user_id"]},
            {"$inc": {f"leave_balance.{leave_type}": -days}}
        )

    updated = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    return updated


@router.get("/balance")
async def get_leave_balance(request: Request):
    user = await get_current_user(request)
    user_doc = await db.users.find_one({"email": user["email"]}, {"_id": 0, "leave_balance": 1})
    return user_doc.get("leave_balance", {"casual": 12, "sick": 10, "earned": 15})
