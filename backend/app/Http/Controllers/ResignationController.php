<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Resignation;
use App\Models\User;
use App\Models\Notification;
use Illuminate\Support\Str;

class ResignationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = Resignation::query();

        if ($user['role'] === 'employee') {
            $query->where('employee_id', $user['employee_id'] ?? '');
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        $request->validate(['reason' => 'required', 'resignation_date' => 'required|date']);

        $empId = $request->employee_id ?? $user['employee_id'] ?? '';
        $emp = User::where('employee_id', $empId)->first();

        $resignation = Resignation::create([
            'employee_id' => $empId,
            'employee_name' => $emp->name ?? $user['name'] ?? '',
            'resignation_date' => $request->resignation_date,
            'last_working_date' => $request->last_working_date ?? '',
            'notice_period' => (int)($request->notice_period ?? 30),
            'reason' => $request->reason,
            'status' => 'pending',
            'created_by' => $user['name'] ?? $user['email'],
        ]);

        // Notify HR managers
        $hrs = User::where('role', 'hr_manager')->get();
        foreach ($hrs as $hr) {
            Notification::create([
                'user_id' => $hr->employee_id ?? '',
                'type' => 'resignation',
                'title' => 'New Resignation',
                'message' => ($emp->name ?? 'Employee') . " submitted resignation for {$request->resignation_date}",
                'read' => false,
            ]);
        }

        return response()->json($resignation, 201);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $resignation = Resignation::find($id);
        if (!$resignation) {
            return response()->json(['detail' => 'Resignation not found'], 404);
        }

        $updates = array_filter($request->only(['status', 'last_working_date', 'notice_period']), fn($v) => $v !== null);

        if (isset($updates['status']) && $updates['status'] === 'approved') {
            User::where('employee_id', $resignation->employee_id)->update(['status' => 'resigned']);
            
            Notification::create([
                'user_id' => $resignation->employee_id,
                'type' => 'resignation_approved',
                'title' => 'Resignation Approved',
                'message' => 'Your resignation has been approved.',
                'read' => false,
            ]);
        }

        $resignation->update($updates);
        return response()->json($resignation->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        Resignation::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
