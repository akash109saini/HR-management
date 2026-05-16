from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user, hash_password

router = APIRouter(prefix="/api/employees", tags=["employees"])


class EmployeeCreate(BaseModel):
    name: str
    email: str
    mobile: str
    department: str = ""
    position: str = ""
    salary: float = 0
    role: str = "employee"


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    salary: Optional[float] = None
    mobile: Optional[str] = None
    status: Optional[str] = None


async def generate_employee_id(tenant_id: str) -> str:
    count = await db.users.count_documents({"tenant_id": tenant_id, "role": {"$in": ["employee", "hr_manager"]}})
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    prefix = tenant["name"][:4].upper() if tenant else "EMP"
    return f"EMP-{prefix}-{str(count + 1).zfill(3)}"


@router.get("")
async def list_employees(request: Request):
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        tenant_id = request.query_params.get("tenant_id")
        query = {"role": {"$in": ["employee", "hr_manager"]}}
        if tenant_id:
            query["tenant_id"] = tenant_id
    elif user["role"] == "hr_manager":
        query = {"tenant_id": user["tenant_id"], "role": {"$in": ["employee", "hr_manager"]}}
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    employees = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
    return employees


@router.post("")
async def create_employee(req: EmployeeCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    tenant_id = user.get("tenant_id")
    if user["role"] == "super_admin":
        tenant_id = request.query_params.get("tenant_id", tenant_id)

    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")

    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    employee_id = await generate_employee_id(tenant_id)
    password_hash = hash_password(req.mobile)

    new_user = {
        "email": req.email.lower(),
        "name": req.name,
        "mobile": req.mobile,
        "employee_id": employee_id,
        "password_hash": password_hash,
        "role": req.role if req.role in ["employee", "hr_manager"] else "employee",
        "tenant_id": tenant_id,
        "department": req.department,
        "position": req.position,
        "salary": req.salary,
        "status": "active",
        "first_login": True,
        "leave_balance": {"casual": 12, "sick": 10, "earned": 15},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    result = await db.users.insert_one(new_user)
    await db.tenants.update_one({"id": tenant_id}, {"$inc": {"employee_count": 1}})

    new_user.pop("_id", None)
    new_user.pop("password_hash", None)
    return {**new_user, "initial_password": req.mobile, "message": f"Employee created. Initial password is the mobile number: {req.mobile}"}


@router.get("/{employee_id}")
async def get_employee(employee_id: str, request: Request):
    user = await get_current_user(request)
    emp = await db.users.find_one({"employee_id": employee_id}, {"_id": 0, "password_hash": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user["role"] == "employee" and user.get("employee_id") != employee_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if user["role"] == "hr_manager" and emp.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    return emp


@router.put("/{employee_id}")
async def update_employee(employee_id: str, req: EmployeeUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one({"employee_id": employee_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp = await db.users.find_one({"employee_id": employee_id}, {"_id": 0, "password_hash": 0})
    return emp


@router.get("/me/profile")
async def get_my_profile(request: Request):
    user = await get_current_user(request)
    profile = await db.users.find_one({"email": user["email"]}, {"_id": 0, "password_hash": 0})
    return profile
