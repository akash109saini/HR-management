import os
import json
import pymysql
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime

load_dotenv()

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME') or os.environ.get('DB_DATABASE', 'hrms_db')
print(f"Connecting to MongoDB: {mongo_url.split('@')[-1]} ...")
mongo_client = MongoClient(mongo_url)
mongodb = mongo_client[db_name]

# MySQL connection
mysql_host = "127.0.0.1"
mysql_port = 3306
mysql_user = "root"
mysql_password = ""
mysql_db = "DMR-HR"

print(f"Connecting to MySQL: {mysql_host}:{mysql_port} (db: {mysql_db}) ...")
mysql_conn = pymysql.connect(
    host=mysql_host,
    port=mysql_port,
    user=mysql_user,
    password=mysql_password,
    database=mysql_db,
    charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor
)

def clean_val(val):
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, ObjectId):
        return str(val)
    if isinstance(val, bool):
        return 1 if val else 0
    return val

# Map of collection names to target tables and their columns
COLLECTION_MAP = {
    "tenants": {
        "table": "tenants",
        "pk": "id",
        "columns": ["id", "name", "domain", "subscription_plan", "max_employees", "billing_cycle", "status", "employee_count", "created_at", "updated_at"]
    },
    "users": {
        "table": "users",
        "pk": "employee_id",
        "columns": ["email", "name", "mobile", "employee_id", "password_hash", "role", "tenant_id", "department", "designation", "position", "salary", "status", "first_login", "leave_balance", "bank_details", "biometric_pin", "shift", "joining_date", "created_at", "updated_at"]
    },
    "departments": {
        "table": "departments",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "description", "head", "created_at"]
    },
    "designations": {
        "table": "designations",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "level", "description", "created_at"]
    },
    "shifts": {
        "table": "shifts",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "start_time", "end_time", "break_duration", "working_hours", "created_at"]
    },
    "salary_slabs": {
        "table": "salary_slabs",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "grade", "min_salary", "max_salary", "basic_percentage", "hra_percentage", "pf_percentage", "created_at"]
    },
    "attendance": {
        "table": "attendance",
        "pk": "id",
        "columns": ["id", "user_id", "user_name", "tenant_id", "date", "clock_in", "clock_out", "total_hours", "status", "note", "created_at", "demo"]
    },
    "punch_corrections": {
        "table": "punch_corrections",
        "pk": "id",
        "columns": ["id", "user_id", "user_name", "tenant_id", "date", "correction_type", "requested_time", "reason", "status", "reviewed_by", "reviewer_note", "reviewed_at", "created_at", "demo"]
    },
    "leaves": {
        "table": "leaves",
        "pk": "id",
        "columns": ["id", "user_id", "user_name", "tenant_id", "leave_type", "start_date", "end_date", "days", "total_days", "reason", "status", "reviewed_by", "reviewer_note", "reviewed_at", "created_at", "demo"]
    },
    "holidays": {
        "table": "holidays",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "date", "type", "description", "is_optional", "created_at", "demo"]
    },
    "tax_records": {
        "table": "tax_records",
        "pk": "id",
        "columns": ["id", "tenant_id", "employee_id", "employee_name", "financial_year", "regime", "annual_gross", "annual_tax", "monthly_tds", "monthly_gross", "pf_employee", "net_salary", "status", "created_at", "demo"]
    },
    "pf_records": {
        "table": "pf_records",
        "pk": "id",
        "columns": ["id", "tenant_id", "employee_id", "employee_name", "uan_number", "pf_account", "monthly_basic", "pf_wage_base", "employee_pf", "employer_epf", "employer_eps", "total_monthly", "financial_year", "status", "created_at", "demo"]
    },
    "announcements": {
        "table": "announcements",
        "pk": "id",
        "columns": ["id", "tenant_id", "title", "content", "priority", "created_by", "created_at", "demo"]
    },
    "performance_reviews": {
        "table": "performance_reviews",
        "pk": "id",
        "columns": ["id", "employee_id", "employee_name", "reviewer_id", "reviewer_name", "tenant_id", "review_period", "rating", "goals", "achievements", "areas_of_improvement", "ai_summary", "status", "created_at"]
    },
    "job_postings": {
        "table": "job_postings",
        "pk": "id",
        "columns": ["id", "tenant_id", "title", "department", "description", "requirements", "location", "salary_range", "status", "applicant_count", "created_by", "created_at"]
    },
    "payslips": {
        "table": "payslips",
        "pk": "id",
        "columns": ["id", "employee_id", "employee_name", "tenant_id", "month", "year", "financial_year", "currency", "currency_symbol", "basic_salary", "hra", "allowances", "special_allowance", "gross_salary", "pf_wage", "eps_wage", "pf_deduction", "employer_epf", "employer_eps", "edli", "admin_charges", "esi_applicable", "esi_employee", "esi_employer", "tax_regime", "tax", "annual_tax", "taxable_income", "absence_deduction", "total_deductions", "net_salary", "days_worked", "days_absent", "department", "position", "status", "created_at"]
    },
    "login_attempts": {
        "table": "login_attempts",
        "pk": "identifier",
        "columns": ["identifier", "count", "last_attempt"]
    },
    "tax_settings": {
        "table": "tax_settings",
        "pk": "id",
        "columns": ["id", "tenant_id", "financial_year", "default_regime", "new_regime_slabs", "old_regime_slabs", "surcharge_slabs", "standard_deduction_new", "standard_deduction_old", "cess_rate", "rebate_87a_limit_new", "rebate_87a_max_new", "rebate_87a_limit_old", "rebate_87a_max_old", "max_80c", "max_80d_self", "max_80d_parents", "max_80ccd_1b", "max_24_home_loan", "created_at", "updated_at"]
    },
    "tax_declarations": {
        "table": "tax_declarations",
        "pk": "id",
        "columns": ["id", "employee_id", "tenant_id", "financial_year", "regime", "declarations", "status", "reviewed_by", "reviewer_note", "reviewed_at", "created_at", "updated_at"]
    },
    "pf_settings": {
        "table": "pf_settings",
        "pk": "id",
        "columns": ["id", "tenant_id", "pf_rate_employee", "pf_rate_employer", "pf_wage_ceiling", "pf_apply_ceiling", "eps_wage_ceiling", "edli_rate", "admin_charges_rate", "nps_enabled", "employer_nps_rate", "esi_enabled", "esi_employee_rate", "esi_employer_rate", "esi_wage_limit", "created_at", "updated_at"]
    },
    "biometric_devices": {
        "table": "biometric_devices",
        "pk": "device_id",
        "columns": ["device_id", "serial_number", "name", "tenant_id", "status", "online", "location", "first_seen", "last_ping", "firmware_pushver"]
    },
    "biometric_punches": {
        "table": "biometric_punches",
        "pk": "punch_id",
        "columns": ["punch_id", "device_sn", "device_name", "tenant_id", "user_pin", "employee_id", "employee_name", "timestamp", "status", "verify_mode", "source", "matched", "received_at"]
    },
    "whatsapp_messages": {
        "table": "whatsapp_messages",
        "pk": "message_id",
        "columns": ["message_id", "to", "sent_by", "tenant_id", "text", "type", "direction", "send_status", "send_error", "created_at"]
    },
    "custom_roles": {
        "table": "custom_roles",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "description", "permissions", "type", "editable", "created_at"]
    },
    "ai_conversations": {
        "table": "ai_conversations",
        "pk": "id",
        "columns": ["id", "user_id", "messages", "created_at"]
    },
    "feedbacks": {
        "table": "feedbacks",
        "pk": "id",
        "columns": ["id", "user_id", "feedback_text", "rating", "created_at"]
    },
    "biometric_raw_pushes": {
        "table": "biometric_raw_pushes",
        "pk": "id",
        "columns": ["id", "device_sn", "raw_data", "created_at"]
    },
    "biometric_commands": {
        "table": "biometric_commands",
        "pk": "id",
        "columns": ["id", "device_sn", "command", "status", "created_at", "updated_at"]
    },
    "leave_types": {
        "table": "leave_types",
        "pk": "id",
        "columns": ["id", "tenant_id", "name", "days_allotted", "description"]
    }
}

