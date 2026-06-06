import pymongo
import uuid
import sys
from datetime import datetime, timezone

# Configuration
MONGO_URL = "mongodb+srv://creativecloudakash_db_user:OKIlaoFRwNaRdEyO@hr-sai.u2bpdap.mongodb.net/hrms_db?retryWrites=true&w=majority&appName=HR-sai"
DB_NAME = "hrms_db"

def main():
    try:
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        tenant = db.tenants.find_one({"name": "Acme Corporation"})
        if not tenant:
            print("Acme Corporation tenant not found!")
            return
            
        tenant_id = tenant["id"]
        employees = list(db.users.find({"tenant_id": tenant_id, "role": "employee"}))
        
        print(f"Generating payslips for {len(employees)} employees...")
        db.payslips.delete_many({"tenant_id": tenant_id})
        
        for emp in employees:
            salary = float(emp.get("salary", 0) or 80000.0)
            basic = round(salary * 0.5, 2)
            hra = round(salary * 0.2, 2)
            allowances = round(salary * 0.15, 2)
            special = round(salary - basic - hra - allowances, 2)
            
            # Simple PF
            pf = round(min(basic, 15000.0) * 0.12, 2)
            
            # Simple ESI
            esi = 0.0
            if salary <= 21000.0:
                esi = round(salary * 0.0075, 2)
                
            tax = 2500.0 if salary > 50000.0 else 0.0
            total_deductions = round(pf + esi + tax, 2)
            net_salary = round(salary - total_deductions, 2)
            
            # Add payslips for April 2026 and May 2026
            for month in [4, 5]:
                payslip = {
                    "id": str(uuid.uuid4()),
                    "employee_id": emp.get("employee_id"),
                    "employee_name": emp.get("name"),
                    "tenant_id": tenant_id,
                    "month": month,
                    "year": 2026,
                    "financial_year": "2026-27" if month >= 4 else "2025-26",
                    "currency": "INR",
                    "currency_symbol": "₹",
                    "basic_salary": basic,
                    "hra": hra,
                    "allowances": allowances,
                    "special_allowance": special,
                    "gross_salary": salary,
                    "pf_wage": min(basic, 15000.0),
                    "eps_wage": min(basic, 15000.0),
                    "pf_deduction": pf,
                    "employer_epf": round(min(basic, 15000.0) * 0.0367, 2),
                    "employer_eps": round(min(basic, 15000.0) * 0.0833, 2),
                    "edli": round(min(basic, 15000.0) * 0.005, 2),
                    "admin_charges": round(min(basic, 15000.0) * 0.005, 2),
                    "esi_applicable": salary <= 21000.0,
                    "esi_employee": esi,
                    "esi_employer": round(salary * 0.0325, 2) if salary <= 21000.0 else 0.0,
                    "tax_regime": "new",
                    "tax": tax,
                    "annual_tax": tax * 12,
                    "taxable_income": salary * 12 - pf * 12,
                    "absence_deduction": 0.0,
                    "total_deductions": total_deductions,
                    "net_salary": net_salary,
                    "days_worked": 22,
                    "days_absent": 0,
                    "department": emp.get("department", "Engineering"),
                    "position": emp.get("position", "Developer"),
                    "status": "published",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                db.payslips.insert_one(payslip)
                print(f"Generated payslip for {emp.get('name')} (Month: {month}/2026)")
                
        print("Payslip generation complete!")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
