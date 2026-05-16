<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->auth_user;
        $profile = User::find($user['id']);
        return response()->json($profile);
    }

    public function update(Request $request)
    {
        $user = $request->auth_user;
        $profile = User::find($user['id']);
        if (!$profile) {
            return response()->json(['detail' => 'User not found'], 404);
        }

        $allowed = ['name', 'mobile', 'department', 'designation'];
        if (in_array($user['role'], ['super_admin', 'hr_manager'])) {
            $allowed[] = 'salary';
        }
        $updates = array_filter($request->only($allowed), fn($v) => $v !== null);
        
        $profile->update($updates);
        return response()->json($profile->fresh());
    }
}
