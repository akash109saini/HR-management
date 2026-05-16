<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\HasUuid;

class Applicant extends Model
{
    use HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'id',
        'job_id',
        'tenant_id',
        'name',
        'email',
        'phone',
        'resume_text',
        'status',
        'notes'
    ];
}
