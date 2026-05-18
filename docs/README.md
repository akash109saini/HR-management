# HRMS — Project Documentation

A **multi-tenant** Human Resources Management System for Indian companies. FastAPI
backend (Python 3) + React 18 frontend + MongoDB.

> Latest update (May 2026): added full **Tax Management** and **PF / ESI
> Management** modules for India FY 2025-26.

---

## Table of contents

1. [Architecture & stack](#architecture--stack)
2. [Module overview](#module-overview)
3. [Roles & access matrix](#roles--access-matrix)
4. [Tax Management module — how to use](TAX_MODULE.md) ⭐ new
5. [PF & ESI Management module — how to use](PF_MODULE.md) ⭐ new
6. [Payroll module — updated](#payroll-module-updated)
7. [API reference — quick index](API_REFERENCE.md)
8. [Local development](#local-development)
9. [Deployment & MongoDB authentication](../deploy/README.md)

---

## Architecture & stack

```
┌──────────────────────┐          ┌──────────────────────┐
│   React 18 + Tailwind │  HTTPS  │    FastAPI (Uvicorn) │
│   shadcn/ui  · axios  │ ──────▶ │    /api/*  endpoints │
└──────────────────────┘          └─────────┬────────────┘
                                            │
                                            ▼
                                  ┌──────────────────────┐
                                  │      MongoDB         │
                                  │ users, payslips,     │
                                  │ tax_settings,        │
                                  │ tax_declarations,    │
                                  │ pf_settings, …       │
                                  └──────────────────────┘
```

- All backend routes are prefixed with `/api/...` and routed via Kubernetes
  ingress to the container's port 8001.
- JWT auth: every request must carry `Authorization: Bearer <token>`.
- Multi-tenant: every "business" document carries a `tenant_id`; a `super_admin`
  has no `tenant_id` and can read everything.

## Module overview

| # | Module | Path | Purpose |
|---|--------|------|---------|
| 1 | **Auth & Users** | `/login`, `/admin/users` | Login, password reset, RBAC |
| 2 | **Tenants** | `/admin/tenants` | Companies served by the platform |
| 3 | **Employees** | `/employees` | Employee directory & onboarding |
| 4 | **Attendance** | `/attendance` | Punch-in/out, corrections, biometric ingestion |
| 5 | **Leave** | `/leaves` | Apply, approve, balance tracking |
| 6 | **Payroll** | `/payroll` | Payslip generation (now ₹ + full Indian deductions) |
| 7 | **Tax Management** ⭐ | `/tax-management` | Slabs, regimes, declarations, TDS reports |
| 8 | **PF & ESI** ⭐ | `/pf-management` | EPF/EPS/EDLI/ESI, statutory info, challan |
| 9 | **Salary Slabs** | `/salary-slabs` | CTC structure templates |
| 10 | **Advance Salary** | `/advance-salary` | Loans & advances |
| 11 | **Recruitment** | `/recruitment` | Job postings & ATS |
| 12 | **Performance** | `/performance` | Reviews, goals, 360° feedback |
| 13 | **Announcements** | `/announcements` | Company-wide notices |
| 14 | **Team Calendar** | `/team-calendar` | Leaves, holidays, birthdays |
| 15 | **AI Assistant** | various | Resume parsing, smart suggestions |
| 16 | **WhatsApp** | `/whatsapp-admin` | Notifications via WhatsApp Business |
| 17 | **Biometric** | `/biometric` | ZK/ESSL push-protocol ingestion |
| 18 | **Blockchain** | optional | Tamper-proof attendance log |

## Roles & access matrix

| Action | super_admin | hr_manager | employee |
|--------|:--:|:--:|:--:|
| Read all tenants | ✅ | ❌ | ❌ |
| Manage users / roles | ✅ | tenant-only | ❌ |
| Edit Tax / PF settings | ✅ | tenant-only | ❌ |
| Approve tax declarations | ✅ | tenant-only | ❌ |
| Generate payslips | ✅ | tenant-only | ❌ |
| View own payslip / declaration / PF | ✅ | ✅ | ✅ |
| Edit own PAN / Aadhaar / UAN | ✅ | ✅ | ✅ |
| Edit own PF / ESI opt-in flags | ✅ | ✅ | ❌ |

## Payroll module (updated)

Payslip generation now uses the proper tax & PF/ESI calculators instead of the
old flat-rate formulas. Every payslip now includes:

| Block | Fields |
|-------|--------|
| **Earnings** | `basic_salary`, `hra`, `allowances`, `special_allowance`, `gross_salary` |
| **Employee deductions** | `pf_deduction`, `esi_employee`, `tax` (TDS), `absence_deduction` |
| **Employer cost (informational)** | `employer_epf`, `employer_eps`, `edli`, `admin_charges`, `esi_employer` |
| **Tax meta** | `tax_regime`, `annual_tax`, `taxable_income`, `financial_year` |
| **Misc** | `pf_wage`, `eps_wage`, `currency` = "INR", `currency_symbol` = "₹" |

All amounts in the UI and the PDF are now in **₹ (INR)** with Indian number
formatting (e.g. ₹1,23,456.00).

### How to generate payslips (HR)
1. Log in as `hr@acmecorp.com` (or any HR/super-admin).
2. Sidebar → **Payroll**.
3. Pick month + year → click **Generate for All** (bulk) or select one employee.
4. Click **PDF** on any row to download a full Form 16-style payslip.

The calculator pulls:
- **Tax regime** + declarations from `tax_declarations` (per employee, per FY).
  Fallback = tenant's `default_regime` (defaults to **New**).
- **PF / ESI settings** from `pf_settings`. Fallback = statutory defaults
  (12% / 8.33% / ₹15,000 ceiling / ESI 0.75 + 3.25 / ₹21,000 limit).
- **Statutory flags** from the user record (`pf_opt_in`, `esi_opt_in`).

## Local development

```bash
# Backend
cd /app/backend
pip install -r requirements.txt  # if present
sudo supervisorctl restart backend
tail -f /var/log/supervisor/backend.*.log

# Frontend
cd /app/frontend
yarn install
sudo supervisorctl restart frontend
tail -f /var/log/supervisor/frontend.*.log
```

URLs:
- Backend (internal): `http://localhost:8001/api/...`
- Backend (public):  `https://under-run.preview.emergentagent.com/api/...`
- Frontend: same host, no `/api` prefix

See [`/app/memory/test_credentials.md`](../memory/test_credentials.md) for
seeded demo accounts.

## Deployment & MongoDB authentication

A production-ready, authenticated MongoDB setup is available in
[`/app/deploy/`](../deploy/README.md) — Docker Compose & bare-metal paths,
strong-password user provisioning, backup & rotation scripts.
