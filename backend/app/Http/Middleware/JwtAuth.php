<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Helpers\AuthHelper;

class JwtAuth
{
    public function handle(Request $request, Closure $next, ...$roles)
    {
        $user = AuthHelper::getCurrentUser($request);
        if (!$user) {
            return response()->json(['detail' => 'Not authenticated'], 401);
        }
        if (!empty($roles) && !in_array($user['role'], $roles)) {
            return response()->json(['detail' => 'Insufficient permissions'], 403);
        }

        // Connect Super Admins to proper tenant DB if tenant_id is provided
        if ($user['role'] === 'super_admin' && $request->has('tenant_id')) {
            $tenant = \App\Models\Tenant::find($request->tenant_id);
            if ($tenant) {
                 \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $tenant->database_name);
                 \Illuminate\Support\Facades\DB::purge('tenant');
                 \Illuminate\Support\Facades\DB::reconnect('tenant');
            }
        }

        $request->merge(['auth_user' => $user]);
        return $next($request);
    }
}
