<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class TerminationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        return response()->json(MongoService::find('terminations', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['employee_id' => 'required', 'termination_type' => 'required', 'termination_date' => 'required']);

        $emp = MongoService::findOneNoId('users', ['employee_id' => $request->employee_id]);
        if (!$emp) return response()->json(['detail' => 'Employee not found'], 404);

        $termination = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'employee_id' => $request->employee_id, 'employee_name' => $emp['name'] ?? '',
            'termination_type' => $request->termination_type,
            'termination_date' => $request->termination_date,
            'description' => $request->description ?? '', 'status' => 'pending',
            'created_by' => $user['name'] ?? $user['email'],
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('terminations', $termination);

        // Create notification
        MongoService::insertOne('notifications', [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'user_id' => $request->employee_id, 'type' => 'termination',
            'title' => 'Termination Notice', 'message' => "Termination ({$request->termination_type}) scheduled for {$request->termination_date}",
            'read' => false, 'created_at' => now()->toISOString(),
        ]);

        return response()->json($termination, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['termination_type', 'termination_date', 'description', 'status']), fn($v) => $v !== null);

        if (isset($updates['status']) && $updates['status'] === 'completed') {
            $term = MongoService::findOneNoId('terminations', ['id' => $id]);
            if ($term) MongoService::updateOne('users', ['employee_id' => $term['employee_id']], ['status' => 'terminated']);
        }

        MongoService::updateOne('terminations', ['id' => $id], $updates);
        return response()->json(MongoService::findOneNoId('terminations', ['id' => $id]));
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('terminations', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
