<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Tenant;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Super Admin (Landlord Database)
        \App\Models\SuperAdmin::create([
            'name' => 'Admin User',
            'email' => 'admin@hrms.com',
            'password' => bcrypt('admin123'),
        ]);

        // Acme Corp Tenant Creation
        $uuid = (string) \Illuminate\Support\Str::uuid();
        $dbPrefix = '';
        if (env('APP_ENV') === 'production' && str_contains(env('DB_USERNAME'), '_')) {
            $dbPrefix = explode('_', env('DB_USERNAME'))[0] . '_';
        }
        $dbName = $dbPrefix . 'hr_tenant_' . str_replace('-', '_', $uuid);

        if (env('APP_ENV') === 'production') {
            shell_exec("uapi Mysql create_database name=" . escapeshellarg($dbName));
            shell_exec("uapi Mysql set_privileges_on_database user=" . escapeshellarg(env('DB_USERNAME')) . " database=" . escapeshellarg($dbName) . " privileges=ALL");
        } else {
            \Illuminate\Support\Facades\DB::connection('landlord')->statement("CREATE DATABASE IF NOT EXISTS `{$dbName}`;");
        }

        $tenant = Tenant::create([
            'id' => $uuid,
            'database_name' => $dbName,
            'name' => 'Acme Corp',
            'domain' => 'acmecorp.com',
            'subscription_plan' => 'premium',
            'max_employees' => 100,
            'billing_cycle' => 'monthly',
            'status' => 'active',
            'employee_count' => 1
        ]);

        // Migrate the new Tenant Database
        \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $dbName);
        \Illuminate\Support\Facades\DB::purge('tenant');
        \Illuminate\Support\Facades\Artisan::call('migrate', [
            '--database' => 'tenant',
            '--path' => 'database/migrations/tenant',
            '--force' => true,
        ]);

        // Seed HR user into the Tenant Database
        User::create([
            'name' => 'HR Manager',
            'email' => 'hr@acmecorp.com',
            'password' => bcrypt('1Akash@@'),
            'role' => 'hr_manager',
            'first_login' => false,
        ]);
    }
}
