# PF & ESI Management Module — User Guide

Full Provident Fund (EPF + EPS + EDLI + Admin charges) and Employee State
Insurance (ESI) management for Indian payrolls. Fully configurable per tenant
with statutory defaults baked in.

> 💡 **Where to find it**: HR sidebar → **PF & ESI** → route `/pf-management`.
>
> Employees see a simplified **My PF** page (route `/my-pf`) showing their
> running PF balance.

---

## Table of contents

1. [Statutory background (TL;DR)](#1-statutory-background-tldr)
2. [HR — Configuring PF & ESI settings](#2-hr--configuring-pf--esi-settings)
3. [HR — Per-employee statutory info](#3-hr--per-employee-statutory-info)
4. [Live monthly preview](#4-live-monthly-preview)
5. [Reports — PF / ECR challan](#5-reports--pf--ecr-challan)
6. [Employee — My PF statement](#6-employee--my-pf-statement)
7. [How PF & ESI flow into payroll](#7-how-pf--esi-flow-into-payroll)
8. [Default rates & ceilings](#8-default-rates--ceilings)
9. [API reference](#9-api-reference)
10. [FAQ & troubleshooting](#10-faq--troubleshooting)

---

## 1. Statutory background (TL;DR)

### Provident Fund (EPF / EPS / EDLI)
- Employee contributes **12 %** of PF wages (Basic + DA) → goes to **EPF**.
- Employer contributes **12 %** of PF wages too — but it's split:
  - **8.33 %** → **EPS** (Pension), capped at ₹15,000 wages → max ₹1,250 / mo
  - **3.67 %** (the remainder) → **EPF** (Provident Fund)
- **EDLI** (insurance) — employer-only, **0.5 %** of capped wage.
- **Admin charges** — employer-only, **0.5 %** of capped wage.
- **PF wage ceiling** — ₹15,000 / month. If basic > ceiling and you apply it,
  PF is computed only on ₹15,000.

### Employee State Insurance (ESI)
- Applies only if **gross monthly salary ≤ ₹21,000** (the wage limit).
- Employee: **0.75 %** of gross, Employer: **3.25 %** of gross.

## 2. HR — Configuring PF & ESI settings

**Path**: Sidebar → **PF & ESI** → tab **Settings**

### Provident Fund block
- **Employee PF %** — default 12.
- **Employer total %** — default 12 (sum of EPS + EPF parts).
- **Employer EPS %** — default 8.33.
- **PF wage ceiling (₹)** — default 15,000.
- **EPS wage ceiling (₹)** — default 15,000 (always applied).
- **Apply wage ceiling** — toggle: if OFF, employee+employer EPF are computed
  on actual basic, but EPS still capped.
- **EDLI rate %** — default 0.5.
- **PF admin charges %** — default 0.5.

### ESI block
- **ESI enabled** — master switch for the whole tenant.
- **Employee ESI %** — default 0.75.
- **Employer ESI %** — default 3.25.
- **ESI gross wage limit (₹)** — default 21,000.

### Buttons
- **Save settings** — upserts the tenant's `pf_settings` doc.
- **Reset to defaults** — back to statutory defaults.

## 3. HR — Per-employee statutory info

**Path**: Sidebar → **PF & ESI** → tab **Employee Statutory Info**

1. Pick an employee from the dropdown.
2. Fill in:

| Field | Notes |
|-------|-------|
| **PAN** | 10-char, format `ABCDE1234F`. Used in tax reports. |
| **Aadhaar (last 4)** | Privacy — we only store the last 4 digits. |
| **UAN** | 12-digit Universal Account Number (linked to EPFO). |
| **PF account no.** | Establishment-wise PF account number. |
| **PF join date** | When the employee joined PF coverage. |
| **PF opt-in** ⚙️ | Excludes the employee from PF entirely when OFF. *HR only — employees cannot change this.* |
| **ESI number** | The employee's ESIC IP number. |
| **ESI opt-in** ⚙️ | Excludes the employee from ESI when OFF. |

3. Click **Save**.

> 🔒 **Employees can self-update only PAN / Aadhaar / UAN** on the
> `/profile` page (or via API). All other fields are HR-only.

## 4. Live monthly preview

Right under the statutory form, the **Live PF/ESI preview** card shows what
the employee's *current* monthly contribution would be, based on their
salary in the user record + the current settings. Use this as a sanity check
before payroll runs.

Example for basic ₹47,500 with apply_ceiling = true:

```
Monthly gross    ₹95,000
Monthly basic    ₹47,500
PF wage          ₹15,000   ← capped
Employee PF      ₹ 1,800   (12 % of 15,000)
Employer EPF     ₹   550   (12% − 8.33% of 15,000)
Employer EPS     ₹ 1,250   (8.33 % of 15,000)
EDLI             ₹    75   (0.5 % of 15,000)
Admin charges    ₹    75
ESI applicable   No        ← gross > 21,000
```

## 5. Reports — PF / ECR challan

**Path**: Sidebar → **PF & ESI** → tab **Reports**

Enter the month in **YYYY-MM** format (e.g. `2026-05`) and click
**Download CSV**. The file contains one row per generated payslip:

```
Employee ID, Name, UAN, PF Account, Gross Wages, PF Wages, EPS Wages,
Employee PF, Employer EPF, Employer EPS, EDLI, Admin Charges,
Employee ESI, Employer ESI
TOTALS, …
```

The format mirrors the **EPFO ECR text file** layout (minus the special
delimiter) — your accountant can use it as the input for the actual ECR
upload to EPFO.

> Pro-tip: re-generate payslips for the month *before* downloading the
> challan if you've changed settings — the report reads from `payslips`.

## 6. Employee — My PF statement

**Path**: Employee sidebar → **My PF** → route `/my-pf`

What employees see:
- **Header**: their UAN and PF account number (badges show "Not set" if HR
  hasn't filled them in yet).
- **Four summary cards**: Employee PF, Employer EPF, Employer EPS, **Grand
  total** (running across all months payslips exist).
- **Month-wise contributions table**: each row is one payslip period
  (e.g. `2026-05`) with PF wage, employee PF (red), employer EPF, employer
  EPS, and running totals.

This is read-only and tenant-scoped — an employee can only see their own data.

## 7. How PF & ESI flow into payroll

When HR clicks **Generate** in the Payroll page:

1. Load the tenant's **`pf_settings`** (or defaults).
2. Read the employee's `pf_opt_in` & `esi_opt_in` flags.
3. Call `compute_pf(basic_monthly, pf_settings, pf_opt_in)`:
   - If `pf_opt_in = false` → all PF zero.
   - Else compute `pf_wage`, employee PF, employer EPS, employer EPF, EDLI, admin charges.
4. Call `compute_esi(gross_monthly, pf_settings, esi_opt_in)`:
   - Only applies if gross ≤ `esi_wage_limit` AND `esi_enabled` AND `esi_opt_in`.
5. Persist all values on the payslip document.

The payslip PDF then renders a "Deductions" block (employee side) and a
separate "Employer Contributions" block (informational).

## 8. Default rates & ceilings

| Setting | Default | Statutory ref |
|---------|---------|---------------|
| Employee PF | **12 %** | EPF Act 1952 |
| Employer total PF | **12 %** | EPF Act 1952 |
| Employer EPS share | **8.33 %** | EPS 1995 |
| PF wage ceiling | **₹15,000 / mo** | Notification 22-Aug-2014 |
| EPS wage ceiling | **₹15,000 / mo** | Always applied |
| EDLI | **0.5 %** | EDLI 1976 (employer-only) |
| PF admin charges | **0.5 %** | Min ₹500 per establishment |
| ESI employee | **0.75 %** | ESIC w.e.f. Jul-2019 |
| ESI employer | **3.25 %** | ESIC w.e.f. Jul-2019 |
| ESI wage limit | **₹21,000 / mo** | ESIC 2017 |

## 9. API reference

Base URL: `https://your-host/api/pf`

| Method | Endpoint | Roles | Body / Params | Returns |
|--------|----------|-------|----------------|---------|
| `GET`  | `/settings` | any auth | — | PF settings |
| `PUT`  | `/settings` | super_admin · hr | `PFSettingsUpsert` | Updated |
| `POST` | `/settings/reset` | admin · hr | — | Defaults |
| `GET`  | `/employees/{id}/statutory` | self or hr-in-tenant | — | Statutory info |
| `PUT`  | `/employees/{id}/statutory` | self (limited) or hr | `StatutoryInfoUpsert` | Updated |
| `GET`  | `/compute/{id}` | self or hr-in-tenant | — | Live PF/ESI preview |
| `GET`  | `/reports/challan?month=YYYY-MM` | admin · hr | — | CSV |
| `GET`  | `/statement/me` | any auth | — | PF statement (JSON) |

### Schemas

```jsonc
// PUT /api/pf/settings
{
  "pf_employee_rate": 12,
  "pf_employer_rate": 12,
  "pf_employer_eps_rate": 8.33,
  "pf_wage_ceiling": 15000,
  "pf_apply_ceiling": true,
  "eps_wage_ceiling": 15000,
  "edli_rate": 0.5,
  "admin_charges_rate": 0.5,
  "esi_enabled": true,
  "esi_employee_rate": 0.75,
  "esi_employer_rate": 3.25,
  "esi_wage_limit": 21000
}

// PUT /api/pf/employees/{id}/statutory
{
  "pan": "ABCDE1234F",
  "aadhaar_last4": "1234",
  "uan": "100200300400",
  "pf_account_no": "MH/BAN/12345/000/00012",
  "pf_join_date": "2023-04-01",
  "pf_opt_in": true,
  "esi_number": "1234567890",
  "esi_opt_in": true
}
```

### Example — fetch live preview for an employee

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://your-host/api/pf/compute/EMP-001
```

Response:

```json
{
  "employee_id": "EMP-001",
  "monthly_gross": 85000,
  "monthly_basic": 42500,
  "pf": {
    "applicable": true,
    "pf_wage": 15000,
    "employee_pf": 1800,
    "employer_eps": 1249.5,
    "employer_epf": 550.5,
    "employer_total": 1800,
    "edli": 75,
    "admin_charges": 75
  },
  "esi": { "applicable": false, "employee_esi": 0, "employer_esi": 0, "total_esi": 0 }
}
```

## 10. FAQ & troubleshooting

**Q. "Employee PF amount is wrong on a payslip."**
Regenerate the payslip — values are snapshotted at generation time, not live.

**Q. "Why is employer EPF 550 instead of 550.5?"**
Float rounding. The system rounds to 2 decimals (₹0.01). Cumulative reports
re-sum the rounded values so totals stay consistent.

**Q. "How do I opt an employee out of PF entirely (e.g. > ₹15k joiner who was never EPF-covered)?"**
HR → Employee Statutory Info → toggle **PF opt-in** OFF → Save. The payslip will
record zero PF for them going forward. ⚠️ This isn't always legally allowed —
consult your CA.

**Q. "Can I run PF on the entire basic (no ceiling) for senior staff?"**
Yes — toggle **Apply wage ceiling** OFF in Settings. Employee PF will then be
12 % of actual basic; EPS still capped at ₹15,000 (statutory).

**Q. "ESI isn't being deducted even though the employee earns ₹18,000."**
Check that `esi_enabled` is ON and the employee's `esi_opt_in` is ON, and
that ₹18,000 ≤ the configured wage limit.

**Q. "Where's the UAN dashboard / Form 5 / Form 10?"**
Not built yet. The PF challan CSV covers the monthly ECR; let us know if you
need EPFO Form 5 (new joiners) or Form 10 (leavers) and we'll add them.
