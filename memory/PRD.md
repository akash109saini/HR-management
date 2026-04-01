# HRMS - Multi-Tenant SaaS HR Management System

## Original Problem Statement
Design and generate a comprehensive, multi-tenant SaaS HR Management System with robust RBAC (Super Admin, HR Manager, Employee). Core modules: Recruitment, Attendance with Punch Corrections, Payroll with PDF payslips, Performance Management with AI summaries.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor) + JWT auth + bcrypt
- **Frontend**: React + Tailwind CSS + Shadcn UI + Recharts
- **AI**: OpenAI GPT-5.2 via emergentintegrations (performance review summaries)
- **PDF**: ReportLab for payslip generation
- **Auth**: JWT tokens in httpOnly cookies, first-time password change flow

## User Personas
1. **Super Admin** - Global system management, tenant CRUD, billing oversight
2. **HR Manager** - Tenant-level operations: employees, attendance, leaves, payroll, recruitment, performance, announcements
3. **Employee** - Self-service: clock in/out, leave applications, punch corrections, payslip downloads, announcements

## Core Requirements
- Multi-tenant data isolation via tenant_id
- Role-based access control (3-tier)
- Employee registration with auto-generated ID series (EMP-{PREFIX}-{NUM})
- Mobile number as initial password, mandatory change on first login
- Real-time clock in/out with punch correction workflow
- Automated payslip generation with PDF download
- AI-powered performance review summaries (GPT-5.2)

## What's Been Implemented (April 1, 2026)
- Full JWT auth with first-time password change flow
- Super Admin: Dashboard with stats + Tenant CRUD
- HR Manager: Dashboard + Employee Management + Attendance & Punch Correction Approvals + Leave Approvals + Payroll (bulk/individual + PDF) + Recruitment (jobs + applicants) + Performance Reviews (with AI summary) + Announcements
- Employee: Dashboard (clock in/out CTA, leave balance, announcements) + My Attendance (with punch corrections) + My Leaves + My Payslips (PDF download) + Announcements
- Dark/Light mode toggle
- Mobile-responsive design
- Demo seed data (2 tenants, 5 users, sample records)

## Prioritized Backlog
### P0 (Must have - next iteration)
- Email notifications for leave/correction approvals
- Employee profile edit page
- Department management CRUD

### P1 (Should have)
- Subscription billing integration (Stripe)
- Onboarding checklist workflows
- Advanced attendance reports with export
- Employee document management

### P2 (Nice to have)
- AI-powered recruitment insights
- Custom report builder
- Calendar view for attendance/leaves
- Mobile app (PWA)

## Next Tasks
1. Add employee profile editing
2. Department management
3. Advanced filtering and search across all tables
4. Payroll history export (CSV/Excel)
5. Company policy document upload and viewing
