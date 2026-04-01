<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if (in_array($user['role'], ['hr_manager', 'employee'])) {
            $filter['tenant_id'] = $user['tenant_id'] ?? '';
        } elseif ($user['role'] === 'super_admin' && $request->query('tenant_id')) {
            $filter['tenant_id'] = $request->query('tenant_id');
        }
        $departments = MongoService::find('departments', $filter, ['projection' => ['_id' => 0], 'sort' => ['name' => 1]]);

        // Enrich with employee count
        foreach ($departments as &$dept) {
            $dept['employee_count'] = MongoService::count('users', [
                'tenant_id' => $dept['tenant_id'] ?? '',
                'department' => $dept['name'],
                'role' => ['$in' => ['employee', 'hr_manager']],
            ]);
        }
        return response()->json($departments);
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        $request->validate(['name' => 'required']);

        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id', '');
        $existing = MongoService::findOneNoId('departments', ['name' => $request->name, 'tenant_id' => $tenantId]);
        if ($existing) return response()->json(['detail' => 'Department already exists'], 400);

        $dept = [
            'id' => (string)Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => $request->name,
            'description' => $request->description ?? '',
            'head' => $request->head ?? '',
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('departments', $dept);
        $dept['employee_count'] = 0;
        return response()->json($dept, 201);
    }

    public function update(Request $request, string $deptId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        $updates = array_filter($request->only(['name', 'description', 'head']), fn($v) => $v !== null);

        $oldDept = MongoService::findOneNoId('departments', ['id' => $deptId]);
        MongoService::updateOne('departments', ['id' => $deptId], $updates);

        // Update employee department names if department name changed
        if (isset($updates['name']) && $oldDept && $oldDept['name'] !== $updates['name']) {
            MongoService::collection('users')->updateMany(
                ['department' => $oldDept['name'], 'tenant_id' => $oldDept['tenant_id'] ?? ''],
                ['$set' => ['department' => $updates['name']]]
            );
        }

        $dept = MongoService::findOneNoId('departments', ['id' => $deptId]);
        if ($dept) {
            $dept['employee_count'] = MongoService::count('users', [
                'tenant_id' => $dept['tenant_id'] ?? '', 'department' => $dept['name'],
                'role' => ['$in' => ['employee', 'hr_manager']],
            ]);
        }
        return response()->json($dept);
    }

    public function destroy(Request $request, string $deptId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        MongoService::deleteOne('departments', ['id' => $deptId]);
        return response()->json(['message' => 'Department deleted']);
    }
}
