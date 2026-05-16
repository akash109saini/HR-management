<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('database_name')->unique();
            $table->string('name');
            $table->string('domain')->nullable();
            $table->string('subscription_plan')->default('basic');
            $table->integer('max_employees')->default(50);
            $table->string('billing_cycle')->default('monthly');
            $table->string('status')->default('active');
            $table->integer('employee_count')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
