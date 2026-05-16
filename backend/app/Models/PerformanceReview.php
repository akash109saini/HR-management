<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class PerformanceReview extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'user_id',
        'employee_id',
        'employee_name',
        'reviewer_id',
        'reviewer_name',
        'review_period',
        'rating',
        'goals',
        'achievements',
        'areas_of_improvement',
        'ai_summary',
        'status'
    ];

    protected $casts = [
        'rating' => 'integer'
    ];
}
