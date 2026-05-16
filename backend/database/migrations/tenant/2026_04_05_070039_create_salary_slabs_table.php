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
        Schema::create('salary_slabs', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->string('name');
            $table->string('grade')->nullable();
            $table->decimal('min_salary', 10, 2);
            $table->decimal('max_salary', 10, 2);
            $table->decimal('basic_percentage', 5, 2)->default(0);
            $table->decimal('hra_percentage', 5, 2)->default(0);
            $table->decimal('pf_percentage', 5, 2)->default(0);
            $table->string('status')->default('active');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('salary_slabs');
    }
};
