<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Helpers\AuthHelper;

class JwtAuth
{
    private function getRequiredPermission(Request $request): ?string
    {
        $path = $request->path(); // e.g. api/employees, api/attendance/clock-in
        // Normalize path by removing 'api/' prefix if present
        if (str_starts_with($path, 'api/')) {
            $path = substr($path, 4);
        }
        $method = $request->method();

        // Self-service routes
        if ($path === 'profile') {
            return 'self_profile';
        }
        if ($path === 'attendance/clock-in' || $path === 'attendance/clock-out' || $path === 'attendance/today' || $path === 'attendance/punch-correction') {
            return 'self_attendance';
        }
        if ($path === 'leaves/balance' || ($path === 'leaves' && $method === 'POST')) {
            return 'self_leaves';
        }

        // HR/Admin routes mapping
        if (str_starts_with($path, 'employees')) {
            return 'employees';
        }
        if (str_starts_with($path, 'departments')) {
            return 'departments';
        }
        if (str_starts_with($path, 'designations')) {
            return 'designations';
        }
        if (str_starts_with($path, 'shifts')) {
            return 'shifts';
        }
        if (str_starts_with($path, 'salary-slabs')) {
            return 'salary_slabs';
        }
        if (str_starts_with($path, 'holidays')) {
            return 'holidays';
        }
        if (str_starts_with($path, 'attendance')) {
            return 'attendance';
        }
        if (str_starts_with($path, 'leaves') || str_starts_with($path, 'leave-types')) {
            return 'leaves';
        }
        if (str_starts_with($path, 'payroll') || str_starts_with($path, 'salary-advances')) {
            return 'payroll';
        }
        if (str_starts_with($path, 'recruitment')) {
            return 'recruitment';
        }
        if (str_starts_with($path, 'performance')) {
            return 'performance';
        }
        if (str_starts_with($path, 'onboarding')) {
            return 'onboarding';
        }
        if (str_starts_with($path, 'terminations')) {
            return 'terminations';
        }
        if (str_starts_with($path, 'resignations')) {
            return 'resignations';
        }
        if (str_starts_with($path, 'announcements')) {
            if ($method !== 'GET') {
                return 'announcements';
            }
        }
        
        return null;
    }

    public function handle(Request $request, Closure $next, ...$roles)
    {
        $user = AuthHelper::getCurrentUser($request);
        if (!$user) {
            return response()->json(['detail' => 'Not authenticated'], 401);
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

        // Enforce permissions for custom roles (roles that are not system roles)
        if (!in_array($user['role'], ['super_admin', 'hr_manager', 'employee'])) {
            $requiredPerm = $this->getRequiredPermission($request);
            if ($requiredPerm) {
                $userPerms = $user['permissions'] ?? [];
                if (!in_array('*', $userPerms) && !in_array($requiredPerm, $userPerms)) {
                    return response()->json(['detail' => 'Insufficient permissions'], 403);
                }
            }

            // Temporarily map role to system role for controller checks
            $userPerms = $user['permissions'] ?? [];
            $isAdmin = false;
            foreach ($userPerms as $p) {
                if (!str_starts_with($p, 'self_') && $p !== 'announcements') {
                    $isAdmin = true;
                    break;
                }
            }
            $user['role'] = $isAdmin ? 'hr_manager' : 'employee';
        }

        if (!empty($roles) && !in_array($user['role'], $roles)) {
            return response()->json(['detail' => 'Insufficient permissions'], 403);
        }

        $request->merge(['auth_user' => $user]);
        return $next($request);
    }
}
