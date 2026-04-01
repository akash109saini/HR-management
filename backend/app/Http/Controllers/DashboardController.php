<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $role = $user['role'];
        $today = now()->format('Y-m-d');
        $currentMonth = now()->format('Y-m');

        if ($role === 'super_admin') {
            $totalTenants = MongoService::count('tenants', ['status' => ['$ne' => 'deleted']]);
            $activeTenants = MongoService::count('tenants', ['status' => 'active']);
            $totalEmployees = MongoService::count('users', ['role' => ['$in' => ['employee', 'hr_manager']]]);
            $totalJobs = MongoService::count('job_postings', ['status' => 'open']);
            $tenants = MongoService::find('tenants', ['status' => ['$ne' => 'deleted']]);

            $planDistribution = [];
            foreach ($tenants as $t) {
                $plan = $t['subscription_plan'] ?? 'basic';
                $planDistribution[$plan] = ($planDistribution[$plan] ?? 0) + 1;
            }

            return response()->json([
                'role' => 'super_admin', 'total_tenants' => $totalTenants,
                'active_tenants' => $activeTenants, 'total_employees' => $totalEmployees,
                'total_open_jobs' => $totalJobs, 'plan_distribution' => $planDistribution,
                'recent_tenants' => array_slice($tenants, 0, 5),
            ]);
        }

        if ($role === 'hr_manager') {
            $tenantId = $user['tenant_id'] ?? '';
            $totalEmployees = MongoService::count('users', ['tenant_id' => $tenantId, 'role' => ['$in' => ['employee', 'hr_manager']]]);
            $pendingLeaves = MongoService::count('leaves', ['tenant_id' => $tenantId, 'status' => 'pending']);
            $pendingCorrections = MongoService::count('punch_corrections', ['tenant_id' => $tenantId, 'status' => 'pending']);
            $todayAttendance = MongoService::count('attendance', ['tenant_id' => $tenantId, 'date' => $today]);
            $openJobs = MongoService::count('job_postings', ['tenant_id' => $tenantId, 'status' => 'open']);
            $totalApplicants = MongoService::count('applicants', ['tenant_id' => $tenantId]);

            $recentLeaves = MongoService::find('leaves', ['tenant_id' => $tenantId, 'status' => 'pending'], ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1], 'limit' => 5]);
            $recentCorrections = MongoService::find('punch_corrections', ['tenant_id' => $tenantId, 'status' => 'pending'], ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1], 'limit' => 5]);

            $attendanceRecords = MongoService::find('attendance', ['tenant_id' => $tenantId, 'date' => ['$regex' => "^{$currentMonth}"]], ['projection' => ['_id' => 0, 'date' => 1]]);
            $byDate = [];
            foreach ($attendanceRecords as $r) { $d = $r['date']; $byDate[$d] = ($byDate[$d] ?? 0) + 1; }
            ksort($byDate);
            $attendanceTrend = array_map(fn($k, $v) => ['date' => $k, 'count' => $v], array_keys($byDate), array_values($byDate));

            return response()->json([
                'role' => 'hr_manager', 'total_employees' => $totalEmployees,
                'pending_leaves' => $pendingLeaves, 'pending_corrections' => $pendingCorrections,
                'today_attendance' => $todayAttendance, 'open_jobs' => $openJobs,
                'total_applicants' => $totalApplicants, 'recent_pending_leaves' => $recentLeaves,
                'recent_pending_corrections' => $recentCorrections, 'attendance_trend' => $attendanceTrend,
            ]);
        }

        // Employee
        $tenantId = $user['tenant_id'] ?? '';
        $empId = $user['employee_id'] ?? $user['email'];
        $todayRecord = MongoService::findOneNoId('attendance', ['user_id' => $empId, 'date' => $today, 'tenant_id' => $tenantId]);
        $userDoc = MongoService::findOneNoId('users', ['email' => $user['email']]);
        $leaveBalance = $userDoc['leave_balance'] ?? ['casual' => 12, 'sick' => 10, 'earned' => 15];
        $pendingLeaves = MongoService::count('leaves', ['user_id' => $empId, 'status' => 'pending']);
        $pendingCorrections = MongoService::count('punch_corrections', ['user_id' => $empId, 'status' => 'pending']);
        $monthAttendance = MongoService::count('attendance', ['user_id' => $empId, 'tenant_id' => $tenantId, 'date' => ['$regex' => "^{$currentMonth}"], 'clock_in' => ['$ne' => null]]);
        $recentAnnouncements = MongoService::find('announcements', ['tenant_id' => $tenantId], ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1], 'limit' => 3]);

        return response()->json([
            'role' => 'employee', 'today_attendance' => $todayRecord,
            'leave_balance' => $leaveBalance, 'pending_leaves' => $pendingLeaves,
            'pending_corrections' => $pendingCorrections, 'days_present_this_month' => $monthAttendance,
            'recent_announcements' => $recentAnnouncements,
        ]);
    }
}
