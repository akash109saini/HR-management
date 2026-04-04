<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use App\Helpers\AuthHelper;
use Illuminate\Support\Str;

class RoleUserController extends Controller
{
    // ROLES
    public function listRoles(Request $request)
    {
        $user = $request->auth_user;
        $filter = ['tenant_id' => $user['tenant_id'] ?? ''];
        $roles = MongoService::find('custom_roles', $filter);

        // Always include system roles
        $systemRoles = [
            ['id' => 'system_hr_manager', 'name' => 'HR Manager', 'type' => 'system', 'permissions' => ['employees', 'departments', 'attendance', 'leaves', 'payroll', 'recruitment', 'performance', 'announcements', 'terminations', 'resignations', 'shifts', 'designations', 'salary_slabs', 'holidays', 'onboarding'], 'editable' => false],
            ['id' => 'system_employee', 'name' => 'Employee', 'type' => 'system', 'permissions' => ['self_attendance', 'self_leaves', 'self_payslips', 'announcements', 'self_profile'], 'editable' => false],
        ];
        return response()->json(array_merge($systemRoles, $roles));
    }

    public function createRole(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['name' => 'required', 'permissions' => 'required|array']);
        $role = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'name' => $request->name, 'type' => 'custom',
            'permissions' => $request->permissions, 'description' => $request->description ?? '',
            'editable' => true, 'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('custom_roles', $role);
        return response()->json($role, 201);
    }

    public function updateRole(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        if (str_starts_with($id, 'system_')) return response()->json(['detail' => 'Cannot edit system roles'], 400);
        $updates = array_filter($request->only(['name', 'permissions', 'description']), fn($v) => $v !== null);
        MongoService::updateOne('custom_roles', ['id' => $id], $updates);
        return response()->json(MongoService::findOneNoId('custom_roles', ['id' => $id]));
    }

    public function deleteRole(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        if (str_starts_with($id, 'system_')) return response()->json(['detail' => 'Cannot delete system roles'], 400);
        MongoService::deleteOne('custom_roles', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }

    // USERS
    public function listUsers(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        $users = MongoService::find('users', $filter, ['projection' => ['_id' => 0, 'password_hash' => 0]]);
        return response()->json($users);
    }

    public function updateUser(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);

        $updates = array_filter($request->only(['name', 'email', 'role', 'status', 'department', 'designation', 'custom_role']), fn($v) => $v !== null);
        if (isset($updates['role']) && !in_array($updates['role'], ['employee', 'hr_manager'])) {
            return response()->json(['detail' => 'Invalid role. Use employee or hr_manager'], 400);
        }
        $updates['updated_at'] = now()->toISOString();
        MongoService::updateOne('users', ['employee_id' => $employeeId], $updates);
        $updated = MongoService::findOneNoId('users', ['employee_id' => $employeeId]);
        unset($updated['password_hash']);
        return response()->json($updated);
    }

    public function resetPassword(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $emp = MongoService::findOneNoId('users', ['employee_id' => $employeeId]);
        if (!$emp) return response()->json(['detail' => 'User not found'], 404);

        $newPassword = $emp['mobile'] ?? 'temp123456';
        MongoService::collection('users')->updateOne(
            ['employee_id' => $employeeId],
            ['$set' => ['password_hash' => AuthHelper::hashPassword($newPassword), 'first_login' => true]]
        );
        return response()->json(['message' => "Password reset. New password: {$newPassword}", 'new_password' => $newPassword]);
    }
}
