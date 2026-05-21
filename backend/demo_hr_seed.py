"""
Comprehensive HR Demo Data Seeder
Run: python3 demo_hr_seed.py
Seeds: departments, designations, shifts, salary slabs, 10 employees,
       attendance (30 days), punch corrections, leaves, holidays, tax records, PF records
"""
import asyncio, os, uuid, random
from datetime import datetime, timezone, timedelta, date

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "hrms_db")
os.environ.setdefault("JWT_SECRET", "hrms-super-secret-key-change-in-production")

from database import db
from auth_utils import hash_password

NOW = datetime.now(timezone.utc)
TODAY = date.today()

def uid(): return str(uuid.uuid4())
def ts(): return NOW.isoformat()

async def main():
    # ── Get tenant ──────────────────────────────────────────────────────────
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        print("No tenant found. Run the base seed first."); return
    tid = tenant.get("id") or tenant.get("tenant_id")
    print(f"Seeding for tenant: {tenant.get('name')} ({tid})")

    # ── Departments ──────────────────────────────────────────────────────────
    await db.departments.delete_many({"tenant_id": tid})
    depts = [
        {"id": uid(), "tenant_id": tid, "name": "Engineering",        "description": "Product & Platform engineering", "head": "Ravi Kumar",     "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Human Resources",    "description": "People operations",              "head": "Sarah Johnson",  "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Finance",            "description": "Finance & Accounts",             "head": "Priya Sharma",   "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Sales",              "description": "Revenue & Growth",               "head": "Rahul Singh",    "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Marketing",         "description": "Brand & Communications",          "head": "Neha Patel",     "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Operations",        "description": "Business operations & support",   "head": "Amit Verma",     "created_at": ts()},
    ]
    await db.departments.insert_many(depts)
    print(f"  ✓ {len(depts)} departments")

    # ── Designations ─────────────────────────────────────────────────────────
    await db.designations.delete_many({"tenant_id": tid})
    desigs = [
        {"id": uid(), "tenant_id": tid, "name": "Software Engineer",        "level": 3, "description": "IC engineer",            "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Senior Software Engineer", "level": 4, "description": "Senior IC",               "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Tech Lead",                "level": 5, "description": "Technical lead",          "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "HR Executive",             "level": 3, "description": "HR operations",           "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Finance Analyst",          "level": 3, "description": "Financial reporting",     "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Sales Executive",          "level": 3, "description": "Direct sales",            "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Marketing Manager",        "level": 5, "description": "Marketing strategy",      "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Operations Analyst",       "level": 3, "description": "Operations support",      "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Manager",                  "level": 6, "description": "People manager",          "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Director",                 "level": 8, "description": "Department director",     "created_at": ts()},
    ]
    await db.designations.insert_many(desigs)
    print(f"  ✓ {len(desigs)} designations")

    # ── Shifts ────────────────────────────────────────────────────────────────
    await db.shifts.delete_many({"tenant_id": tid})
    shifts = [
        {"id": uid(), "tenant_id": tid, "name": "Morning Shift",   "start_time": "08:00", "end_time": "17:00", "break_duration": 60, "working_hours": 8.0, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "General Shift",   "start_time": "09:00", "end_time": "18:00", "break_duration": 60, "working_hours": 8.0, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Afternoon Shift", "start_time": "13:00", "end_time": "22:00", "break_duration": 60, "working_hours": 8.0, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Night Shift",     "start_time": "22:00", "end_time": "07:00", "break_duration": 60, "working_hours": 8.0, "created_at": ts()},
    ]
    await db.shifts.insert_many(shifts)
    print(f"  ✓ {len(shifts)} shifts")

    # ── Salary Slabs ─────────────────────────────────────────────────────────
    await db.salary_slabs.delete_many({"tenant_id": tid})
    slabs = [
        {"id": uid(), "tenant_id": tid, "name": "Entry Level",  "grade": "L1", "min_salary": 250000,  "max_salary": 500000,  "basic_percentage": 50, "hra_percentage": 20, "pf_percentage": 12, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Junior",       "grade": "L2", "min_salary": 500000,  "max_salary": 800000,  "basic_percentage": 50, "hra_percentage": 20, "pf_percentage": 12, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Mid Level",    "grade": "L3", "min_salary": 800000,  "max_salary": 1200000, "basic_percentage": 50, "hra_percentage": 20, "pf_percentage": 12, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Senior",       "grade": "L4", "min_salary": 1200000, "max_salary": 1800000, "basic_percentage": 50, "hra_percentage": 20, "pf_percentage": 12, "created_at": ts()},
        {"id": uid(), "tenant_id": tid, "name": "Lead/Manager", "grade": "L5", "min_salary": 1800000, "max_salary": 3000000, "basic_percentage": 45, "hra_percentage": 20, "pf_percentage": 12, "created_at": ts()},
    ]
    await db.salary_slabs.insert_many(slabs)
    print(f"  ✓ {len(slabs)} salary slabs")

    # ── 10 Employees ─────────────────────────────────────────────────────────
    # Remove old seeded employees (keep HR manager)
    await db.users.delete_many({"tenant_id": tid, "role": "employee"})

    shift_names = [s["name"] for s in shifts]
    emp_data = [
        {"name": "Arjun Mehta",    "email": f"arjun@{tenant.get('domain','co.in')}",   "mobile": "9100000001", "department": "Engineering",     "designation": "Software Engineer",        "salary": 900000,  "shift": "General Shift",   "joining_date": "2022-03-15", "biometric_pin": "1001"},
        {"name": "Priya Sharma",   "email": f"priya@{tenant.get('domain','co.in')}",   "mobile": "9100000002", "department": "Finance",          "designation": "Finance Analyst",          "salary": 750000,  "shift": "Morning Shift",   "joining_date": "2021-07-01", "biometric_pin": "1002"},
        {"name": "Rahul Singh",    "email": f"rahul@{tenant.get('domain','co.in')}",   "mobile": "9100000003", "department": "Sales",            "designation": "Sales Executive",          "salary": 680000,  "shift": "General Shift",   "joining_date": "2023-01-10", "biometric_pin": "1003"},
        {"name": "Neha Patel",     "email": f"neha@{tenant.get('domain','co.in')}",    "mobile": "9100000004", "department": "Marketing",        "designation": "Marketing Manager",        "salary": 1400000, "shift": "General Shift",   "joining_date": "2020-06-20", "biometric_pin": "1004"},
        {"name": "Amit Verma",     "email": f"amit@{tenant.get('domain','co.in')}",    "mobile": "9100000005", "department": "Operations",       "designation": "Operations Analyst",       "salary": 620000,  "shift": "Morning Shift",   "joining_date": "2022-11-01", "biometric_pin": "1005"},
        {"name": "Sunita Rao",     "email": f"sunita@{tenant.get('domain','co.in')}",  "mobile": "9100000006", "department": "Engineering",     "designation": "Senior Software Engineer", "salary": 1300000, "shift": "General Shift",   "joining_date": "2019-05-15", "biometric_pin": "1006"},
        {"name": "Vikram Nair",    "email": f"vikram@{tenant.get('domain','co.in')}",  "mobile": "9100000007", "department": "Engineering",     "designation": "Tech Lead",                "salary": 1800000, "shift": "General Shift",   "joining_date": "2018-09-01", "biometric_pin": "1007"},
        {"name": "Kavitha Iyer",   "email": f"kavitha@{tenant.get('domain','co.in')}", "mobile": "9100000008", "department": "Human Resources", "designation": "HR Executive",             "salary": 580000,  "shift": "Morning Shift",   "joining_date": "2023-04-01", "biometric_pin": "1008"},
        {"name": "Deepak Joshi",   "email": f"deepak@{tenant.get('domain','co.in')}",  "mobile": "9100000009", "department": "Sales",            "designation": "Manager",                  "salary": 1600000, "shift": "Afternoon Shift", "joining_date": "2017-12-01", "biometric_pin": "1009"},
        {"name": "Ananya Krishnan","email": f"ananya@{tenant.get('domain','co.in')}",  "mobile": "9100000010", "department": "Engineering",     "designation": "Software Engineer",        "salary": 800000,  "shift": "General Shift",   "joining_date": "2024-01-15", "biometric_pin": "1010"},
    ]

    emp_counter = 1
    created_emps = []
    for i, e in enumerate(emp_data):
        emp_id = f"EMP-{tid[:4].upper()}-{100 + i + 1}"
        doc = {
            "email": e["email"], "name": e["name"], "mobile": e["mobile"],
            "employee_id": emp_id, "password_hash": hash_password(e["mobile"]),
            "role": "employee", "tenant_id": tid,
            "department": e["department"], "designation": e["designation"],
            "position": e["designation"], "salary": e["salary"],
            "shift": e["shift"], "joining_date": e["joining_date"],
            "biometric_pin": e["biometric_pin"],
            "status": "active", "first_login": True,
            "leave_balance": {"casual": 12, "sick": 10, "earned": 15},
            "bank_details": {
                "bank_name": random.choice(["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank"]),
                "account_number": f"10{random.randint(1000000000, 9999999999)}",
                "ifsc_code": f"SBIN{random.randint(1000000, 9999999)}",
                "account_holder": e["name"],
            },
            "created_at": ts(), "updated_at": ts(),
        }
        await db.users.insert_one(doc)
        doc["_id"] = str(doc["_id"])
        created_emps.append(doc)
    print(f"  ✓ {len(created_emps)} employees")

    # ── Attendance (last 30 working days) ─────────────────────────────────────
    await db.attendance.delete_many({"tenant_id": tid, "demo": True})
    att_docs = []
    for emp in created_emps:
        for day_offset in range(1, 35):
            day = TODAY - timedelta(days=day_offset)
            if day.weekday() >= 5: continue  # skip weekends
            status = random.choices(["present", "present", "present", "present", "absent", "late"], weights=[60,60,60,60,5,10])[0]
            clock_in_h = 9 if status != "late" else random.randint(10, 11)
            clock_in = datetime(day.year, day.month, day.day, clock_in_h, random.randint(0,30), tzinfo=timezone.utc)
            clock_out = clock_in + timedelta(hours=8, minutes=random.randint(0,60)) if status != "absent" else None
            att_docs.append({
                "id": uid(), "user_id": emp["employee_id"], "user_name": emp["name"],
                "tenant_id": tid, "date": day.isoformat(),
                "clock_in": clock_in.isoformat() if status != "absent" else None,
                "clock_out": clock_out.isoformat() if clock_out else None,
                "total_hours": 8.5 if status == "present" else (random.uniform(6,8) if status == "late" else 0),
                "status": status, "note": "", "created_at": ts(), "demo": True,
            })
    if att_docs:
        await db.attendance.insert_many(att_docs)
    print(f"  ✓ {len(att_docs)} attendance records")

    # ── Punch Corrections ────────────────────────────────────────────────────
    await db.punch_corrections.delete_many({"tenant_id": tid, "demo": True})
    pc_docs = []
    for emp in random.sample(created_emps, min(5, len(created_emps))):
        day = TODAY - timedelta(days=random.randint(2, 10))
        pc_docs.append({
            "id": uid(), "user_id": emp["employee_id"], "user_name": emp["name"],
            "tenant_id": tid, "date": day.isoformat(),
            "correction_type": random.choice(["clock_in", "clock_out"]),
            "requested_time": f"{random.randint(8,18):02d}:{random.choice(['00','15','30','45'])}:00",
            "reason": random.choice([
                "Forgot to punch in due to client call",
                "System was down at clock-in time",
                "Left early due to medical appointment — forgot to punch out",
                "Worked from lobby — device not accessible",
            ]),
            "status": random.choice(["pending", "approved", "rejected"]),
            "reviewed_by": None, "reviewer_note": "", "reviewed_at": None,
            "created_at": ts(), "demo": True,
        })
    await db.punch_corrections.insert_many(pc_docs)
    print(f"  ✓ {len(pc_docs)} punch corrections")

    # ── Leaves ───────────────────────────────────────────────────────────────
    await db.leaves.delete_many({"tenant_id": tid, "demo": True})
    leave_samples = [
        {"days_offset": 2,  "dur": 2, "type": "casual",  "reason": "Personal work"},
        {"days_offset": 7,  "dur": 1, "type": "sick",    "reason": "Doctor appointment"},
        {"days_offset": 12, "dur": 3, "type": "earned",  "reason": "Family function"},
        {"days_offset": 20, "dur": 2, "type": "sick",    "reason": "Recovery from fever"},
        {"days_offset": 28, "dur": 5, "type": "earned",  "reason": "Annual vacation"},
        {"days_offset": -5, "dur": 2, "type": "casual",  "reason": "House shifting"},
        {"days_offset": -10,"dur": 1, "type": "sick",    "reason": "Medical checkup"},
        {"days_offset": 35, "dur": 3, "type": "earned",  "reason": "Wedding in family"},
    ]
    lv_docs = []
    for i, ls in enumerate(leave_samples):
        emp = created_emps[i % len(created_emps)]
        s = TODAY + timedelta(days=ls["days_offset"])
        e = s + timedelta(days=ls["dur"] - 1)
        status = "approved" if ls["days_offset"] < 0 else random.choice(["pending", "approved", "approved"])
        lv_docs.append({
            "id": uid(), "tenant_id": tid,
            "user_id": emp["employee_id"], "user_name": emp["name"],
            "leave_type": ls["type"], "start_date": s.isoformat(),
            "end_date": e.isoformat(), "days": ls["dur"], "total_days": ls["dur"],
            "reason": ls["reason"], "status": status,
            "reviewed_by": None, "reviewer_note": "", "reviewed_at": None,
            "created_at": ts(), "demo": True,
        })
    await db.leaves.insert_many(lv_docs)
    print(f"  ✓ {len(lv_docs)} leave requests")

    # ── Holidays ─────────────────────────────────────────────────────────────
    await db.holidays.delete_many({"tenant_id": tid, "demo": True})
    holidays = [
        {"name": "Republic Day",         "date": f"{TODAY.year}-01-26", "type": "public",     "is_optional": False},
        {"name": "Holi",                  "date": f"{TODAY.year}-03-14", "type": "public",     "is_optional": False},
        {"name": "Good Friday",           "date": f"{TODAY.year}-04-18", "type": "optional",   "is_optional": True},
        {"name": "Eid ul-Fitr",           "date": f"{TODAY.year}-04-20", "type": "public",     "is_optional": False},
        {"name": "Independence Day",      "date": f"{TODAY.year}-08-15", "type": "public",     "is_optional": False},
        {"name": "Gandhi Jayanti",        "date": f"{TODAY.year}-10-02", "type": "public",     "is_optional": False},
        {"name": "Diwali",                "date": f"{TODAY.year}-10-20", "type": "public",     "is_optional": False},
        {"name": "Diwali (Holiday)",      "date": f"{TODAY.year}-10-21", "type": "public",     "is_optional": False},
        {"name": "Christmas",             "date": f"{TODAY.year}-12-25", "type": "public",     "is_optional": False},
        {"name": "Founder's Day",         "date": (TODAY + timedelta(days=14)).isoformat(), "type": "optional", "is_optional": True},
        {"name": "Company Anniversary",   "date": (TODAY + timedelta(days=45)).isoformat(), "type": "optional", "is_optional": True},
    ]
    hol_docs = [{"id": uid(), "tenant_id": tid, **h, "created_at": ts(), "demo": True} for h in holidays]
    await db.holidays.insert_many(hol_docs)
    print(f"  ✓ {len(hol_docs)} holidays")

    # ── Tax Records ──────────────────────────────────────────────────────────
    await db.tax_records.delete_many({"tenant_id": tid, "demo": True})
    tax_docs = []
    for emp in created_emps:
        monthly_gross = emp["salary"] / 12
        basic = monthly_gross * 0.5
        pf_employee = min(basic, 15000) * 0.12
        annual_gross = emp["salary"]
        annual_tax = max(0, (annual_gross - 75000) * 0.05) if annual_gross < 700000 else max(0, (annual_gross - 75000) * 0.1)
        tds_monthly = round(annual_tax / 12, 2)
        net = round(monthly_gross - pf_employee - tds_monthly - 200, 2)
        tax_docs.append({
            "id": uid(), "tenant_id": tid,
            "employee_id": emp["employee_id"], "employee_name": emp["name"],
            "financial_year": "2025-26", "regime": "new",
            "annual_gross": annual_gross, "annual_tax": round(annual_tax, 2),
            "monthly_tds": tds_monthly, "monthly_gross": round(monthly_gross, 2),
            "pf_employee": round(pf_employee, 2), "net_salary": net,
            "status": "filed", "created_at": ts(), "demo": True,
        })
    await db.tax_records.insert_many(tax_docs)
    print(f"  ✓ {len(tax_docs)} tax records")

    # ── PF Records ───────────────────────────────────────────────────────────
    await db.pf_records.delete_many({"tenant_id": tid, "demo": True})
    pf_docs = []
    for emp in created_emps:
        monthly_gross = emp["salary"] / 12
        basic = monthly_gross * 0.5
        pf_base = min(basic, 15000)
        pf_emp = round(pf_base * 0.12, 2)
        eps = round(min(pf_base * 0.0833, 1250), 2)
        pf_er = round(pf_base * 0.12 - eps, 2)
        pf_docs.append({
            "id": uid(), "tenant_id": tid,
            "employee_id": emp["employee_id"], "employee_name": emp["name"],
            "uan_number": f"10{random.randint(1000000000, 9999999999)}",
            "pf_account": f"MH/BOM/{random.randint(100000, 999999)}/000/{random.randint(1000000, 9999999)}",
            "monthly_basic": round(basic, 2), "pf_wage_base": round(pf_base, 2),
            "employee_pf": pf_emp, "employer_epf": pf_er, "employer_eps": eps,
            "total_monthly": round(pf_emp + pf_base * 0.12, 2),
            "financial_year": "2025-26", "status": "active",
            "created_at": ts(), "demo": True,
        })
    await db.pf_records.insert_many(pf_docs)
    print(f"  ✓ {len(pf_docs)} PF records")

    # ── Announcements ────────────────────────────────────────────────────────
    await db.announcements.delete_many({"tenant_id": tid, "demo": True})
    anns = [
        {"title": "🎉 Q2 Town Hall — This Friday 3 PM", "content": "Join us for the Q2 all-hands. Agenda: roadmap, kudos & Q&A.", "priority": "high"},
        {"title": "📋 Updated Leave Policy (Effective June 1)", "content": "New leave encashment rules effective June 1. Check the policy portal for details.", "priority": "medium"},
        {"title": "💻 Mandatory Security Training by May 31", "content": "All employees must complete the annual cybersecurity training by May 31.", "priority": "high"},
        {"title": "🏖️ Summer Half-Day Fridays", "content": "Fridays will be half-days (1 PM close) for June & July. Enjoy!", "priority": "low"},
    ]
    ann_docs = [{"id": uid(), "tenant_id": tid, **a, "created_by": "System", "created_at": ts(), "demo": True} for a in anns]
    await db.announcements.insert_many(ann_docs)
    print(f"  ✓ {len(ann_docs)} announcements")

    print("\n✅ All demo data seeded successfully!")
    print(f"\nEmployee credentials (password = mobile number):")
    for emp in created_emps:
        print(f"  {emp['employee_id']} | {emp['name']:<20} | {emp['email']:<40} | pwd: {emp['mobile']}")

asyncio.run(main())
