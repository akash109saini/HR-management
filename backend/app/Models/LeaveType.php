<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class LeaveType extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';

    protected $fillable = [
        'name',
        'days_allotted',
        'is_paid',
        'description',
    ];

    protected $casts = [
        'is_paid' => 'boolean',
        'days_allotted' => 'integer',
    ];
}
