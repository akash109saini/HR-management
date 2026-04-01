<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class DesignationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if (in_array($user['role'], ['hr_manager', 'employee'])) $filter['tenant_id'] = $user['tenant_id'] ?? '';
        $designations = MongoService::find('designations', $filter, ['projection' => ['_id' => 0], 'sort' => ['level' => 1]]);
        foreach ($designations as &$d) {
            $d['employee_count'] = MongoService::count('users', ['tenant_id' => $d['tenant_id'] ?? '', 'designation' => $d['name'], 'role' => ['$in' => ['employee', 'hr_manager']]]);
        }
        return response()->json($designations);
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['name' => 'required']);
        $designation = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'name' => $request->name, 'level' => (int)($request->level ?? 1),
            'description' => $request->description ?? '', 'status' => 'active',
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('designations', $designation);
        $designation['employee_count'] = 0;
        return response()->json($designation, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $old = MongoService::findOneNoId('designations', ['id' => $id]);
        $updates = array_filter($request->only(['name', 'level', 'description', 'status']), fn($v) => $v !== null);
        MongoService::updateOne('designations', ['id' => $id], $updates);
        if (isset($updates['name']) && $old && $old['name'] !== $updates['name']) {
            MongoService::collection('users')->updateMany(['designation' => $old['name'], 'tenant_id' => $old['tenant_id'] ?? ''], ['$set' => ['designation' => $updates['name']]]);
        }
        return response()->json(MongoService::findOneNoId('designations', ['id' => $id]));
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('designations', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
