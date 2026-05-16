<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SalarySlab;
use Illuminate\Support\Str;

class SalarySlabController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(SalarySlab::orderBy('grade', 'asc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['name' => 'required', 'min_salary' => 'required|numeric', 'max_salary' => 'required|numeric']);

        $slab = SalarySlab::create([
            'name' => $request->name,
            'grade' => $request->grade ?? '',
            'min_salary' => (float)$request->min_salary,
            'max_salary' => (float)$request->max_salary,
            'components' => [
                'basic_percentage' => (float)($request->basic_percentage ?? 50),
                'hra_percentage' => (float)($request->hra_percentage ?? 20),
                'pf_percentage' => (float)($request->pf_percentage ?? 12),
            ],
            'status' => 'active',
        ]);

        return response()->json($slab, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $slab = SalarySlab::find($id);
        if (!$slab) {
            return response()->json(['detail' => 'Salary slab not found'], 404);
        }

        $updates = array_filter($request->only(['name', 'grade', 'min_salary', 'max_salary', 'basic_percentage', 'hra_percentage', 'pf_percentage', 'status']), fn($v) => $v !== null);
        
        if (isset($updates['basic_percentage']) || isset($updates['hra_percentage']) || isset($updates['pf_percentage'])) {
            $updates['components'] = [
                'basic_percentage' => (float)($updates['basic_percentage'] ?? $slab->components['basic_percentage'] ?? 50),
                'hra_percentage' => (float)($updates['hra_percentage'] ?? $slab->components['hra_percentage'] ?? 20),
                'pf_percentage' => (float)($updates['pf_percentage'] ?? $slab->components['pf_percentage'] ?? 12),
            ];
            unset($updates['basic_percentage'], $updates['hra_percentage'], $updates['pf_percentage']);
        }

        $slab->update($updates);
        return response()->json($slab->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        SalarySlab::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
