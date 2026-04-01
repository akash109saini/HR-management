from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid
import io

router = APIRouter(prefix="/api/payroll", tags=["payroll"])


class PayslipGenerate(BaseModel):
    employee_id: str
    month: int
    year: int


class BulkPayslipGenerate(BaseModel):
    month: int
    year: int


@router.post("/generate")
async def generate_payslip(req: PayslipGenerate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["super_admin", "hr_manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    employee = await db.users.find_one({"employee_id": req.employee_id}, {"_id": 0, "password_hash": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Count working days from attendance
    month_str = f"{req.year}-{str(req.month).zfill(2)}"
    attendance_records = await db.attendance.find({
        "user_id": req.employee_id,
        "date": {"$regex": f"^{month_str}"},
        "tenant_id": employee.get("tenant_id")
    }).to_list(1000)

    days_worked = len([r for r in attendance_records if r.get("clock_in")])
    days_absent = 22 - days_worked  # Assuming 22 working days

    salary = employee.get("salary", 0)
    basic = round(salary * 0.5, 2)
    hra = round(salary * 0.2, 2)
    allowances = round(salary * 0.15, 2)
    pf_deduction = round(basic * 0.12, 2)
    tax = round(salary * 0.1, 2)
    absence_deduction = round((salary / 22) * max(0, days_absent), 2) if days_absent > 0 else 0
    total_deductions = round(pf_deduction + tax + absence_deduction, 2)
    net_salary = round(salary - total_deductions, 2)

    existing = await db.payslips.find_one({
        "employee_id": req.employee_id, "month": req.month, "year": req.year
    })
    if existing:
        await db.payslips.delete_one({"id": existing["id"]})

    payslip = {
        "id": str(uuid.uuid4()),
        "employee_id": req.employee_id,
        "employee_name": employee.get("name", ""),
        "tenant_id": employee.get("tenant_id"),
        "month": req.month,
        "year": req.year,
        "basic_salary": basic,
        "hra": hra,
        "allowances": allowances,
        "pf_deduction": pf_deduction,
        "tax": tax,
        "absence_deduction": absence_deduction,
        "total_deductions": total_deductions,
        "gross_salary": salary,
        "net_salary": net_salary,
        "days_worked": days_worked,
        "days_absent": max(0, days_absent),
        "department": employee.get("department", ""),
        "position": employee.get("position", ""),
        "status": "published",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
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
        {"_id": 0}
    ).to_list(1000)

    results = []
    for emp in employees:
        try:
            gen_req = PayslipGenerate(employee_id=emp["employee_id"], month=req.month, year=req.year)
            # Inline generation
            month_str = f"{req.year}-{str(req.month).zfill(2)}"
            attendance_records = await db.attendance.find({
                "user_id": emp["employee_id"],
                "date": {"$regex": f"^{month_str}"},
                "tenant_id": tenant_id
            }).to_list(1000)
            days_worked = len([r for r in attendance_records if r.get("clock_in")])
            salary = emp.get("salary", 0)
            basic = round(salary * 0.5, 2)
            pf_deduction = round(basic * 0.12, 2)
            tax = round(salary * 0.1, 2)
            days_absent = max(0, 22 - days_worked)
            absence_deduction = round((salary / 22) * days_absent, 2) if salary > 0 else 0
            total_deductions = round(pf_deduction + tax + absence_deduction, 2)
            net_salary = round(salary - total_deductions, 2)

            existing = await db.payslips.find_one({"employee_id": emp["employee_id"], "month": req.month, "year": req.year})
            if existing:
                await db.payslips.delete_one({"id": existing["id"]})

            payslip = {
                "id": str(uuid.uuid4()),
                "employee_id": emp["employee_id"],
                "employee_name": emp.get("name", ""),
                "tenant_id": tenant_id,
                "month": req.month, "year": req.year,
                "basic_salary": basic, "hra": round(salary * 0.2, 2),
                "allowances": round(salary * 0.15, 2),
                "pf_deduction": pf_deduction, "tax": tax,
                "absence_deduction": absence_deduction,
                "total_deductions": total_deductions,
                "gross_salary": salary, "net_salary": net_salary,
                "days_worked": days_worked, "days_absent": days_absent,
                "department": emp.get("department", ""), "position": emp.get("position", ""),
                "status": "published",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.payslips.insert_one(payslip)
            payslip.pop("_id", None)
            results.append(payslip)
        except Exception:
            continue
    return {"generated": len(results), "payslips": results}


@router.get("")
async def list_payslips(request: Request):
    user = await get_current_user(request)
    query = {}
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

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    months = ["", "January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"]

    elements.append(Paragraph("PAYSLIP", styles['Title']))
    elements.append(Paragraph(f"{months[payslip['month']]} {payslip['year']}", styles['Heading2']))
    elements.append(Spacer(1, 20))

    info_data = [
        ["Employee ID", payslip.get("employee_id", "")],
        ["Employee Name", payslip.get("employee_name", "")],
        ["Department", payslip.get("department", "")],
        ["Position", payslip.get("position", "")],
    ]
    info_table = Table(info_data, colWidths=[200, 300])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.Color(0, 0.18, 0.65)),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 20))

    salary_data = [
        ["Component", "Amount"],
        ["Basic Salary", f"${payslip['basic_salary']:,.2f}"],
        ["HRA", f"${payslip['hra']:,.2f}"],
        ["Allowances", f"${payslip['allowances']:,.2f}"],
        ["Gross Salary", f"${payslip['gross_salary']:,.2f}"],
        ["", ""],
        ["PF Deduction", f"-${payslip['pf_deduction']:,.2f}"],
        ["Tax", f"-${payslip['tax']:,.2f}"],
        ["Absence Deduction", f"-${payslip['absence_deduction']:,.2f}"],
        ["Total Deductions", f"-${payslip['total_deductions']:,.2f}"],
        ["", ""],
        ["Net Salary", f"${payslip['net_salary']:,.2f}"],
    ]
    salary_table = Table(salary_data, colWidths=[300, 200])
    salary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0, 0.18, 0.65)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, -1), (-1, -1), colors.Color(0.9, 0.95, 1)),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(salary_table)
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"Days Worked: {payslip['days_worked']} | Days Absent: {payslip['days_absent']}", styles['Normal']))

    doc.build(elements)
    buffer.seek(0)

    filename = f"payslip_{payslip['employee_id']}_{payslip['month']}_{payslip['year']}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
