<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Shift extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'tenant_id',
        'name',
        'start_time',
        'end_time',
        'break_duration',
        'working_hours',
        'status',
    ];

    protected $casts = [
        'is_night_shift' => 'boolean'
    ];
}
