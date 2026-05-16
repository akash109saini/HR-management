<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add biometric_pin to users table.
     * This PIN must match the User ID enrolled on the ESSL biometric device.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('biometric_pin')->nullable()->unique()->after('employee_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('biometric_pin');
        });
    }
};
