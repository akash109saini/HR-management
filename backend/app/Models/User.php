<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

use App\Traits\HasUuid;

class User extends Authenticatable
{

    protected $connection = 'tenant';

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, HasUuid;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'employee_id',
        'biometric_pin',
        'mobile',
        'first_login',
        'department',
        'designation',
        'salary',
        'shift',
        'joining_date',
        'status',
        'profile_image',
        'bank_details',
        'leave_balance',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'first_login' => 'boolean',
            'bank_details' => 'array',
            'leave_balance' => 'array',
            'salary' => 'decimal:2',
            'joining_date' => 'date',
        ];
    }
}
