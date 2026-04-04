<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class LeaveController extends Controller
{
    public function store(Request $request)
    {
        $user = $request->auth_user;
        $request->validate(['leave_type' => 'required', 'start_date' => 'required', 'end_date' => 'required', 'reason' => 'required']);
        $leave = [
            'id' => (string)Str::uuid(), 'user_id' => $user['employee_id'] ?? $user['email'],
            'user_name' => $user['name'] ?? '', 'tenant_id' => $user['tenant_id'] ?? '',
            'leave_type' => $request->leave_type, 'start_date' => $request->start_date,
            'end_date' => $request->end_date, 'reason' => $request->reason,
            'status' => 'pending', 'reviewed_by' => null, 'reviewer_note' => '', 'reviewed_at' => null,
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('leaves', $leave);
        return response()->json($leave);
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'employee') {
            $filter['user_id'] = $user['employee_id'] ?? $user['email'];
            $filter['tenant_id'] = $user['tenant_id'] ?? '';
        } elseif ($user['role'] === 'hr_manager') {
            $filter['tenant_id'] = $user['tenant_id'] ?? '';
        }
        if ($status = $request->query('status')) $filter['status'] = $status;
        return response()->json(MongoService::find('leaves', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function update(Request $request, string $leaveId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['status' => 'required']);
        $leave = MongoService::findOneNoId('leaves', ['id' => $leaveId]);
        if (!$leave) return response()->json(['detail' => 'Leave not found'], 404);

        MongoService::updateOne('leaves', ['id' => $leaveId], [
            'status' => $request->status, 'reviewed_by' => $user['name'] ?? $user['email'],
            'reviewer_note' => $request->reviewer_note ?? '', 'reviewed_at' => now()->toISOString(),
        ]);

        if ($request->status === 'approved') {
            $start = new \DateTime($leave['start_date']);
            $end = new \DateTime($leave['end_date']);
            $days = $end->diff($start)->days + 1;
            $leaveType = $leave['leave_type'];
            MongoService::increment('users', ['employee_id' => $leave['user_id']], "leave_balance.{$leaveType}", -$days);
        }

        // Send email notification
        $emp = MongoService::findOneNoId('users', ['employee_id' => $leave['user_id']]);
        if ($emp && isset($emp['email'])) {
            \App\Services\EmailService::sendLeaveApproval($emp['email'], $request->status, $leave['leave_type'], "{$leave['start_date']} to {$leave['end_date']}");
        }

        return response()->json(MongoService::findOneNoId('leaves', ['id' => $leaveId]));
    }

    public function balance(Request $request)
    {
        $user = $request->auth_user;
        $userDoc = MongoService::findOneNoId('users', ['email' => $user['email']]);
        return response()->json($userDoc['leave_balance'] ?? ['casual' => 12, 'sick' => 10, 'earned' => 15]);
    }
}
