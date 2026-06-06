import pymongo
import uuid
import sys
from datetime import datetime, timezone, timedelta

# Configuration
MONGO_URL = "mongodb+srv://creativecloudakash_db_user:OKIlaoFRwNaRdEyO@hr-sai.u2bpdap.mongodb.net/hrms_db?retryWrites=true&w=majority&appName=HR-sai"
DB_NAME = "hrms_db"

def _now():
    return datetime.now(timezone.utc).isoformat()

def main():
    try:
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # 1. Connect and verify
        print("Connecting to MongoDB Atlas...")
        client.admin.command('ping')
        print("Connected successfully!")
        
        # 2. Get Acme Corporation Tenant
        tenant = db.tenants.find_one({"name": "Acme Corporation"})
        if not tenant:
            print("Acme Corporation tenant not found in database! Creating it first...")
            tenant_id = str(uuid.uuid4())
            tenant = {
                "id": tenant_id,
                "name": "Acme Corporation",
                "domain": "acmecorp.com",
                "subscription_plan": "premium",
                "max_employees": 200,
                "billing_cycle": "yearly",
                "status": "active",
                "employee_count": 3,
                "created_at": _now(),
                "updated_at": _now()
            }
            db.tenants.insert_one(tenant)
        else:
            tenant_id = tenant["id"]
        
        print(f"Acme Corporation Tenant ID: {tenant_id}")
        
        # Get employees
        employees = list(db.users.find({"tenant_id": tenant_id}))
        print(f"Found {len(employees)} employees in Acme Corporation.")
        
        emp_john = next((e for e in employees if e.get("email") == "john@acmecorp.com"), None)
        emp_emily = next((e for e in employees if e.get("email") == "emily@acmecorp.com"), None)
        emp_hr = next((e for e in employees if e.get("email") == "hr@acmecorp.com"), None)
        
        # 3. Insert Departments
        print("\nInserting Departments...")
        db.departments.delete_many({"tenant_id": tenant_id})
        depts = [
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Engineering", "description": "Software development and technical operations", "head": "John Smith", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Design", "description": "Product UX/UI and brand design", "head": "Emily Davis", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Human Resources", "description": "People operations, talent, and compliance", "head": "Sarah Johnson", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Sales & Marketing", "description": "Enterprise sales and marketing campaigns", "head": "Sarah Johnson", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Finance", "description": "Accounts, payroll, and bookkeeping", "head": "Sarah Johnson", "created_at": _now()}
        ]
        db.departments.insert_many(depts)
        print(f"Inserted {len(depts)} departments.")
        
        # 4. Insert Designations
        print("\nInserting Designations...")
        db.designations.delete_many({"tenant_id": tenant_id})
        designations = [
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "VP of Engineering", "level": 10, "description": "Heads the engineering division", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Senior Software Engineer", "level": 8, "description": "Design and build core architecture", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Lead UI/UX Designer", "level": 8, "description": "Lead the design language and assets", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "HR Specialist", "level": 6, "description": "Talent management and operations", "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Sales Executive", "level": 5, "description": "Direct enterprise client acquisition", "created_at": _now()}
        ]
        db.designations.insert_many(designations)
        print(f"Inserted {len(designations)} designations.")
        
        # 5. Insert Shifts
        print("\nInserting Shifts...")
        db.shifts.delete_many({"tenant_id": tenant_id})
        shifts = [
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "General Day Shift", "start_time": "09:00", "end_time": "18:00", "break_duration": 60, "working_hours": 8.0, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Early Morning Shift", "start_time": "07:00", "end_time": "16:00", "break_duration": 60, "working_hours": 8.0, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Night Swing Shift", "start_time": "22:00", "end_time": "06:00", "break_duration": 45, "working_hours": 7.25, "created_at": _now()}
        ]
        db.shifts.insert_many(shifts)
        print(f"Inserted {len(shifts)} shifts.")
        
        # 6. Insert Salary Slabs
        print("\nInserting Salary Slabs...")
        db.salary_slabs.delete_many({"tenant_id": tenant_id})
        slabs = [
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Executive Level A", "grade": "L10", "min_salary": 120000.0, "max_salary": 250000.0, "basic_percentage": 50.0, "hra_percentage": 20.0, "pf_percentage": 12.0, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Senior Staff B", "grade": "L8", "min_salary": 80000.0, "max_salary": 120000.0, "basic_percentage": 50.0, "hra_percentage": 20.0, "pf_percentage": 12.0, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Associate Level C", "grade": "L6", "min_salary": 45000.0, "max_salary": 80000.0, "basic_percentage": 50.0, "hra_percentage": 20.0, "pf_percentage": 12.0, "created_at": _now()}
        ]
        db.salary_slabs.insert_many(slabs)
        print(f"Inserted {len(slabs)} salary slabs.")
        
        # 7. Insert Holidays
        print("\nInserting Holidays...")
        db.holidays.delete_many({"tenant_id": tenant_id})
        holidays = [
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "New Year's Day", "date": "2026-01-01", "type": "public", "description": "Global New Year Celebration", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Republic Day", "date": "2026-01-26", "type": "public", "description": "Indian Republic Day", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Holi Festival", "date": "2026-03-03", "type": "public", "description": "Festival of Colors", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Good Friday", "date": "2026-04-03", "type": "public", "description": "Good Friday Christian Holiday", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Independence Day", "date": "2026-08-15", "type": "public", "description": "Indian Independence Day", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Gandhi Jayanti", "date": "2026-10-02", "type": "public", "description": "Mahatma Gandhi Birthday", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Diwali Festival", "date": "2026-11-08", "type": "public", "description": "Festival of Lights", "is_optional": False, "created_at": _now()},
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Christmas Day", "date": "2026-12-25", "type": "public", "description": "Christmas Celebration", "is_optional": False, "created_at": _now()}
        ]
        db.holidays.insert_many(holidays)
        print(f"Inserted {len(holidays)} holidays.")
        
        # 8. Insert Announcements
        print("\nInserting Announcements...")
        db.announcements.delete_many({"tenant_id": tenant_id})
        announcements = [
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "title": "Welcome to the New HRMS Portal!",
                "content": "We have successfully rolled out our advanced HR Management System. Employees can now clock in/out, view payslips, manage statutory declarations, and check leave balance on this portal.",
                "priority": "high",
                "created_by": "Sarah Johnson",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "title": "Tax Declaration Submission Deadline",
                "content": "Please submit your rent receipts, 80C, and 80D investments declarations before the end of the month to compute appropriate monthly TDS deductions.",
                "priority": "high",
                "created_by": "Sarah Johnson",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "title": "Monthly Town Hall Meeting",
                "content": "Our monthly Town Hall is scheduled for next Friday at 4:00 PM. We will discuss Q2 goals, product roadmap updates, and welcome new team members.",
                "priority": "medium",
                "created_by": "Sarah Johnson",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        db.announcements.insert_many(announcements)
        print(f"Inserted {len(announcements)} announcements.")
        
        # 9. Insert Leave Requests
        print("\nInserting Leave Requests...")
        db.leaves.delete_many({"tenant_id": tenant_id})
        
        leave_reqs = []
        if emp_john:
            leave_reqs.append({
                "id": str(uuid.uuid4()),
                "user_id": emp_john.get("employee_id"),
                "user_name": emp_john.get("name"),
                "tenant_id": tenant_id,
                "leave_type": "casual",
                "start_date": "2026-05-10",
                "end_date": "2026-05-12",
                "reason": "Family gathering out of town",
                "status": "approved",
                "reviewed_by": "Sarah Johnson",
                "reviewer_note": "Enjoy your time off!",
                "reviewed_at": (datetime.now(timezone.utc) - timedelta(days=12)).isoformat(),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
            })
            
        if emp_emily:
            leave_reqs.append({
                "id": str(uuid.uuid4()),
                "user_id": emp_emily.get("employee_id"),
                "user_name": emp_emily.get("name"),
                "tenant_id": tenant_id,
                "leave_type": "earned",
                "start_date": "2026-05-15",
                "end_date": "2026-05-18",
                "reason": "Personal vacation trip",
                "status": "rejected",
                "reviewed_by": "Sarah Johnson",
                "reviewer_note": "Cannot approve due to critical project release during this week.",
                "reviewed_at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat(),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
            })
            
            leave_reqs.append({
                "id": str(uuid.uuid4()),
                "user_id": emp_emily.get("employee_id"),
                "user_name": emp_emily.get("name"),
                "tenant_id": tenant_id,
                "leave_type": "sick",
                "start_date": "2026-05-20",
                "end_date": "2026-05-21",
                "reason": "Viral fever and severe headache",
                "status": "pending",
                "reviewed_by": None,
                "reviewer_note": "",
                "reviewed_at": None,
                "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
            })
            
        if leave_reqs:
            db.leaves.insert_many(leave_reqs)
            print(f"Inserted {len(leave_reqs)} leave requests.")
            
        # 10. Insert Attendance (last 15 days)
        print("\nInserting Attendance...")
        db.attendance.delete_many({"tenant_id": tenant_id})
        
        attendance_records = []
        base_date = datetime.now() - timedelta(days=15)
        
        for day in range(16):
            cur_date = base_date + timedelta(days=day)
            # Skip weekends (Saturday & Sunday)
            if cur_date.weekday() in (5, 6):
                continue
                
            date_str = cur_date.strftime("%Y-%m-%d")
            
            for emp in [emp_john, emp_emily, emp_hr]:
                if not emp:
                    continue
                    
                clock_in_time = f"{date_str}T09:{str(10 + day % 5).zfill(2)}:00"
                clock_out_time = f"{date_str}T18:{str(0 + day % 8).zfill(2)}:00"
                
                # Compute hours
                in_dt = datetime.fromisoformat(clock_in_time)
                out_dt = datetime.fromisoformat(clock_out_time)
                total_hours = round((out_dt - in_dt).total_seconds() / 3600, 2)
                
                attendance_records.append({
                    "id": str(uuid.uuid4()),
                    "user_id": emp.get("employee_id"),
                    "user_name": emp.get("name"),
                    "tenant_id": tenant_id,
                    "date": date_str,
                    "clock_in": clock_in_time,
                    "clock_out": clock_out_time,
                    "total_hours": total_hours,
                    "status": "present",
                    "source": "biometric" if day % 2 == 0 else "web",
                    "device_sn": "AB12345678" if day % 2 == 0 else None,
                    "created_at": _now()
                })
                
        if attendance_records:
            db.attendance.insert_many(attendance_records)
            print(f"Inserted {len(attendance_records)} attendance logs.")
            
        # 11. Insert Biometric Devices
        print("\nInserting Biometric Devices...")
        db.biometric_devices.delete_many({"tenant_id": tenant_id})
        db.biometric_devices.insert_one({
            "device_id": str(uuid.uuid4()),
            "serial_number": "AB12345678",
            "name": "Main Lobby Entrance ZK",
            "tenant_id": tenant_id,
            "status": "active",
            "online": True,
            "location": "Main Entrance Lobby",
            "first_seen": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
            "last_ping": datetime.now(timezone.utc).isoformat(),
            "firmware_pushver": "2.4.2"
        })
        print("Inserted 1 Biometric Device.")
        
        # 12. Insert Punch Corrections
        print("\nInserting Punch Corrections...")
        db.punch_corrections.delete_many({"tenant_id": tenant_id})
        
        punch_corrs = []
        if emp_john:
            punch_corrs.append({
                "id": str(uuid.uuid4()),
                "user_id": emp_john.get("employee_id"),
                "user_name": emp_john.get("name"),
                "tenant_id": tenant_id,
                "date": "2026-05-18",
                "correction_type": "clock_out",
                "requested_time": "2026-05-18T18:00:00",
                "reason": "Forgot to punch out while leaving office",
                "status": "approved",
                "reviewed_by": "Sarah Johnson",
                "reviewer_note": "Approved after manual log verification.",
                "reviewed_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()
            })
            
        if emp_emily:
            punch_corrs.append({
                "id": str(uuid.uuid4()),
                "user_id": emp_emily.get("employee_id"),
                "user_name": emp_emily.get("name"),
                "tenant_id": tenant_id,
                "date": "2026-05-19",
                "correction_type": "clock_in",
                "requested_time": "2026-05-19T09:05:00",
                "reason": "Biometric device was not reading my fingerprint properly",
                "status": "pending",
                "reviewed_by": None,
                "reviewer_note": "",
                "reviewed_at": None,
                "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
            })
            
        if punch_corrs:
            db.punch_corrections.insert_many(punch_corrs)
            print(f"Inserted {len(punch_corrs)} punch corrections.")
            
        print("\nAll live data seeded successfully!")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
