<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SalaryAdvance;
use App\Models\User;
use Illuminate\Support\Str;

class SalaryAdvanceController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = SalaryAdvance::query();

        if ($user['role'] === 'employee') {
            $query->where('user_id', $user['id']);
        }

        if ($request->has('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate([
            'employee_id' => 'required|string',
            'amount' => 'required|numeric|min:1',
            'reason' => 'nullable|string',
            'date_issued' => 'required|date',
        ]);

        $employee = User::where('employee_id', $request->employee_id)->first();
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        $advance = SalaryAdvance::create([
            'user_id' => $employee->id,
            'employee_id' => $request->employee_id,
            'amount' => $request->amount,
            'reason' => $request->reason,
            'date_issued' => $request->date_issued,
            'status' => 'pending',
        ]);

        return response()->json($advance, 201);
    }

    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $advance = SalaryAdvance::find($id);
        if (!$advance) {
            return response()->json(['detail' => 'Advance record not found'], 404);
        }

        if ($advance->status === 'paid') {
            return response()->json(['detail' => 'Cannot delete an advance that has already been deducted'], 400);
        }

        $advance->delete();
        return response()->json(['detail' => 'Advance record deleted']);
    }
}
