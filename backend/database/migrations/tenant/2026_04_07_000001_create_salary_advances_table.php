<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'tenant';

    public function up(): void
    {
        Schema::connection('tenant')->create('salary_advances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->onDelete('cascade');
            $table->string('employee_id');
            $table->decimal('amount', 10, 2);
            $table->string('reason')->nullable();
            $table->date('date_issued');
            $table->enum('status', ['pending', 'paid'])->default('pending');
            $table->uuid('payslip_id')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::connection('tenant')->dropIfExists('salary_advances');
    }
};
