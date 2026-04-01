<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use App\Helpers\AuthHelper;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->auth_user;
        $profile = MongoService::findOneNoId('users', ['email' => $user['email']]);
        if ($profile) unset($profile['password_hash']);
        return response()->json($profile);
    }

    public function update(Request $request)
    {
        $user = $request->auth_user;
        $allowed = ['name', 'mobile', 'department', 'position'];
        // HR and super admin can also update salary
        if (in_array($user['role'], ['super_admin', 'hr_manager'])) {
            $allowed[] = 'salary';
        }
        $updates = array_filter($request->only($allowed), fn($v) => $v !== null);
        $updates['updated_at'] = now()->toISOString();

        MongoService::updateOne('users', ['email' => $user['email']], $updates);
        $profile = MongoService::findOneNoId('users', ['email' => $user['email']]);
        if ($profile) unset($profile['password_hash']);
        return response()->json($profile);
    }
}
