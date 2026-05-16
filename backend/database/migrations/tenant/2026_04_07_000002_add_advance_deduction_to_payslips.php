<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'tenant';

    public function up(): void
    {
        Schema::connection('tenant')->table('payslips', function (Blueprint $table) {
            $table->decimal('advance_deduction', 10, 2)->default(0)->after('absence_deduction');
        });
    }

    public function down(): void
    {
        Schema::connection('tenant')->table('payslips', function (Blueprint $table) {
            $table->dropColumn('advance_deduction');
        });
    }
};
