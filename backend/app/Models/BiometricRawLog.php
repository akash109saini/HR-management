<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BiometricRawLog extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';

    protected $fillable = [
        'device_sn',
        'user_pin',
        'punched_at',
        'punch_status',
        'verify_mode',
        'raw_line',
        'synced',
        'sync_error',
    ];

    protected $casts = [
        'punched_at' => 'datetime',
        'synced' => 'boolean',
        'punch_status' => 'integer',
        'verify_mode' => 'integer',
    ];

    /**
     * Get the employee associated with this log via biometric_pin.
     */
    public function employee()
    {
        return User::where('biometric_pin', $this->user_pin)->first();
    }

    /**
     * Human-readable punch status.
     */
    public function getPunchStatusLabelAttribute(): string
    {
        return match ($this->punch_status) {
            0 => 'Check-In',
            1 => 'Check-Out',
            2 => 'Break-Out',
            3 => 'Break-In',
            4 => 'OT-In',
            5 => 'OT-Out',
            default => 'Unknown',
        };
    }

    /**
     * Human-readable verify mode.
     */
    public function getVerifyModeLabelAttribute(): string
    {
        return match ($this->verify_mode) {
            0 => 'Password',
            1 => 'Fingerprint',
            2 => 'Card',
            3 => 'Password',
            4 => 'Card',
            15 => 'Face',
            default => 'Unknown',
        };
    }

    protected $appends = ['punch_status_label', 'verify_mode_label'];
}
