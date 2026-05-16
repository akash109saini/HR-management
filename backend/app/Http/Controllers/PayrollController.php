<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Attendance;
use App\Models\Payslip;
use App\Models\SalaryAdvance;
use Illuminate\Support\Str;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;

class PayrollController extends Controller
{
    public function generate(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        $request->validate(['employee_id' => 'required', 'month' => 'required|integer', 'year' => 'required|integer']);

        $employee = User::where('employee_id', $request->employee_id)->first();
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        $monthStr = sprintf('%d-%02d', $request->year, $request->month);
        
        $daysWorked = Attendance::where('user_id', $employee->id)
            ->where('date', 'like', "{$monthStr}%")
            ->whereNotNull('clock_in')
            ->count();

        $daysAbsent = max(0, 22 - $daysWorked);
        $salary = (float)($employee->salary ?? 0);
        
        $basic = round($salary * 0.5, 2);
        $hra = round($salary * 0.2, 2);
        $allowances = round($salary * 0.15, 2);
        $pfDeduction = round($basic * 0.12, 2);
        $tax = round($salary * 0.1, 2);
        $absenceDeduction = $salary > 0 ? round(($salary / 22) * $daysAbsent, 2) : 0;
        
        // Fetch pending advances
        $pendingAdvances = SalaryAdvance::where('user_id', $employee->id)->where('status', 'pending')->get();
        $advanceDeduction = $pendingAdvances->sum('amount');

        $totalDeductions = round($pfDeduction + $tax + $absenceDeduction + $advanceDeduction, 2);
        $netSalary = round($salary - $totalDeductions, 2);

        // Remove old payslip for same period
        Payslip::where('user_id', $employee->id)
            ->where('month', (int)$request->month)
            ->where('year', (int)$request->year)
            ->delete();

        $payslip = Payslip::create([
            'user_id' => $employee->id,
            'employee_id' => $request->employee_id,
            'employee_name' => $employee->name ?? '',
            'month' => (int)$request->month,
            'year' => (int)$request->year,
            'basic_salary' => $basic,
            'hra' => $hra,
            'allowances' => $allowances,
            'pf_deduction' => $pfDeduction,
            'tax' => $tax,
            'absence_deduction' => $absenceDeduction,
            'advance_deduction' => $advanceDeduction,
            'total_deductions' => $totalDeductions,
            'gross_salary' => $salary,
            'net_salary' => $netSalary,
            'days_worked' => $daysWorked,
            'days_absent' => $daysAbsent,
            'department' => $employee->department ?? '',
            'position' => $employee->designation ?? '',
            'status' => 'published',
        ]);

        // Mark advances as paid
        foreach ($pendingAdvances as $adv) {
            $adv->update(['status' => 'paid', 'payslip_id' => $payslip->id]);
        }

        return response()->json($payslip);
    }

    public function generateBulk(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        $request->validate(['month' => 'required|integer', 'year' => 'required|integer']);

        $employees = User::whereIn('role', ['employee', 'hr_manager'])
            ->where('status', 'active')
            ->get();
            
        $monthStr = sprintf('%d-%02d', $request->year, $request->month);
        $results = [];

        foreach ($employees as $emp) {
            $daysWorked = Attendance::where('user_id', $emp->employee_id)
                ->where('date', 'like', "{$monthStr}%")
                ->whereNotNull('clock_in')
                ->count();

            $salary = (float)($emp->salary ?? 0);
            $basic = round($salary * 0.5, 2);
            $pfDeduction = round($basic * 0.12, 2);
            $tax = round($salary * 0.1, 2);
            $daysAbsent = max(0, 22 - $daysWorked);
            $absenceDeduction = $salary > 0 ? round(($salary / 22) * $daysAbsent, 2) : 0;
            
            // Fetch pending advances
            $pendingAdvances = SalaryAdvance::where('user_id', $emp->id)->where('status', 'pending')->get();
            $advanceDeduction = $pendingAdvances->sum('amount');

            $totalDeductions = round($pfDeduction + $tax + $absenceDeduction + $advanceDeduction, 2);
            $netSalary = round($salary - $totalDeductions, 2);

            Payslip::where('user_id', $emp->id)
                ->where('month', (int)$request->month)
                ->where('year', (int)$request->year)
                ->delete();

            $payslip = Payslip::create([
                'user_id' => $emp->id,
                'employee_id' => $emp->employee_id,
                'employee_name' => $emp->name ?? '',
                'month' => (int)$request->month,
                'year' => (int)$request->year,
                'basic_salary' => $basic,
                'hra' => round($salary * 0.2, 2),
                'allowances' => round($salary * 0.15, 2),
                'pf_deduction' => $pfDeduction,
                'tax' => $tax,
                'absence_deduction' => $absenceDeduction,
                'advance_deduction' => $advanceDeduction,
                'total_deductions' => $totalDeductions,
                'gross_salary' => $salary,
                'net_salary' => $netSalary,
                'days_worked' => $daysWorked,
                'days_absent' => $daysAbsent,
                'department' => $emp->department ?? '',
                'position' => $emp->designation ?? '',
                'status' => 'published',
            ]);

            // Mark advances as paid
            foreach ($pendingAdvances as $adv) {
                $adv->update(['status' => 'paid', 'payslip_id' => $payslip->id]);
            }
            
            $results[] = $payslip;
        }
        return response()->json(['generated' => count($results), 'payslips' => $results]);
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = Payslip::query();

        if ($user['role'] === 'employee') {
            $query->where('user_id', $user['id']);
        }

        if ($month = $request->query('month')) {
            $query->where('month', (int)$month);
        }
        if ($year = $request->query('year')) {
            $query->where('year', (int)$year);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function downloadPdf(Request $request, string $payslipId)
    {
        $user = $request->auth_user;
        $payslip = Payslip::find($payslipId);
        
        if (!$payslip) {
            return response()->json(['detail' => 'Payslip not found'], 404);
        }
        if ($user['role'] === 'employee' && ($payslip->user_id ?? '') !== $user['id']) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        $pdf = Pdf::loadView('payslip', [
            'payslip' => $payslip->toArray(), 
            'monthName' => $months[$payslip->month] ?? ''
        ])->setPaper('a4');

        return $pdf->download("payslip_{$payslip->employee_id}_{$payslip->month}_{$payslip->year}.pdf");
    }
}
