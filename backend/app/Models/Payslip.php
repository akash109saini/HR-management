<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Payslip extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'user_id',
        'employee_id',
        'employee_name',
        'month',
        'year',
        'basic_salary',
        'hra',
        'allowances',
        'pf_deduction',
        'tax',
        'absence_deduction',
        'advance_deduction',
        'total_deductions',
        'gross_salary',
        'net_salary',
        'days_worked',
        'days_absent',
        'department',
        'position',
        'status',
    ];

    protected $casts = [
        'basic_salary' => 'decimal:2',
        'hra' => 'decimal:2',
        'allowances' => 'decimal:2',
        'pf_deduction' => 'decimal:2',
        'tax' => 'decimal:2',
        'absence_deduction' => 'decimal:2',
        'advance_deduction' => 'decimal:2',
        'total_deductions' => 'decimal:2',
        'gross_salary' => 'decimal:2',
        'net_salary' => 'decimal:2',
    ];
}
