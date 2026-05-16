<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Termination extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'tenant_id',
        'user_id',
        'employee_id',
        'employee_name',
        'termination_type',
        'termination_date',
        'description',
        'status',
        'created_by',
    ];

    protected $casts = [
        'termination_date' => 'date'
    ];
}
