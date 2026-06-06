from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, date, timedelta
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


def parse_to_local_time(time_str) -> Optional[datetime]:
    if not time_str:
        return None
    if isinstance(time_str, datetime):
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        return time_str.astimezone(ist_tz)
    time_str = str(time_str)
    try:
        if "T" in time_str:
            clean_str = time_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            return dt.astimezone(ist_tz)
        else:
            dt = datetime.strptime(time_str.split(".")[0], "%Y-%m-%d %H:%M:%S")
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            return dt.replace(tzinfo=ist_tz)
    except Exception:
        return None


async def enrich_attendance_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    from collections import defaultdict
    user_records = defaultdict(list)
    for r in records:
        user_records[r["user_id"]].append(r)
        
    enriched_list = []
    
    for user_id, r_list in user_records.items():
        # Sort chronologically by date ascending
        r_list.sort(key=lambda x: x["date"])
        
        # Get shift details for the user
        user = await db.users.find_one({"employee_id": user_id})
        if not user:
            user = await db.users.find_one({"email": user_id})
            
        shift_name = user.get("shift") if user else None
        shift_start = "09:00"
        shift_end = "18:00"
        if shift_name:
            shift_doc = await db.shifts.find_one({"name": shift_name})
            if shift_doc:
                shift_start = shift_doc.get("start_time", "09:00")
                shift_end = shift_doc.get("end_time", "18:00")
                
        remaining_buffer = 120
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        
        for record in r_list:
            # Day of the week
            try:
                dt_date = datetime.strptime(record["date"], "%Y-%m-%d")
                weekday = dt_date.strftime("%A")
            except Exception:
                weekday = "-"
                
            shift_time = f"{shift_start} - {shift_end}"
            
            # Parse In/Out Time
            dt_in = parse_to_local_time(record.get("clock_in"))
            in_time_str = dt_in.strftime("%H:%M:%S") if dt_in else "-"
            
            dt_out = parse_to_local_time(record.get("clock_out"))
            out_time_str = dt_out.strftime("%H:%M:%S") if dt_out else "-"
            
            # Working Hour
            working_hour_val = 0.0
            if dt_in and dt_out:
                working_hour_val = round((dt_out - dt_in).total_seconds() / 3600, 2)
                working_hour_str = f"{working_hour_val}h"
            else:
                fallback_hours = record.get("total_hours")
                working_hour_str = f"{fallback_hours}h" if fallback_hours is not None else "-"
                
            # Late BY
            lateness_mins = 0
            if dt_in:
                try:
                    dt_shift_start = datetime.strptime(f"{record['date']} {shift_start}", "%Y-%m-%d %H:%M").replace(tzinfo=ist_tz)
                    diff_mins = (dt_in - dt_shift_start).total_seconds() / 60
                    if diff_mins > 0:
                        lateness_mins = int(diff_mins)
                except Exception:
                    pass
            late_by_str = f"{lateness_mins} mins" if lateness_mins > 0 else "-"
            
            # Early BY
            early_mins = 0
            if dt_out:
                try:
                    dt_shift_end = datetime.strptime(f"{record['date']} {shift_end}", "%Y-%m-%d %H:%M").replace(tzinfo=ist_tz)
                    diff_mins = (dt_shift_end - dt_out).total_seconds() / 60
                    if diff_mins > 0:
                        early_mins = int(diff_mins)
                except Exception:
                    pass
            early_by_str = f"{early_mins} mins" if early_mins > 0 else "-"
            
            # Buffer Utilization
            buffer_utilized = 0
            if lateness_mins > 0:
                buffer_utilized = min(lateness_mins, 15, remaining_buffer)
                remaining_buffer = max(0, remaining_buffer - buffer_utilized)
            buffer_util_str = f"{buffer_utilized} mins" if buffer_utilized > 0 else "-"
            
            # Remaining Buffer
            remaining_buffer_str = f"{remaining_buffer} mins"
            
            # Status
            status = record.get("status", "present")
            if not dt_in:
                status = "absent"
            else:
                unbuffered_lateness = lateness_mins - buffer_utilized
                if unbuffered_lateness >= 1:
                    status = "half day"
            
            enriched_record = {
                **record,
                "weekday": weekday,
                "shift_time": shift_time,
                "in_time": in_time_str,
                "out_time": out_time_str,
                "working_hour": working_hour_str,
                "late_by": late_by_str,
                "early_by": early_by_str,
                "buffer_utilization": buffer_util_str,
                "remaining_buffer": remaining_buffer_str,
                "status": status,
            }
            enriched_list.append(enriched_record)
            
    # Sort back by date descending
    enriched_list.sort(key=lambda x: x["date"], reverse=True)
    return enriched_list


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

    # Fetch all records without the month filter to compute running buffers correctly
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Enrich the records
    enriched = await enrich_attendance_records(records)
    
    # Filter by month if query parameter was supplied
    if month:
        enriched = [r for r in enriched if r["date"].startswith(month)]
        
    return enriched


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
@router.get("/correction-details")
async def get_correction_details(request: Request):
    """Return attendance details + shift info for a given date — used by the punch correction form."""
    user = await get_current_user(request)
    date_str = request.query_params.get("date")
    if not date_str:
        raise HTTPException(status_code=400, detail="date query parameter is required")

    emp_id = user.get("employee_id", user["email"])
    tenant_id = user.get("tenant_id")

    # Fetch the attendance record for that date
    att_record = await db.attendance.find_one(
        {"user_id": emp_id, "date": date_str, "tenant_id": tenant_id},
        {"_id": 0}
    )

    # Helper: extract HH:MM from an ISO datetime or plain time string
    def fmt_time(t):
        if not t:
            return "-"
        if "T" in str(t):
            try:
                return datetime.fromisoformat(str(t).replace("Z", "+00:00")).strftime("%H:%M")
            except Exception:
                pass
        return str(t)[:5] if len(str(t)) >= 5 else str(t)

    actual_in  = fmt_time(att_record.get("clock_in"))  if att_record else "-"
    actual_out = fmt_time(att_record.get("clock_out")) if att_record else "-"

    # Fetch shift times
    shift_start = "09:00"
    shift_end   = "18:00"
    emp_doc = await db.users.find_one({"employee_id": emp_id}, {"_id": 0, "shift": 1})
    if emp_doc:
        shift_name = emp_doc.get("shift", "")
        if shift_name:
            shift_doc = await db.shifts.find_one({"name": shift_name})
            if shift_doc:
                shift_start = shift_doc.get("start_time", "09:00")
                shift_end   = shift_doc.get("end_time",   "18:00")

    # Count existing corrections for this date
    count = await db.punch_corrections.count_documents(
        {"user_id": emp_id, "date": date_str, "tenant_id": tenant_id}
    )

    # Fetch approval authority: HR managers of the same tenant
    hr_users = await db.users.find(
        {"tenant_id": tenant_id, "role": {"$in": ["hr_manager", "super_admin"]}},
        {"_id": 0, "name": 1}
    ).limit(2).to_list(2)
    approval_authority = [u.get("name", "") for u in hr_users]

    return {
        "actual_in":          actual_in,
        "actual_out":         actual_out,
        "shift_start":        shift_start,
        "shift_end":          shift_end,
        "count":              count,
        "approval_authority": approval_authority,
    }


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
        ctype = correction.get("correction_type", "clock_in")
        att_filter = {"user_id": correction["user_id"], "date": correction["date"], "tenant_id": correction["tenant_id"]}
        att_record  = await db.attendance.find_one(att_filter)

        if ctype == "clock_in":
            update_fields = {"clock_in": correction["requested_time"]}
        elif ctype == "clock_out":
            update_fields = {"clock_out": correction["requested_time"]}
        elif ctype == "both":
            # Punch correction — update both clock_in and clock_out to shift times
            update_fields = {
                "clock_in":  correction["requested_time"],
                "clock_out": correction.get("requested_time_out", correction["requested_time"]),
            }
        elif ctype == "missed_punch":
            # Add whichever punch is missing
            if att_record:
                if not att_record.get("clock_in"):
                    update_fields = {"clock_in": correction["requested_time"]}
                else:
                    update_fields = {"clock_out": correction["requested_time"]}
            else:
                update_fields = {"clock_in": correction["requested_time"]}
        else:
            update_fields = {"clock_in": correction["requested_time"]}

        if att_record:
            await db.attendance.update_one(att_filter, {"$set": update_fields})
        else:
            # Create a new attendance record if none exists
            new_att = {
                "id":         str(uuid.uuid4()),
                "user_id":    correction["user_id"],
                "user_name":  correction["user_name"],
                "tenant_id":  correction["tenant_id"],
                "date":       correction["date"],
                "status":     "present",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            new_att.update(update_fields)
            await db.attendance.insert_one(new_att)

    updated = await db.punch_corrections.find_one({"id": correction_id}, {"_id": 0})
    return updated


@router.get("/punches")
async def list_my_punches(request: Request):
    """Return all biometric punch logs for the current employee (or filtered by employee_id for HR)."""
    user = await get_current_user(request)

    if user["role"] == "employee":
        emp_id = user.get("employee_id", "")
        bio_pin = user.get("biometric_pin", "")

        # Build all possible matching conditions — no tenant restriction so we catch every record
        or_conditions = []
        if emp_id:
            or_conditions.append({"employee_id": emp_id})
        if bio_pin:
            or_conditions.append({"user_pin": bio_pin})
            if bio_pin.isdigit():
                stripped = bio_pin.lstrip("0") or "0"
                if stripped != bio_pin:
                    or_conditions.append({"user_pin": stripped})
                # Also pad-zero variants (device may send 1, 01, 001, etc.)
                for pad in range(1, 9):
                    padded = bio_pin.zfill(pad)
                    if padded not in (bio_pin, stripped):
                        or_conditions.append({"user_pin": padded})

        if not or_conditions:
            return []

        query = {"$or": or_conditions}

    elif user["role"] in ["hr_manager", "super_admin"]:
        query = {}
        if user["role"] == "hr_manager":
            query["tenant_id"] = user.get("tenant_id")
        emp_id_param = request.query_params.get("employee_id")
        if emp_id_param:
            query["employee_id"] = emp_id_param
        tid = request.query_params.get("tenant_id")
        if tid:
            query["tenant_id"] = tid

    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    punches = await db.biometric_punches.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return punches


# ─── Monthly Attendance Calendar ──────────────────────────────────────────────

def _time_to_minutes(t_str: str) -> int:
    """Convert HH:MM string to total minutes."""
    try:
        h, m = map(int, t_str.split(":"))
        return h * 60 + m
    except Exception:
        return 0


def _compute_day_status(
    first_punch_mins: Optional[int],
    last_punch_mins: Optional[int],
    shift_start_mins: int,
    shift_end_mins: int,
    is_weekend: bool,
    is_holiday: bool,
) -> str:
    """
    Status Rules:
      WO  – Weekend (Saturday/Sunday)
      H   – Public holiday
      AA  – No punch at all
      AA  – Both punches exist but first punch > shift_start AND last punch < shift_end
            (came late AND left early → full absent)
      P   – first_punch ≤ shift_start AND last_punch ≥ shift_end  (full present)
      AHD – first_punch > shift_start AND last_punch ≥ shift_end  (came late, left on time)
      AHD – first_punch ≤ shift_start AND last_punch < shift_end  (came on time, left early)
    """
    if is_holiday:
        return "H"
    if is_weekend:
        return "WO"
    if first_punch_mins is None:
        return "AA"

    late_in  = first_punch_mins > shift_start_mins
    early_out = last_punch_mins is not None and last_punch_mins < shift_end_mins

    if late_in and early_out:
        return "AA"
    if not late_in and not early_out:
        return "P"
    # One side is off → half day
    return "AHD"


@router.get("/calendar")
async def attendance_calendar(request: Request):
    """
    Return one row per calendar day for the requested month + employee.
    Query params:
      month  – YYYY-MM  (required)
      employee_id – override for HR/admin (optional)
    """
    user = await get_current_user(request)
    month_param = request.query_params.get("month")
    if not month_param:
        raise HTTPException(status_code=400, detail="month param required (YYYY-MM)")

    try:
        year, mon = int(month_param[:4]), int(month_param[5:7])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format")

    # Resolve which employee to show
    if user["role"] == "employee":
        target_user_id = user.get("employee_id", user["email"])
        tenant_id      = user.get("tenant_id")
    elif user["role"] in ("hr_manager", "super_admin"):
        emp_id_param   = request.query_params.get("employee_id")
        target_user_id = emp_id_param or user.get("employee_id", user["email"])
        tenant_id      = user.get("tenant_id")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Fetch employee details for shift info
    emp_doc = await db.users.find_one({"employee_id": target_user_id})
    if not emp_doc:
        emp_doc = await db.users.find_one({"email": target_user_id})

    shift_start = "09:00"
    shift_end   = "18:00"
    shift_name  = ""
    if emp_doc:
        shift_name = emp_doc.get("shift", "")
        if shift_name:
            shift_doc = await db.shifts.find_one({"name": shift_name})
            if shift_doc:
                shift_start = shift_doc.get("start_time", "09:00")
                shift_end   = shift_doc.get("end_time",   "18:00")

    shift_start_mins = _time_to_minutes(shift_start)
    shift_end_mins   = _time_to_minutes(shift_end)
    ist_tz = timezone(timedelta(hours=5, minutes=30))

    # Fetch attendance records for this month
    month_prefix = f"{year:04d}-{mon:02d}"
    att_query = {
        "user_id":   target_user_id,
        "tenant_id": tenant_id,
        "date":      {"$regex": f"^{month_prefix}"},
    }
    att_records_raw = await db.attendance.find(att_query, {"_id": 0}).to_list(200)
    att_by_date: Dict[str, Any] = {r["date"]: r for r in att_records_raw}

    # Fetch biometric punches for this month (used to derive in/out times)
    bio_pin = emp_doc.get("biometric_pin") if emp_doc else None
    bio_query_or = [{"employee_id": target_user_id}]
    if bio_pin:
        bio_query_or.append({"user_pin": bio_pin})
        if bio_pin.isdigit():
            stripped = bio_pin.lstrip("0") or "0"
            if stripped != bio_pin:
                bio_query_or.append({"user_pin": stripped})

    bio_punches_raw = await db.biometric_punches.find(
        {"$or": bio_query_or}, {"_id": 0}
    ).sort("timestamp", 1).to_list(2000)

    # Group biometric punches by date (YYYY-MM-DD in IST)
    bio_by_date: Dict[str, list] = {}
    for punch in bio_punches_raw:
        ts = punch.get("timestamp") or punch.get("punched_at") or punch.get("punch_time")
        if not ts:
            continue
        dt = parse_to_local_time(ts)
        if not dt:
            continue
        d_str = dt.strftime("%Y-%m-%d")
        if not d_str.startswith(month_prefix):
            continue
        bio_by_date.setdefault(d_str, []).append(dt)

    # Build holidays set for this month
    holiday_docs = await db.holidays.find(
        {"tenant_id": tenant_id, "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "date": 1}
    ).to_list(50)
    holiday_set = {h["date"] for h in holiday_docs}

    # How many days in the month?
    import calendar as cal_mod
    days_in_month = cal_mod.monthrange(year, mon)[1]

    rows = []
    for day in range(1, days_in_month + 1):
        date_str   = f"{year:04d}-{mon:02d}-{day:02d}"
        dt_date    = date(year, mon, day)
        weekday    = dt_date.strftime("%A")
        is_weekend = dt_date.weekday() >= 6  # Sunday only; Saturday is a work day for many Indian cos
        # Treat Sunday as WO; Saturday as regular working day (common in India).
        # If you want Saturday as WO too, change: dt_date.weekday() >= 5
        is_holiday = date_str in holiday_set

        # Determine in/out from biometric punches (preferred) or attendance record
        day_punches = sorted(bio_by_date.get(date_str, []))
        att_rec     = att_by_date.get(date_str)

        first_punch_mins: Optional[int] = None
        last_punch_mins:  Optional[int] = None
        in_time_str  = "-"
        out_time_str = "-"

        if day_punches:
            fp = day_punches[0]
            lp = day_punches[-1]
            first_punch_mins = fp.hour * 60 + fp.minute
            last_punch_mins  = lp.hour * 60 + lp.minute
            in_time_str  = fp.strftime("%H:%M")
            out_time_str = lp.strftime("%H:%M") if len(day_punches) > 1 else "-"
        elif att_rec:
            dt_in  = parse_to_local_time(att_rec.get("clock_in"))
            dt_out = parse_to_local_time(att_rec.get("clock_out"))
            if dt_in:
                first_punch_mins = dt_in.hour * 60 + dt_in.minute
                in_time_str  = dt_in.strftime("%H:%M")
            if dt_out:
                last_punch_mins  = dt_out.hour * 60 + dt_out.minute
                out_time_str = dt_out.strftime("%H:%M")

        status = _compute_day_status(
            first_punch_mins, last_punch_mins,
            shift_start_mins, shift_end_mins,
            is_weekend, is_holiday,
        )

        # Working hours
        working_hour = "-"
        if first_punch_mins is not None and last_punch_mins is not None and last_punch_mins > first_punch_mins:
            total_mins = last_punch_mins - first_punch_mins
            working_hour = f"{total_mins // 60}:{total_mins % 60:02d}"

        # Late by
        late_by = "-"
        if first_punch_mins is not None and first_punch_mins > shift_start_mins and status not in ("WO", "H"):
            diff = first_punch_mins - shift_start_mins
            late_by = f"{diff // 60}:{diff % 60:02d}"

        # Early by (left before shift end)
        early_by = "-"
        if last_punch_mins is not None and last_punch_mins < shift_end_mins and status not in ("WO", "H", "AA"):
            diff = shift_end_mins - last_punch_mins
            early_by = f"{diff // 60}:{diff % 60:02d}"

        rows.append({
            "date":         date_str,
            "display_date": dt_date.strftime("%d %b %Y"),
            "weekday":      weekday,
            "shift_time":   f"{shift_start} - {shift_end}",
            "in_time":      in_time_str,
            "out_time":     out_time_str,
            "working_hour": working_hour,
            "late_by":      late_by,
            "early_by":     early_by,
            "status":       status,
            "is_today":     date_str == datetime.now(ist_tz).strftime("%Y-%m-%d"),
        })

    return {
        "employee_id":  target_user_id,
        "employee_name": emp_doc.get("name", "") if emp_doc else "",
        "shift":        shift_name,
        "shift_time":   f"{shift_start} - {shift_end}",
        "month":        month_param,
        "rows":         rows,
    }
