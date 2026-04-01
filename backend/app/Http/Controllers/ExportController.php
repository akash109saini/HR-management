<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportController extends Controller
{
    public function exportAttendance(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        if ($month = $request->query('month')) $filter['date'] = ['$regex' => "^{$month}"];

        $records = MongoService::find('attendance', $filter, ['projection' => ['_id' => 0], 'sort' => ['date' => -1]]);

        $response = new StreamedResponse(function () use ($records) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Employee ID', 'Employee Name', 'Date', 'Clock In', 'Clock Out', 'Total Hours', 'Status']);
            foreach ($records as $r) {
                fputcsv($handle, [
                    $r['user_id'] ?? '', $r['user_name'] ?? '', $r['date'] ?? '',
                    $r['clock_in'] ?? '', $r['clock_out'] ?? '', $r['total_hours'] ?? 0,
                    $r['status'] ?? '',
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
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        if ($month = $request->query('month')) $filter['month'] = (int)$month;
        if ($year = $request->query('year')) $filter['year'] = (int)$year;

        $payslips = MongoService::find('payslips', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]);

        $response = new StreamedResponse(function () use ($payslips) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Employee ID', 'Employee Name', 'Month', 'Year', 'Department', 'Position', 'Gross Salary', 'Basic', 'HRA', 'Allowances', 'PF Deduction', 'Tax', 'Absence Deduction', 'Total Deductions', 'Net Salary', 'Days Worked', 'Days Absent']);
            foreach ($payslips as $p) {
                fputcsv($handle, [
                    $p['employee_id'] ?? '', $p['employee_name'] ?? '', $p['month'] ?? '', $p['year'] ?? '',
                    $p['department'] ?? '', $p['position'] ?? '', $p['gross_salary'] ?? 0,
                    $p['basic_salary'] ?? 0, $p['hra'] ?? 0, $p['allowances'] ?? 0,
                    $p['pf_deduction'] ?? 0, $p['tax'] ?? 0, $p['absence_deduction'] ?? 0,
                    $p['total_deductions'] ?? 0, $p['net_salary'] ?? 0,
                    $p['days_worked'] ?? 0, $p['days_absent'] ?? 0,
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
        $filter = ['role' => ['$in' => ['employee', 'hr_manager']]];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';

        $employees = MongoService::find('users', $filter, ['projection' => ['_id' => 0, 'password_hash' => 0]]);

        $response = new StreamedResponse(function () use ($employees) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Employee ID', 'Name', 'Email', 'Mobile', 'Department', 'Position', 'Role', 'Salary', 'Status']);
            foreach ($employees as $e) {
                fputcsv($handle, [
                    $e['employee_id'] ?? '', $e['name'] ?? '', $e['email'] ?? '', $e['mobile'] ?? '',
                    $e['department'] ?? '', $e['position'] ?? '', $e['role'] ?? '',
                    $e['salary'] ?? 0, $e['status'] ?? '',
                ]);
            }
            fclose($handle);
        });
        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="employees_export.csv"');
        return $response;
    }
}
