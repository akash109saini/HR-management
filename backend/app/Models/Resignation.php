<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Resignation extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'tenant_id',
        'user_id',
        'employee_id',
        'employee_name',
        'resignation_date',
        'last_working_date',
        'notice_period',
        'reason',
        'status',
        'created_by',
    ];

    protected $casts = [
        'last_working_day' => 'date'
    ];
}
