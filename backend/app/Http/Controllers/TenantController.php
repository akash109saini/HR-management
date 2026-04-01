<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class TenantController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        return response()->json(MongoService::find('tenants'));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        $request->validate(['name' => 'required']);
        $tenant = [
            'id' => (string)Str::uuid(), 'name' => $request->name, 'domain' => $request->domain ?? '',
            'subscription_plan' => $request->subscription_plan ?? 'basic', 'max_employees' => $request->max_employees ?? 50,
            'billing_cycle' => $request->billing_cycle ?? 'monthly', 'status' => 'active', 'employee_count' => 0,
            'created_at' => now()->toISOString(), 'updated_at' => now()->toISOString(),
        ];
        MongoService::insertOne('tenants', $tenant);
        return response()->json($tenant, 201);
    }

    public function show(Request $request, string $tenantId)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        $tenant = MongoService::findOneNoId('tenants', ['id' => $tenantId]);
        if (!$tenant) return response()->json(['detail' => 'Tenant not found'], 404);
        return response()->json($tenant);
    }

    public function update(Request $request, string $tenantId)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        $updates = array_filter($request->only(['name', 'domain', 'subscription_plan', 'max_employees', 'billing_cycle', 'status']), fn($v) => $v !== null);
        $updates['updated_at'] = now()->toISOString();
        MongoService::updateOne('tenants', ['id' => $tenantId], $updates);
        return response()->json(MongoService::findOneNoId('tenants', ['id' => $tenantId]));
    }

    public function destroy(Request $request, string $tenantId)
    {
        $user = $request->auth_user;
        if ($user['role'] !== 'super_admin') return response()->json(['detail' => 'Super Admin only'], 403);
        MongoService::updateOne('tenants', ['id' => $tenantId], ['status' => 'deleted']);
        return response()->json(['message' => 'Tenant deleted']);
    }
}
