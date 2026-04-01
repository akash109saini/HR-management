from fastapi import APIRouter, Request
from database import db
from auth_utils import get_current_user
from datetime import datetime, timezone

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def get_dashboard(request: Request):
    user = await get_current_user(request)
    role = user["role"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")

    if role == "super_admin":
        total_tenants = await db.tenants.count_documents({"status": {"$ne": "deleted"}})
        active_tenants = await db.tenants.count_documents({"status": "active"})
        total_employees = await db.users.count_documents({"role": {"$in": ["employee", "hr_manager"]}})
        total_jobs = await db.job_postings.count_documents({"status": "open"})

        tenants = await db.tenants.find({"status": {"$ne": "deleted"}}, {"_id": 0}).to_list(100)
        plan_distribution = {}
        for t in tenants:
            plan = t.get("subscription_plan", "basic")
            plan_distribution[plan] = plan_distribution.get(plan, 0) + 1

        return {
            "role": "super_admin",
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "total_employees": total_employees,
            "total_open_jobs": total_jobs,
            "plan_distribution": plan_distribution,
            "recent_tenants": tenants[:5],
        }

    elif role == "hr_manager":
        tenant_id = user.get("tenant_id")
        total_employees = await db.users.count_documents({"tenant_id": tenant_id, "role": {"$in": ["employee", "hr_manager"]}})
        pending_leaves = await db.leaves.count_documents({"tenant_id": tenant_id, "status": "pending"})
        pending_corrections = await db.punch_corrections.count_documents({"tenant_id": tenant_id, "status": "pending"})
        today_attendance = await db.attendance.count_documents({"tenant_id": tenant_id, "date": today})
        open_jobs = await db.job_postings.count_documents({"tenant_id": tenant_id, "status": "open"})
        total_applicants = await db.applicants.count_documents({"tenant_id": tenant_id})

        recent_leaves = await db.leaves.find({"tenant_id": tenant_id, "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(5)
        recent_corrections = await db.punch_corrections.find({"tenant_id": tenant_id, "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(5)

        # Monthly attendance trend
        attendance_records = await db.attendance.find(
            {"tenant_id": tenant_id, "date": {"$regex": f"^{current_month}"}},
            {"_id": 0}
        ).to_list(5000)

        attendance_by_date = {}
        for r in attendance_records:
            d = r["date"]
            attendance_by_date[d] = attendance_by_date.get(d, 0) + 1

        return {
            "role": "hr_manager",
            "total_employees": total_employees,
            "pending_leaves": pending_leaves,
            "pending_corrections": pending_corrections,
            "today_attendance": today_attendance,
            "open_jobs": open_jobs,
            "total_applicants": total_applicants,
            "recent_pending_leaves": recent_leaves,
            "recent_pending_corrections": recent_corrections,
            "attendance_trend": [{"date": k, "count": v} for k, v in sorted(attendance_by_date.items())],
        }

    else:  # employee
        tenant_id = user.get("tenant_id")
        emp_id = user.get("employee_id", user["email"])

        today_record = await db.attendance.find_one(
            {"user_id": emp_id, "date": today, "tenant_id": tenant_id},
            {"_id": 0}
        )

        leave_balance = user.get("leave_balance", {"casual": 12, "sick": 10, "earned": 15})
        # Get from DB
        user_doc = await db.users.find_one({"email": user["email"]}, {"_id": 0, "leave_balance": 1})
        if user_doc and "leave_balance" in user_doc:
            leave_balance = user_doc["leave_balance"]

        pending_leaves = await db.leaves.count_documents({"user_id": emp_id, "status": "pending"})
        pending_corrections = await db.punch_corrections.count_documents({"user_id": emp_id, "status": "pending"})

        month_attendance = await db.attendance.find(
            {"user_id": emp_id, "tenant_id": tenant_id, "date": {"$regex": f"^{current_month}"}},
            {"_id": 0}
        ).to_list(50)
        days_present = len([r for r in month_attendance if r.get("clock_in")])

        recent_announcements = await db.announcements.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(3)

        return {
            "role": "employee",
            "today_attendance": today_record,
            "leave_balance": leave_balance,
            "pending_leaves": pending_leaves,
            "pending_corrections": pending_corrections,
            "days_present_this_month": days_present,
            "recent_announcements": recent_announcements,
        }
