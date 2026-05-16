<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OnboardingChecklist extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'tenant_id',
        'employee_id',
        'items',
        'progress',
        'status',
    ];

    protected $casts = [
        'items' => 'array',
        'progress' => 'integer',
    ];
}
