"""
Organization Settings — Departments, Designations, Shifts, Salary Slabs, Holidays
Plus: India Payroll Tax & PF Calculator (FY 2025-26 New Regime)
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(tags=["organization"])


# ─── Generic helpers ──────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _tenant_query(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        return {}, user
    return {"tenant_id": user.get("tenant_id")}, user


# ─── Leave Types ──────────────────────────────────────────────────────────────
class LeaveTypeIn(BaseModel):
    name: str
    days_allotted: float
    description: Optional[str] = ""


@router.get("/api/leave-types")
async def list_leave_types(request: Request):
    q, user = await _tenant_query(request)
    tenant_id = user.get("tenant_id")
    if not tenant_id and user["role"] != "super_admin":
        raise HTTPException(400, "Tenant ID required")
    query = {"tenant_id": tenant_id} if tenant_id else {}
    docs = await db.leave_types.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    if not docs and tenant_id:
        defaults = [
            {"id": "casual", "tenant_id": tenant_id, "name": "Casual Leave", "days_allotted": 12.0, "description": "For personal/casual needs"},
            {"id": "sick", "tenant_id": tenant_id, "name": "Sick Leave", "days_allotted": 10.0, "description": "For medical needs"},
            {"id": "earned", "tenant_id": tenant_id, "name": "Earned Leave", "days_allotted": 15.0, "description": "Vacation / annual leave"},
        ]
        await db.leave_types.insert_many(defaults)
        for d in defaults:
            d.pop("_id", None)
        return defaults
    return docs


@router.post("/api/leave-types")
async def create_leave_type(body: LeaveTypeIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    doc = {"id": str(uuid.uuid4()), "tenant_id": user.get("tenant_id"),
           **body.model_dump(), "created_at": _now()}
    await db.leave_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/api/leave-types/{lt_id}")
async def update_leave_type(lt_id: str, body: LeaveTypeIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.leave_types.update_one({"id": lt_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Leave type not found")
    doc = await db.leave_types.find_one({"id": lt_id}, {"_id": 0})
    return doc


@router.delete("/api/leave-types/{lt_id}")
async def delete_leave_type(lt_id: str, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.leave_types.delete_one({"id": lt_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Leave type not found")
    return {"message": "Leave type deleted successfully"}


# ─── Departments ──────────────────────────────────────────────────────────────
class DepartmentIn(BaseModel):
    name: str
    description: Optional[str] = ""
    head: Optional[str] = ""


@router.get("/api/departments")
async def list_departments(request: Request):
    q, _ = await _tenant_query(request)
    docs = await db.departments.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return docs


@router.post("/api/departments")
async def create_department(body: DepartmentIn, request: Request):
    q, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    doc = {"id": str(uuid.uuid4()), "tenant_id": user.get("tenant_id"),
           **body.model_dump(), "created_at": _now()}
    await db.departments.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/api/departments/{dept_id}")
async def update_department(dept_id: str, body: DepartmentIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.departments.update_one({"id": dept_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Department not found")
    return await db.departments.find_one({"id": dept_id}, {"_id": 0})


@router.delete("/api/departments/{dept_id}")
async def delete_department(dept_id: str, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.departments.delete_one({"id": dept_id})
    return {"deleted": r.deleted_count}


# ─── Designations ─────────────────────────────────────────────────────────────
class DesignationIn(BaseModel):
    name: str
    level: int = 1
    description: Optional[str] = ""


@router.get("/api/designations")
async def list_designations(request: Request):
    q, _ = await _tenant_query(request)
    docs = await db.designations.find(q, {"_id": 0}).sort("level", -1).to_list(500)
    return docs


@router.post("/api/designations")
async def create_designation(body: DesignationIn, request: Request):
    q, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    doc = {"id": str(uuid.uuid4()), "tenant_id": user.get("tenant_id"),
           **body.model_dump(), "created_at": _now()}
    await db.designations.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/api/designations/{desig_id}")
async def update_designation(desig_id: str, body: DesignationIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.designations.update_one({"id": desig_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Designation not found")
    return await db.designations.find_one({"id": desig_id}, {"_id": 0})


@router.delete("/api/designations/{desig_id}")
async def delete_designation(desig_id: str, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.designations.delete_one({"id": desig_id})
    return {"deleted": r.deleted_count}


# ─── Shifts ───────────────────────────────────────────────────────────────────
class ShiftIn(BaseModel):
    name: str
    start_time: str = "09:00"
    end_time: str = "18:00"
    break_duration: int = 60
    working_hours: float = 8


@router.get("/api/shifts")
async def list_shifts(request: Request):
    q, _ = await _tenant_query(request)
    docs = await db.shifts.find(q, {"_id": 0}).sort("start_time", 1).to_list(500)
    return docs


@router.post("/api/shifts")
async def create_shift(body: ShiftIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    doc = {"id": str(uuid.uuid4()), "tenant_id": user.get("tenant_id"),
           **body.model_dump(), "created_at": _now()}
    await db.shifts.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/api/shifts/{shift_id}")
async def update_shift(shift_id: str, body: ShiftIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.shifts.update_one({"id": shift_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Shift not found")
    return await db.shifts.find_one({"id": shift_id}, {"_id": 0})


@router.delete("/api/shifts/{shift_id}")
async def delete_shift(shift_id: str, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.shifts.delete_one({"id": shift_id})
    return {"deleted": r.deleted_count}


# ─── Salary Slabs ─────────────────────────────────────────────────────────────
class SalarySlabIn(BaseModel):
    name: str
    grade: Optional[str] = ""
    min_salary: float = 0
    max_salary: float = 0
    basic_percentage: float = 50
    hra_percentage: float = 20
    pf_percentage: float = 12


@router.get("/api/salary-slabs")
async def list_salary_slabs(request: Request):
    q, _ = await _tenant_query(request)
    docs = await db.salary_slabs.find(q, {"_id": 0}).sort("min_salary", 1).to_list(500)
    return docs


@router.post("/api/salary-slabs")
async def create_salary_slab(body: SalarySlabIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    doc = {"id": str(uuid.uuid4()), "tenant_id": user.get("tenant_id"),
           **body.model_dump(), "created_at": _now()}
    await db.salary_slabs.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/api/salary-slabs/{slab_id}")
async def update_salary_slab(slab_id: str, body: SalarySlabIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.salary_slabs.update_one({"id": slab_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Salary slab not found")
    return await db.salary_slabs.find_one({"id": slab_id}, {"_id": 0})


@router.delete("/api/salary-slabs/{slab_id}")
async def delete_salary_slab(slab_id: str, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.salary_slabs.delete_one({"id": slab_id})
    return {"deleted": r.deleted_count}


# ─── Holidays (admin CRUD; demo seeder uses same collection) ──────────────────
class HolidayIn(BaseModel):
    name: str
    date: str  # YYYY-MM-DD
    type: str = "public"  # public | optional | restricted
    description: Optional[str] = ""


@router.get("/api/holidays")
async def list_holidays(request: Request):
    q, _ = await _tenant_query(request)
    docs = await db.holidays.find(q, {"_id": 0}).sort("date", 1).to_list(500)
    return docs


@router.post("/api/holidays")
async def create_holiday(body: HolidayIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    doc = {"id": str(uuid.uuid4()), "tenant_id": user.get("tenant_id"),
           **body.model_dump(), "is_optional": body.type != "public",
           "created_at": _now()}
    await db.holidays.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/api/holidays/{hol_id}")
async def update_holiday(hol_id: str, body: HolidayIn, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.holidays.update_one(
        {"id": hol_id},
        {"$set": {**body.model_dump(), "is_optional": body.type != "public", "updated_at": _now()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Holiday not found")
    return await db.holidays.find_one({"id": hol_id}, {"_id": 0})


@router.delete("/api/holidays/{hol_id}")
async def delete_holiday(hol_id: str, request: Request):
    _, user = await _tenant_query(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(403, "Not authorized")
    r = await db.holidays.delete_one({"id": hol_id})
    return {"deleted": r.deleted_count}


# ─── Tax & PF Calculator (India FY 2025-26 New Regime) ────────────────────────
class TaxPFRequest(BaseModel):
    monthly_gross: float = Field(..., gt=0, description="Monthly gross (CTC / 12)")
    basic_percentage: float = 50
    hra_percentage: float = 20
    other_allowance_percentage: float = 30  # filler so basic+hra+other = 100
    regime: str = "new"  # new | old
    age_group: str = "below_60"  # below_60 | 60_to_80 | above_80
    pf_capped: bool = True  # use ₹15,000 statutory wage ceiling
    professional_tax_monthly: float = 200
    other_deductions: float = 0
    days_absent: int = 0
    working_days: int = 22


# Indian Tax Slabs FY 2025-26
NEW_REGIME_SLABS = [
    (300_000, 0.0),
    (700_000, 0.05),
    (1_000_000, 0.10),
    (1_200_000, 0.15),
    (1_500_000, 0.20),
    (float("inf"), 0.30),
]
NEW_STANDARD_DEDUCTION = 75_000
NEW_REBATE_LIMIT = 700_000  # 87A rebate
NEW_REBATE_AMOUNT = 25_000

OLD_REGIME_SLABS_BY_AGE = {
    "below_60": [(250_000, 0.0), (500_000, 0.05), (1_000_000, 0.20), (float("inf"), 0.30)],
    "60_to_80": [(300_000, 0.0), (500_000, 0.05), (1_000_000, 0.20), (float("inf"), 0.30)],
    "above_80": [(500_000, 0.0), (1_000_000, 0.20), (float("inf"), 0.30)],
}
OLD_STANDARD_DEDUCTION = 50_000
OLD_REBATE_LIMIT = 500_000
OLD_REBATE_AMOUNT = 12_500

HEALTH_EDUCATION_CESS = 0.04
PF_WAGE_CEILING_MONTHLY = 15_000  # Statutory cap
PF_EMPLOYEE_RATE = 0.12
PF_EMPLOYER_RATE = 0.12
EPS_RATE = 0.0833  # Of employer's 12%, 8.33% goes to EPS
EPS_CAP_MONTHLY = 1_250  # Capped at 8.33% of 15K


def calc_income_tax(annual_taxable: float, regime: str, age_group: str) -> dict:
    """Returns {tax, cess, total_tax, breakdown, rebate_applied}"""
    if regime == "new":
        slabs = NEW_REGIME_SLABS
        std_ded = NEW_STANDARD_DEDUCTION
        rebate_limit = NEW_REBATE_LIMIT
        rebate_amt = NEW_REBATE_AMOUNT
    else:
        slabs = OLD_REGIME_SLABS_BY_AGE.get(age_group, OLD_REGIME_SLABS_BY_AGE["below_60"])
        std_ded = OLD_STANDARD_DEDUCTION
        rebate_limit = OLD_REBATE_LIMIT
        rebate_amt = OLD_REBATE_AMOUNT

    after_std = max(0, annual_taxable - std_ded)

    tax = 0.0
    breakdown = []
    last = 0.0
    for limit, rate in slabs:
        if after_std <= last:
            break
        chunk_top = min(after_std, limit)
        chunk = chunk_top - last
        chunk_tax = chunk * rate
        if chunk > 0:
            breakdown.append({
                "range": f"₹{int(last):,} – ₹{int(chunk_top):,}",
                "rate": f"{int(rate*100)}%",
                "taxable": round(chunk, 2),
                "tax": round(chunk_tax, 2),
            })
        tax += chunk_tax
        last = limit
        if last == float("inf"):
            break

    rebate_applied = 0.0
    if after_std <= rebate_limit and tax > 0:
        rebate_applied = min(tax, rebate_amt)
        tax -= rebate_applied

    cess = tax * HEALTH_EDUCATION_CESS
    total = tax + cess
    return {
        "annual_taxable_income": round(annual_taxable, 2),
        "standard_deduction": std_ded,
        "after_standard_deduction": round(after_std, 2),
        "income_tax": round(tax, 2),
        "rebate_under_87A": round(rebate_applied, 2),
        "health_education_cess_4pct": round(cess, 2),
        "total_annual_tax": round(total, 2),
        "monthly_tds": round(total / 12, 2),
        "slab_breakdown": breakdown,
        "regime": regime,
    }


@router.post("/api/payroll/calculate")
async def calculate_payroll(body: TaxPFRequest, request: Request):
    """Full Tax + PF + payroll breakdown for one employee for one month."""
    await get_current_user(request)  # any authed user

    g = body.monthly_gross
    basic = round(g * body.basic_percentage / 100, 2)
    hra = round(g * body.hra_percentage / 100, 2)
    other = round(g * body.other_allowance_percentage / 100, 2)

    # PF — employee & employer contributions
    pf_base = min(basic, PF_WAGE_CEILING_MONTHLY) if body.pf_capped else basic
    pf_employee = round(pf_base * PF_EMPLOYEE_RATE, 2)
    pf_employer_total = round(pf_base * PF_EMPLOYER_RATE, 2)
    eps_employer = round(min(pf_base * EPS_RATE, EPS_CAP_MONTHLY), 2)
    epf_employer = round(pf_employer_total - eps_employer, 2)

    # Annual tax
    annual_gross = g * 12
    tax_calc = calc_income_tax(annual_gross, body.regime, body.age_group)
    monthly_tds = tax_calc["monthly_tds"]

    # Absence deduction
    per_day = g / body.working_days
    absence_deduction = round(per_day * max(0, body.days_absent), 2)

    # Totals
    total_deductions = round(pf_employee + monthly_tds + body.professional_tax_monthly +
                             body.other_deductions + absence_deduction, 2)
    net_salary = round(g - total_deductions, 2)

    return {
        "earnings": {
            "basic": basic,
            "hra": hra,
            "other_allowance": other,
            "gross_monthly": round(g, 2),
            "gross_annual": round(annual_gross, 2),
        },
        "deductions": {
            "pf_employee_12pct": pf_employee,
            "tax_tds_monthly": monthly_tds,
            "professional_tax": body.professional_tax_monthly,
            "absence_deduction": absence_deduction,
            "other": body.other_deductions,
            "total_deductions": total_deductions,
        },
        "employer_contributions": {
            "epf_employer": epf_employer,
            "eps_employer": eps_employer,
            "pf_employer_total": pf_employer_total,
            "ctc_addition": round(pf_employer_total, 2),
        },
        "tax_breakdown": tax_calc,
        "pf_details": {
            "wage_base": round(pf_base, 2),
            "capped_at_15k": body.pf_capped,
            "employee_rate": "12%",
            "employer_rate": "12% (split 8.33% EPS + 3.67% EPF)",
            "eps_monthly_cap": EPS_CAP_MONTHLY,
        },
        "net_salary": net_salary,
        "estimated_take_home_annual": round(net_salary * 12, 2),
        "ctc_annual": round(annual_gross + pf_employer_total * 12, 2),
        "regime": body.regime,
        "age_group": body.age_group,
    }


@router.get("/api/payroll/tax-slabs")
async def get_tax_slabs():
    """Public reference data — current Indian tax slabs."""
    return {
        "fiscal_year": "FY 2025-26 (AY 2026-27)",
        "new_regime": {
            "slabs": [
                {"range": "₹0 – ₹3L", "rate": "0%"},
                {"range": "₹3L – ₹7L", "rate": "5%"},
                {"range": "₹7L – ₹10L", "rate": "10%"},
                {"range": "₹10L – ₹12L", "rate": "15%"},
                {"range": "₹12L – ₹15L", "rate": "20%"},
                {"range": "Above ₹15L", "rate": "30%"},
            ],
            "standard_deduction": NEW_STANDARD_DEDUCTION,
            "rebate_87A": {"limit": NEW_REBATE_LIMIT, "amount": NEW_REBATE_AMOUNT},
        },
        "old_regime": {
            "slabs_below_60": [
                {"range": "₹0 – ₹2.5L", "rate": "0%"},
                {"range": "₹2.5L – ₹5L", "rate": "5%"},
                {"range": "₹5L – ₹10L", "rate": "20%"},
                {"range": "Above ₹10L", "rate": "30%"},
            ],
            "standard_deduction": OLD_STANDARD_DEDUCTION,
            "rebate_87A": {"limit": OLD_REBATE_LIMIT, "amount": OLD_REBATE_AMOUNT},
        },
        "cess": "4% Health & Education Cess on total tax",
        "pf": {
            "employee_rate": "12% of basic",
            "employer_rate": "12% of basic (8.33% EPS, 3.67% EPF)",
            "statutory_wage_ceiling": PF_WAGE_CEILING_MONTHLY,
            "eps_monthly_cap": EPS_CAP_MONTHLY,
        },
    }
