<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class SalarySlabController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if (in_array($user['role'], ['hr_manager', 'employee'])) $filter['tenant_id'] = $user['tenant_id'] ?? '';
        return response()->json(MongoService::find('salary_slabs', $filter, ['projection' => ['_id' => 0], 'sort' => ['grade' => 1]]));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['name' => 'required', 'min_salary' => 'required|numeric', 'max_salary' => 'required|numeric']);
        $slab = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'name' => $request->name, 'grade' => $request->grade ?? '',
            'min_salary' => (float)$request->min_salary, 'max_salary' => (float)$request->max_salary,
            'basic_percentage' => (float)($request->basic_percentage ?? 50),
            'hra_percentage' => (float)($request->hra_percentage ?? 20),
            'pf_percentage' => (float)($request->pf_percentage ?? 12),
            'status' => 'active', 'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('salary_slabs', $slab);
        return response()->json($slab, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['name', 'grade', 'min_salary', 'max_salary', 'basic_percentage', 'hra_percentage', 'pf_percentage', 'status']), fn($v) => $v !== null);
        MongoService::updateOne('salary_slabs', ['id' => $id], $updates);
        return response()->json(MongoService::findOneNoId('salary_slabs', ['id' => $id]));
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('salary_slabs', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
