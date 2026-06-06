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
        Schema::table('punch_corrections', function (Blueprint $table) {
            if (!Schema::hasColumn('punch_corrections', 'reviewed_by')) {
                $table->string('reviewed_by')->nullable();
            }
            if (!Schema::hasColumn('punch_corrections', 'reviewer_note')) {
                $table->text('reviewer_note')->nullable();
            }
            if (!Schema::hasColumn('punch_corrections', 'reviewed_at')) {
                $table->dateTime('reviewed_at')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('punch_corrections', function (Blueprint $table) {
            $table->dropColumn(['reviewed_by', 'reviewer_note', 'reviewed_at']);
        });
    }
};
