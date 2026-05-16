<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Shift;
use Illuminate\Support\Str;

class ShiftController extends Controller
{
    public function index(Request $request)
    {
        // No tenant_id needed because the connection is already switched to the tenant's DB.
        return response()->json(Shift::orderBy('name', 'asc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['name' => 'required', 'start_time' => 'required', 'end_time' => 'required']);

        $shift = Shift::create([
            'name' => $request->name,
            'start_time' => $request->start_time,
            'end_time' => $request->end_time,
            'break_duration' => $request->break_duration ?? 60,
            'working_hours' => $request->working_hours ?? 8,
            'status' => 'active',
        ]);

        return response()->json($shift, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $shift = Shift::find($id);
        if (!$shift) {
            return response()->json(['detail' => 'Shift not found'], 404);
        }

        $updates = array_filter($request->only(['name', 'start_time', 'end_time', 'break_duration', 'working_hours', 'status']), fn($v) => $v !== null);
        $shift->update($updates);

        return response()->json($shift->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        Shift::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
