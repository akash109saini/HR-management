from database import db
from auth_utils import hash_password
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os

logger = logging.getLogger(__name__)


async def seed_database():
    """Seed database with demo data if empty."""
    existing_admin = await db.users.find_one({"role": "super_admin"})
    if existing_admin:
        logger.info("Database already seeded, skipping.")
        return

    logger.info("Seeding database with demo data...")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@hrms.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    # Create Super Admin
    super_admin = {
        "email": admin_email,
        "name": "System Administrator",
        "mobile": "9999999999",
        "employee_id": "SA-001",
        "password_hash": hash_password(admin_password),
        "role": "super_admin",
        "tenant_id": None,
        "department": "Administration",
        "position": "Super Admin",
        "salary": 0,
        "status": "active",
        "first_login": False,
        "leave_balance": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(super_admin)

    # Create Tenants
    tenant1_id = str(uuid.uuid4())
    tenant2_id = str(uuid.uuid4())

    tenants = [
        {
            "id": tenant1_id,
            "name": "Acme Corporation",
            "domain": "acmecorp.com",
            "subscription_plan": "premium",
            "max_employees": 200,
            "billing_cycle": "yearly",
            "status": "active",
            "employee_count": 3,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": tenant2_id,
            "name": "Tech Solutions Inc",
            "domain": "techsolutions.io",
            "subscription_plan": "basic",
            "max_employees": 50,
            "billing_cycle": "monthly",
            "status": "active",
            "employee_count": 2,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await db.tenants.insert_many(tenants)

    # Create HR Managers
    hr1 = {
        "email": "hr@acmecorp.com",
        "name": "Sarah Johnson",
        "mobile": "9876543210",
        "employee_id": "EMP-ACME-001",
        "password_hash": hash_password("9876543210"),
        "role": "hr_manager",
        "tenant_id": tenant1_id,
        "department": "Human Resources",
        "position": "HR Manager",
        "salary": 85000,
        "status": "active",
        "first_login": True,
        "leave_balance": {"casual": 12, "sick": 10, "earned": 15},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    hr2 = {
        "email": "hr@techsolutions.io",
        "name": "Mike Chen",
        "mobile": "9876543211",
        "employee_id": "EMP-TECH-001",
        "password_hash": hash_password("9876543211"),
        "role": "hr_manager",
        "tenant_id": tenant2_id,
        "department": "Human Resources",
        "position": "HR Manager",
        "salary": 75000,
        "status": "active",
        "first_login": True,
        "leave_balance": {"casual": 12, "sick": 10, "earned": 15},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Create Employees
    emp1 = {
        "email": "john@acmecorp.com",
        "name": "John Smith",
        "mobile": "9123456780",
        "employee_id": "EMP-ACME-002",
        "password_hash": hash_password("9123456780"),
        "role": "employee",
        "tenant_id": tenant1_id,
        "department": "Engineering",
        "position": "Senior Developer",
        "salary": 95000,
        "status": "active",
        "first_login": True,
        "leave_balance": {"casual": 10, "sick": 8, "earned": 15},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    emp2 = {
        "email": "emily@acmecorp.com",
        "name": "Emily Davis",
        "mobile": "9123456781",
        "employee_id": "EMP-ACME-003",
        "password_hash": hash_password("9123456781"),
        "role": "employee",
        "tenant_id": tenant1_id,
        "department": "Design",
        "position": "UI/UX Designer",
        "salary": 78000,
        "status": "active",
        "first_login": True,
        "leave_balance": {"casual": 12, "sick": 10, "earned": 15},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    emp3 = {
        "email": "alex@techsolutions.io",
        "name": "Alex Rivera",
        "mobile": "9123456782",
        "employee_id": "EMP-TECH-002",
        "password_hash": hash_password("9123456782"),
        "role": "employee",
        "tenant_id": tenant2_id,
        "department": "Development",
        "position": "Full Stack Developer",
        "salary": 88000,
        "status": "active",
        "first_login": True,
        "leave_balance": {"casual": 12, "sick": 10, "earned": 15},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.users.insert_many([hr1, hr2, emp1, emp2, emp3])

    # Create sample attendance records (last 7 days)
    now = datetime.now(timezone.utc)
    users_for_attendance = [
        ("EMP-ACME-001", "Sarah Johnson", tenant1_id),
        ("EMP-ACME-002", "John Smith", tenant1_id),
        ("EMP-ACME-003", "Emily Davis", tenant1_id),
        ("EMP-TECH-001", "Mike Chen", tenant2_id),
        ("EMP-TECH-002", "Alex Rivera", tenant2_id),
    ]

    attendance_records = []
    for i in range(7):
        day = now - timedelta(days=i + 1)
        if day.weekday() >= 5:  # Skip weekends
            continue
        date_str = day.strftime("%Y-%m-%d")
        for emp_id, name, tid in users_for_attendance:
            clock_in = day.replace(hour=9, minute=0, second=0)
            clock_out = day.replace(hour=17, minute=30, second=0)
            attendance_records.append({
                "id": str(uuid.uuid4()),
                "user_id": emp_id,
                "user_name": name,
                "tenant_id": tid,
                "date": date_str,
                "clock_in": clock_in.isoformat(),
                "clock_out": clock_out.isoformat(),
                "total_hours": 8.5,
                "status": "present",
                "note": "",
                "created_at": clock_in.isoformat(),
            })

    if attendance_records:
        await db.attendance.insert_many(attendance_records)

    # Sample leave requests
    leaves = [
        {
            "id": str(uuid.uuid4()),
            "user_id": "EMP-ACME-002",
            "user_name": "John Smith",
            "tenant_id": tenant1_id,
            "leave_type": "casual",
            "start_date": (now + timedelta(days=5)).strftime("%Y-%m-%d"),
            "end_date": (now + timedelta(days=6)).strftime("%Y-%m-%d"),
            "reason": "Family function",
            "status": "pending",
            "reviewed_by": None,
            "reviewer_note": "",
            "reviewed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": "EMP-ACME-003",
            "user_name": "Emily Davis",
            "tenant_id": tenant1_id,
            "leave_type": "sick",
            "start_date": (now + timedelta(days=2)).strftime("%Y-%m-%d"),
            "end_date": (now + timedelta(days=2)).strftime("%Y-%m-%d"),
            "reason": "Medical appointment",
            "status": "pending",
            "reviewed_by": None,
            "reviewer_note": "",
            "reviewed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await db.leaves.insert_many(leaves)

    # Sample punch corrections
    corrections = [
        {
            "id": str(uuid.uuid4()),
            "user_id": "EMP-ACME-002",
            "user_name": "John Smith",
            "tenant_id": tenant1_id,
            "date": (now - timedelta(days=2)).strftime("%Y-%m-%d"),
            "correction_type": "clock_out",
            "requested_time": "18:00:00",
            "reason": "Forgot to clock out, was working late",
            "status": "pending",
            "reviewed_by": None,
            "reviewer_note": "",
            "reviewed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await db.punch_corrections.insert_many(corrections)

    # Sample job postings
    jobs = [
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant1_id,
            "title": "Senior Backend Engineer",
            "department": "Engineering",
            "description": "Looking for an experienced backend engineer with Python/Node.js expertise.",
            "requirements": "5+ years experience, Python, FastAPI, PostgreSQL/MongoDB",
            "location": "Remote",
            "salary_range": "$100k - $130k",
            "status": "open",
            "applicant_count": 2,
            "created_by": "Sarah Johnson",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant1_id,
            "title": "Product Designer",
            "department": "Design",
            "description": "Seeking a creative product designer to join our growing design team.",
            "requirements": "3+ years experience, Figma, user research, prototyping",
            "location": "Hybrid",
            "salary_range": "$80k - $100k",
            "status": "open",
            "applicant_count": 0,
            "created_by": "Sarah Johnson",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await db.job_postings.insert_many(jobs)

    # Sample announcements
    announcements = [
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant1_id,
            "title": "Annual Company Retreat",
            "content": "We are excited to announce our annual company retreat scheduled for next month. All team members are encouraged to participate. More details will follow.",
            "priority": "high",
            "created_by": "Sarah Johnson",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant1_id,
            "title": "Updated Work From Home Policy",
            "content": "Starting next week, the updated WFH policy will be in effect. Please review the policy document shared via email for complete details.",
            "priority": "medium",
            "created_by": "Sarah Johnson",
            "created_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant2_id,
            "title": "Q1 Town Hall Meeting",
            "content": "Join us for the Q1 town hall meeting this Friday at 3 PM. The CEO will share company updates and Q1 results.",
            "priority": "high",
            "created_by": "Mike Chen",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await db.announcements.insert_many(announcements)

    # Sample performance reviews
    reviews = [
        {
            "id": str(uuid.uuid4()),
            "employee_id": "EMP-ACME-002",
            "employee_name": "John Smith",
            "reviewer_id": "EMP-ACME-001",
            "reviewer_name": "Sarah Johnson",
            "tenant_id": tenant1_id,
            "review_period": "Q4 2025",
            "rating": 4,
            "goals": "Lead the migration to microservices architecture. Mentor 2 junior developers.",
            "achievements": "Successfully delivered 3 major features. Reduced API response time by 40%.",
            "areas_of_improvement": "Documentation could be more thorough. Time management during sprint planning.",
            "ai_summary": None,
            "status": "submitted",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await db.performance_reviews.insert_many(reviews)

    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# HRMS Test Credentials\n\n")
        f.write("## Super Admin\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write("- Role: super_admin\n\n")
        f.write("## HR Manager (Acme Corp)\n")
        f.write("- Email: hr@acmecorp.com\n")
        f.write("- Password: 9876543210 (mobile number, first_login=true)\n")
        f.write("- Role: hr_manager\n\n")
        f.write("## HR Manager (Tech Solutions)\n")
        f.write("- Email: hr@techsolutions.io\n")
        f.write("- Password: 9876543211 (mobile number, first_login=true)\n")
        f.write("- Role: hr_manager\n\n")
        f.write("## Employee (Acme Corp - John Smith)\n")
        f.write("- Email: john@acmecorp.com\n")
        f.write("- Password: 9123456780 (mobile number, first_login=true)\n")
        f.write("- Role: employee\n\n")
        f.write("## Employee (Acme Corp - Emily Davis)\n")
        f.write("- Email: emily@acmecorp.com\n")
        f.write("- Password: 9123456781 (mobile number, first_login=true)\n")
        f.write("- Role: employee\n\n")
        f.write("## Employee (Tech Solutions - Alex Rivera)\n")
        f.write("- Email: alex@techsolutions.io\n")
        f.write("- Password: 9123456782 (mobile number, first_login=true)\n")
        f.write("- Role: employee\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/change-password\n")
        f.write("- GET /api/auth/me\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- POST /api/auth/refresh\n\n")
        f.write("## Note\n")
        f.write("- HR Managers and Employees have first_login=true, so they need to change password on first login.\n")
        f.write("- Super Admin (admin@hrms.com / admin123) does NOT have first_login=true.\n")

    logger.info("Database seeded successfully!")
