<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Termination;
use App\Models\User;
use App\Models\Notification;
use Illuminate\Support\Str;

class TerminationController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(Termination::orderBy('created_at', 'desc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['employee_id' => 'required', 'termination_type' => 'required', 'termination_date' => 'required|date']);

        $emp = User::where('employee_id', $request->employee_id)->first();
        if (!$emp) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        $termination = Termination::create([
            'employee_id' => $request->employee_id,
            'employee_name' => $emp->name ?? '',
            'termination_type' => $request->termination_type,
            'termination_date' => $request->termination_date,
            'description' => $request->description ?? '',
            'status' => 'pending',
            'created_by' => $user['name'] ?? $user['email'],
        ]);

        // Create notification
        Notification::create([
            'user_id' => $request->employee_id,
            'type' => 'termination',
            'title' => 'Termination Notice',
            'message' => "Termination ({$request->termination_type}) scheduled for {$request->termination_date}",
            'read' => false,
        ]);

        return response()->json($termination, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $termination = Termination::find($id);
        if (!$termination) {
            return response()->json(['detail' => 'Termination not found'], 404);
        }

        $updates = array_filter($request->only(['termination_type', 'termination_date', 'description', 'status']), fn($v) => $v !== null);

        if (isset($updates['status']) && $updates['status'] === 'completed') {
            User::where('employee_id', $termination->employee_id)->update(['status' => 'terminated']);
        }

        $termination->update($updates);
        return response()->json($termination->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        Termination::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
