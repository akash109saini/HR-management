<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Goal extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'id',
        'tenant_id',
        'employee_id',
        'title',
        'description',
        'target_date',
        'status',
        'progress'
    ];

    protected $casts = [
        'target_date' => 'date',
        'progress' => 'integer'
    ];
}
