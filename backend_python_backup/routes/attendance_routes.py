from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, date
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


class ClockInRequest(BaseModel):
    note: Optional[str] = ""


class PunchCorrectionRequest(BaseModel):
    date: str
    correction_type: str  # clock_in or clock_out
    requested_time: str
    reason: str


class PunchCorrectionAction(BaseModel):
    status: str  # approved or rejected
    reviewer_note: Optional[str] = ""


@router.post("/clock-in")
async def clock_in(req: ClockInRequest, request: Request):
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Super Admin cannot clock in")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.attendance.find_one({
        "user_id": user.get("employee_id", user["email"]),
        "date": today,
        "tenant_id": user.get("tenant_id")
    })
    if existing and existing.get("clock_in"):
        raise HTTPException(status_code=400, detail="Already clocked in today")

    record = {
        "id": str(uuid.uuid4()),
        "user_id": user.get("employee_id", user["email"]),
        "user_name": user.get("name", ""),
        "tenant_id": user.get("tenant_id"),
        "date": today,
        "clock_in": datetime.now(timezone.utc).isoformat(),
        "clock_out": None,
        "total_hours": 0,
        "status": "present",
        "note": req.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.attendance.insert_one(record)
    record.pop("_id", None)
    return record


@router.post("/clock-out")
async def clock_out(request: Request):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    record = await db.attendance.find_one({
        "user_id": user.get("employee_id", user["email"]),
        "date": today,
        "tenant_id": user.get("tenant_id")
    })
    if not record:
        raise HTTPException(status_code=400, detail="No clock-in record found for today")
    if record.get("clock_out"):
        raise HTTPException(status_code=400, detail="Already clocked out")

    clock_out_time = datetime.now(timezone.utc)
    clock_in_time = datetime.fromisoformat(record["clock_in"])
    total_hours = round((clock_out_time - clock_in_time).total_seconds() / 3600, 2)

    await db.attendance.update_one(
        {"id": record["id"]},
        {"$set": {"clock_out": clock_out_time.isoformat(), "total_hours": total_hours}}
    )
    record["clock_out"] = clock_out_time.isoformat()
    record["total_hours"] = total_hours
    record.pop("_id", None)
    return record


@router.get("")
async def list_attendance(request: Request):
    user = await get_current_user(request)
    month = request.query_params.get("month")
    query = {}

    if user["role"] == "employee":
        query["user_id"] = user.get("employee_id", user["email"])
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
        emp_id = request.query_params.get("employee_id")
        if emp_id:
            query["user_id"] = emp_id
    elif user["role"] == "super_admin":
        tenant_id = request.query_params.get("tenant_id")
        if tenant_id:
            query["tenant_id"] = tenant_id

    if month:
        query["date"] = {"$regex": f"^{month}"}

    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return records


@router.get("/today")
async def get_today_attendance(request: Request):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    record = await db.attendance.find_one({
        "user_id": user.get("employee_id", user["email"]),
        "date": today,
        "tenant_id": user.get("tenant_id")
    }, {"_id": 0})
    return record or {"clocked_in": False}


# Punch Corrections
@router.post("/punch-correction")
async def submit_punch_correction(req: PunchCorrectionRequest, request: Request):
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        raise HTTPException(status_code=400, detail="Not applicable")

    correction = {
        "id": str(uuid.uuid4()),
        "user_id": user.get("employee_id", user["email"]),
        "user_name": user.get("name", ""),
        "tenant_id": user.get("tenant_id"),
        "date": req.date,
        "correction_type": req.correction_type,
        "requested_time": req.requested_time,
        "reason": req.reason,
        "status": "pending",
        "reviewed_by": None,
        "reviewer_note": "",
        "reviewed_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.punch_corrections.insert_one(correction)
    correction.pop("_id", None)
    return correction


@router.get("/punch-corrections")
async def list_punch_corrections(request: Request):
    user = await get_current_user(request)
    query = {}
    if user["role"] == "employee":
        query["user_id"] = user.get("employee_id", user["email"])
    elif user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")
    status_filter = request.query_params.get("status")
    if status_filter:
        query["status"] = status_filter
    corrections = await db.punch_corrections.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return corrections


@router.put("/punch-corrections/{correction_id}")
async def review_punch_correction(correction_id: str, req: PunchCorrectionAction, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    correction = await db.punch_corrections.find_one({"id": correction_id})
    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    await db.punch_corrections.update_one(
        {"id": correction_id},
        {"$set": {
            "status": req.status,
            "reviewed_by": user.get("name", user["email"]),
            "reviewer_note": req.reviewer_note,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    if req.status == "approved":
        field = "clock_in" if correction["correction_type"] == "clock_in" else "clock_out"
        await db.attendance.update_one(
            {"user_id": correction["user_id"], "date": correction["date"], "tenant_id": correction["tenant_id"]},
            {"$set": {field: correction["requested_time"]}}
        )

    updated = await db.punch_corrections.find_one({"id": correction_id}, {"_id": 0})
    return updated
