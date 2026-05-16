<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        
        $departments = Department::orderBy('name', 'asc')->get();

        foreach ($departments as $dept) {
            $dept->employee_count = User::where('department', $dept->name)
                ->whereIn('role', ['employee', 'hr_manager'])
                ->count();
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

        $existing = Department::where('name', $request->name)->first();

        if ($existing) return response()->json(['detail' => 'Department already exists'], 400);

        $dept = Department::create([
            'name' => $request->name,
            'description' => $request->description ?? '',
            'head' => $request->head ?? '',
        ]);

        $dept->employee_count = 0;
        return response()->json($dept, 201);
    }

    public function update(Request $request, string $deptId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        
        $dept = Department::find($deptId);
        if (!$dept) return response()->json(['detail' => 'Department not found'], 404);

        $oldName = $dept->name;
        $updates = array_filter($request->only(['name', 'description', 'head']), fn($v) => $v !== null);
        $dept->update($updates);

        if (isset($updates['name']) && $oldName !== $updates['name']) {
            User::where('department', $oldName)
                ->update(['department' => $updates['name']]);
        }

        $dept->employee_count = User::where('department', $dept->name)
            ->whereIn('role', ['employee', 'hr_manager'])
            ->count();

        return response()->json($dept);
    }

    public function destroy(Request $request, string $deptId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        
        Department::destroy($deptId);
        return response()->json(['message' => 'Department deleted']);
    }
}
