<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BiometricDevice extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'landlord';

    protected $fillable = [
        'tenant_id',
        'serial_number',
        'name',
        'location',
        'last_heartbeat',
        'status',
    ];

    protected $casts = [
        'last_heartbeat' => 'datetime',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * Check if the device is considered online (heartbeat within last 30 minutes).
     */
    public function getIsOnlineAttribute(): bool
    {
        if (!$this->last_heartbeat) return false;
        return $this->last_heartbeat->diffInMinutes(now()) < 30;
    }

    protected $appends = ['is_online'];
}
