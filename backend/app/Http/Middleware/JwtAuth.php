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
        $request->merge(['auth_user' => $user]);
        return $next($request);
    }
}