def migrate_collection(col_name, mapping):
    table = mapping["table"]
    columns = mapping["columns"]
    pk = mapping["pk"]
    
    col = mongodb[col_name]
    documents = list(col.find({}))
    
    print(f"Migrating {len(documents)} documents from MongoDB '{col_name}' to MySQL '{table}'...")
    
    if not documents:
        return
        
    with mysql_conn.cursor() as cursor:
        # Clear existing data to allow fresh seed
        cursor.execute(f"SET FOREIGN_KEY_CHECKS = 0;")
        cursor.execute(f"TRUNCATE TABLE `{table}`;")
        cursor.execute(f"SET FOREIGN_KEY_CHECKS = 1;")
        
        # Build REPLACE query
        placeholders = ", ".join(["%s"] * len(columns))
        col_names_str = ", ".join([f"`{c}`" for c in columns])
        query = f"REPLACE INTO `{table}` ({col_names_str}) VALUES ({placeholders})"
        
        batch = []
        for doc in documents:
            row = []
            for col_name_in_sql in columns:
                val = doc.get(col_name_in_sql)
                # Fallback to id mapping if pk column is missing in mongo document but present under another key
                if val is None:
                    if col_name_in_sql == pk:
                        val = doc.get("id") or doc.get("key") or doc.get("_id")
                    elif col_name_in_sql == "id":
                        val = doc.get(pk) or doc.get("_id")
                
                row.append(clean_val(val))
            batch.append(row)
            
            # Execute in chunks of 100
            if len(batch) >= 100:
                cursor.executemany(query, batch)
                batch = []
                
        if batch:
            cursor.executemany(query, batch)
            
        mysql_conn.commit()
    print(f"Successfully migrated '{col_name}' -> '{table}'")

def main():
    try:
        # Check all collections in Mongo
        mongo_collections = mongodb.list_collection_names()
        print(f"MongoDB Collections: {sorted(mongo_collections)}")
        
        for col_name, mapping in COLLECTION_MAP.items():
            if col_name in mongo_collections:
                migrate_collection(col_name, mapping)
            else:
                print(f"Collection '{col_name}' not found in MongoDB database, skipping migration but table remains empty.")
                
        print("\nDatabase migration completed successfully!")
    except Exception as e:
        print(f"Migration error: {e}")
    finally:
        mysql_conn.close()
        mongo_client.close()

if __name__ == "__main__":
    main()
