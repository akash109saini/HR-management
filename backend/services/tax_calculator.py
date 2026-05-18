"""
India Income Tax calculator (FY 2025-26).

Supports both Old and New regimes. Pure functions — no DB access.
All amounts are annual unless noted otherwise.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Default slabs / rates for FY 2025-26 (effective 1 Apr 2025).
# These are the fallback values — a tenant can override them in tax_settings.
# ---------------------------------------------------------------------------
DEFAULT_NEW_REGIME_SLABS: List[Dict] = [
    {"from": 0,        "to": 400000,   "rate": 0},
    {"from": 400000,   "to": 800000,   "rate": 5},
    {"from": 800000,   "to": 1200000,  "rate": 10},
    {"from": 1200000,  "to": 1600000,  "rate": 15},
    {"from": 1600000,  "to": 2000000,  "rate": 20},
    {"from": 2000000,  "to": 2400000,  "rate": 25},
    {"from": 2400000,  "to": None,     "rate": 30},
]

DEFAULT_OLD_REGIME_SLABS: List[Dict] = [
    {"from": 0,        "to": 250000,   "rate": 0},
    {"from": 250000,   "to": 500000,   "rate": 5},
    {"from": 500000,   "to": 1000000,  "rate": 20},
    {"from": 1000000,  "to": None,     "rate": 30},
]

DEFAULT_SURCHARGE_SLABS: List[Dict] = [
    {"from": 5000000,  "to": 10000000,  "rate": 10},
    {"from": 10000000, "to": 20000000,  "rate": 15},
    {"from": 20000000, "to": 50000000,  "rate": 25},
    {"from": 50000000, "to": None,      "rate": 37},
]

DEFAULT_TAX_SETTINGS: Dict = {
    "financial_year": "2025-26",
    "default_regime": "new",
    "new_regime_slabs": DEFAULT_NEW_REGIME_SLABS,
    "old_regime_slabs": DEFAULT_OLD_REGIME_SLABS,
    "surcharge_slabs": DEFAULT_SURCHARGE_SLABS,
    "standard_deduction_new": 75000,
    "standard_deduction_old": 50000,
    "cess_rate": 4,           # Health & Education cess %
    # Section 87A rebate (FY 2025-26)
    "rebate_87a_limit_new": 1200000,
    "rebate_87a_max_new": 60000,
    "rebate_87a_limit_old": 500000,
    "rebate_87a_max_old": 12500,
    # 80C / 80D / etc. ceilings (used only in old regime)
    "max_80c": 150000,
    "max_80d_self": 25000,
    "max_80d_parents": 50000,
    "max_80ccd_1b": 50000,
    "max_24_home_loan": 200000,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _r(x: float) -> float:
    return round(float(x or 0), 2)


def _slab_tax(taxable: float, slabs: List[Dict]) -> float:
    """Apply a list of progressive slabs to an annual taxable amount."""
    if taxable <= 0:
        return 0.0
    tax = 0.0
    for s in slabs:
        lo = float(s["from"])
        hi = s["to"]
        rate = float(s["rate"]) / 100.0
        if hi is None:
            slice_amt = max(0.0, taxable - lo)
        else:
            slice_amt = max(0.0, min(taxable, float(hi)) - lo)
        if slice_amt <= 0:
            break
        tax += slice_amt * rate
    return _r(tax)


def _surcharge(income: float, base_tax: float, surcharge_slabs: List[Dict],
               regime: str) -> float:
    """Compute surcharge on base tax (before cess).

    For the New regime the surcharge is capped at 25%.
    """
    rate = 0.0
    for s in surcharge_slabs:
        lo = float(s["from"])
        hi = s["to"]
        if income > lo and (hi is None or income <= float(hi)):
            rate = float(s["rate"])
            break
    if regime == "new" and rate > 25:
        rate = 25.0
    return _r(base_tax * rate / 100.0)


def _hra_exempt(annual_basic: float, hra_rent_paid: float,
                annual_hra_received: float, is_metro: bool) -> float:
    """Old-regime HRA exemption — minimum of the 3 components."""
    if hra_rent_paid <= 0 or annual_basic <= 0:
        return 0.0
    a = annual_hra_received
    b = hra_rent_paid - 0.10 * annual_basic
    c = (0.50 if is_metro else 0.40) * annual_basic
    return _r(max(0.0, min(a, b, c)))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def merged_settings(custom: Optional[Dict]) -> Dict:
    out = dict(DEFAULT_TAX_SETTINGS)
    if custom:
        for k, v in custom.items():
            if v is not None:
                out[k] = v
    return out


def compute_tax(
    *,
    gross_annual: float,
    basic_annual: float = 0.0,
    hra_annual: float = 0.0,
    regime: str = "new",
    declarations: Optional[Dict] = None,
    tax_settings: Optional[Dict] = None,
    professional_tax_annual: float = 0.0,
    employer_nps_annual: float = 0.0,
) -> Dict:
    """Compute Indian income tax for one financial year.

    Returns a fully-itemised dict (every line you need on a Form-16 style report).
    """
    s = merged_settings(tax_settings)
    d = dict(declarations or {})
    regime = (regime or s["default_regime"] or "new").lower()
    if regime not in ("new", "old"):
        regime = "new"

    gross_annual = max(0.0, float(gross_annual or 0))
    basic_annual = max(0.0, float(basic_annual or 0))
    hra_annual = max(0.0, float(hra_annual or 0))

    # ------- Exemptions (only Old regime allows the bulk of these) -------
    exemptions: Dict[str, float] = {}
    if regime == "old":
        exemptions["hra"] = _hra_exempt(
            annual_basic=basic_annual,
            hra_rent_paid=float(d.get("hra_rent_paid", 0) or 0),
            annual_hra_received=hra_annual,
            is_metro=(d.get("hra_city", "non-metro") == "metro"),
        )
        exemptions["lta"] = _r(d.get("lta_claimed", 0))
        exemptions["other_exemptions"] = _r(d.get("other_exemptions", 0))
    total_exemptions = _r(sum(exemptions.values()))

    # ------- Standard deduction & professional tax -------
    std_ded = float(
        s["standard_deduction_new"] if regime == "new" else s["standard_deduction_old"]
    )
    professional_tax = _r(professional_tax_annual)

    # Income from salary ("gross taxable income")
    income_from_salary = _r(
        gross_annual - total_exemptions - std_ded - professional_tax
    )

    # ------- Chapter VI-A deductions (only Old regime) -------
    chap_via: Dict[str, float] = {}
    if regime == "old":
        chap_via["section_80c"] = min(
            _r(d.get("section_80c", 0)), float(s["max_80c"])
        )
        chap_via["section_80d_self"] = min(
            _r(d.get("section_80d_self", 0)), float(s["max_80d_self"])
        )
        chap_via["section_80d_parents"] = min(
            _r(d.get("section_80d_parents", 0)), float(s["max_80d_parents"])
        )
        chap_via["section_80ccd_1b"] = min(
            _r(d.get("section_80ccd_1b", 0)), float(s["max_80ccd_1b"])
        )
        chap_via["section_80e"] = _r(d.get("section_80e", 0))
        chap_via["section_80g"] = _r(d.get("section_80g", 0))
        chap_via["section_24_home_loan"] = min(
            _r(d.get("section_24_home_loan", 0)), float(s["max_24_home_loan"])
        )
    # Employer NPS u/s 80CCD(2) is allowed in BOTH regimes (up to 10% of basic; we accept caller-validated amount)
    chap_via["section_80ccd_2_employer_nps"] = _r(employer_nps_annual)
    total_chap_via = _r(sum(chap_via.values()))

    taxable_income = _r(max(0.0, income_from_salary - total_chap_via))

    # ------- Slab tax -------
    slabs = s["new_regime_slabs"] if regime == "new" else s["old_regime_slabs"]
    base_tax = _slab_tax(taxable_income, slabs)

    # ------- 87A rebate -------
    if regime == "new":
        rebate_limit = float(s["rebate_87a_limit_new"])
        rebate_max = float(s["rebate_87a_max_new"])
    else:
        rebate_limit = float(s["rebate_87a_limit_old"])
        rebate_max = float(s["rebate_87a_max_old"])

    rebate_87a = 0.0
    if taxable_income <= rebate_limit:
        rebate_87a = min(base_tax, rebate_max)
    tax_after_rebate = _r(max(0.0, base_tax - rebate_87a))

    # ------- Surcharge -------
    surcharge = _surcharge(
        taxable_income, tax_after_rebate, s["surcharge_slabs"], regime
    )

    # ------- Cess -------
    cess = _r((tax_after_rebate + surcharge) * float(s["cess_rate"]) / 100.0)

    total_tax_annual = _r(tax_after_rebate + surcharge + cess)
    monthly_tds = _r(total_tax_annual / 12.0)

    return {
        "regime": regime,
        "financial_year": s["financial_year"],
        "gross_annual": _r(gross_annual),
        "exemptions": exemptions,
        "total_exemptions": total_exemptions,
        "standard_deduction": _r(std_ded),
        "professional_tax": professional_tax,
        "income_from_salary": income_from_salary,
        "chapter_via_deductions": chap_via,
        "total_chapter_via": total_chap_via,
        "taxable_income": taxable_income,
        "slab_tax": base_tax,
        "rebate_87a": _r(rebate_87a),
        "tax_after_rebate": tax_after_rebate,
        "surcharge": surcharge,
        "cess": cess,
        "total_tax_annual": total_tax_annual,
        "monthly_tds": monthly_tds,
    }
