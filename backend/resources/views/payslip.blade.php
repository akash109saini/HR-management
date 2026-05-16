<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
        h1 { color: #002FA7; text-align: center; }
        h2 { color: #475569; text-align: center; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 8px 12px; border: 1px solid #ccc; text-align: left; }
        th { background-color: #002FA7; color: white; }
        .total-row { background-color: #EFF6FF; font-weight: bold; }
        .info-label { background-color: #002FA7; color: white; font-weight: bold; }
        .summary { margin-top: 20px; font-size: 11px; color: #666; }
    </style>
</head>
<body>
    <h1>PAYSLIP</h1>
    <h2>{{ $monthName }} {{ $payslip['year'] }}</h2>

    <table>
        <tr><td class="info-label">Employee ID</td><td>{{ $payslip['employee_id'] ?? '' }}</td></tr>
        <tr><td class="info-label">Employee Name</td><td>{{ $payslip['employee_name'] ?? '' }}</td></tr>
        <tr><td class="info-label">Department</td><td>{{ $payslip['department'] ?? '' }}</td></tr>
        <tr><td class="info-label">Position</td><td>{{ $payslip['position'] ?? '' }}</td></tr>
    </table>

    <table>
        <tr><th>Component</th><th>Amount</th></tr>
        <tr><td>Basic Salary</td><td>${{ number_format($payslip['basic_salary'], 2) }}</td></tr>
        <tr><td>HRA</td><td>${{ number_format($payslip['hra'], 2) }}</td></tr>
        <tr><td>Allowances</td><td>${{ number_format($payslip['allowances'], 2) }}</td></tr>
        <tr><td><strong>Gross Salary</strong></td><td><strong>${{ number_format($payslip['gross_salary'], 2) }}</strong></td></tr>
        <tr><td colspan="2"></td></tr>
        <tr><td>PF Deduction</td><td>-${{ number_format($payslip['pf_deduction'], 2) }}</td></tr>
        <tr><td>Tax</td><td>-${{ number_format($payslip['tax'], 2) }}</td></tr>
        <tr><td>Absence Deduction</td><td>-${{ number_format($payslip['absence_deduction'], 2) }}</td></tr>
        @if(isset($payslip['advance_deduction']) && $payslip['advance_deduction'] > 0)
        <tr><td>Advance Deduction</td><td>-${{ number_format($payslip['advance_deduction'], 2) }}</td></tr>
        @endif
        <tr><td><strong>Total Deductions</strong></td><td><strong>-${{ number_format($payslip['total_deductions'], 2) }}</strong></td></tr>
        <tr><td colspan="2"></td></tr>
        <tr class="total-row"><td><strong>Net Salary</strong></td><td><strong>${{ number_format($payslip['net_salary'], 2) }}</strong></td></tr>
    </table>

    <p class="summary">Days Worked: {{ $payslip['days_worked'] }} | Days Absent: {{ $payslip['days_absent'] }}</p>
</body>
</html>
