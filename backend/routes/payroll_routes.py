from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from services.pf_calculator import (
    DEFAULT_PF_SETTINGS, merged_pf_settings, compute_pf, compute_esi,
)
from services.tax_calculator import (
    DEFAULT_TAX_SETTINGS, compute_tax,
)
import uuid
import io

router = APIRouter(prefix="/api/payroll", tags=["payroll"])

CURRENCY = "INR"
CURRENCY_SYMBOL = "\u20b9"


class PayslipGenerate(BaseModel):
    employee_id: str
    month: int
    year: int


class BulkPayslipGenerate(BaseModel):
    month: int
    year: int


def _r(x: float) -> float:
    return round(float(x or 0), 2)


async def _get_pf_settings(tenant_id: Optional[str]) -> Dict[str, Any]:
    if tenant_id is None:
        return dict(DEFAULT_PF_SETTINGS)
    doc = await db.pf_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})
    return doc if doc else dict(DEFAULT_PF_SETTINGS)


async def _get_tax_settings(tenant_id: Optional[str], fy: str) -> Dict[str, Any]:
    if tenant_id is None:
        return dict(DEFAULT_TAX_SETTINGS, financial_year=fy)
    doc = await db.tax_settings.find_one(
        {"tenant_id": tenant_id, "financial_year": fy}, {"_id": 0}
    )
    return doc if doc else dict(DEFAULT_TAX_SETTINGS, financial_year=fy)


def _fy_for(month: int, year: int) -> str:
    if month >= 4:
        return f"{year}-{str(year + 1)[-2:]}"
    return f"{year - 1}-{str(year)[-2:]}"


