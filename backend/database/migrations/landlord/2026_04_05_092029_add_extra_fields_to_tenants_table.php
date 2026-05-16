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
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('logo')->nullable()->after('name');
            $table->string('email')->nullable()->after('domain');
            $table->string('contact_number')->nullable()->after('email');
            $table->string('contact_person')->nullable()->after('contact_number');
            $table->string('tenant_number')->nullable()->after('contact_person');
            $table->text('address')->nullable()->after('tenant_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['logo', 'email', 'contact_number', 'contact_person', 'tenant_number', 'address']);
        });
    }
};
