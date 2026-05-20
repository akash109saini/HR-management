"""Tax management routes — settings, declarations, computation, reports."""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import io
import csv
import zipfile

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak,
)
from reportlab.lib.units import mm

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


# ---------------------------------------------------------------------------
# Form 16 (Part B) PDF generation
# ---------------------------------------------------------------------------
def _assessment_year(fy: str) -> str:
    """FY '2025-26' -> AY '2026-27'."""
    try:
        a, b = fy.split("-")
        start = int(a)
        return f"{start + 1}-{str(start + 2)[-2:]}"
    except Exception:
        return fy


def _inr(v) -> str:
    try:
        return f"\u20b9 {float(v or 0):,.2f}"
    except Exception:
        return "\u20b9 0.00"


def _build_form16_pdf(buffer: io.BytesIO, employer: Dict, employee: Dict,
                      fy: str, computation: Dict, declarations: Dict) -> None:
    """Render a Form 16 (Part B) style PDF into the given buffer."""
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=12 * mm, bottomMargin=12 * mm,
        title=f"Form 16 - {employee.get('name', '')} - FY {fy}",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1", parent=styles["Title"], fontSize=14, leading=18, alignment=1,
    )
    h2 = ParagraphStyle(
        "h2", parent=styles["Heading3"], fontSize=10, textColor=colors.HexColor("#1f2937"),
    )
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=10)
    normal = ParagraphStyle("n", parent=styles["Normal"], fontSize=9, leading=12)

    story: List = []
    story.append(Paragraph("FORM 16 \u2014 PART B", h1))
    story.append(Paragraph(
        "Certificate under Section 203 of the Income-tax Act, 1961 for tax deducted at source on salary",
        small,
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Financial Year: <b>{fy}</b> &nbsp;&nbsp;|&nbsp;&nbsp; Assessment Year: <b>{_assessment_year(fy)}</b>",
        normal,
    ))
    story.append(Spacer(1, 8))

    # Employer / Employee block
    emp_table = Table(
        [
            [Paragraph("<b>Employer (Deductor)</b>", h2),
             Paragraph("<b>Employee (Deductee)</b>", h2)],
            [Paragraph(
                f"Name: {employer.get('name', '-')}<br/>"
                f"Domain: {employer.get('domain', '-')}<br/>"
                f"Tenant ID: {employer.get('id', '-')}",
                normal,
             ),
             Paragraph(
                f"Name: {employee.get('name', '-')}<br/>"
                f"Employee ID: {employee.get('employee_id', '-')}<br/>"
                f"PAN: {employee.get('pan', '-')}<br/>"
                f"Designation: {employee.get('position', '-')}",
                normal,
             )],
        ],
        colWidths=[90 * mm, 90 * mm],
    )
    emp_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(emp_table)
    story.append(Spacer(1, 10))

    # Salary & exemptions
    story.append(Paragraph("<b>1. Gross Salary & Exemptions (Section 10)</b>", h2))
    sal_rows = [
        ["Particulars", "Amount"],
        ["Gross Annual Salary (a)", _inr(computation.get("gross_annual"))],
        ["Less: Total Exemptions u/s 10 (HRA etc.) (b)", _inr(computation.get("total_exemptions"))],
        ["Balance (a-b)", _inr(
            float(computation.get("gross_annual", 0)) - float(computation.get("total_exemptions", 0))
        )],
        ["Less: Standard Deduction u/s 16(ia)", _inr(computation.get("standard_deduction"))],
        ["Income chargeable under the head 'Salaries'", _inr(
            float(computation.get("gross_annual", 0))
            - float(computation.get("total_exemptions", 0))
            - float(computation.get("standard_deduction", 0))
        )],
    ]
    t = Table(sal_rows, colWidths=[120 * mm, 60 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))

    # Chapter VI-A
    story.append(Paragraph("<b>2. Deductions under Chapter VI-A</b>", h2))
    via_rows = [["Section", "Claimed", "Allowed"]]
    decl = declarations or {}
    via_rows += [
        ["80C \u2014 LIC, PF, ELSS, PPF",  _inr(decl.get("section_80c")), ""],
        ["80D \u2014 Medical insurance (self+family)", _inr(decl.get("section_80d_self")), ""],
        ["80D \u2014 Medical insurance (parents)", _inr(decl.get("section_80d_parents")), ""],
        ["80CCD(1B) \u2014 Additional NPS", _inr(decl.get("section_80ccd_1b")), ""],
        ["80CCD(2) \u2014 Employer NPS contribution", _inr(decl.get("section_80ccd_2_employer_nps")), ""],
        ["80E \u2014 Education loan interest", _inr(decl.get("section_80e_education_loan")), ""],
        ["24(b) \u2014 Home loan interest", _inr(decl.get("section_24_home_loan")), ""],
        ["Total Chapter VI-A allowed", "", _inr(computation.get("total_chapter_via"))],
    ]
    t2 = Table(via_rows, colWidths=[100 * mm, 40 * mm, 40 * mm])
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(t2)
    story.append(Spacer(1, 8))

    # Tax computation
    story.append(Paragraph("<b>3. Computation of Tax Payable</b>", h2))
    tax_rows = [
        ["Particulars", "Amount"],
        [f"Regime opted: {computation.get('regime', '').upper()}", ""],
        ["Total Taxable Income", _inr(computation.get("taxable_income"))],
        ["Tax on slab income", _inr(computation.get("slab_tax"))],
        ["Less: Rebate u/s 87A", _inr(computation.get("rebate_87a"))],
        ["Add: Surcharge", _inr(computation.get("surcharge"))],
        ["Add: Health & Education Cess (4%)", _inr(computation.get("cess"))],
        ["Total Tax Liability (Annual)", _inr(computation.get("total_tax_annual"))],
        ["Monthly TDS to be deducted", _inr(computation.get("monthly_tds"))],
    ]
    t3 = Table(tax_rows, colWidths=[120 * mm, 60 * mm])
    t3.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, -2), (-1, -2), colors.HexColor("#fef3c7")),
        ("FONTNAME", (0, -2), (-1, -2), "Helvetica-Bold"),
    ]))
    story.append(t3)
    story.append(Spacer(1, 14))

    story.append(Paragraph(
        "<i>Generated by HRMS \u2014 Computed values are indicative based on declarations on record. "
        "Final TDS is governed by actual payments and proofs verified at year-end.</i>",
        small,
    ))
    story.append(Spacer(1, 30))
    sig = Table(
        [[Paragraph("________________________<br/>Signature of Deductor", small),
          Paragraph(f"Date: {datetime.now(timezone.utc).strftime('%d-%b-%Y')}", small)]],
        colWidths=[90 * mm, 90 * mm],
    )
    sig.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story.append(sig)

    doc.build(story)


