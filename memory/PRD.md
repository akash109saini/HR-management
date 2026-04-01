# HRMS - Multi-Tenant SaaS HR Management System

## Architecture
- **Backend**: Laravel 12 (PHP 8.2) + MongoDB + JWT + bcrypt
- **Frontend**: React + Tailwind CSS + Shadcn UI + Recharts

## Implemented Features (April 2026)
### Core (Phase 1)
- JWT auth with first-time password change, 3-role RBAC
- Super Admin: Dashboard + Tenant CRUD
- HR Dashboard, Employee Management, Attendance (clock in/out + punch corrections)
- Leave management with approvals, Payroll with PDF payslips
- Recruitment pipeline, Performance reviews with AI (GPT-5.2), Announcements
- Dark/Light mode, mobile-responsive, CSV exports

### New Modules (Phase 2)
- **Shift Management** - Morning/Evening/Night shifts with CRUD
- **Designation Management** - Levels, descriptions, employee counts
- **Salary Slab Management** - Grades with Basic/HRA/PF percentages
- **Holidays Management** - Calendar with public/optional/restricted types
- **Termination Management** - Types (layoff/misconduct/performance/retirement), status workflow
- **Resignation Management** - Notice period, approval workflow with notifications
- **Department Management** - CRUD with employee counts
- **Profile Editing** - Self-service for all roles
- **Notification Bell** - Real-time alerts for HR approvals, terminations, resignations
- **Updated Employee Form** - Department/Designation/Shift dropdowns, joining date, bank details, auto-gen ID

## Credentials
- Super Admin: admin@hrms.com / admin123
- HR Manager: hr@acmecorp.com / 1Akash@@

## Backlog
- P0: Stripe billing, email notifications, onboarding checklists, profile image upload
- P1: Advanced reports, calendar integration
- P2: AI recruitment, PWA
