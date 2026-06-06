<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TenantController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        
        return response()->json(Tenant::all());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'logo' => 'nullable|string|max:255',
            'domain' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'contact_number' => 'nullable|string|max:20',
            'contact_person' => 'nullable|string|max:255',
            'tenant_number' => 'nullable|string|max:100',
            'address' => 'nullable|string',
            'subscription_plan' => 'required|string|in:free,basic,premium,enterprise',
            'max_employees' => 'required|integer|min:1',
            'billing_cycle' => 'required|string|in:monthly,yearly',
        ]);

        $uuid = (string) Str::uuid();
        $dbPrefix = '';
        if (env('APP_ENV') === 'production' && str_contains(env('DB_USERNAME'), '_')) {
            $dbPrefix = explode('_', env('DB_USERNAME'))[0] . '_';
        }
        $dbName = $dbPrefix . 'hr_tenant_' . str_replace('-', '_', $uuid);

        // 1. Create Physical Database
        if (env('APP_ENV') === 'production') {
            shell_exec("uapi Mysql create_database name=" . escapeshellarg($dbName));
            shell_exec("uapi Mysql set_privileges_on_database user=" . escapeshellarg(env('DB_USERNAME')) . " database=" . escapeshellarg($dbName) . " privileges=ALL");
        } else {
            \Illuminate\Support\Facades\DB::connection('landlord')->statement("CREATE DATABASE IF NOT EXISTS `{$dbName}`;");
        }

        // 2. Register Tenant in Landlord DB
        $tenant = Tenant::create([
            'id' => $uuid,
            'database_name' => $dbName,
            'name' => $validated['name'],
            'logo' => $validated['logo'] ?? null,
            'domain' => $validated['domain'] ?? '',
            'email' => $validated['email'] ?? null,
            'contact_number' => $validated['contact_number'] ?? null,
            'contact_person' => $validated['contact_person'] ?? null,
            'tenant_number' => $validated['tenant_number'] ?? null,
            'address' => $validated['address'] ?? null,
            'subscription_plan' => $validated['subscription_plan'],
            'max_employees' => $validated['max_employees'],
            'billing_cycle' => $validated['billing_cycle'],
            'status' => 'active',
            'employee_count' => 0,
        ]);

        // 3. Migrate the new Tenant DB
        \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $dbName);
        \Illuminate\Support\Facades\DB::purge('tenant');
        
        \Illuminate\Support\Facades\Artisan::call('migrate', [
            '--database' => 'tenant',
            '--path' => 'database/migrations/tenant',
            '--force' => true,
        ]);

        return response()->json($tenant, 201);
    }

    public function show(Request $request, string $tenantId)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        
        $tenant = Tenant::find($tenantId);
        if (!$tenant) return response()->json(['detail' => 'Tenant not found'], 404);
        return response()->json($tenant);
    }

    public function update(Request $request, string $tenantId)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        
        $tenant = Tenant::find($tenantId);
        if (!$tenant) return response()->json(['detail' => 'Tenant not found'], 404);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'logo' => 'nullable|string|max:255',
            'domain' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'contact_number' => 'nullable|string|max:20',
            'contact_person' => 'nullable|string|max:255',
            'tenant_number' => 'nullable|string|max:100',
            'address' => 'nullable|string',
            'subscription_plan' => 'sometimes|required|string|in:free,basic,premium,enterprise',
            'max_employees' => 'sometimes|required|integer|min:1',
            'billing_cycle' => 'sometimes|required|string|in:monthly,yearly',
            'status' => 'sometimes|required|string|in:active,inactive,suspended',
        ]);

        $tenant->update($validated);

        return response()->json($tenant);
    }

    public function destroy(Request $request, string $tenantId)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        
        $tenant = Tenant::find($tenantId);
        if (!$tenant) return response()->json(['detail' => 'Tenant not found'], 404);

        $tenant->update(['status' => 'deleted']);
        return response()->json(['message' => 'Tenant deleted']);
    }
}
