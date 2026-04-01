<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class ResignationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        elseif ($user['role'] === 'employee') $filter['employee_id'] = $user['employee_id'] ?? '';
        return response()->json(MongoService::find('resignations', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        $request->validate(['reason' => 'required', 'resignation_date' => 'required']);

        $empId = $request->employee_id ?? $user['employee_id'] ?? '';
        $emp = MongoService::findOneNoId('users', ['employee_id' => $empId]);

        $resignation = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'employee_id' => $empId, 'employee_name' => $emp['name'] ?? $user['name'] ?? '',
            'resignation_date' => $request->resignation_date,
            'last_working_date' => $request->last_working_date ?? '',
            'notice_period' => (int)($request->notice_period ?? 30),
            'reason' => $request->reason, 'status' => 'pending',
            'created_by' => $user['name'] ?? $user['email'],
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('resignations', $resignation);

        // Notify HR managers
        $hrs = MongoService::find('users', ['tenant_id' => $user['tenant_id'] ?? '', 'role' => 'hr_manager'], ['projection' => ['_id' => 0, 'employee_id' => 1]]);
        foreach ($hrs as $hr) {
            MongoService::insertOne('notifications', [
                'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
                'user_id' => $hr['employee_id'] ?? '', 'type' => 'resignation',
                'title' => 'New Resignation', 'message' => ($emp['name'] ?? 'Employee') . " submitted resignation for {$request->resignation_date}",
                'read' => false, 'created_at' => now()->toISOString(),
            ]);
        }

        return response()->json($resignation, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['status', 'last_working_date', 'notice_period']), fn($v) => $v !== null);

        if (isset($updates['status']) && $updates['status'] === 'approved') {
            $res = MongoService::findOneNoId('resignations', ['id' => $id]);
            if ($res) {
                MongoService::updateOne('users', ['employee_id' => $res['employee_id']], ['status' => 'resigned']);
                MongoService::insertOne('notifications', [
                    'id' => (string)Str::uuid(), 'tenant_id' => $res['tenant_id'] ?? '',
                    'user_id' => $res['employee_id'], 'type' => 'resignation_approved',
                    'title' => 'Resignation Approved', 'message' => 'Your resignation has been approved.',
                    'read' => false, 'created_at' => now()->toISOString(),
                ]);
            }
        }

        MongoService::updateOne('resignations', ['id' => $id], $updates);
        return response()->json(MongoService::findOneNoId('resignations', ['id' => $id]));
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('resignations', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
