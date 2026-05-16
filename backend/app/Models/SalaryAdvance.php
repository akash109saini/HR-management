<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class SalaryAdvance extends Model
{
    use HasUuid;

    protected $connection = 'tenant';

    protected $fillable = [
        'user_id',
        'employee_id',
        'amount',
        'reason',
        'date_issued',
        'status',
        'payslip_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'date_issued' => 'date',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function payslip()
    {
        return $this->belongsTo(Payslip::class);
    }
}
