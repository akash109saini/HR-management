from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from bson import ObjectId
import uuid

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


class TenantCreate(BaseModel):
    name: str
    domain: Optional[str] = ""
    subscription_plan: str = "basic"
    max_employees: int = 50
    billing_cycle: str = "monthly"


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    subscription_plan: Optional[str] = None
    max_employees: Optional[int] = None
    billing_cycle: Optional[str] = None
    status: Optional[str] = None


@router.get("")
async def list_tenants(request: Request):
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(1000)
    return tenants


@router.post("")
async def create_tenant(req: TenantCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    tenant = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "domain": req.domain,
        "subscription_plan": req.subscription_plan,
        "max_employees": req.max_employees,
        "billing_cycle": req.billing_cycle,
        "status": "active",
        "employee_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tenants.insert_one(tenant)
    tenant.pop("_id", None)
    return tenant


@router.get("/{tenant_id}")
async def get_tenant(tenant_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/{tenant_id}")
async def update_tenant(tenant_id: str, req: TenantUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.tenants.update_one({"id": tenant_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return tenant


@router.delete("/{tenant_id}")
async def delete_tenant(tenant_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"status": "deleted"}})
    return {"message": "Tenant deleted"}
