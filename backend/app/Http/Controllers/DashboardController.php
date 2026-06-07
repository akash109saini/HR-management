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
            $selectedDate = $request->query('date', now()->format('Y-m-d'));
            $selectedMonth = substr($selectedDate, 0, 7);

            $totalEmployees = User::whereIn('role', ['employee', 'hr_manager'])->count();
            $pendingLeaves = Leave::where('status', 'pending')->count();
            $pendingCorrections = PunchCorrection::where('status', 'pending')->count();
            $openJobs = JobPosting::where('status', 'open')->count();
            $totalApplicants = Applicant::count();

            // Attendance trending for the selected month
            $attendanceTrending = Attendance::where('date', 'like', "{$selectedMonth}%")
                ->select('date', DB::raw('count(*) as count'))
                ->groupBy('date')
                ->orderBy('date', 'asc')
                ->get();

            // Retrieve all employees for presence checks
            $employees = User::whereIn('role', ['employee', 'hr_manager'])->get();

            // Total Present
            $presentUserIds = Attendance::where('date', $selectedDate)
                ->where('status', '!=', 'absent')
                ->pluck('user_id')
                ->toArray();
            $totalPresent = count($presentUserIds);

            // Total Absent
            $totalAbsent = max(0, $totalEmployees - $totalPresent);

            // Punch Corrections on/for this date
            $corrections = PunchCorrection::whereDate('corrected_time', $selectedDate)->get();
            $todayPunchCorrectionsCount = $corrections->count();

            // Misspunches on this date (clock_in exists without clock_out, or vice versa)
            $misspunchAttendances = Attendance::where('date', $selectedDate)
                ->where(function ($q) {
                    $q->where(function ($q2) {
                        $q2->whereNotNull('clock_in')->whereNull('clock_out');
                    })->orWhere(function ($q2) {
                        $q2->whereNull('clock_in')->whereNotNull('clock_out');
                    });
                })->get();
            $todayMisspunchCount = $misspunchAttendances->count();

            // Lists:
            // 1. Punch Correction List
            $punchCorrectionList = $corrections->map(function ($c) {
                $u = $c->user;
                $correctedTime = \Carbon\Carbon::parse($c->corrected_time);
                return [
                    'id' => $c->id,
                    'user_id' => $c->user_id,
                    'user_name' => $u ? $u->name : 'Unknown',
                    'employee_id' => $u ? $u->employee_id : null,
                    'type' => $c->type,
                    'corrected_time' => $c->corrected_time,
                    'date' => $correctedTime->format('Y-m-d'),
                    'requested_time' => $correctedTime->format('H:i'),
                    'reason' => $c->reason,
                    'status' => $c->status,
                    'reviewed_by' => $c->reviewed_by,
                ];
            });

            // 2. Leave Approval List (for/covering selected date)
            $leaves = Leave::where('start_date', '<=', $selectedDate)
                ->where('end_date', '>=', $selectedDate)
                ->get();
            $leaveApprovalList = $leaves->map(function ($l) {
                $u = $l->user;
                return [
                    'id' => $l->id,
                    'user_name' => $u ? $u->name : ($l->user_name ?? 'Unknown'),
                    'employee_id' => $u ? $u->employee_id : null,
                    'leave_type' => $l->leave_type,
                    'start_date' => $l->start_date,
                    'end_date' => $l->end_date,
                    'reason' => $l->reason,
                    'status' => $l->status,
                ];
            });

            // 3. Absent List
            $absentList = [];
            foreach ($employees as $emp) {
                if (!in_array($emp->id, $presentUserIds)) {
                    $onLeave = $leaves->contains('user_id', $emp->id);
                    $absentList[] = [
                        'id' => $emp->id,
                        'name' => $emp->name,
                        'employee_id' => $emp->employee_id,
                        'department' => $emp->department,
                        'designation' => $emp->designation,
                        'on_leave' => $onLeave,
                        'status' => 'Absent'
                    ];
                }
            }

            // 4. Misspunch List
            $misspunchList = $misspunchAttendances->map(function ($att) {
                $u = $att->user;
                return [
                    'attendance_id' => $att->id,
                    'user_id' => $att->user_id,
                    'user_name' => $u ? $u->name : 'Unknown',
                    'employee_id' => $u ? $u->employee_id : null,
                    'department' => $u ? $u->department : null,
                    'designation' => $u ? $u->designation : null,
                    'clock_in' => $att->clock_in,
                    'clock_out' => $att->clock_out,
                ];
            });

            // Existing summary lists (recent/pending)
            $recentLeaves = Leave::where('status', 'pending')->orderBy('created_at', 'desc')->limit(5)->get();
            $recentCorrections = PunchCorrection::where('status', 'pending')->orderBy('created_at', 'desc')->limit(5)->get();

            return response()->json([
                'role' => 'hr_manager', 
                'total_employees' => $totalEmployees,
                'pending_leaves' => $pendingLeaves, 
                'pending_corrections' => $pendingCorrections,
                'today_attendance' => $totalPresent, 
                'open_jobs' => $openJobs,
                'total_applicants' => $totalApplicants, 
                'recent_pending_leaves' => $recentLeaves,
                'recent_pending_corrections' => $recentCorrections, 
                'attendance_trend' => $attendanceTrending,

                // New fields for date filter:
                'selected_date' => $selectedDate,
                'total_present' => $totalPresent,
                'total_absent' => $totalAbsent,
                'today_punch_corrections_count' => $todayPunchCorrectionsCount,
                'today_misspunches_count' => $todayMisspunchCount,
                'punch_correction_list' => $punchCorrectionList,
                'leave_approval_list' => $leaveApprovalList,
                'absent_list' => $absentList,
                'misspunch_list' => $misspunchList
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
