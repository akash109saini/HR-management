<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PunchCorrection extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'attendance_id',
        'user_id',
        'type',
        'corrected_time',
        'reason',
        'status',
        'reviewed_by',
        'reviewer_note',
        'reviewed_at',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function attendance()
    {
        return $this->belongsTo(Attendance::class, 'attendance_id');
    }
}
