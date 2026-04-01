<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class ShiftController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if (in_array($user['role'], ['hr_manager', 'employee'])) $filter['tenant_id'] = $user['tenant_id'] ?? '';
        return response()->json(MongoService::find('shifts', $filter, ['projection' => ['_id' => 0], 'sort' => ['name' => 1]]));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['name' => 'required', 'start_time' => 'required', 'end_time' => 'required']);
        $shift = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'name' => $request->name, 'start_time' => $request->start_time,
            'end_time' => $request->end_time, 'break_duration' => $request->break_duration ?? 60,
            'working_hours' => $request->working_hours ?? 8, 'status' => 'active',
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('shifts', $shift);
        return response()->json($shift, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['name', 'start_time', 'end_time', 'break_duration', 'working_hours', 'status']), fn($v) => $v !== null);
        MongoService::updateOne('shifts', ['id' => $id], $updates);
        return response()->json(MongoService::findOneNoId('shifts', ['id' => $id]));
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('shifts', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
