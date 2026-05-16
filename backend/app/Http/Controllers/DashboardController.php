<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Leave;
use App\Models\PunchCorrection;
use App\Models\Attendance;
use App\Models\JobPosting;
use App\Models\Applicant;
use App\Models\Announcement;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $role = $user['role'];
        $today = now()->format('Y-m-d');
        $currentMonth = now()->format('Y-m');

        if ($role === 'super_admin') {
            $totalTenants = Tenant::where('status', '!=', 'deleted')->count();
            $activeTenants = Tenant::where('status', 'active')->count();
            
            // For SaaS, aggregating employees across all DBs is complex. 
            // We'll show landlord-level stats.
            $tenants = Tenant::where('status', '!=', 'deleted')->limit(5)->get();

            $planDistribution = Tenant::select('subscription_plan', DB::raw('count(*) as count'))
                ->groupBy('subscription_plan')
                ->get()
                ->pluck('count', 'subscription_plan')
                ->toArray();

            return response()->json([
                'role' => 'super_admin', 
                'total_tenants' => $totalTenants,
                'active_tenants' => $activeTenants, 
                'plan_distribution' => $planDistribution,
                'recent_tenants' => $tenants,
            ]);
        }

        if ($role === 'hr_manager') {
            $totalEmployees = User::whereIn('role', ['employee', 'hr_manager'])->count();
            $pendingLeaves = Leave::where('status', 'pending')->count();
            $pendingCorrections = PunchCorrection::where('status', 'pending')->count();
            $todayAttendance = Attendance::where('date', $today)->count();
            $openJobs = JobPosting::where('status', 'open')->count();
            $totalApplicants = Applicant::count();

            $recentLeaves = Leave::where('status', 'pending')->orderBy('created_at', 'desc')->limit(5)->get();
            $recentCorrections = PunchCorrection::where('status', 'pending')->orderBy('created_at', 'desc')->limit(5)->get();

            $attendanceTrending = Attendance::where('date', 'like', "{$currentMonth}%")
                ->select('date', DB::raw('count(*) as count'))
                ->groupBy('date')
                ->orderBy('date', 'asc')
                ->get();

            return response()->json([
                'role' => 'hr_manager', 
                'total_employees' => $totalEmployees,
                'pending_leaves' => $pendingLeaves, 
                'pending_corrections' => $pendingCorrections,
                'today_attendance' => $todayAttendance, 
                'open_jobs' => $openJobs,
                'total_applicants' => $totalApplicants, 
                'recent_pending_leaves' => $recentLeaves,
                'recent_pending_corrections' => $recentCorrections, 
                'attendance_trend' => $attendanceTrending,
            ]);
        }

        // Employee Dashboard
        $empId = $user['id'];
        $todayRecord = Attendance::where('user_id', $empId)->where('date', $today)->first();
        $userDoc = User::where('email', $user['email'])->first();
        
        $pendingLeaves = Leave::where('user_id', $empId)->where('status', 'pending')->count();
        $pendingCorrections = PunchCorrection::where('user_id', $empId)->where('status', 'pending')->count();
        $monthAttendance = Attendance::where('user_id', $user['id'])
            ->where('date', 'like', "{$currentMonth}%")
            ->whereNotNull('clock_in')
            ->count();
            
        $recentAnnouncements = Announcement::orderBy('created_at', 'desc')->limit(3)->get();

        return response()->json([
            'role' => 'employee', 
            'today_attendance' => $todayRecord,
            'leave_balance' => $userDoc->leave_balance ?? ['casual' => 12, 'sick' => 10, 'earned' => 15], 
            'pending_leaves' => $pendingLeaves,
            'pending_corrections' => $pendingCorrections, 
            'days_present_this_month' => $monthAttendance,
            'recent_announcements' => $recentAnnouncements,
        ]);
    }
}
