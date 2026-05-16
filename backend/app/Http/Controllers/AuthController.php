<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Helpers\AuthHelper;
use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate(['email' => 'required|email', 'password' => 'required']);
        $email = strtolower(trim($request->email));
        
        // 1. Check Super Admins
        $user = \App\Models\SuperAdmin::where('email', $email)->first();
        $isSuperAdmin = $user ? true : false;
        $tenantId = null;

        // 2. Cross-DB Check for Tenant Users
        if (!$user) {
            $tenants = \App\Models\Tenant::where('status', 'active')->get();
            foreach ($tenants as $tenant) {
                \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $tenant->database_name);
                \Illuminate\Support\Facades\DB::purge('tenant');
                \Illuminate\Support\Facades\DB::reconnect('tenant');

                $user = User::where('email', $email)->first();
                if ($user) {
                    $tenantId = $tenant->id;
                    break;
                }
            }
        }

        if (!$user || !AuthHelper::verifyPassword($request->password, $user->password)) {
            return response()->json(['detail' => 'Invalid credentials'], 401);
        }

        $userId = (string)$user->id;
        $role = $isSuperAdmin ? 'super_admin' : $user->role;
        $accessToken = AuthHelper::createAccessToken($userId, $user->email, $role, $tenantId);
        $refreshToken = AuthHelper::createRefreshToken($userId);

        return response()->json([
            'id' => $userId,
            'email' => $user->email,
            'name' => $user->name,
            'role' => $user->role,
            'tenant_id' => $tenantId,
            'employee_id' => $user->employee_id,
            'first_login' => $user->first_login,
            'department' => $user->department,
            'position' => $user->position,
            'leave_balance' => $user->leave_balance,
            'access_token' => $accessToken,
        ])
        ->cookie('access_token', $accessToken, 1440, '/', null, false, true, false, 'lax')
        ->cookie('refresh_token', $refreshToken, 10080, '/', null, false, true, false, 'lax');
    }

    public function changePassword(Request $request)
    {
        $request->validate(['current_password' => 'required', 'new_password' => 'required|min:6']);

        $token = $request->cookie('access_token');
        if (!$token) {
            $authHeader = $request->header('Authorization', '');
            if (str_starts_with($authHeader, 'Bearer ')) {
                $token = substr($authHeader, 7);
            }
        }
        if (!$token) return response()->json(['detail' => 'Not authenticated'], 401);

        try {
            $payload = JWT::decode($token, new Key(env('JWT_SECRET'), 'HS256'));
            if (($payload->role ?? '') === 'super_admin') {
                $user = \App\Models\SuperAdmin::find($payload->sub);
            } else {
                if (!$payload->tenant_id) return response()->json(['detail' => 'Invalid token'], 401);
                $tenant = \App\Models\Tenant::find($payload->tenant_id);
                if (!$tenant) return response()->json(['detail' => 'Invalid token'], 401);

                \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $tenant->database_name);
                \Illuminate\Support\Facades\DB::purge('tenant');
                \Illuminate\Support\Facades\DB::reconnect('tenant');

                $user = User::find($payload->sub);
            }
        } catch (\Exception $e) {
            return response()->json(['detail' => 'Invalid token'], 401);
        }

        if (!$user) return response()->json(['detail' => 'User not found'], 404);
        if (!AuthHelper::verifyPassword($request->current_password, $user->password)) {
            return response()->json(['detail' => 'Current password is incorrect'], 400);
        }

        $user->update([
            'password' => AuthHelper::hashPassword($request->new_password),
            'first_login' => false,
        ]);

        $userId = (string)$user->id;
        $accessToken = AuthHelper::createAccessToken($userId, $user->email, $user->role, $user->tenant_id);
        $refreshToken = AuthHelper::createRefreshToken($userId);

        return response()->json(['message' => 'Password changed successfully', 'access_token' => $accessToken])
            ->cookie('access_token', $accessToken, 1440, '/', null, false, true, false, 'lax')
            ->cookie('refresh_token', $refreshToken, 10080, '/', null, false, true, false, 'lax');
    }

    public function me(Request $request)
    {
        $user = AuthHelper::getCurrentUser($request);
        if (!$user) return response()->json(['detail' => 'Not authenticated'], 401);
        return response()->json($user);
    }

    public function logout()
    {
        return response()->json(['message' => 'Logged out successfully'])
            ->withoutCookie('access_token', '/')
            ->withoutCookie('refresh_token', '/');
    }

    public function refresh(Request $request)
    {
        $token = $request->cookie('refresh_token');
        if (!$token) return response()->json(['detail' => 'No refresh token'], 401);
        try {
            $payload = JWT::decode($token, new Key(env('JWT_SECRET'), 'HS256'));
            if (($payload->type ?? '') !== 'refresh') return response()->json(['detail' => 'Invalid token type'], 401);
            
            // Re-fetch original access token payload info if possible, or we need to look them up again
            // For now, let's keep it simple: assume a refresh token has the role/tenant inside it.
            // Oh, wait, the original createRefreshToken doesn't have role/tenant_id. Let's look up.
            
            $user = \App\Models\SuperAdmin::find($payload->sub);
            $role = 'super_admin';
            $tenantId = null;

            if (!$user) {
                // Must be a tenant user, we need to iterate again :( 
                // Or modify createRefreshToken to include tenant_id.
                // Let's iterate for safety right now.
                $tenants = \App\Models\Tenant::where('status', 'active')->get();
                foreach ($tenants as $tenant) {
                    \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $tenant->database_name);
                    \Illuminate\Support\Facades\DB::purge('tenant');
                    \Illuminate\Support\Facades\DB::reconnect('tenant');

                    $user = User::find($payload->sub);
                    if ($user) {
                        $role = $user->role;
                        $tenantId = $tenant->id;
                        break;
                    }
                }
            }
            if (!$user) return response()->json(['detail' => 'User not found'], 401);
            $userId = (string)$user->id;
            $accessToken = AuthHelper::createAccessToken($userId, $user->email, $role, $tenantId);
            return response()->json(['access_token' => $accessToken])
                ->cookie('access_token', $accessToken, 1440, '/', null, false, true, false, 'lax');
        } catch (\Exception $e) {
            return response()->json(['detail' => 'Invalid refresh token'], 401);
        }
    }
}
