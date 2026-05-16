<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Designation;
use App\Models\User;
use Illuminate\Support\Str;

class DesignationController extends Controller
{
    public function index(Request $request)
    {
        $designations = Designation::orderBy('level', 'asc')->get();
        
        foreach ($designations as $d) {
            $d->employee_count = User::where('designation', $d->name)
                ->whereIn('role', ['employee', 'hr_manager'])
                ->count();
        }
        
        return response()->json($designations);
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['name' => 'required']);

        $designation = Designation::create([
            'name' => $request->name,
            'level' => (int)($request->level ?? 1),
            'description' => $request->description ?? '',
            'status' => 'active',
        ]);

        $designation->employee_count = 0;
        return response()->json($designation, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $designation = Designation::find($id);
        if (!$designation) {
            return response()->json(['detail' => 'Designation not found'], 404);
        }

        $oldName = $designation->name;
        $updates = array_filter($request->only(['name', 'level', 'description', 'status']), fn($v) => $v !== null);
        
        $designation->update($updates);

        if (isset($updates['name']) && $oldName !== $updates['name']) {
            User::where('designation', $oldName)->update(['designation' => $updates['name']]);
        }

        return response()->json($designation->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        Designation::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
