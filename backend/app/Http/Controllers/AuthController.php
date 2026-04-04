<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Helpers\AuthHelper;
use App\Services\MongoService;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate(['email' => 'required|email', 'password' => 'required']);
        $email = strtolower(trim($request->email));
        $user = MongoService::findOne('users', ['email' => $email]);

        if (!$user) return response()->json(['detail' => 'Invalid credentials'], 401);

        // Brute force check
        $ip = $request->ip() ?? 'unknown';
        $identifier = "{$ip}:{$email}";
        $attempts = MongoService::findOneNoId('login_attempts', ['identifier' => $identifier]);

        if ($attempts && ($attempts['count'] ?? 0) >= 10) {
            $lastAttempt = $attempts['last_attempt'] ?? null;
            if ($lastAttempt && (time() - strtotime($lastAttempt)) < 300) {
                return response()->json(['detail' => 'Too many attempts. Try again in 5 minutes.'], 429);
            } else {
                // Reset after lockout period
                MongoService::deleteMany('login_attempts', ['identifier' => $identifier]);
            }
        }

        if (!AuthHelper::verifyPassword($request->password, $user['password_hash'])) {
            if ($attempts) {
                MongoService::updateOne('login_attempts', ['identifier' => $identifier], [
                    'count' => ($attempts['count'] ?? 0) + 1, 'last_attempt' => now()->toISOString()
                ]);
            } else {
                MongoService::insertOne('login_attempts', [
                    'identifier' => $identifier, 'count' => 1, 'last_attempt' => now()->toISOString()
                ]);
            }
            return response()->json(['detail' => 'Invalid credentials'], 401);
        }

        MongoService::deleteMany('login_attempts', ['identifier' => $identifier]);

        $userId = (string)($user['_id'] ?? '');
        $tenantId = $user['tenant_id'] ?? null;
        $accessToken = AuthHelper::createAccessToken($userId, $user['email'], $user['role'], $tenantId);
        $refreshToken = AuthHelper::createRefreshToken($userId);

        return response()->json([
            'id' => $userId,
            'email' => $user['email'],
            'name' => $user['name'] ?? '',
            'role' => $user['role'],
            'tenant_id' => $tenantId,
            'employee_id' => $user['employee_id'] ?? null,
            'first_login' => $user['first_login'] ?? false,
            'department' => $user['department'] ?? '',
            'position' => $user['position'] ?? '',
            'leave_balance' => $user['leave_balance'] ?? [],
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
            $user = MongoService::findOne('users', ['_id' => MongoService::objectId($payload->sub)]);
        } catch (\Exception $e) {
            return response()->json(['detail' => 'Invalid token'], 401);
        }

        if (!$user) return response()->json(['detail' => 'User not found'], 404);
        if (!AuthHelper::verifyPassword($request->current_password, $user['password_hash'])) {
            return response()->json(['detail' => 'Current password is incorrect'], 400);
        }

        MongoService::collection('users')->updateOne(
            ['_id' => MongoService::objectId($payload->sub)],
            ['$set' => ['password_hash' => AuthHelper::hashPassword($request->new_password), 'first_login' => false, 'updated_at' => now()->toISOString()]]
        );

        $userId = (string)($user['_id'] ?? '');
        $accessToken = AuthHelper::createAccessToken($userId, $user['email'], $user['role'], $user['tenant_id'] ?? null);
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
            $user = MongoService::findOne('users', ['_id' => MongoService::objectId($payload->sub)]);
            if (!$user) return response()->json(['detail' => 'User not found'], 401);
            $userId = (string)($user['_id'] ?? '');
            $accessToken = AuthHelper::createAccessToken($userId, $user['email'], $user['role'], $user['tenant_id'] ?? null);
            return response()->json(['access_token' => $accessToken])
                ->cookie('access_token', $accessToken, 1440, '/', null, false, true, false, 'lax');
        } catch (\Exception $e) {
            return response()->json(['detail' => 'Invalid refresh token'], 401);
        }
    }
}
