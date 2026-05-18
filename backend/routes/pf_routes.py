"""PF / EPS / ESI management routes."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid
import io
import csv

from database import db
from auth_utils import get_current_user
from services.pf_calculator import (
    DEFAULT_PF_SETTINGS,
    merged_pf_settings,
    compute_pf,
    compute_esi,
    compute_nps,
)

router = APIRouter(prefix="/api/pf", tags=["pf"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] not in ("super_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    return user


async def _get_pf_settings(tenant_id: Optional[str]) -> Dict:
    if tenant_id is None:
        return dict(DEFAULT_PF_SETTINGS)
    doc = await db.pf_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if doc:
        return doc
    return dict(DEFAULT_PF_SETTINGS, tenant_id=tenant_id)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class PFSettingsUpsert(BaseModel):
    pf_employee_rate: Optional[float] = None
    pf_employer_rate: Optional[float] = None
    pf_employer_eps_rate: Optional[float] = None
    pf_wage_ceiling: Optional[float] = None
    pf_apply_ceiling: Optional[bool] = None
    eps_wage_ceiling: Optional[float] = None
    edli_rate: Optional[float] = None
    admin_charges_rate: Optional[float] = None
    nps_enabled: Optional[bool] = None
    employer_nps_rate: Optional[float] = None
    esi_enabled: Optional[bool] = None
    esi_employee_rate: Optional[float] = None
    esi_employer_rate: Optional[float] = None
    esi_wage_limit: Optional[float] = None


class StatutoryInfoUpsert(BaseModel):
    pan: Optional[str] = None
    aadhaar_last4: Optional[str] = None
    uan: Optional[str] = None
    pf_account_no: Optional[str] = None
    pf_join_date: Optional[str] = None
    pf_exit_date: Optional[str] = None
    pf_opt_in: Optional[bool] = None
    nps_opt_in: Optional[bool] = None
    esi_number: Optional[str] = None
    esi_opt_in: Optional[bool] = None


# ---------------------------------------------------------------------------
# PF SETTINGS
# ---------------------------------------------------------------------------
@router.get("/settings")
async def get_pf_settings(request: Request):
    user = await get_current_user(request)
    return await _get_pf_settings(user.get("tenant_id"))


@router.put("/settings")
async def upsert_pf_settings(req: PFSettingsUpsert, request: Request):
    user = await _require_admin(request)
    tenant_id = user.get("tenant_id")
    if tenant_id is None and user["role"] != "super_admin":
        raise HTTPException(status_code=400, detail="Tenant context required")

    payload = {k: v for k, v in req.model_dump().items() if v is not None}
    payload["tenant_id"] = tenant_id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    existing = await db.pf_settings.find_one({"tenant_id": tenant_id})
    if existing:
        await db.pf_settings.update_one({"_id": existing["_id"]}, {"$set": payload})
    else:
        payload["id"] = str(uuid.uuid4())
        payload["created_at"] = payload["updated_at"]
        await db.pf_settings.insert_one(payload)
    return await db.pf_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})


@router.post("/settings/reset")
async def reset_pf_settings(request: Request):
    user = await _require_admin(request)
    await db.pf_settings.delete_one({"tenant_id": user.get("tenant_id")})
    return await _get_pf_settings(user.get("tenant_id"))


# ---------------------------------------------------------------------------
# Employee STATUTORY INFO (PAN/UAN/PF/ESI)
# ---------------------------------------------------------------------------
@router.get("/employees/{employee_id}/statutory")
async def get_statutory(employee_id: str, request: Request):
    user = await get_current_user(request)
    emp = await db.users.find_one(
        {"employee_id": employee_id}, {"_id": 0, "password_hash": 0}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    # access control
    if user["role"] == "employee" and emp.get("employee_id") != user.get("employee_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if user["role"] == "hr_manager" and emp.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    return {
        "employee_id": emp.get("employee_id"),
        "name": emp.get("name"),
        "pan": emp.get("pan"),
        "aadhaar_last4": emp.get("aadhaar_last4"),
        "uan": emp.get("uan"),
        "pf_account_no": emp.get("pf_account_no"),
        "pf_join_date": emp.get("pf_join_date"),
        "pf_exit_date": emp.get("pf_exit_date"),
        "pf_opt_in": emp.get("pf_opt_in", True),
        "nps_opt_in": emp.get("nps_opt_in", False),
        "esi_number": emp.get("esi_number"),
        "esi_opt_in": emp.get("esi_opt_in", True),
    }


@router.put("/employees/{employee_id}/statutory")
async def upsert_statutory(employee_id: str, req: StatutoryInfoUpsert, request: Request):
    user = await get_current_user(request)
    emp = await db.users.find_one({"employee_id": employee_id})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    # access control: HR within tenant, or the employee themselves (limited)
    is_self = (user.get("employee_id") == employee_id)
    is_hr = user["role"] in ("super_admin", "hr_manager") and (
        user["role"] == "super_admin" or emp.get("tenant_id") == user.get("tenant_id")
    )
    if not (is_self or is_hr):
        raise HTTPException(status_code=403, detail="Not authorized")

    allowed = req.model_dump(exclude_none=True)
    if not is_hr:
        # Employees can only edit PAN/Aadhaar/UAN, never the opt-in flags or PF account
        allowed = {k: v for k, v in allowed.items()
                   if k in ("pan", "aadhaar_last4", "uan")}
    if not allowed:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"employee_id": employee_id}, {"$set": allowed})
    return await get_statutory(employee_id, request)


# ---------------------------------------------------------------------------
# Monthly PF/ESI computation preview (uses live settings, NOT a payslip)
# ---------------------------------------------------------------------------
@router.get("/compute/{employee_id}")
async def compute_for_employee(employee_id: str, request: Request):
    user = await get_current_user(request)
    emp = await db.users.find_one(
        {"employee_id": employee_id}, {"_id": 0, "password_hash": 0}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user["role"] == "employee" and emp.get("employee_id") != user.get("employee_id"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if user["role"] == "hr_manager" and emp.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    settings = await _get_pf_settings(emp.get("tenant_id"))
    monthly = float(emp.get("salary", 0))
    basic = round(monthly * 0.5, 2)
    pf_r = compute_pf(
        basic_monthly=basic,
        pf_settings=settings,
        pf_opt_in=bool(emp.get("pf_opt_in", True)),
    )
    esi_r = compute_esi(
        gross_monthly=monthly,
        pf_settings=settings,
        esi_opt_in=bool(emp.get("esi_opt_in", True)),
    )
    nps_r = compute_nps(
        basic_monthly=basic,
        pf_settings=settings,
        nps_opt_in=bool(emp.get("nps_opt_in", False)),
    )
    return {
        "employee_id": employee_id,
        "monthly_gross": monthly,
        "monthly_basic": basic,
        "pf": pf_r,
        "esi": esi_r,
        "nps": nps_r,
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@router.get("/reports/challan")
async def pf_challan_report(request: Request):
    """PF/ECR-style monthly summary CSV."""
    user = await _require_admin(request)
    month_str = request.query_params.get("month")  # e.g. 2026-05
    if not month_str:
        raise HTTPException(status_code=400, detail="month query param required, e.g. 2026-05")
    try:
        y, m = month_str.split("-")
        year, month = int(y), int(m)
    except Exception:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    tenant_id = user.get("tenant_id")
    q: Dict[str, Any] = {"month": month, "year": year}
    if tenant_id:
        q["tenant_id"] = tenant_id
    payslips = await db.payslips.find(q, {"_id": 0}).to_list(5000)

    buffer = io.StringIO()
    w = csv.writer(buffer)
    w.writerow([
        "Employee ID", "Name", "UAN", "PF Account",
        "Gross Wages", "PF Wages", "EPS Wages",
        "Employee PF", "Employer EPF", "Employer EPS",
        "EDLI", "Admin Charges",
        "Employee ESI", "Employer ESI",
    ])
    totals = {
        "emp_pf": 0, "empr_epf": 0, "empr_eps": 0, "edli": 0, "admin": 0,
        "emp_esi": 0, "empr_esi": 0,
    }
    for p in payslips:
        emp = await db.users.find_one(
            {"employee_id": p.get("employee_id")},
            {"_id": 0, "uan": 1, "pf_account_no": 1, "name": 1},
        )
        uan = (emp or {}).get("uan", "") or ""
        pfacc = (emp or {}).get("pf_account_no", "") or ""
        w.writerow([
            p.get("employee_id", ""), p.get("employee_name", ""), uan, pfacc,
            p.get("gross_salary", 0),
            p.get("pf_wage", 0),
            p.get("eps_wage", p.get("pf_wage", 0)),
            p.get("pf_deduction", 0),
            p.get("employer_epf", 0),
            p.get("employer_eps", 0),
            p.get("edli", 0),
            p.get("admin_charges", 0),
            p.get("esi_employee", 0),
            p.get("esi_employer", 0),
        ])
        totals["emp_pf"] += float(p.get("pf_deduction", 0) or 0)
        totals["empr_epf"] += float(p.get("employer_epf", 0) or 0)
        totals["empr_eps"] += float(p.get("employer_eps", 0) or 0)
        totals["edli"] += float(p.get("edli", 0) or 0)
        totals["admin"] += float(p.get("admin_charges", 0) or 0)
        totals["emp_esi"] += float(p.get("esi_employee", 0) or 0)
        totals["empr_esi"] += float(p.get("esi_employer", 0) or 0)

    w.writerow([])
    w.writerow([
        "TOTALS", "", "", "", "", "", "",
        round(totals["emp_pf"], 2),
        round(totals["empr_epf"], 2),
        round(totals["empr_eps"], 2),
        round(totals["edli"], 2),
        round(totals["admin"], 2),
        round(totals["emp_esi"], 2),
        round(totals["empr_esi"], 2),
    ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="pf_challan_{year}_{month:02d}.csv"'},
    )


@router.get("/statement/me")
async def my_pf_statement(request: Request):
    """Running PF statement for the logged-in employee."""
    user = await get_current_user(request)
    emp_id = user.get("employee_id")
    tenant_id = user.get("tenant_id")
    payslips = await db.payslips.find(
        {"employee_id": emp_id, "tenant_id": tenant_id},
        {"_id": 0},
    ).sort([("year", 1), ("month", 1)]).to_list(120)

    rows: List[Dict[str, Any]] = []
    total_employee = 0.0
    total_employer_epf = 0.0
    total_employer_eps = 0.0
    for p in payslips:
        emp_pf = float(p.get("pf_deduction", 0) or 0)
        er_epf = float(p.get("employer_epf", 0) or 0)
        er_eps = float(p.get("employer_eps", 0) or 0)
        total_employee += emp_pf
        total_employer_epf += er_epf
        total_employer_eps += er_eps
        rows.append({
            "period": f"{p.get('year')}-{int(p.get('month', 0)):02d}",
            "pf_wage": p.get("pf_wage", 0),
            "employee_pf": emp_pf,
            "employer_epf": er_epf,
            "employer_eps": er_eps,
            "running_employee_total": round(total_employee, 2),
            "running_employer_total": round(total_employer_epf + total_employer_eps, 2),
        })
    return {
        "employee_id": emp_id,
        "uan": user.get("uan"),
        "pf_account_no": user.get("pf_account_no"),
        "rows": rows,
        "totals": {
            "employee_pf": round(total_employee, 2),
            "employer_epf": round(total_employer_epf, 2),
            "employer_eps": round(total_employer_eps, 2),
            "grand_total": round(total_employee + total_employer_epf + total_employer_eps, 2),
        },
    }



# ---------------------------------------------------------------------------
# EPFO Form 5 (new joiners) & Form 10 (leavers) — monthly statutory returns
# ---------------------------------------------------------------------------
def _parse_month_param(month_str: Optional[str]) -> tuple:
    if not month_str:
        raise HTTPException(status_code=400, detail="month query param required, e.g. 2026-05")
    try:
        y, m = month_str.split("-")
        return int(y), int(m)
    except Exception:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")


async def _employees_with_date_in_month(
    tenant_id: Optional[str], field: str, year: int, month: int
) -> List[Dict[str, Any]]:
    prefix = f"{year:04d}-{month:02d}"
    q: Dict[str, Any] = {field: {"$regex": f"^{prefix}"}}
    if tenant_id:
        q["tenant_id"] = tenant_id
    return await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(5000)


@router.get("/reports/form5")
async def epfo_form5(request: Request):
    """EPFO Form 5 — list of employees who JOINED PF during the requested month."""
    user = await _require_admin(request)
    year, month = _parse_month_param(request.query_params.get("month"))
    emps = await _employees_with_date_in_month(
        user.get("tenant_id"), "pf_join_date", year, month
    )

    buffer = io.StringIO()
    w = csv.writer(buffer)
    w.writerow([
        "Sr. No.", "UAN", "PF Account No", "Employee Name", "Father / Husband Name",
        "Date of Birth", "Date of Joining PF", "Gender",
        "PAN", "Aadhaar (last 4)", "Designation", "Department",
    ])
    for i, e in enumerate(emps, 1):
        w.writerow([
            i,
            e.get("uan", "") or "",
            e.get("pf_account_no", "") or "",
            e.get("name", "") or "",
            e.get("father_name", "") or "",
            e.get("date_of_birth", "") or "",
            e.get("pf_join_date", "") or "",
            e.get("gender", "") or "",
            e.get("pan", "") or "",
            e.get("aadhaar_last4", "") or "",
            e.get("position", "") or "",
            e.get("department", "") or "",
        ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="epfo_form5_{year}_{month:02d}.csv"'},
    )


@router.get("/reports/form10")
async def epfo_form10(request: Request):
    """EPFO Form 10 — list of employees who LEFT PF coverage during the month."""
    user = await _require_admin(request)
    year, month = _parse_month_param(request.query_params.get("month"))
    emps = await _employees_with_date_in_month(
        user.get("tenant_id"), "pf_exit_date", year, month
    )

    buffer = io.StringIO()
    w = csv.writer(buffer)
    w.writerow([
        "Sr. No.", "UAN", "PF Account No", "Employee Name",
        "Date of Joining PF", "Date of Leaving PF", "Reason for Leaving",
        "PAN", "Designation", "Department",
    ])
    for i, e in enumerate(emps, 1):
        w.writerow([
            i,
            e.get("uan", "") or "",
            e.get("pf_account_no", "") or "",
            e.get("name", "") or "",
            e.get("pf_join_date", "") or "",
            e.get("pf_exit_date", "") or "",
            e.get("exit_reason", "Resignation") if e.get("status") != "active" else "",
            e.get("pan", "") or "",
            e.get("position", "") or "",
            e.get("department", "") or "",
        ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="epfo_form10_{year}_{month:02d}.csv"'},
    )