async def _compute_for_employee(employee: Dict, fy: str, settings: Dict
                                ) -> tuple:
    """Helper that returns (computation, declarations) for an employee."""
    annual = float(employee.get("salary", 0) or 0) * 12
    basic = annual * 0.5
    hra = annual * 0.2
    d = await db.tax_declarations.find_one(
        {
            "employee_id": employee.get("employee_id"),
            "tenant_id": employee.get("tenant_id"),
            "financial_year": fy,
        },
        {"_id": 0},
    )
    declarations = (d or {}).get("declarations", {})
    regime = (d or {}).get("regime") or settings.get("default_regime", "new")
    comp = compute_tax(
        gross_annual=annual, basic_annual=basic, hra_annual=hra,
        regime=regime, declarations=declarations, tax_settings=settings,
    )
    return comp, declarations


@router.get("/reports/form16/{employee_id}")
async def form16_for_employee(employee_id: str, request: Request):
    """Generate Form 16 (Part B) PDF for a single employee."""
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    emp = await db.users.find_one(
        {"employee_id": employee_id}, {"_id": 0, "password_hash": 0}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user.get("tenant_id") and emp.get("tenant_id") != user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    tenant = await db.tenants.find_one(
        {"id": emp.get("tenant_id")}, {"_id": 0}
    ) or {"name": "Employer", "id": emp.get("tenant_id")}
    settings = await _get_settings(emp.get("tenant_id"), fy)
    comp, declarations = await _compute_for_employee(emp, fy, settings)

    buffer = io.BytesIO()
    _build_form16_pdf(buffer, tenant, emp, fy, comp, declarations)
    buffer.seek(0)
    fname = f"form16_{emp.get('employee_id')}_{fy}.pdf"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/reports/form16-bulk")
async def form16_bulk(request: Request):
    """Bulk-generate Form 16 PDFs for every active employee in tenant, as ZIP."""
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    tenant_id = user.get("tenant_id")

    emp_q: Dict[str, Any] = {"role": {"$in": ["employee", "hr_manager"]}, "status": "active"}
    if tenant_id:
        emp_q["tenant_id"] = tenant_id
    employees = await db.users.find(
        emp_q, {"_id": 0, "password_hash": 0}
    ).to_list(5000)

    tenant = await db.tenants.find_one(
        {"id": tenant_id}, {"_id": 0}
    ) or {"name": "Employer", "id": tenant_id}
    settings = await _get_settings(tenant_id, fy)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for emp in employees:
            comp, declarations = await _compute_for_employee(emp, fy, settings)
            pdf_buf = io.BytesIO()
            _build_form16_pdf(pdf_buf, tenant, emp, fy, comp, declarations)
            fname = f"form16_{emp.get('employee_id', 'unknown')}_{fy}.pdf"
            zf.writestr(fname, pdf_buf.getvalue())
    zip_buffer.seek(0)
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="form16_bulk_{fy}.zip"'
        },
    )


