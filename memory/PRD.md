# HRMS - Multi-Tenant SaaS HR Management System

## Architecture
- Backend: Laravel 12 (PHP 8.2) + MongoDB + JWT + bcrypt
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts
- Email: Resend API (fallback to in-app notifications)
- Payments: Razorpay (demo mode, needs real keys for production)
- Storage: Emergent Object Storage (base64 fallback)
- AI: OpenAI GPT-5.2 via Emergent Integration Proxy

## All Implemented Features
### Auth & Core: JWT auth, first-login password change, 3-role RBAC, dark/light mode
### Super Admin: Dashboard, Tenant CRUD
### HR Manager (20+ modules):
Dashboard, Employees (with image upload, dept/desig/shift selects, bank details, joining date),
Departments, Designations, Shifts, Salary Slabs, Attendance, Leave Mgmt, Holidays,
Payroll (PDF payslips + CSV export), Recruitment, Performance (AI summaries),
Onboarding Checklists, Terminations, Resignations, Roles & Users Management,
Announcements, Billing (Razorpay plans), Profile, Notification Bell
### Employee: Dashboard (clock in/out), Attendance, Leaves, Payslips, Announcements, Profile
### Integrations: Email notifications (Resend), Razorpay billing, Object storage, CSV exports

## Credentials
- Super Admin: admin@hrms.com / admin123
- HR Manager: hr@acmecorp.com / 1Akash@@
- Employees: mobile numbers as passwords (first_login=true)

## Production Setup Needed
- Replace RESEND_API_KEY with real key from resend.com
- Replace RAZORPAY_KEY_ID/SECRET with real keys from razorpay.com
- Add Razorpay checkout.js script to frontend index.html for live payments
