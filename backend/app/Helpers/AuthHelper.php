<?php

namespace App\Helpers;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use App\Models\User;

class AuthHelper
{
    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT);
    }

    public static function verifyPassword(string $plain, string $hash): bool
    {
        return password_verify($plain, $hash);
    }

    public static function createAccessToken(string $userId, string $email, string $role, ?string $tenantId = null): string
    {
        $payload = [
            'sub' => $userId,
            'email' => $email,
            'role' => $role,
            'tenant_id' => $tenantId,
            'exp' => time() + 86400,
            'type' => 'access',
        ];
        return JWT::encode($payload, env('JWT_SECRET'), 'HS256');
    }

    public static function createRefreshToken(string $userId): string
    {
        $payload = [
            'sub' => $userId,
            'exp' => time() + 604800,
            'type' => 'refresh',
        ];
        return JWT::encode($payload, env('JWT_SECRET'), 'HS256');
    }

    public static function getCurrentUser(Request $request): ?array
    {
        $token = $request->cookie('access_token');
        if (!$token) {
            $authHeader = $request->header('Authorization', '');
            if (str_starts_with($authHeader, 'Bearer ')) {
                $token = substr($authHeader, 7);
            }
        }
        if (!$token) return null;

        try {
            $payload = JWT::decode($token, new Key(env('JWT_SECRET'), 'HS256'));
            if (($payload->type ?? '') !== 'access') return null;

            if (($payload->role ?? '') === 'super_admin') {
                $user = \App\Models\SuperAdmin::find($payload->sub);
            } else {
                if (!$payload->tenant_id) return null;
                $tenant = \App\Models\Tenant::find($payload->tenant_id);
                if (!$tenant) return null;

                \Illuminate\Support\Facades\Config::set('database.connections.tenant.database', $tenant->database_name);
                \Illuminate\Support\Facades\DB::purge('tenant');
                \Illuminate\Support\Facades\DB::reconnect('tenant');

                $user = User::find($payload->sub);
            }

            if (!$user) return null;

            $arr = $user->toArray();
            $arr['id'] = (string)$user->id;
            $arr['role'] = $payload->role; // Ensure role is available
            $arr['tenant_id'] = $payload->tenant_id ?? null;
            return $arr;
        } catch (\Exception $e) {
            return null;
        }
    }
}