# ---------------------------------------------------------------------------
# Bulk CSV import of tax declarations (dry-run preview + strict commit)
# ---------------------------------------------------------------------------
_CSV_ALLOWED_NUMERIC = {
    "section_80c", "section_80d_self", "section_80d_parents",
    "section_80ccd_1b", "section_80ccd_2_employer_nps",
    "section_80e_education_loan",
    "hra_rent_paid", "section_24_home_loan",
    "lta", "other_exemptions",
}
_CSV_REQUIRED = {"employee_id", "regime"}
_CSV_OPTIONAL_TEXT = {"status"}


async def _parse_declarations_csv(file: UploadFile, tenant_id: Optional[str], fy: str
                                  ) -> Dict[str, Any]:
    """Parse a declarations CSV upload. Returns dict with parsed rows + errors."""
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    fields = reader.fieldnames or []
    missing = [c for c in _CSV_REQUIRED if c not in fields]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV missing required columns: {', '.join(missing)}",
        )

    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # Pre-load valid employee ids for this tenant for fast validation
    q: Dict[str, Any] = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    valid_emp = await db.users.find(q, {"_id": 0, "employee_id": 1}).to_list(10000)
    valid_ids = {e.get("employee_id") for e in valid_emp if e.get("employee_id")}

    for i, raw_row in enumerate(reader, start=2):  # header is row 1
        row_errs: List[str] = []
        emp_id = (raw_row.get("employee_id") or "").strip()
        regime = (raw_row.get("regime") or "").strip().lower()
        if not emp_id:
            row_errs.append("employee_id is required")
        elif emp_id not in valid_ids:
            row_errs.append(f"employee_id '{emp_id}' not found in tenant")
        if regime not in ("new", "old"):
            row_errs.append("regime must be 'new' or 'old'")

        declarations_out: Dict[str, float] = {}
        for col in _CSV_ALLOWED_NUMERIC:
            v = (raw_row.get(col) or "").strip()
            if v == "":
                continue
            try:
                num = float(v.replace(",", ""))
                if num < 0:
                    row_errs.append(f"{col}: must be >= 0")
                else:
                    declarations_out[col] = num
            except ValueError:
                row_errs.append(f"{col}: not a number ('{v}')")

        status = (raw_row.get("status") or "submitted").strip().lower()
        if status not in ("draft", "submitted"):
            row_errs.append("status must be 'draft' or 'submitted'")

        parsed = {
            "row": i,
            "employee_id": emp_id,
            "regime": regime,
            "declarations": declarations_out,
            "status": status,
        }
        if row_errs:
            errors.append({**parsed, "errors": row_errs})
        else:
            rows.append(parsed)

    return {
        "financial_year": fy,
        "tenant_id": tenant_id,
        "total_rows": len(rows) + len(errors),
        "accepted": rows,
        "rejected": errors,
        "valid": len(errors) == 0,
    }


