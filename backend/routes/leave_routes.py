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



@router.get("/calendar")
async def team_calendar(
    request: Request,
    start: str = None,
    end: str = None,
):
    """
    Team Time-Off Calendar — Returns approved leaves + holidays for the tenant
    within the given date range. Used by the calendar widget.
    Params:
      start: YYYY-MM-DD (defaults to start of current month)
      end:   YYYY-MM-DD (defaults to end of current month + 60 days)
    """
    from datetime import date as _date, datetime as _dt, timedelta as _td
    user = await get_current_user(request)

    # Default date range
    today = _date.today()
    if not start:
        start = today.replace(day=1).isoformat()
    if not end:
        end = (today + _td(days=60)).isoformat()

    tenant_id = user.get("tenant_id")
    query: dict = {"status": "approved"}
    if user["role"] != "super_admin":
        query["tenant_id"] = tenant_id

    # Overlap test: leave_end >= start AND leave_start <= end
    query["$and"] = [
        {"end_date": {"$gte": start}},
        {"start_date": {"$lte": end}},
    ]

    leaves = await db.leaves.find(query, {"_id": 0}).to_list(2000)

    events = []
    for l in leaves:
        events.append({
            "id": l.get("id") or l.get("leave_id"),
            "type": "leave",
            "leave_type": l.get("leave_type", "leave"),
            "employee_id": l.get("user_id") or l.get("employee_id"),
            "employee_name": l.get("user_name") or l.get("employee_name", ""),
            "start_date": l.get("start_date"),
            "end_date": l.get("end_date"),
            "days": l.get("days") or l.get("total_days") or 1,
            "reason": l.get("reason", ""),
        })

    # Holidays for the same tenant within range
    hol_query: dict = {"date": {"$gte": start, "$lte": end}}
    if tenant_id and user["role"] != "super_admin":
        hol_query["$or"] = [{"tenant_id": tenant_id}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]
    holidays = await db.holidays.find(hol_query, {"_id": 0}).to_list(500)
    for h in holidays:
        events.append({
            "id": h.get("id") or h.get("holiday_id"),
            "type": "holiday",
            "name": h.get("name") or h.get("title", "Holiday"),
            "date": h.get("date"),
            "is_optional": h.get("is_optional", False),
        })

    # Build a per-day index for easy frontend rendering
    by_day: dict = {}
    for ev in events:
        if ev["type"] == "leave":
            try:
                s = _dt.strptime(ev["start_date"], "%Y-%m-%d").date()
                e = _dt.strptime(ev["end_date"], "%Y-%m-%d").date()
                d = s
                while d <= e:
                    by_day.setdefault(d.isoformat(), {"leaves": [], "holidays": []})["leaves"].append(ev)
                    d += _td(days=1)
            except Exception:
                pass
        else:
            by_day.setdefault(ev["date"], {"leaves": [], "holidays": []})["holidays"].append(ev)

    # Today's overlap summary
    today_iso = today.isoformat()
    on_leave_today = list({l["employee_id"]: l for l in by_day.get(today_iso, {}).get("leaves", [])}.values())

    return {
        "start": start,
        "end": end,
        "events": events,
        "by_day": by_day,
        "summary": {
            "total_employees_on_leave_today": len(on_leave_today),
            "on_leave_today": on_leave_today,
            "upcoming_leave_days": sum(1 for d in by_day if d >= today_iso),
            "holidays_in_range": sum(1 for e in events if e["type"] == "holiday"),
        },
    }
