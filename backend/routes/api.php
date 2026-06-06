<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\TenantController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\LeaveController;
use App\Http\Controllers\LeaveTypeController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\RecruitmentController;
use App\Http\Controllers\PerformanceController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\ShiftController;
use App\Http\Controllers\DesignationController;
use App\Http\Controllers\SalarySlabController;
use App\Http\Controllers\HolidayController;
use App\Http\Controllers\TerminationController;
use App\Http\Controllers\ResignationController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\FileUploadController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\RoleUserController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\SalaryAdvanceController;
use App\Http\Controllers\ADMSController;
use App\Http\Controllers\BiometricDeviceController;
use App\Http\Controllers\AiController;
use App\Http\Controllers\RealtimeBiometricController;

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

// ADMS Biometric Device Endpoints (NO auth — device cannot send JWT tokens)
// The ESSL Aiface Mars pushes attendance data to these endpoints via HTTP
Route::prefix('iclock')->group(function () {
    Route::match(['get', 'post'], '/cdata', [ADMSController::class, 'handleCdata']);
    Route::get('/getrequest', [ADMSController::class, 'getRequest']);
    Route::post('/devicecmd', [ADMSController::class, 'commandResult']);
});

// FkWeb Protocol Endpoints (NO auth — Realtime brand biometric devices use this protocol)
// Realtime devices POST attendance binary+JSON data to /hdata.aspx
Route::match(['get', 'post'], '/hdata.aspx', [ADMSController::class, 'handleFkWeb']);

