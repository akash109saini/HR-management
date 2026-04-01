<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\TenantController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\LeaveController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\RecruitmentController;
use App\Http\Controllers\PerformanceController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ExportController;

// Health check
Route::get('/', fn() => response()->json(['message' => 'HRMS API v1.0 (Laravel)']));

// Auth (no middleware)
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/refresh', [AuthController::class, 'refresh']);
});

// Protected routes
Route::middleware('jwt.auth')->group(function () {
    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index']);

    // Tenants
    Route::get('/tenants', [TenantController::class, 'index']);
    Route::post('/tenants', [TenantController::class, 'store']);
    Route::get('/tenants/{tenantId}', [TenantController::class, 'show']);
    Route::put('/tenants/{tenantId}', [TenantController::class, 'update']);
    Route::delete('/tenants/{tenantId}', [TenantController::class, 'destroy']);

    // Employees
    Route::get('/employees', [EmployeeController::class, 'index']);
    Route::post('/employees', [EmployeeController::class, 'store']);
    Route::get('/employees/{employeeId}', [EmployeeController::class, 'show']);
    Route::put('/employees/{employeeId}', [EmployeeController::class, 'update']);

    // Attendance
    Route::post('/attendance/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('/attendance/clock-out', [AttendanceController::class, 'clockOut']);
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::get('/attendance/today', [AttendanceController::class, 'today']);
    Route::post('/attendance/punch-correction', [AttendanceController::class, 'submitCorrection']);
    Route::get('/attendance/punch-corrections', [AttendanceController::class, 'listCorrections']);
    Route::put('/attendance/punch-corrections/{correctionId}', [AttendanceController::class, 'reviewCorrection']);

    // Leaves
    Route::post('/leaves', [LeaveController::class, 'store']);
    Route::get('/leaves', [LeaveController::class, 'index']);
    Route::get('/leaves/balance', [LeaveController::class, 'balance']);
    Route::put('/leaves/{leaveId}', [LeaveController::class, 'update']);

    // Payroll
    Route::post('/payroll/generate', [PayrollController::class, 'generate']);
    Route::post('/payroll/generate-bulk', [PayrollController::class, 'generateBulk']);
    Route::get('/payroll', [PayrollController::class, 'index']);
    Route::get('/payroll/{payslipId}/pdf', [PayrollController::class, 'downloadPdf']);

    // Recruitment
    Route::get('/recruitment/jobs', [RecruitmentController::class, 'listJobs']);
    Route::post('/recruitment/jobs', [RecruitmentController::class, 'createJob']);
    Route::put('/recruitment/jobs/{jobId}', [RecruitmentController::class, 'updateJob']);
    Route::get('/recruitment/applicants', [RecruitmentController::class, 'listApplicants']);
    Route::post('/recruitment/applicants', [RecruitmentController::class, 'createApplicant']);
    Route::put('/recruitment/applicants/{applicantId}', [RecruitmentController::class, 'updateApplicant']);

    // Performance
    Route::get('/performance', [PerformanceController::class, 'index']);
    Route::post('/performance', [PerformanceController::class, 'store']);
    Route::put('/performance/{reviewId}', [PerformanceController::class, 'update']);
    Route::post('/performance/{reviewId}/ai-summary', [PerformanceController::class, 'generateAiSummary']);

    // Announcements
    Route::get('/announcements', [AnnouncementController::class, 'index']);
    Route::post('/announcements', [AnnouncementController::class, 'store']);
    Route::put('/announcements/{announcementId}', [AnnouncementController::class, 'update']);
    Route::delete('/announcements/{announcementId}', [AnnouncementController::class, 'destroy']);

    // Departments
    Route::get('/departments', [DepartmentController::class, 'index']);
    Route::post('/departments', [DepartmentController::class, 'store']);
    Route::put('/departments/{deptId}', [DepartmentController::class, 'update']);
    Route::delete('/departments/{deptId}', [DepartmentController::class, 'destroy']);

    // Profile
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);

    // Exports (CSV)
    Route::get('/export/attendance', [ExportController::class, 'exportAttendance']);
    Route::get('/export/payroll', [ExportController::class, 'exportPayroll']);
    Route::get('/export/employees', [ExportController::class, 'exportEmployees']);
});
