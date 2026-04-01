<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class HolidayController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if (in_array($user['role'], ['hr_manager', 'employee'])) $filter['tenant_id'] = $user['tenant_id'] ?? '';
        if ($year = $request->query('year')) $filter['date'] = ['$regex' => "^{$year}"];
        return response()->json(MongoService::find('holidays', $filter, ['projection' => ['_id' => 0], 'sort' => ['date' => 1]]));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['name' => 'required', 'date' => 'required']);
        $holiday = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'name' => $request->name, 'date' => $request->date,
            'type' => $request->type ?? 'public', 'description' => $request->description ?? '',
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('holidays', $holiday);
        return response()->json($holiday, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['name', 'date', 'type', 'description']), fn($v) => $v !== null);
        MongoService::updateOne('holidays', ['id' => $id], $updates);
        return response()->json(MongoService::findOneNoId('holidays', ['id' => $id]));
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('holidays', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
