<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OnboardingTemplate extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';

    protected $fillable = [
        'tenant_id',
        'title',
        'description',
        'category',
        'order',
    ];
}
