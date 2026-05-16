<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\CustomRole;
use App\Helpers\AuthHelper;
use Illuminate\Support\Str;

class RoleUserController extends Controller
{
    // ROLES
    public function listRoles(Request $request)
    {
        $roles = CustomRole::orderBy('name', 'asc')->get();

        // Always include system roles
        $systemRoles = [
            [
                'id' => 'system_hr_manager', 
                'name' => 'HR Manager', 
                'type' => 'system', 
                'permissions' => ['employees', 'departments', 'attendance', 'leaves', 'payroll', 'recruitment', 'performance', 'announcements', 'terminations', 'resignations', 'shifts', 'designations', 'salary_slabs', 'holidays', 'onboarding'], 
                'editable' => false
            ],
            [
                'id' => 'system_employee', 
                'name' => 'Employee', 
                'type' => 'system', 
                'permissions' => ['self_attendance', 'self_leaves', 'self_payslips', 'announcements', 'self_profile'], 
                'editable' => false
            ],
        ];
        
        return response()->json(array_merge($systemRoles, $roles->toArray()));
    }

    public function createRole(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['name' => 'required', 'permissions' => 'required|array']);

        $role = CustomRole::create([
            'name' => $request->name, 
            'type' => 'custom',
            'permissions' => $request->permissions, 
            'description' => $request->description ?? '',
            'editable' => true,
        ]);

        return response()->json($role, 201);
    }

    public function updateRole(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        if (str_starts_with($id, 'system_')) {
            return response()->json(['detail' => 'Cannot edit system roles'], 400);
        }

        $role = CustomRole::find($id);
        if (!$role) {
            return response()->json(['detail' => 'Role not found'], 404);
        }

        $updates = array_filter($request->only(['name', 'permissions', 'description']), fn($v) => $v !== null);
        $role->update($updates);

        return response()->json($role->fresh());
    }

    public function deleteRole(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        if (str_starts_with($id, 'system_')) {
            return response()->json(['detail' => 'Cannot delete system roles'], 400);
        }

        CustomRole::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }

    // USERS
    public function listUsers(Request $request)
    {
        $users = User::orderBy('name', 'asc')->get();
        return response()->json($users);
    }

    public function updateUser(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $targetUser = User::where('employee_id', $employeeId)->first();
        if (!$targetUser) {
            return response()->json(['detail' => 'User not found'], 404);
        }

        $updates = array_filter($request->only(['name', 'email', 'role', 'status', 'department', 'designation', 'custom_role']), fn($v) => $v !== null);
        
        if (isset($updates['role']) && !in_array($updates['role'], ['employee', 'hr_manager'])) {
            return response()->json(['detail' => 'Invalid role. Use employee or hr_manager'], 400);
        }

        $targetUser->update($updates);
        return response()->json($targetUser->fresh());
    }

    public function resetPassword(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $targetUser = User::where('employee_id', $employeeId)->first();
        if (!$targetUser) {
            return response()->json(['detail' => 'User not found'], 404);
        }

        $newPassword = $targetUser->mobile ?? 'temp123456';
        $targetUser->update([
            'password' => $newPassword, // Hashed automatically
            'first_login' => true
        ]);

        return response()->json(['message' => "Password reset. New password: {$newPassword}", 'new_password' => $newPassword]);
    }
}
