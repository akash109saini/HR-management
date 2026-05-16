<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BillingOrder extends Model
{
    use HasFactory, HasUuid;
    
    protected $connection = 'landlord';

    protected $fillable = [
        'order_id',
        'tenant_id',
        'plan_id',
        'amount',
        'currency',
        'status',
        'payment_id',
        'created_by',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }
}
