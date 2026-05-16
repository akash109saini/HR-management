<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Raw logs received from ESSL biometric devices via ADMS PUSH.
     * These are parsed and synced into the attendances table.
     */
    public function up(): void
    {
        Schema::create('biometric_raw_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('device_sn');
            $table->string('user_pin');
            $table->dateTime('punched_at');
            $table->tinyInteger('punch_status')->default(0)->comment('0=Check-In, 1=Check-Out, 2=Break-Out, 3=Break-In, 4=OT-In, 5=OT-Out');
            $table->tinyInteger('verify_mode')->default(15)->comment('1=FP, 3=Password, 4=Card, 15=Face');
            $table->text('raw_line')->nullable();
            $table->boolean('synced')->default(false);
            $table->string('sync_error')->nullable();
            $table->timestamps();

            $table->index(['device_sn', 'punched_at']);
            $table->index(['user_pin', 'punched_at']);
            $table->index('synced');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('biometric_raw_logs');
    }
};
