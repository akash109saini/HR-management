<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalarySlab extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'tenant_id',
        'name',
        'min_salary',
        'max_salary',
        'components',
    ];

    protected $casts = [
        'components' => 'array',
        'min_salary' => 'decimal:2',
        'max_salary' => 'decimal:2',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }
}
