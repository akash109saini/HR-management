<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;
use Barryvdh\DomPDF\Facade\Pdf;

class PayrollController extends Controller
{
    public function generate(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['employee_id' => 'required', 'month' => 'required|integer', 'year' => 'required|integer']);

        $employee = MongoService::findOneNoId('users', ['employee_id' => $request->employee_id]);
        if (!$employee) return response()->json(['detail' => 'Employee not found'], 404);
        unset($employee['password_hash']);

        $monthStr = sprintf('%d-%02d', $request->year, $request->month);
        $daysWorked = MongoService::count('attendance', ['user_id' => $request->employee_id, 'date' => ['$regex' => "^{$monthStr}"], 'tenant_id' => $employee['tenant_id'] ?? '', 'clock_in' => ['$ne' => null]]);
        $daysAbsent = max(0, 22 - $daysWorked);
        $salary = (float)($employee['salary'] ?? 0);
        $basic = round($salary * 0.5, 2);
        $hra = round($salary * 0.2, 2);
        $allowances = round($salary * 0.15, 2);
        $pfDeduction = round($basic * 0.12, 2);
        $tax = round($salary * 0.1, 2);
        $absenceDeduction = $salary > 0 ? round(($salary / 22) * $daysAbsent, 2) : 0;
        $totalDeductions = round($pfDeduction + $tax + $absenceDeduction, 2);
        $netSalary = round($salary - $totalDeductions, 2);

        MongoService::deleteOne('payslips', ['employee_id' => $request->employee_id, 'month' => (int)$request->month, 'year' => (int)$request->year]);

        $payslip = [
            'id' => (string)Str::uuid(), 'employee_id' => $request->employee_id,
            'employee_name' => $employee['name'] ?? '', 'tenant_id' => $employee['tenant_id'] ?? '',
            'month' => (int)$request->month, 'year' => (int)$request->year,
            'basic_salary' => $basic, 'hra' => $hra, 'allowances' => $allowances,
            'pf_deduction' => $pfDeduction, 'tax' => $tax, 'absence_deduction' => $absenceDeduction,
            'total_deductions' => $totalDeductions, 'gross_salary' => $salary, 'net_salary' => $netSalary,
            'days_worked' => $daysWorked, 'days_absent' => $daysAbsent,
            'department' => $employee['department'] ?? '', 'position' => $employee['position'] ?? '',
            'status' => 'published', 'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('payslips', $payslip);
        return response()->json($payslip);
    }

    public function generateBulk(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['month' => 'required|integer', 'year' => 'required|integer']);

        $tenantId = $user['tenant_id'] ?? '';
        $employees = MongoService::find('users', ['tenant_id' => $tenantId, 'role' => ['$in' => ['employee', 'hr_manager']], 'status' => 'active'], ['projection' => ['_id' => 0, 'password_hash' => 0]]);
        $monthStr = sprintf('%d-%02d', $request->year, $request->month);
        $results = [];

        foreach ($employees as $emp) {
            $daysWorked = MongoService::count('attendance', ['user_id' => $emp['employee_id'], 'date' => ['$regex' => "^{$monthStr}"], 'tenant_id' => $tenantId, 'clock_in' => ['$ne' => null]]);
            $salary = (float)($emp['salary'] ?? 0);
            $basic = round($salary * 0.5, 2);
            $pfDeduction = round($basic * 0.12, 2);
            $tax = round($salary * 0.1, 2);
            $daysAbsent = max(0, 22 - $daysWorked);
            $absenceDeduction = $salary > 0 ? round(($salary / 22) * $daysAbsent, 2) : 0;
            $totalDeductions = round($pfDeduction + $tax + $absenceDeduction, 2);
            $netSalary = round($salary - $totalDeductions, 2);

            MongoService::deleteOne('payslips', ['employee_id' => $emp['employee_id'], 'month' => (int)$request->month, 'year' => (int)$request->year]);

            $payslip = [
                'id' => (string)Str::uuid(), 'employee_id' => $emp['employee_id'],
                'employee_name' => $emp['name'] ?? '', 'tenant_id' => $tenantId,
                'month' => (int)$request->month, 'year' => (int)$request->year,
                'basic_salary' => $basic, 'hra' => round($salary * 0.2, 2), 'allowances' => round($salary * 0.15, 2),
                'pf_deduction' => $pfDeduction, 'tax' => $tax, 'absence_deduction' => $absenceDeduction,
                'total_deductions' => $totalDeductions, 'gross_salary' => $salary, 'net_salary' => $netSalary,
                'days_worked' => $daysWorked, 'days_absent' => $daysAbsent,
                'department' => $emp['department'] ?? '', 'position' => $emp['position'] ?? '',
                'status' => 'published', 'created_at' => now()->toISOString(),
            ];
            MongoService::insertOne('payslips', $payslip);
            $results[] = $payslip;
        }
        return response()->json(['generated' => count($results), 'payslips' => $results]);
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'employee') {
            $filter['employee_id'] = $user['employee_id'] ?? '';
            $filter['tenant_id'] = $user['tenant_id'] ?? '';
        } elseif ($user['role'] === 'hr_manager') {
            $filter['tenant_id'] = $user['tenant_id'] ?? '';
        }
        if ($month = $request->query('month')) $filter['month'] = (int)$month;
        if ($year = $request->query('year')) $filter['year'] = (int)$year;
        return response()->json(MongoService::find('payslips', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function downloadPdf(Request $request, string $payslipId)
    {
        $user = $request->auth_user;
        $payslip = MongoService::findOneNoId('payslips', ['id' => $payslipId]);
        if (!$payslip) return response()->json(['detail' => 'Payslip not found'], 404);
        if ($user['role'] === 'employee' && ($payslip['employee_id'] ?? '') !== ($user['employee_id'] ?? '')) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        $months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        $pdf = Pdf::loadView('payslip', ['payslip' => $payslip, 'monthName' => $months[$payslip['month']] ?? ''])->setPaper('a4');
        return $pdf->download("payslip_{$payslip['employee_id']}_{$payslip['month']}_{$payslip['year']}.pdf");
    }
}
