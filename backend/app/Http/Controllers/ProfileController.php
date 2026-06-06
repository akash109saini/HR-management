<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;

class ProfileController extends Controller
{
    private function appendRoleName($profile, $defaultRole = null)
    {
        if (!$profile) return null;
        
        $role = $profile->role ?? $defaultRole;
        $roleName = $role;
        $systemMapping = [
            'super_admin' => 'Super Admin',
            'hr_manager' => 'HR Manager',
            'employee' => 'Employee',
        ];
        if (isset($systemMapping[$role])) {
            $roleName = $systemMapping[$role];
        } elseif ($role) {
            $customRole = \App\Models\CustomRole::find($role);
            if ($customRole) {
                $roleName = $customRole->name;
            }
        }
        
        $arr = $profile->toArray();
        $arr['role'] = $role;
        $arr['role_name'] = $roleName;
        return $arr;
    }

    public function show(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] === 'super_admin') {
            $profile = \App\Models\SuperAdmin::find($user['id']);
        } else {
            $profile = User::find($user['id']);
        }
        return response()->json($this->appendRoleName($profile, $user['role']));
    }

    public function update(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] === 'super_admin') {
            $profile = \App\Models\SuperAdmin::find($user['id']);
            $allowed = ['name'];
        } else {
            $profile = User::find($user['id']);
            $allowed = ['name', 'mobile', 'department', 'designation'];
            if (in_array($user['role'], ['super_admin', 'hr_manager'])) {
                $allowed[] = 'salary';
            }
        }
        
        if (!$profile) {
            return response()->json(['detail' => 'User not found'], 404);
        }

        $updates = array_filter($request->only($allowed), fn($v) => $v !== null);
        
        $profile->update($updates);
        return response()->json($this->appendRoleName($profile->fresh(), $user['role']));
    }
}