@router.post("/declarations/bulk-import/preview")
async def bulk_import_preview(request: Request, file: UploadFile = File(...)):
    """Dry-run: parse & validate the uploaded CSV. Nothing is persisted."""
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")
    return await _parse_declarations_csv(file, user.get("tenant_id"), fy)


@router.post("/declarations/bulk-import/commit")
async def bulk_import_commit(request: Request, file: UploadFile = File(...)):
    """Strict commit: rejects whole file if any row is invalid."""
    user = await _require_admin(request)
    fy = request.query_params.get("financial_year") or await _current_fy()
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    parsed = await _parse_declarations_csv(file, user.get("tenant_id"), fy)
    if not parsed["valid"]:
        # Strict mode — refuse the whole batch
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Import rejected: validation errors found",
                "rejected": parsed["rejected"],
                "total_rows": parsed["total_rows"],
            },
        )

    now = datetime.now(timezone.utc).isoformat()
    tenant_id = user.get("tenant_id")
    inserted, updated = 0, 0

    for r in parsed["accepted"]:
        payload = {
            "employee_id": r["employee_id"],
            "tenant_id": tenant_id,
            "financial_year": fy,
            "regime": r["regime"],
            "declarations": r["declarations"],
            "status": r["status"],
            "updated_at": now,
            "imported_by": user.get("email"),
            "imported_at": now,
        }
        if r["status"] == "submitted":
            payload["submitted_at"] = now

        existing = await db.tax_declarations.find_one({
            "employee_id": r["employee_id"],
            "tenant_id": tenant_id,
            "financial_year": fy,
        })
        if existing:
            if existing.get("status") == "approved":
                # Don't override an HR-approved declaration via import
                continue
            await db.tax_declarations.update_one(
                {"_id": existing["_id"]}, {"$set": payload}
            )
            updated += 1
        else:
            payload["id"] = str(uuid.uuid4())
            payload["created_at"] = now
            await db.tax_declarations.insert_one(payload)
            inserted += 1

    return {
        "financial_year": fy,
        "inserted": inserted,
        "updated": updated,
        "total_rows": parsed["total_rows"],
        "valid": True,
    }


@router.get("/declarations/bulk-import/template")
async def bulk_import_template(request: Request):
    """Download a CSV template for bulk import."""
    await _require_admin(request)
    buffer = io.StringIO()
    w = csv.writer(buffer)
    w.writerow([
        "employee_id", "regime", "section_80c", "section_80d_self",
        "section_80d_parents", "section_80ccd_1b",
        "section_80ccd_2_employer_nps", "section_80e_education_loan",
        "hra_rent_paid", "section_24_home_loan", "lta", "other_exemptions",
        "status",
    ])
    w.writerow([
        "EMP-ACME-001", "old", "150000", "25000", "50000", "50000",
        "0", "0", "240000", "200000", "0", "0", "submitted",
    ])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="declarations_template.csv"'},
    )
