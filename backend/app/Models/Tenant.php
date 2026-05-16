<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Tenant extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'landlord';

    protected $fillable = [
        'database_name',
        'name',
        'logo',
        'domain',
        'email',
        'contact_number',
        'contact_person',
        'tenant_number',
        'address',
        'subscription_plan',
        'max_employees',
        'billing_cycle',
        'status',
        'employee_count',
    ];
}
