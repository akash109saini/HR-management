# API Reference (Quick Index)

Base URL: `https://under-run.preview.emergentagent.com/api`
All requests except `/auth/login` require `Authorization: Bearer <token>`.

> Full per-module deep-dive: see [TAX_MODULE.md](TAX_MODULE.md) and
> [PF_MODULE.md](PF_MODULE.md).

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | `{ email, password }` → `{ access_token, role, tenant_id, … }` |
| POST | `/auth/change-password` | First-login flow |
| POST | `/auth/forgot-password` | Reset via email |
| GET  | `/auth/me` | Current user profile |

## Employees & Tenants

| Method | Path | Notes |
|--------|------|-------|
| GET / POST | `/employees` | List / create |
| PUT / DELETE | `/employees/{id}` | Update / soft delete |
| GET / POST | `/admin/tenants` | super_admin only |

## Attendance & Leave

| Method | Path | Notes |
|--------|------|-------|
| POST | `/attendance/punch` | Clock in / out |
| GET  | `/attendance` | List records |
| POST | `/punch-corrections` | Employee corrections |
| GET / POST | `/leaves` | List / apply |
| POST | `/leaves/{id}/approve` | HR |

## Payroll

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/payroll` | List payslips (scoped) |
| POST | `/payroll/generate` | Single — `{ employee_id, month, year }` |
| POST | `/payroll/generate-bulk` | Tenant-wide |
| GET  | `/payroll/{id}/pdf` | Download PDF |

## Tax Management ⭐ new

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/tax/settings` | Effective settings (with defaults) |
| PUT  | `/tax/settings` | Admin / HR only |
| POST | `/tax/settings/reset` | Back to FY 2025-26 defaults |
| GET  | `/tax/declarations/me` | Self declaration |
| PUT  | `/tax/declarations/me` | Save draft / submit |
| GET  | `/tax/declarations` | HR list view |
| POST | `/tax/declarations/{id}/decision` | `approve` or `reject` |
| POST | `/tax/compute` | What-if calculator |
| GET  | `/tax/compare/me` | Old vs New regime side-by-side |
| GET  | `/tax/reports/tds-summary?financial_year=2025-26` | CSV |

## PF & ESI ⭐ new

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/pf/settings` | Effective settings (with defaults) |
| PUT  | `/pf/settings` | Admin / HR only |
| POST | `/pf/settings/reset` | Back to statutory defaults |
| GET  | `/pf/employees/{id}/statutory` | PAN/UAN/PF/ESI fields |
| PUT  | `/pf/employees/{id}/statutory` | Self (limited) or HR |
| GET  | `/pf/compute/{id}` | Live monthly preview |
| GET  | `/pf/reports/challan?month=YYYY-MM` | CSV |
| GET  | `/pf/statement/me` | Running PF balance |

## Recruitment, Performance, Announcements, Calendar, WhatsApp, AI, Biometric, Blockchain

See the corresponding route files under
[`/app/backend/routes/`](../backend/routes/) for the full surface. They are
all standard REST under their respective prefixes:
`/recruitment`, `/performance`, `/announcements`, `/team-calendar`,
`/whatsapp`, `/ai`, `/biometric`, `/blockchain`.
