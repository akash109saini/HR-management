"""
India EPF / EPS / ESI calculator.

Pure functions — no DB access. Amounts are MONTHLY.

References (statutory defaults):
  EPF — 12% employee, 12% employer total (of which 8.33% goes to EPS subject
        to a ₹15,000 wage ceiling, rest to EPF).
  ESI — 0.75% employee + 3.25% employer, applicable only when monthly gross
        salary <= ₹21,000.
"""
from __future__ import annotations
from typing import Dict, Optional


DEFAULT_PF_SETTINGS: Dict = {
    "pf_employee_rate": 12.0,
    "pf_employer_rate": 12.0,           # total employer share (EPS+EPF)
    "pf_employer_eps_rate": 8.33,       # part of employer share that goes to EPS
    "pf_wage_ceiling": 15000,
    "pf_apply_ceiling": True,           # if False → PF on actual basic
    "eps_wage_ceiling": 15000,          # EPS is *always* capped
    "edli_rate": 0.5,                   # EDLI employer-only, of capped wage
    "admin_charges_rate": 0.5,          # PF admin charges employer-only
    # NPS (Section 80CCD(2)) — employer contribution to NPS, deductible from tax
    "nps_enabled": False,
    "employer_nps_rate": 10.0,          # % of basic, max 10% allowed u/s 80CCD(2)
    # ESI
    "esi_enabled": True,
    "esi_employee_rate": 0.75,
    "esi_employer_rate": 3.25,
    "esi_wage_limit": 21000,            # applicability cap on gross monthly
}


def _r(x: float) -> float:
    return round(float(x or 0), 2)


def merged_pf_settings(custom: Optional[Dict]) -> Dict:
    out = dict(DEFAULT_PF_SETTINGS)
    if custom:
        for k, v in custom.items():
            if v is not None:
                out[k] = v
    return out


def compute_pf(
    *,
    basic_monthly: float,
    da_monthly: float = 0.0,
    pf_settings: Optional[Dict] = None,
    pf_opt_in: bool = True,
) -> Dict:
    """Compute employee + employer monthly PF/EPS/EDLI/admin contributions."""
    s = merged_pf_settings(pf_settings)
    if not pf_opt_in:
        return {
            "applicable": False,
            "pf_wage": 0.0,
            "employee_pf": 0.0,
            "employer_eps": 0.0,
            "employer_epf": 0.0,
            "employer_total": 0.0,
            "edli": 0.0,
            "admin_charges": 0.0,
        }

    wages = max(0.0, float(basic_monthly or 0) + float(da_monthly or 0))
    ceiling = float(s["pf_wage_ceiling"])
    pf_wage = min(wages, ceiling) if s["pf_apply_ceiling"] else wages

    employee_pf = _r(pf_wage * float(s["pf_employee_rate"]) / 100.0)

    # EPS is *always* capped at the EPS ceiling regardless of pf_apply_ceiling
    eps_wage = min(wages, float(s["eps_wage_ceiling"]))
    employer_eps = _r(eps_wage * float(s["pf_employer_eps_rate"]) / 100.0)

    employer_total = _r(pf_wage * float(s["pf_employer_rate"]) / 100.0)
    employer_epf = _r(max(0.0, employer_total - employer_eps))

    edli = _r(min(wages, ceiling) * float(s["edli_rate"]) / 100.0)
    admin_charges = _r(min(wages, ceiling) * float(s["admin_charges_rate"]) / 100.0)

    return {
        "applicable": True,
        "pf_wage": _r(pf_wage),
        "employee_pf": employee_pf,
        "employer_eps": employer_eps,
        "employer_epf": employer_epf,
        "employer_total": employer_total,
        "edli": edli,
        "admin_charges": admin_charges,
    }


def compute_esi(
    *,
    gross_monthly: float,
    pf_settings: Optional[Dict] = None,
    esi_opt_in: bool = True,
) -> Dict:
    """Compute monthly ESI contributions. Only applicable if gross <= limit."""
    s = merged_pf_settings(pf_settings)
    gross_monthly = max(0.0, float(gross_monthly or 0))
    applicable = bool(
        esi_opt_in
        and s["esi_enabled"]
        and gross_monthly > 0
        and gross_monthly <= float(s["esi_wage_limit"])
    )
    if not applicable:
        return {
            "applicable": False,
            "employee_esi": 0.0,
            "employer_esi": 0.0,
            "total_esi": 0.0,
        }
    employee_esi = _r(gross_monthly * float(s["esi_employee_rate"]) / 100.0)
    employer_esi = _r(gross_monthly * float(s["esi_employer_rate"]) / 100.0)
    return {
        "applicable": True,
        "employee_esi": employee_esi,
        "employer_esi": employer_esi,
        "total_esi": _r(employee_esi + employer_esi),
    }


def compute_nps(
    *,
    basic_monthly: float,
    pf_settings: Optional[Dict] = None,
    nps_opt_in: bool = False,
) -> Dict:
    """Compute monthly employer NPS contribution u/s 80CCD(2).

    Capped at 10% of basic (statutory cap for tax-deductibility).
    """
    s = merged_pf_settings(pf_settings)
    basic = max(0.0, float(basic_monthly or 0))
    applicable = bool(nps_opt_in and s.get("nps_enabled") and basic > 0)
    if not applicable:
        return {"applicable": False, "employer_nps": 0.0, "rate": 0.0}
    rate = min(float(s.get("employer_nps_rate", 10.0)), 10.0)
    return {
        "applicable": True,
        "rate": rate,
        "employer_nps": _r(basic * rate / 100.0),
    }
