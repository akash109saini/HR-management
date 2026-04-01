# HRMS - Multi-Tenant SaaS HR Management System

## Original Problem Statement
Multi-tenant SaaS HR Management System with RBAC. Backend converted from FastAPI/Python to Laravel/PHP.

## Architecture
- **Backend**: Laravel 12 (PHP 8.2) + MongoDB (native driver) + JWT (firebase/php-jwt) + bcrypt
- **Frontend**: React + Tailwind CSS + Shadcn UI + Recharts
- **AI**: OpenAI GPT-5.2 via Emergent Integration Proxy
- **PDF**: barryvdh/laravel-dompdf | **CSV**: StreamedResponse exports

## What's Been Implemented (April 1, 2026)
### Phase 1 - Core MVP
- Full JWT auth with first-time password change flow
- 3 role dashboards (Super Admin, HR Manager, Employee) with stats/charts
- Tenant CRUD, Employee Management, Attendance (clock in/out + punch corrections)
- Leave management with approval workflow, Payroll with PDF payslips
- Recruitment pipeline (jobs + applicants), Performance reviews with AI summaries
- Announcements, Dark/Light mode, mobile-responsive design

### Phase 2 - Enhancements
- Backend converted from FastAPI/Python to Laravel 12/PHP
- HR password set to 1Akash@@ per user request
- **Department Management** - full CRUD with employee count tracking
- **Profile Editing** - all users can view/edit their profile
- **CSV Exports** - employees, attendance, and payroll data export
- Sidebar navigation with unique test IDs for mobile/desktop

## Credentials
- Super Admin: admin@hrms.com / admin123
- HR Manager: hr@acmecorp.com / 1Akash@@
- Employees: mobile numbers as initial passwords (first_login=true)

## Prioritized Backlog
### P0 - Stripe billing, email notifications
### P1 - Onboarding checklists, advanced reports
### P2 - AI recruitment, calendar view, PWA
