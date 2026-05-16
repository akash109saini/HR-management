<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class JobPosting extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'id',
        'tenant_id',
        'title',
        'department',
        'description',
        'requirements',
        'location',
        'salary_range',
        'status',
        'applicant_count',
        'created_by'
    ];
}
