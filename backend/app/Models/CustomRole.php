<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomRole extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'tenant_id',
        'name',
        'type',
        'permissions',
        'description',
        'editable',
    ];

    protected $casts = [
        'permissions' => 'array',
        'editable' => 'boolean',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }
}
