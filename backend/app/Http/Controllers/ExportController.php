<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Attendance;
use App\Models\Payslip;
use App\Models\User;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportController extends Controller
{
    public function exportAttendance(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        
        $query = Attendance::query();
        if ($month = $request->query('month')) {
            $query->where('date', 'like', "{$month}%");
        }

        $records = $query->orderBy('date', 'desc')->get();

        $response = new StreamedResponse(function () use ($records) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Employee ID', 'Date', 'Clock In', 'Clock Out', 'Total Hours', 'Status']);
            foreach ($records as $r) {
                fputcsv($handle, [
                    $r->user_id, $r->date, $r->clock_in, $r->clock_out, $r->total_hours, $r->status
                ]);
            }
            fclose($handle);
        });

        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="attendance_export.csv"');
        return $response;
    }

    public function exportPayroll(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $query = Payslip::query();
        if ($month = $request->query('month')) {
            $query->where('month', (int)$month);
        }
        if ($year = $request->query('year')) {
            $query->where('year', (int)$year);
        }

        $payslips = $query->orderBy('created_at', 'desc')->get();

        $response = new StreamedResponse(function () use ($payslips) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Employee ID', 'Employee Name', 'Month', 'Year', 'Department', 'Position', 'Gross Salary', 'Total Deductions', 'Net Salary']);
            foreach ($payslips as $p) {
                fputcsv($handle, [
                    $p->employee_id, $p->employee_name, $p->month, $p->year,
                    $p->department, $p->position, $p->gross_salary,
                    $p->total_deductions, $p->net_salary
                ]);
            }
            fclose($handle);
        });

        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="payroll_export.csv"');
        return $response;
    }

    public function exportEmployees(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $employees = User::whereIn('role', ['employee', 'hr_manager'])->get();

        $response = new StreamedResponse(function () use ($employees) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Employee ID', 'Name', 'Email', 'Mobile', 'Department', 'Position', 'Role', 'Status']);
            foreach ($employees as $e) {
                fputcsv($handle, [
                    $e->employee_id, $e->name, $e->email, $e->mobile,
                    $e->department, $e->designation, $e->role, $e->status
                ]);
            }
            fclose($handle);
        });

        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="employees_export.csv"');
        return $response;
    }
}
