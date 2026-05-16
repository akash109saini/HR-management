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
        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('user_id')->constrained('users')->onDelete('cascade'); // Link to user id
            $table->string('employee_id')->nullable(); // Legacy employee_id string
            $table->string('employee_name')->nullable();
            $table->foreignUuid('reviewer_id')->constrained('users')->onDelete('cascade');
            $table->string('reviewer_name')->nullable();
            $table->string('review_period')->nullable();
            $table->integer('rating')->default(0);
            $table->text('goals')->nullable();
            $table->text('achievements')->nullable();
            $table->text('areas_of_improvement')->nullable();
            $table->text('ai_summary')->nullable();
            $table->string('status')->default('submitted');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('performance_reviews');
    }
};
