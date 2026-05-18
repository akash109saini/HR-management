"""Tax management routes — settings, declarations, computation, reports."""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import io
import csv

from database import db
from auth_utils import get_current_user
from services.tax_calculator import (
    DEFAULT_TAX_SETTINGS,
    merged_settings,
    compute_tax,
)

router = APIRouter(prefix="/api/tax", tags=["tax"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] not in ("super_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    return user


async def _current_fy() -> str:
    """Return the current Indian financial year (e.g. '2025-26')."""
    now = datetime.now(timezone.utc)
    y = now.year
    if now.month >= 4:
        return f"{y}-{str(y + 1)[-2:]}"
    return f"{y - 1}-{str(y)[-2:]}"


async def _get_settings(tenant_id: Optional[str], fy: str) -> Dict:
    if tenant_id is None:
        # super-admin tenant-less: return defaults
        return dict(DEFAULT_TAX_SETTINGS, financial_year=fy)
    doc = await db.tax_settings.find_one(
        {"tenant_id": tenant_id, "financial_year": fy}, {"_id": 0}
    )
    if doc:
        return doc
    # No custom — fall back to defaults but stamp the FY
    return dict(DEFAULT_TAX_SETTINGS, financial_year=fy, tenant_id=tenant_id)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TaxSettingsUpsert(BaseModel):
    financial_year: Optional[str] = None
    default_regime: Optional[str] = Field(None, pattern="^(new|old)$")
    new_regime_slabs: Optional[List[Dict[str, Any]]] = None
    old_regime_slabs: Optional[List[Dict[str, Any]]] = None
    surcharge_slabs: Optional[List[Dict[str, Any]]] = None
    standard_deduction_new: Optional[float] = None
    standard_deduction_old: Optional[float] = None
    cess_rate: Optional[float] = None
    rebate_87a_limit_new: Optional[float] = None
    rebate_87a_max_new: Optional[float] = None
    rebate_87a_limit_old: Optional[float] = None
    rebate_87a_max_old: Optional[float] = None
    max_80c: Optional[float] = None
    max_80d_self: Optional[float] = None
    max_80d_parents: Optional[float] = None
    max_80ccd_1b: Optional[float] = None
    max_24_home_loan: Optional[float] = None


class TaxDeclarationUpsert(BaseModel):
    financial_year: Optional[str] = None
    regime: str = Field("new", pattern="^(new|old)$")
    declarations: Dict[str, Any] = Field(default_factory=dict)
    status: Optional[str] = Field(None, pattern="^(draft|submitted)$")


class TaxDeclarationDecision(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    note: Optional[str] = None


class TaxComputeRequest(BaseModel):
    employee_id: Optional[str] = None
    gross_annual: Optional[float] = None
    basic_annual: Optional[float] = None
    hra_annual: Optional[float] = None
    regime: Optional[str] = Field(None, pattern="^(new|old)$")
    financial_year: Optional[str] = None
    declarations: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Tax SETTINGS (per tenant per FY)
# ---------------------------------------------------------------------------
@router.get("/settings")
async def get_tax_settings(request: Request):
    user = await get_current_user(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    settings = await _get_settings(user.get("tenant_id"), fy)
    return settings


@router.put("/settings")
async def upsert_tax_settings(req: TaxSettingsUpsert, request: Request):
    user = await _require_admin(request)
    tenant_id = user.get("tenant_id")
    if tenant_id is None and user["role"] != "super_admin":
        raise HTTPException(status_code=400, detail="Tenant context required")

    fy = req.financial_year or await _current_fy()
    payload = {k: v for k, v in req.model_dump().items() if v is not None}
    payload["tenant_id"] = tenant_id
    payload["financial_year"] = fy
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    existing = await db.tax_settings.find_one(
        {"tenant_id": tenant_id, "financial_year": fy}
    )
    if existing:
        await db.tax_settings.update_one(
            {"_id": existing["_id"]}, {"$set": payload}
        )
    else:
        payload["id"] = str(uuid.uuid4())
        payload["created_at"] = payload["updated_at"]
        await db.tax_settings.insert_one(payload)
    out = await db.tax_settings.find_one(
        {"tenant_id": tenant_id, "financial_year": fy}, {"_id": 0}
    )
    return out


@router.post("/settings/reset")
async def reset_tax_settings(request: Request):
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    await db.tax_settings.delete_one(
        {"tenant_id": user.get("tenant_id"), "financial_year": fy}
    )
    return await _get_settings(user.get("tenant_id"), fy)


# ---------------------------------------------------------------------------
# Tax DECLARATIONS (per employee per FY)
# ---------------------------------------------------------------------------
@router.get("/declarations/me")
async def my_declarations(request: Request):
    user = await get_current_user(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    doc = await db.tax_declarations.find_one(
        {
            "employee_id": user.get("employee_id"),
            "tenant_id": user.get("tenant_id"),
            "financial_year": fy,
        },
        {"_id": 0},
    )
    if not doc:
        return {
            "employee_id": user.get("employee_id"),
            "tenant_id": user.get("tenant_id"),
            "financial_year": fy,
            "regime": "new",
            "declarations": {},
            "status": "draft",
        }
    return doc


@router.put("/declarations/me")
async def upsert_my_declaration(req: TaxDeclarationUpsert, request: Request):
    user = await get_current_user(request)
    fy = req.financial_year or await _current_fy()
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "employee_id": user.get("employee_id"),
        "tenant_id": user.get("tenant_id"),
        "financial_year": fy,
        "regime": req.regime,
        "declarations": req.declarations or {},
        "status": req.status or "draft",
        "updated_at": now,
    }
    if req.status == "submitted":
        payload["submitted_at"] = now
    existing = await db.tax_declarations.find_one(
        {
            "employee_id": user.get("employee_id"),
            "tenant_id": user.get("tenant_id"),
            "financial_year": fy,
        }
    )
    if existing:
        if existing.get("status") == "approved":
            raise HTTPException(status_code=400, detail="Declaration already approved; contact HR.")
        await db.tax_declarations.update_one(
            {"_id": existing["_id"]}, {"$set": payload}
        )
    else:
        payload["id"] = str(uuid.uuid4())
        payload["created_at"] = now
        await db.tax_declarations.insert_one(payload)
    return await db.tax_declarations.find_one(
        {
            "employee_id": user.get("employee_id"),
            "tenant_id": user.get("tenant_id"),
            "financial_year": fy,
        },
        {"_id": 0},
    )


@router.get("/declarations")
async def list_declarations(request: Request):
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    status = request.query_params.get("status")
    q: Dict[str, Any] = {"financial_year": fy}
    if user.get("tenant_id"):
        q["tenant_id"] = user.get("tenant_id")
    if status:
        q["status"] = status
    rows = await db.tax_declarations.find(q, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    return rows


@router.post("/declarations/{declaration_id}/decision")
async def decide_declaration(declaration_id: str, body: TaxDeclarationDecision, request: Request):
    user = await _require_admin(request)
    doc = await db.tax_declarations.find_one({"id": declaration_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Declaration not found")
    if user.get("tenant_id") and doc.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    now = datetime.now(timezone.utc).isoformat()
    new_status = "approved" if body.action == "approve" else "draft"
    await db.tax_declarations.update_one(
        {"id": declaration_id},
        {
            "$set": {
                "status": new_status,
                "hr_note": body.note,
                "approved_at": now if new_status == "approved" else None,
                "approved_by": user.get("email") if new_status == "approved" else None,
                "updated_at": now,
            }
        },
    )
    return await db.tax_declarations.find_one({"id": declaration_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Tax COMPUTATION (preview / live calculator)
# ---------------------------------------------------------------------------
@router.post("/compute")
async def compute(req: TaxComputeRequest, request: Request):
    user = await get_current_user(request)
    fy = req.financial_year or await _current_fy()
    tenant_id = user.get("tenant_id")

    # Resolve employee — caller may pass employee_id; else use self.
    target_emp_id = req.employee_id or user.get("employee_id")
    employee = None
    if target_emp_id:
        employee = await db.users.find_one(
            {"employee_id": target_emp_id}, {"_id": 0, "password_hash": 0}
        )
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        # HR only inside their tenant; employee only themselves
        if user["role"] == "employee" and target_emp_id != user.get("employee_id"):
            raise HTTPException(status_code=403, detail="Not authorized")
        if user["role"] == "hr_manager" and employee.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Numbers — prefer caller-provided, else compute from employee salary
    monthly_salary = float(employee.get("salary", 0)) if employee else 0.0
    annual_salary = req.gross_annual if req.gross_annual is not None else monthly_salary * 12
    basic_annual = req.basic_annual if req.basic_annual is not None else annual_salary * 0.5
    hra_annual = req.hra_annual if req.hra_annual is not None else annual_salary * 0.2

    # Declarations — prefer caller-provided, else load saved declaration
    declarations = req.declarations
    regime = req.regime
    if declarations is None and employee:
        d = await db.tax_declarations.find_one(
            {
                "employee_id": employee.get("employee_id"),
                "tenant_id": employee.get("tenant_id"),
                "financial_year": fy,
            },
            {"_id": 0},
        )
        if d:
            declarations = d.get("declarations", {})
            regime = regime or d.get("regime")

    settings = await _get_settings(tenant_id, fy)

    result = compute_tax(
        gross_annual=annual_salary,
        basic_annual=basic_annual,
        hra_annual=hra_annual,
        regime=regime or settings.get("default_regime", "new"),
        declarations=declarations or {},
        tax_settings=settings,
    )
    result["employee_id"] = target_emp_id
    return result


@router.get("/compare/me")
async def compare_regimes_me(request: Request):
    """Side-by-side Old vs New regime computation for the logged-in employee."""
    user = await get_current_user(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    settings = await _get_settings(user.get("tenant_id"), fy)

    monthly_salary = float(user.get("salary", 0))
    annual_salary = monthly_salary * 12
    basic_annual = annual_salary * 0.5
    hra_annual = annual_salary * 0.2

    d = await db.tax_declarations.find_one(
        {
            "employee_id": user.get("employee_id"),
            "tenant_id": user.get("tenant_id"),
            "financial_year": fy,
        },
        {"_id": 0},
    )
    declarations = d.get("declarations", {}) if d else {}

    new_r = compute_tax(
        gross_annual=annual_salary, basic_annual=basic_annual, hra_annual=hra_annual,
        regime="new", declarations=declarations, tax_settings=settings,
    )
    old_r = compute_tax(
        gross_annual=annual_salary, basic_annual=basic_annual, hra_annual=hra_annual,
        regime="old", declarations=declarations, tax_settings=settings,
    )
    cheaper = "new" if new_r["total_tax_annual"] <= old_r["total_tax_annual"] else "old"
    return {"new_regime": new_r, "old_regime": old_r, "cheaper_regime": cheaper}


# ---------------------------------------------------------------------------
# Form 16-style annual TDS summary (CSV)
# ---------------------------------------------------------------------------
@router.get("/reports/tds-summary")
async def tds_summary(request: Request):
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    tenant_id = user.get("tenant_id")

    settings = await _get_settings(tenant_id, fy)
    emp_q: Dict[str, Any] = {"role": {"$in": ["employee", "hr_manager"]}, "status": "active"}
    if tenant_id:
        emp_q["tenant_id"] = tenant_id
    employees = await db.users.find(emp_q, {"_id": 0, "password_hash": 0}).to_list(5000)

    buffer = io.StringIO()
    w = csv.writer(buffer)
    w.writerow([
        "Employee ID", "Name", "PAN", "Regime", "Annual Gross",
        "Total Exemptions", "Std Deduction", "Chapter VI-A",
        "Taxable Income", "Slab Tax", "Rebate 87A",
        "Surcharge", "Cess", "Total Tax Annual", "Monthly TDS",
    ])

    for e in employees:
        d = await db.tax_declarations.find_one(
            {
                "employee_id": e.get("employee_id"),
                "tenant_id": e.get("tenant_id"),
                "financial_year": fy,
            },
            {"_id": 0},
        )
        regime = (d or {}).get("regime") or settings.get("default_regime", "new")
        declarations = (d or {}).get("declarations", {})
        annual = float(e.get("salary", 0)) * 12
        r = compute_tax(
            gross_annual=annual,
            basic_annual=annual * 0.5,
            hra_annual=annual * 0.2,
            regime=regime,
            declarations=declarations,
            tax_settings=settings,
        )
        w.writerow([
            e.get("employee_id", ""), e.get("name", ""), e.get("pan", ""),
            r["regime"], r["gross_annual"], r["total_exemptions"], r["standard_deduction"],
            r["total_chapter_via"], r["taxable_income"], r["slab_tax"], r["rebate_87a"],
            r["surcharge"], r["cess"], r["total_tax_annual"], r["monthly_tds"],
        ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="tds_summary_{fy}.csv"'},
    )
