# HRMS - Multi-Tenant SaaS HR Management System

## Original Problem Statement
Multi-tenant SaaS HR Management System with RBAC (Super Admin, HR Manager, Employee). Core modules: Recruitment, Attendance with Punch Corrections, Payroll with PDF payslips, Performance Management with AI summaries. Backend converted from FastAPI/Python to Laravel/PHP.

## Architecture
- **Backend**: Laravel 12 (PHP 8.2) + MongoDB (native driver) + JWT auth (firebase/php-jwt) + bcrypt
- **Frontend**: React + Tailwind CSS + Shadcn UI + Recharts
- **AI**: OpenAI GPT-5.2 via Emergent Integration Proxy (performance review summaries)
- **PDF**: barryvdh/laravel-dompdf for payslip generation
- **Auth**: JWT tokens in httpOnly cookies, first-time password change flow

## User Personas
1. Super Admin - Global system management, tenant CRUD
2. HR Manager - Tenant-level: employees, attendance, leaves, payroll, recruitment, performance, announcements
3. Employee - Self-service: clock in/out, leave applications, punch corrections, payslip downloads

## What's Been Implemented (April 1, 2026)
- Backend converted from FastAPI/Python to Laravel/PHP (100% API compatibility)
- Full JWT auth with first-time password change flow
- All 3 role dashboards with stats/charts
- Employee management, attendance, leaves, payroll (PDF), recruitment, performance reviews (AI), announcements
- Dark/Light mode, mobile-responsive design
- HR password set to 1Akash@@ per user request
- Demo seed data preserved from original implementation

## Prioritized Backlog
### P0 - Employee profile editing, department management
### P1 - Stripe billing, onboarding checklists, attendance reports
### P2 - AI recruitment insights, calendar view, PWA