// Realtime Biometric Webhook (NO JWT auth — webhook passes custom token)
Route::post('/realtime-biometric/push', [RealtimeBiometricController::class, 'handleRealtimePush']);

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
    Route::get('/employees/suggest-id', [EmployeeController::class, 'suggestId']);
    Route::get('/employees/{employeeId}', [EmployeeController::class, 'show']);
    Route::put('/employees/{employeeId}', [EmployeeController::class, 'update']);

    // Attendance
    Route::post('/attendance/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('/attendance/clock-out', [AttendanceController::class, 'clockOut']);
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::get('/attendance/punches', [AttendanceController::class, 'punches']);
    Route::get('/attendance/calendar', [AttendanceController::class, 'getCalendar']);

    Route::get('/attendance/correction-details', [AttendanceController::class, 'getCorrectionDetails']);
    Route::get('/attendance/today', [AttendanceController::class, 'today']);
    Route::post('/attendance/punch-correction', [AttendanceController::class, 'submitCorrection']);
    Route::get('/attendance/punch-corrections', [AttendanceController::class, 'listCorrections']);
    Route::put('/attendance/punch-corrections/{correctionId}', [AttendanceController::class, 'reviewCorrection']);

    // Leaves
    Route::post('/leaves', [LeaveController::class, 'store']);
    Route::get('/leaves', [LeaveController::class, 'index']);
    Route::get('/leaves/balance', [LeaveController::class, 'balance']);
    Route::put('/leaves/{leaveId}', [LeaveController::class, 'update']);
    Route::post('/leaves/{leaveId}/rollover', [LeaveController::class, 'rollover']);
    Route::get('/leave-types', [LeaveTypeController::class, 'index']);
    Route::post('/leave-types', [LeaveTypeController::class, 'store']);
    Route::put('/leave-types/{id}', [LeaveTypeController::class, 'update']);
    Route::delete('/leave-types/{id}', [LeaveTypeController::class, 'destroy']);

    // Payroll
    Route::post('/payroll/generate', [PayrollController::class, 'generate']);
    Route::post('/payroll/generate-bulk', [PayrollController::class, 'generateBulk']);
    Route::get('/payroll', [PayrollController::class, 'index']);
    Route::get('/payroll/{payslipId}/pdf', [PayrollController::class, 'downloadPdf']);

    // Salary Advances
    Route::get('/salary-advances', [SalaryAdvanceController::class, 'index']);
    Route::post('/salary-advances', [SalaryAdvanceController::class, 'store']);
    Route::delete('/salary-advances/{id}', [SalaryAdvanceController::class, 'destroy']);

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

    // Shifts
    Route::get('/shifts', [ShiftController::class, 'index']);
    Route::post('/shifts', [ShiftController::class, 'store']);
    Route::put('/shifts/{id}', [ShiftController::class, 'update']);
    Route::delete('/shifts/{id}', [ShiftController::class, 'destroy']);

    // Designations
    Route::get('/designations', [DesignationController::class, 'index']);
    Route::post('/designations', [DesignationController::class, 'store']);
    Route::put('/designations/{id}', [DesignationController::class, 'update']);
    Route::delete('/designations/{id}', [DesignationController::class, 'destroy']);

    // Salary Slabs
    Route::get('/salary-slabs', [SalarySlabController::class, 'index']);
    Route::post('/salary-slabs', [SalarySlabController::class, 'store']);
    Route::put('/salary-slabs/{id}', [SalarySlabController::class, 'update']);
    Route::delete('/salary-slabs/{id}', [SalarySlabController::class, 'destroy']);

    // Holidays
    Route::get('/holidays', [HolidayController::class, 'index']);
    Route::post('/holidays', [HolidayController::class, 'store']);
    Route::put('/holidays/{id}', [HolidayController::class, 'update']);
    Route::delete('/holidays/{id}', [HolidayController::class, 'destroy']);

    // Terminations
    Route::get('/terminations', [TerminationController::class, 'index']);
    Route::post('/terminations', [TerminationController::class, 'store']);
    Route::put('/terminations/{id}', [TerminationController::class, 'update']);
    Route::delete('/terminations/{id}', [TerminationController::class, 'destroy']);

    // Resignations
    Route::get('/resignations', [ResignationController::class, 'index']);
    Route::post('/resignations', [ResignationController::class, 'store']);
    Route::put('/resignations/{id}', [ResignationController::class, 'update']);
    Route::delete('/resignations/{id}', [ResignationController::class, 'destroy']);

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    // File Upload
    Route::post('/upload', [FileUploadController::class, 'upload']);
    Route::get('/files/{fileId}', [FileUploadController::class, 'download']);

    // Onboarding
    Route::get('/onboarding', [OnboardingController::class, 'index']);
    Route::put('/onboarding/{checklistId}/items/{itemId}', [OnboardingController::class, 'updateItem']);
    Route::get('/onboarding/templates', [OnboardingController::class, 'listTemplates']);
    Route::post('/onboarding/templates', [OnboardingController::class, 'createTemplate']);
    Route::delete('/onboarding/templates/{id}', [OnboardingController::class, 'deleteTemplate']);

    // Roles & Users Management
    Route::get('/roles', [RoleUserController::class, 'listRoles']);
    Route::post('/roles', [RoleUserController::class, 'createRole']);
    Route::put('/roles/{id}', [RoleUserController::class, 'updateRole']);
    Route::delete('/roles/{id}', [RoleUserController::class, 'deleteRole']);
    Route::get('/users', [RoleUserController::class, 'listUsers']);
    Route::put('/users/{employeeId}', [RoleUserController::class, 'updateUser']);
    Route::post('/users/{employeeId}/reset-password', [RoleUserController::class, 'resetPassword']);

    // Billing (Razorpay)
    Route::get('/billing/plans', [BillingController::class, 'getPlans']);
    Route::post('/billing/create-order', [BillingController::class, 'createOrder']);
    Route::post('/billing/verify-payment', [BillingController::class, 'verifyPayment']);
    Route::get('/billing/history', [BillingController::class, 'billingHistory']);

    // Biometric Device Management
    Route::prefix('biometric')->group(function () {
        Route::get('/devices', [BiometricDeviceController::class, 'index']);
        Route::post('/devices', [BiometricDeviceController::class, 'store']);
        Route::put('/devices/{id}', [BiometricDeviceController::class, 'update']);
        Route::delete('/devices/{id}', [BiometricDeviceController::class, 'destroy']);
        Route::get('/raw-logs', [BiometricDeviceController::class, 'rawLogs']);
        Route::post('/sync', [BiometricDeviceController::class, 'syncLogs']);
        Route::post('/simulate-punch', [BiometricDeviceController::class, 'simulatePunch']);
        Route::post('/simulate', [BiometricDeviceController::class, 'simulatePunch']);
        Route::get('/employees-with-pin', [BiometricDeviceController::class, 'employeesWithPin']);
        Route::get('/punches', [BiometricDeviceController::class, 'punches']);
        Route::get('/status', [BiometricDeviceController::class, 'status']);
        Route::get('/setup-guide', [BiometricDeviceController::class, 'setupGuide']);
    });

    // AI Assistant Endpoints
    Route::prefix('ai')->group(function () {
        Route::post('/chat', [AiController::class, 'chat']);
        Route::post('/sentiment', [AiController::class, 'sentiment']);
        Route::get('/attrition-risk/{employeeId}', [AiController::class, 'attritionRisk']);
        Route::get('/career-path/{employeeId}', [AiController::class, 'careerPath']);
    });
});
