<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class File extends Model
{
    use HasFactory, HasUuid;

    protected $connection = 'tenant';


    protected $fillable = [
        'storage_path',
        'base64_data',
        'original_filename',
        'content_type',
        'size',
        'uploaded_by',
        'tenant_id',
        'is_deleted',
    ];

    protected $casts = [
        'is_deleted' => 'boolean',
        'size' => 'integer',
    ];
}
