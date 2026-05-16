"""
User management routes (/api/users, /api/roles)
These are HR-level routes for managing users and roles.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user, hash_password
import uuid

router = APIRouter(tags=["users"])


# ─── Roles ────────────────────────────────────────────────────────────────────

class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permissions: List[str] = []


SYSTEM_ROLES = [
    {
        "id": "system-super-admin",
        "name": "Super Admin",
        "description": "Full system access",
        "type": "system",
        "editable": False,
        "permissions": ["*"],
    },
    {
        "id": "system-hr-manager",
        "name": "HR Manager",
        "description": "Manage HR operations for a tenant",
        "type": "system",
        "editable": False,
        "permissions": [
            "employees", "departments", "attendance", "leaves", "payroll",
            "recruitment", "performance", "announcements", "terminations",
            "resignations", "shifts", "designations", "salary_slabs",
            "holidays", "onboarding",
        ],
    },
    {
        "id": "system-employee",
        "name": "Employee",
        "description": "Standard employee access",
        "type": "system",
        "editable": False,
        "permissions": [
            "self_attendance", "self_leaves", "self_payslips", "self_profile",
        ],
    },
]


@router.get("/api/roles")
async def list_roles(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    tenant_id = user.get("tenant_id")
    custom_roles = []
    if tenant_id:
        custom_roles = await db.custom_roles.find(
            {"tenant_id": tenant_id}, {"_id": 0}
        ).to_list(100)

    return SYSTEM_ROLES + custom_roles


@router.post("/api/roles")
async def create_role(req: RoleCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required")

    # Check duplicate
    existing = await db.custom_roles.find_one(
        {"name": req.name, "tenant_id": tenant_id}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Role with this name already exists")

    role = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "description": req.description,
        "permissions": req.permissions,
        "type": "custom",
        "editable": True,
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.custom_roles.insert_one(role)
    role.pop("_id", None)
    return role


@router.put("/api/roles/{role_id}")
async def update_role(role_id: str, req: RoleCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.custom_roles.update_one(
        {"id": role_id, "tenant_id": user.get("tenant_id")},
        {"$set": {"name": req.name, "description": req.description, "permissions": req.permissions}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Role not found")

    role = await db.custom_roles.find_one({"id": role_id}, {"_id": 0})
    return role


@router.delete("/api/roles/{role_id}")
async def delete_role(role_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.custom_roles.delete_one(
        {"id": role_id, "tenant_id": user.get("tenant_id"), "editable": True}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Role not found or not editable")

    return {"message": "Role deleted"}


# ─── Users (alias for employees within a tenant) ──────────────────────────────

class UserUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None


@router.get("/api/users")
async def list_users(request: Request):
    """Return all users in the current tenant (alias for employees)."""
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        tenant_id = request.query_params.get("tenant_id")
        query = {"role": {"$in": ["employee", "hr_manager"]}}
        if tenant_id:
            query["tenant_id"] = tenant_id
    elif user["role"] == "hr_manager":
        query = {
            "tenant_id": user["tenant_id"],
            "role": {"$in": ["employee", "hr_manager"]},
        }
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@router.put("/api/users/{employee_id}")
async def update_user(employee_id: str, req: UserUpdate, request: Request):
    current = await get_current_user(request)
    if current["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates: dict = {}
    if req.role and req.role in ["employee", "hr_manager"]:
        updates["role"] = req.role
    if req.status and req.status in ["active", "suspended", "terminated"]:
        updates["status"] = req.status

    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one({"employee_id": employee_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    emp = await db.users.find_one({"employee_id": employee_id}, {"_id": 0, "password_hash": 0})
    return emp


@router.post("/api/users/{employee_id}/reset-password")
async def reset_user_password(employee_id: str, request: Request):
    """Reset a user's password back to their mobile number. HR/Admin only."""
    current = await get_current_user(request)
    if current["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Find target user
    target = await db.users.find_one({"employee_id": employee_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # HR managers can only reset passwords within their tenant
    if current["role"] == "hr_manager" and target.get("tenant_id") != current.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Not authorized for this tenant")

    mobile = target.get("mobile", "")
    if not mobile:
        raise HTTPException(status_code=400, detail="User has no mobile number to reset to")

    new_hash = hash_password(mobile)
    await db.users.update_one(
        {"employee_id": employee_id},
        {"$set": {
            "password_hash": new_hash,
            "first_login": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return {
        "message": "Password reset successfully. User will be prompted to change it on next login.",
        "new_password": mobile,
        "employee_id": employee_id,
    }
