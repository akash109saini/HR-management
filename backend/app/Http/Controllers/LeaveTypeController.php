<?php

namespace App\Http\Controllers;

use App\Models\LeaveType;
use Illuminate\Http\Request;
use App\Helpers\AuthHelper;

class LeaveTypeController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(LeaveType::orderBy('name', 'asc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|unique:tenant.leave_types,name',
            'days_allotted' => 'required|integer|min:0',
            'is_paid' => 'boolean',
            'description' => 'nullable|string',
        ]);

        $leaveType = LeaveType::create($validated);
        return response()->json($leaveType, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $leaveType = LeaveType::find($id);
        if (!$leaveType) return response()->json(['detail' => 'Leave type not found'], 404);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|unique:tenant.leave_types,name,' . $id,
            'days_allotted' => 'sometimes|required|integer|min:0',
            'is_paid' => 'boolean',
            'description' => 'nullable|string',
        ]);

        $leaveType->update($validated);
        return response()->json($leaveType);
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $leaveType = LeaveType::find($id);
        if (!$leaveType) return response()->json(['detail' => 'Leave type not found'], 404);

        $leaveType->delete();
        return response()->json(['message' => 'Leave type deleted']);
    }
}
