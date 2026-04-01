<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class AttendanceController extends Controller
{
    public function clockIn(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] === 'super_admin') return response()->json(['detail' => 'Super Admin cannot clock in'], 400);
        $today = now()->format('Y-m-d');
        $empId = $user['employee_id'] ?? $user['email'];

        $existing = MongoService::findOneNoId('attendance', ['user_id' => $empId, 'date' => $today, 'tenant_id' => $user['tenant_id'] ?? '']);
        if ($existing && isset($existing['clock_in'])) return response()->json(['detail' => 'Already clocked in today'], 400);

        $record = [
            'id' => (string)Str::uuid(), 'user_id' => $empId, 'user_name' => $user['name'] ?? '',
            'tenant_id' => $user['tenant_id'] ?? '', 'date' => $today, 'clock_in' => now()->toISOString(),
            'clock_out' => null, 'total_hours' => 0, 'status' => 'present', 'note' => $request->note ?? '',
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('attendance', $record);
        return response()->json($record);
    }

    public function clockOut(Request $request)
    {
        $user = $request->auth_user;
        $today = now()->format('Y-m-d');
        $empId = $user['employee_id'] ?? $user['email'];
        $record = MongoService::findOneNoId('attendance', ['user_id' => $empId, 'date' => $today, 'tenant_id' => $user['tenant_id'] ?? '']);
        if (!$record) return response()->json(['detail' => 'No clock-in record found for today'], 400);
        if (!empty($record['clock_out'])) return response()->json(['detail' => 'Already clocked out'], 400);

        $clockOut = now();
        $clockIn = new \DateTime($record['clock_in']);
        $totalHours = round(($clockOut->timestamp - $clockIn->getTimestamp()) / 3600, 2);
        MongoService::updateOne('attendance', ['id' => $record['id']], ['clock_out' => $clockOut->toISOString(), 'total_hours' => $totalHours]);
        $record['clock_out'] = $clockOut->toISOString();
        $record['total_hours'] = $totalHours;
        return response()->json($record);
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
            if ($empId = $request->query('employee_id')) $filter['user_id'] = $empId;
        } else {
            if ($tenantId = $request->query('tenant_id')) $filter['tenant_id'] = $tenantId;
        }
        if ($month = $request->query('month')) $filter['date'] = ['$regex' => "^{$month}"];

        $records = MongoService::find('attendance', $filter, ['projection' => ['_id' => 0], 'sort' => ['date' => -1], 'limit' => 1000]);
        return response()->json($records);
    }

    public function today(Request $request)
    {
        $user = $request->auth_user;
        $today = now()->format('Y-m-d');
        $record = MongoService::findOneNoId('attendance', ['user_id' => $user['employee_id'] ?? $user['email'], 'date' => $today, 'tenant_id' => $user['tenant_id'] ?? '']);
        return response()->json($record ?? ['clocked_in' => false]);
    }

    public function submitCorrection(Request $request)
    {
        $user = $request->auth_user;
        $request->validate(['date' => 'required', 'correction_type' => 'required', 'requested_time' => 'required', 'reason' => 'required']);
        $correction = [
            'id' => (string)Str::uuid(), 'user_id' => $user['employee_id'] ?? $user['email'],
            'user_name' => $user['name'] ?? '', 'tenant_id' => $user['tenant_id'] ?? '',
            'date' => $request->date, 'correction_type' => $request->correction_type,
            'requested_time' => $request->requested_time, 'reason' => $request->reason,
            'status' => 'pending', 'reviewed_by' => null, 'reviewer_note' => '', 'reviewed_at' => null,
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('punch_corrections', $correction);
        return response()->json($correction);
    }

    public function listCorrections(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'employee') $filter['user_id'] = $user['employee_id'] ?? $user['email'];
        elseif ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        if ($status = $request->query('status')) $filter['status'] = $status;
        return response()->json(MongoService::find('punch_corrections', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function reviewCorrection(Request $request, string $correctionId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['status' => 'required']);
        $correction = MongoService::findOneNoId('punch_corrections', ['id' => $correctionId]);
        if (!$correction) return response()->json(['detail' => 'Correction not found'], 404);

        MongoService::updateOne('punch_corrections', ['id' => $correctionId], [
            'status' => $request->status, 'reviewed_by' => $user['name'] ?? $user['email'],
            'reviewer_note' => $request->reviewer_note ?? '', 'reviewed_at' => now()->toISOString(),
        ]);

        if ($request->status === 'approved') {
            $field = $correction['correction_type'] === 'clock_in' ? 'clock_in' : 'clock_out';
            MongoService::updateOne('attendance', ['user_id' => $correction['user_id'], 'date' => $correction['date'], 'tenant_id' => $correction['tenant_id']], [$field => $correction['requested_time']]);
        }
        return response()->json(MongoService::findOneNoId('punch_corrections', ['id' => $correctionId]));
    }
}