async def _build_payslip(employee: Dict[str, Any], month: int, year: int) -> Dict[str, Any]:
    tenant_id = employee.get("tenant_id")
    month_str = f"{year}-{str(month).zfill(2)}"
    attendance_records = await db.attendance.find({
        "user_id": employee.get("employee_id"),
        "date": {"$regex": f"^{month_str}"},
        "tenant_id": tenant_id,
    }).to_list(1000)
    days_worked = len([r for r in attendance_records if r.get("clock_in")])
    days_absent = max(0, 22 - days_worked)

    salary = float(employee.get("salary", 0) or 0)
    basic = _r(salary * 0.5)
    hra = _r(salary * 0.2)
    allowances = _r(salary * 0.15)
    special = _r(salary - basic - hra - allowances)  # plug remainder so gross == salary

    absence_deduction = _r((salary / 22) * days_absent) if days_absent > 0 else 0

    # ---------- PF / ESI (proper, settings-driven) ----------
    pf_settings = await _get_pf_settings(tenant_id)
    pf_r = compute_pf(
        basic_monthly=basic, pf_settings=pf_settings,
        pf_opt_in=bool(employee.get("pf_opt_in", True)),
    )
    esi_r = compute_esi(
        gross_monthly=salary, pf_settings=pf_settings,
        esi_opt_in=bool(employee.get("esi_opt_in", True)),
    )

    # ---------- Tax / TDS (proper, regime-aware) ----------
    fy = _fy_for(month, year)
    tax_settings = await _get_tax_settings(tenant_id, fy)
    decl_doc = await db.tax_declarations.find_one(
        {
            "employee_id": employee.get("employee_id"),
            "tenant_id": tenant_id,
            "financial_year": fy,
        },
        {"_id": 0},
    )
    regime = (decl_doc or {}).get("regime") or tax_settings.get("default_regime", "new")
    declarations = (decl_doc or {}).get("declarations", {})
    tax_calc = compute_tax(
        gross_annual=salary * 12,
        basic_annual=basic * 12,
        hra_annual=hra * 12,
        regime=regime,
        declarations=declarations,
        tax_settings=tax_settings,
    )
    monthly_tds = _r(tax_calc["monthly_tds"])

    total_deductions = _r(
        pf_r["employee_pf"] + esi_r["employee_esi"] + monthly_tds + absence_deduction
    )
    net_salary = _r(salary - total_deductions)

    return {
        "id": str(uuid.uuid4()),
        "employee_id": employee.get("employee_id"),
        "employee_name": employee.get("name", ""),
        "tenant_id": tenant_id,
        "month": month,
        "year": year,
        "financial_year": fy,
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,

        # Earnings
        "basic_salary": basic,
        "hra": hra,
        "allowances": allowances,
        "special_allowance": max(0, special),
        "gross_salary": _r(salary),

        # PF block
        "pf_wage": pf_r["pf_wage"],
        "eps_wage": min(pf_r["pf_wage"], float(pf_settings.get("eps_wage_ceiling", 15000))),
        "pf_deduction": pf_r["employee_pf"],
        "employer_epf": pf_r["employer_epf"],
        "employer_eps": pf_r["employer_eps"],
        "edli": pf_r["edli"],
        "admin_charges": pf_r["admin_charges"],

        # ESI block
        "esi_applicable": esi_r["applicable"],
        "esi_employee": esi_r["employee_esi"],
        "esi_employer": esi_r["employer_esi"],

        # Tax block
        "tax_regime": regime,
        "tax": monthly_tds,
        "annual_tax": tax_calc["total_tax_annual"],
        "taxable_income": tax_calc["taxable_income"],

        # Other deductions
        "absence_deduction": absence_deduction,
        "total_deductions": total_deductions,
        "net_salary": net_salary,

        # Attendance summary
        "days_worked": days_worked,
        "days_absent": days_absent,

        # Misc
        "department": employee.get("department", ""),
        "position": employee.get("position", ""),
        "status": "published",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/generate")
async def generate_payslip(req: PayslipGenerate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    employee = await db.users.find_one(
        {"employee_id": req.employee_id}, {"_id": 0, "password_hash": 0}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    payslip = await _build_payslip(employee, req.month, req.year)

    existing = await db.payslips.find_one({
        "employee_id": req.employee_id, "month": req.month, "year": req.year,
    })
    if existing:
        await db.payslips.delete_one({"id": existing["id"]})
    await db.payslips.insert_one(payslip)
    payslip.pop("_id", None)
    return payslip


@router.post("/generate-bulk")
async def generate_bulk_payslips(req: BulkPayslipGenerate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    tenant_id = user.get("tenant_id")
    employees = await db.users.find(
        {"tenant_id": tenant_id, "role": {"$in": ["employee", "hr_manager"]}, "status": "active"},
        {"_id": 0, "password_hash": 0},
    ).to_list(1000)

    results = []
    for emp in employees:
        try:
            payslip = await _build_payslip(emp, req.month, req.year)
            existing = await db.payslips.find_one(
                {"employee_id": emp["employee_id"], "month": req.month, "year": req.year}
            )
            if existing:
                await db.payslips.delete_one({"id": existing["id"]})
            await db.payslips.insert_one(payslip)
            payslip.pop("_id", None)
            results.append(payslip)
        except Exception:
            continue
    return {"generated": len(results), "payslips": results}


@router.get("")
async def list_payslips(request: Request):
    user = await get_current_user(request)
    query: Dict[str, Any] = {}
    if user["role"] == "employee":
        query["employee_id"] = user.get("employee_id")
        query["tenant_id"] = user.get("tenant_id")
    elif user["role"] == "hr_manager":
        query["tenant_id"] = user.get("tenant_id")

    month = request.query_params.get("month")
    year = request.query_params.get("year")
    if month:
        query["month"] = int(month)
    if year:
        query["year"] = int(year)

    payslips = await db.payslips.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return payslips


@router.get("/{payslip_id}/pdf")
async def download_payslip_pdf(payslip_id: str, request: Request):
    user = await get_current_user(request)
    payslip = await db.payslips.find_one({"id": payslip_id}, {"_id": 0})
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    if user["role"] == "employee" and payslip.get("employee_id") != user.get("employee_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet

    sym = payslip.get("currency_symbol") or "\u20b9"

    def f(v):
        try:
            return f"{sym}{float(v):,.2f}"
        except Exception:
            return f"{sym}0.00"

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []
    months = ["", "January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"]

    elements.append(Paragraph("PAYSLIP", styles['Title']))
    elements.append(Paragraph(f"{months[payslip['month']]} {payslip['year']}  (FY {payslip.get('financial_year','')})", styles['Heading3']))
    elements.append(Spacer(1, 14))

    info_data = [
        ["Employee ID", payslip.get("employee_id", "")],
        ["Employee Name", payslip.get("employee_name", "")],
        ["Department", payslip.get("department", "")],
        ["Position", payslip.get("position", "")],
        ["Tax Regime", str(payslip.get("tax_regime", "")).upper()],
    ]
    info_table = Table(info_data, colWidths=[180, 320])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.Color(0, 0.18, 0.65)),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 12))

    salary_data = [
        ["EARNINGS", "AMOUNT", "DEDUCTIONS", "AMOUNT"],
        ["Basic", f(payslip['basic_salary']), "Provident Fund (Employee)", f(payslip.get('pf_deduction', 0))],
        ["HRA", f(payslip['hra']), "ESI (Employee)", f(payslip.get('esi_employee', 0))],
        ["Allowances", f(payslip['allowances']), "TDS (Income Tax)", f(payslip.get('tax', 0))],
        ["Special Allowance", f(payslip.get('special_allowance', 0)), "Absence Deduction", f(payslip.get('absence_deduction', 0))],
        ["", "", "", ""],
        ["Gross Salary", f(payslip['gross_salary']), "Total Deductions", f(payslip['total_deductions'])],
    ]
    salary_table = Table(salary_data, colWidths=[150, 100, 170, 100])
    salary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0, 0.18, 0.65)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(salary_table)
    elements.append(Spacer(1, 12))

    net_data = [["NET SALARY (Take-home)", f(payslip['net_salary'])]]
    net_table = Table(net_data, colWidths=[350, 170])
    net_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.Color(0.9, 0.95, 1)),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.grey),
    ]))
    elements.append(net_table)
    elements.append(Spacer(1, 12))

    # Employer contributions block
    er_data = [
        ["EMPLOYER CONTRIBUTIONS", "AMOUNT"],
        ["EPF (Employer)", f(payslip.get('employer_epf', 0))],
        ["EPS (Employer)", f(payslip.get('employer_eps', 0))],
        ["EDLI", f(payslip.get('edli', 0))],
        ["PF Admin Charges", f(payslip.get('admin_charges', 0))],
        ["ESI (Employer)", f(payslip.get('esi_employer', 0))],
    ]
    er_table = Table(er_data, colWidths=[350, 170])
    er_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.4, 0.4, 0.4)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(er_table)
    elements.append(Spacer(1, 10))

    elements.append(Paragraph(
        f"Days Worked: {payslip['days_worked']} | Days Absent: {payslip['days_absent']} | Annual Tax (projected): {f(payslip.get('annual_tax', 0))}",
        styles['Normal'],
    ))

    doc.build(elements)
    buffer.seek(0)
    filename = f"payslip_{payslip['employee_id']}_{payslip['month']}_{payslip['year']}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
