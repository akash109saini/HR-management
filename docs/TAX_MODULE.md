# Tax Management Module — User Guide

Comprehensive Indian Income Tax management for FY 2025-26 (and beyond).
Supports **both Old and New regimes**, fully configurable slabs, employee
declarations workflow, side-by-side regime comparison, and Form 16-style
TDS reports.

> 💡 **Where to find it**: Once logged in as HR or super-admin, click
> **Tax Management** (receipt icon) in the sidebar →
> route `/tax-management`.
>
> Employees see a slimmer version called **My Tax** (route `/my-tax`).

---

## Table of contents

1. [Concepts](#1-concepts)
2. [HR — Configuring tax settings](#2-hr--configuring-tax-settings)
3. [Employee — Submitting a declaration](#3-employee--submitting-a-declaration)
4. [HR — Reviewing & approving declarations](#4-hr--reviewing--approving-declarations)
5. [Quick Tax Calculator](#5-quick-tax-calculator)
6. [Reports (Form 16-style CSV)](#6-reports-form-16-style-csv)
7. [How tax is computed inside payroll](#7-how-tax-is-computed-inside-payroll)
8. [Default slabs & rates (FY 2025-26)](#8-default-slabs--rates-fy-2025-26)
9. [API reference](#9-api-reference)
10. [FAQ & troubleshooting](#10-faq--troubleshooting)

---

## 1. Concepts

| Term | What it means here |
|------|--------------------|
| **Tenant** | One client company on the SaaS platform. Each tenant has its own tax settings. |
| **Financial Year (FY)** | India tax year, e.g. *2025-26* runs **1 Apr 2025 → 31 Mar 2026**. |
| **Regime** | "New" (lower slabs, no exemptions) or "Old" (higher slabs but 80C / 80D / HRA / etc. allowed). |
| **Declaration** | The employee's choice of regime + planned investments for the year. HR approves it. |
| **TDS** | Tax Deducted at Source — the monthly withholding shown on the payslip. |

A tenant can override **every** slab, rate, ceiling, and rebate — but if they
don't, the system uses the statutory defaults for FY 2025-26 baked into
[`backend/services/tax_calculator.py`](../backend/services/tax_calculator.py).

## 2. HR — Configuring tax settings

**Path**: Sidebar → **Tax Management** → tab **Settings**

You can change anything you need:

### General
- **Default regime** — applied to any employee who hasn't submitted a declaration yet.
- **Standard deduction (New / Old)** — defaults ₹75,000 / ₹50,000.
- **Cess %** — Health & Education cess, default 4 %.
- **87A rebate limit / max** — set per regime. Default for New = ₹12,00,000 / ₹60,000; for Old = ₹5,00,000 / ₹12,500.

### Slab structure
Three editable tables:
- **New regime slabs** — progressive, e.g. 0–4L = 0 %, 4–8L = 5 %, …
- **Old regime slabs** — 0–2.5L = 0 %, 2.5–5L = 5 %, …
- **Surcharge slabs** — applied on tax for incomes > ₹50L.

For each row click **+ Add slab** or the trash icon to remove. "To" empty
means "no upper limit".

### Chapter VI-A limits (Old regime)
80C max, 80D self / parents, 80CCD(1B) NPS, Section 24 home-loan interest, etc.

### Buttons
- **Save settings** — upserts into `tax_settings` for `(tenant_id, financial_year)`.
- **Reset to defaults** — deletes your override → falls back to statutory defaults.

> 💡 Tip: change the **FY input** at the top right to maintain *next year's*
> tax settings before April.

## 3. Employee — Submitting a declaration

**Path**: Sidebar → **My Tax** → tab **Declaration**

1. **Pick a regime** — "New" (recommended for most) or "Old".
2. If you picked *Old*, fill in your planned investments:
   - **80C** — PF, ELSS, PPF, life insurance, principal home loan, etc. *Max ₹1.5L.*
   - **80D — Self & family medical insurance.** *Max ₹25k (₹50k if senior citizen self).*
   - **80D — Parents medical insurance.** *Max ₹50k for senior parents.*
   - **80CCD(1B) — NPS additional.** *Max ₹50k.*
   - **80E — Education loan interest.** *No limit.*
   - **80G — Donations.** *Subject to 50/100 % rules — declare net.*
   - **Section 24 — Home loan interest.** *Max ₹2L (self-occupied).*
   - **Annual rent paid** + **HRA city type (metro / non-metro)** — used to compute HRA exemption.
   - **LTA claimed**, **Other exemptions** — anything else.
3. Click **Save draft** as often as you like to iterate.
4. When happy, click **Submit to HR** — status becomes *submitted* and you
   can no longer edit until HR approves or rejects.

> ⚠️ The New regime does NOT allow most of these deductions. The fields are
> automatically disabled when you select New. Standard deduction of ₹75,000 is
> still applied automatically.

> 🔒 **Locked once approved.** After HR approves, your inputs lock. To make
> changes, ask HR to reject so you can re-edit, then resubmit.

## 4. HR — Reviewing & approving declarations

**Path**: Sidebar → **Tax Management** → tab **Employee Declarations**

You'll see a table of every employee's declaration:

| Column | Notes |
|--------|-------|
| Employee | Their employee ID |
| Regime | NEW / OLD badge |
| 80C, 80D, HRA Rent, Home Loan | Quick scan of the big-ticket items |
| Status | *draft*, *submitted*, *approved* |
| Actions | **Approve** / **Reject** (only on *submitted* rows) |

Use the **status filter** dropdown at the top right to narrow down — typically
HR works through *submitted* before payroll closes for the month.

When you **approve**, the declaration locks and the calculator starts using
it. When you **reject**, status returns to *draft* so the employee can fix
and resubmit.

## 5. Quick Tax Calculator

**Path**: Sidebar → **Tax Management** → tab **Tax Calculator**

A live what-if tool. Enter:
- **Gross annual** — ₹
- **Regime** — New / Old

Click **Compute**. Two side-by-side breakdown cards appear:

```
Gross annual          ₹15,00,000
Std deduction        - ₹   75,000
Exemptions           - ₹        0    (none in New regime)
Chapter VI-A         - ₹        0
─────────────────────────────────
Taxable income         ₹14,25,000

Slab tax               ₹  93,750
87A rebate          -  ₹        0
Surcharge              ₹        0
Cess (4 %)             ₹   3,750
─────────────────────────────────
Annual tax             ₹  97,500
Monthly TDS            ₹   8,125
```

Useful before approving a declaration to see exactly what the employee will
pay, or for an ad-hoc enquiry.

> 💡 Employees also have a **My Tax → Old vs New regime** tab that compares
> both regimes for their own salary in real time. The cheaper one gets a
> green **"Cheaper"** badge — saving them the math.

## 6. Reports (Form 16-style CSV)

**Path**: Sidebar → **Tax Management** → tab **Reports**

Click **Download CSV** under "Annual TDS Summary (Form 16 style)". You get a
CSV with one row per active employee containing:

```
Employee ID, Name, PAN, Regime, Annual Gross,
Total Exemptions, Std Deduction, Chapter VI-A,
Taxable Income, Slab Tax, Rebate 87A, Surcharge, Cess,
Total Tax Annual, Monthly TDS
```

Open in Excel / Google Sheets and ship to your CA.

## 7. How tax is computed inside payroll

When HR clicks **Generate** in the Payroll page, for each employee the system:

1. Loads the **tax settings** for the tenant + FY.
2. Loads the **approved declaration** (or the draft, or falls back to defaults).
3. Calls `compute_tax(...)` which:
   - Applies exemptions (HRA, LTA) — Old regime only.
   - Subtracts standard deduction & professional tax.
   - Subtracts Chapter VI-A deductions (Old regime only, with statutory caps).
   - Walks the slab table → base tax.
   - Applies the 87A rebate, surcharge, then cess.
4. Divides by 12 → **Monthly TDS** → appears on the payslip as `tax`.

The payslip also stores `taxable_income`, `annual_tax`, `tax_regime`,
`financial_year` so downstream reports can audit-trail the computation.

## 8. Default slabs & rates (FY 2025-26)

These are baked-in fallbacks. Override per tenant any time.

### New regime
| From (₹) | To (₹) | Rate |
|----------:|----------:|----:|
| 0 | 4,00,000 | 0 % |
| 4,00,000 | 8,00,000 | 5 % |
| 8,00,000 | 12,00,000 | 10 % |
| 12,00,000 | 16,00,000 | 15 % |
| 16,00,000 | 20,00,000 | 20 % |
| 20,00,000 | 24,00,000 | 25 % |
| 24,00,000 | — | 30 % |

- **Standard deduction**: ₹75,000
- **87A rebate**: full rebate if taxable income ≤ ₹12,00,000 (up to ₹60,000)
- Most exemptions / Chapter VI-A NOT allowed.

### Old regime
| From (₹) | To (₹) | Rate |
|----------:|----------:|----:|
| 0 | 2,50,000 | 0 % |
| 2,50,000 | 5,00,000 | 5 % |
| 5,00,000 | 10,00,000 | 20 % |
| 10,00,000 | — | 30 % |

- **Standard deduction**: ₹50,000
- **87A rebate**: full rebate if taxable income ≤ ₹5,00,000 (up to ₹12,500)
- Exemptions / 80C / 80D / HRA / NPS / home loan interest all allowed.

### Surcharge slabs (both regimes)
| Income range (₹) | Rate |
|------------------|----:|
| 50L – 1 Cr | 10 % |
| 1 Cr – 2 Cr | 15 % |
| 2 Cr – 5 Cr | 25 % |
| > 5 Cr | 37 % (Old) / 25 % cap (New) |

### Cess
4 % Health & Education cess on (tax + surcharge).

## 9. API reference

Base URL: `https://your-host/api/tax`

| Method | Endpoint | Roles | Body / Params | Returns |
|--------|----------|-------|----------------|---------|
| `GET`  | `/settings?financial_year=2025-26` | any auth | — | Tax settings doc |
| `PUT`  | `/settings` | super_admin · hr_manager | `TaxSettingsUpsert` | Updated doc |
| `POST` | `/settings/reset?financial_year=…` | admin · hr | — | Defaults |
| `GET`  | `/declarations/me?financial_year=…` | any auth | — | Self declaration |
| `PUT`  | `/declarations/me` | any auth | `TaxDeclarationUpsert` | Updated |
| `GET`  | `/declarations?status=submitted` | admin · hr | — | List |
| `POST` | `/declarations/{id}/decision` | admin · hr | `{ action, note }` | Decision |
| `POST` | `/compute` | any auth (self/HR) | `{ gross_annual, regime, declarations? }` | Computation |
| `GET`  | `/compare/me?financial_year=…` | any auth | — | Old vs New |
| `GET`  | `/reports/tds-summary?financial_year=…` | admin · hr | — | CSV |

### Schemas

```json
TaxDeclarationUpsert = {
  "financial_year": "2025-26",
  "regime": "new" | "old",
  "declarations": {
    "section_80c": 150000,
    "section_80d_self": 25000,
    "section_80d_parents": 50000,
    "section_80ccd_1b": 50000,
    "section_80e": 30000,
    "section_80g": 0,
    "section_24_home_loan": 200000,
    "hra_rent_paid": 300000,
    "hra_city": "metro" | "non-metro",
    "lta_claimed": 0,
    "other_exemptions": 0
  },
  "status": "draft" | "submitted"
}
```

### Example — submit a declaration with curl

```bash
TOKEN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"john@acmecorp.com","password":"…"}' | jq -r .access_token)

curl -X PUT $API/tax/declarations/me \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "regime": "old",
    "declarations": {
      "section_80c": 150000,
      "hra_rent_paid": 240000,
      "hra_city": "metro"
    },
    "status": "submitted"
  }'
```

## 10. FAQ & troubleshooting

**Q. "I changed slabs, but TDS isn't recomputing."**
Payslips are snapshotted at generation time. Regenerate the payslip after a
slab change for it to reflect.

**Q. "An employee is showing ₹0 tax — is that a bug?"**
Probably not. Under the New regime FY 2025-26, anyone with taxable income
≤ ₹12,00,000 gets a full 87A rebate. So an employee on ₹15L gross with ₹75k
standard deduction has taxable ₹14.25L → real tax. But ₹12L gross →
taxable ₹11.25L → 87A rebate kicks in → tax = ₹0.

**Q. "How do I support multiple FYs in parallel?"**
The `tax_settings` collection is keyed on `(tenant_id, financial_year)`. Just
change the FY input on the Settings tab and save again — both years coexist.

**Q. "Can I import declarations in bulk?"**
Not in the UI today. You can POST `PUT /declarations/me` for each employee
using the API; we can add a CSV importer if you need it.

**Q. "Where does Section 80CCD(2) — employer NPS — fit in?"**
It's allowed in BOTH regimes. Pass it to the compute endpoint as
`employer_nps_annual`. The payslip generator doesn't auto-detect this yet —
ask if you'd like it integrated.

**Q. "How do I lock declarations after a deadline?"**
Approve all *submitted* rows in bulk for the FY. Once approved, they auto-lock
and the employee gets a 400 on any further edit.
