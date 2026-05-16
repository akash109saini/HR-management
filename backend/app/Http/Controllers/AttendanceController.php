<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Attendance;
use App\Models\PunchCorrection;
use App\Models\User;
use Illuminate\Support\Str;
use Carbon\Carbon;

class AttendanceController extends Controller
{
    public function clockIn(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] === 'super_admin') {
            return response()->json(['detail' => 'Super Admin cannot clock in'], 400);
        }

        $today = now()->format('Y-m-d');
        $empId = $user['id'];

        $existing = Attendance::where('user_id', $empId)
            ->where('date', $today)
            ->first();

        if ($existing && $existing->clock_in) {
            return response()->json(['detail' => 'Already clocked in today'], 400);
        }

        $record = Attendance::create([
            'user_id' => $empId,
            'date' => $today,
            'clock_in' => now()->toIso8601String(),
            'status' => 'present',
            'note' => $request->note ?? '',
            'total_hours' => 0,
        ]);

        return response()->json($record);
    }

    public function clockOut(Request $request)
    {
        $user = $request->auth_user;
        $today = now()->format('Y-m-d');
        $empId = $user['id'];

        $record = Attendance::where('user_id', $empId)
            ->where('date', $today)
            ->first();

        if (!$record) {
            return response()->json(['detail' => 'No clock-in record found for today'], 400);
        }
        if ($record->clock_out) {
            return response()->json(['detail' => 'Already clocked out'], 400);
        }

        $clockOut = now();
        $clockIn = Carbon::parse($record->clock_in);
        $totalHours = round($clockOut->diffInSeconds($clockIn) / 3600, 2);

        $record->update([
            'clock_out' => $clockOut->toIso8601String(),
            'total_hours' => $totalHours
        ]);

        return response()->json($record->fresh());
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = Attendance::query();

        if ($user['role'] === 'employee') {
            $query->where('user_id', $user['id']);
        } elseif ($user['role'] === 'hr_manager') {
            if ($empId = $request->query('employee_id')) {
                $query->where('user_id', $empId);
            }
        }

        if ($month = $request->query('month')) {
            $query->where('date', 'like', "{$month}%");
        }

        if ($source = $request->query('source')) {
            $query->where('source', $source);
        }

        $records = $query->orderBy('date', 'desc')->limit(1000)->get();

        // Enrich with user name
        $userIds = $records->pluck('user_id')->unique();
        $users = \App\Models\User::whereIn('id', $userIds)->get()->keyBy('id');

        $enriched = $records->map(function ($record) use ($users) {
            $arr = $record->toArray();
            $u = $users->get($record->user_id);
            $arr['user_name'] = $u ? $u->name : null;
            $arr['employee_id_display'] = $u ? $u->employee_id : null;
            return $arr;
        });

        return response()->json($enriched);
    }

    public function today(Request $request)
    {
        $user = $request->auth_user;
        $today = now()->format('Y-m-d');
        
        $record = Attendance::where('user_id', $user['id'])
            ->where('date', $today)
            ->first();

        return response()->json($record ?? ['clocked_in' => false]);
    }

    public function submitCorrection(Request $request)
    {
        $user = $request->auth_user;
        $request->validate([
            'date' => 'required',
            'correction_type' => 'required',
            'requested_time' => 'required',
            'reason' => 'required'
        ]);

        $correction = PunchCorrection::create([
            'user_id' => $user['id'],
            'date' => $request->date,
            'type' => $request->correction_type,
            'requested_time' => $request->requested_time,
            'reason' => $request->reason,
            'status' => 'pending',
        ]);

        return response()->json($correction);
    }

    public function listCorrections(Request $request)
    {
        $user = $request->auth_user;
        $query = PunchCorrection::query();

        if ($user['role'] === 'employee') {
            $query->where('user_id', $user['id']);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $records = $query->orderBy('created_at', 'desc')->get();
        return response()->json($records);
    }

    public function reviewCorrection(Request $request, string $correctionId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['status' => 'required']);
        
        $correction = PunchCorrection::find($correctionId);
        if (!$correction) {
            return response()->json(['detail' => 'Correction not found'], 404);
        }

        $correction->update([
            'status' => $request->status,
            'reviewed_by' => $user['name'] ?? $user['email'],
            'reviewer_note' => $request->reviewer_note ?? '',
            'reviewed_at' => now(),
        ]);

        if ($request->status === 'approved') {
            // Construct a proper ISO 8601 string: DATE + "T" + TIME + ":00Z"
            $fullIso = $correction->date . 'T' . $correction->requested_time . ':00Z';
            
            Attendance::where('user_id', $correction->user_id)
                ->where('date', $correction->date)
                ->update([
                    $correction->type === 'clock_in' ? 'clock_in' : 'clock_out' => $fullIso
                ]);
        }

        // Send email notification (mocking based on existing logic)
        $emp = User::find($correction->user_id);
        if ($emp && $emp->email) {
            try {
                \App\Services\EmailService::sendPunchCorrectionUpdate($emp->email, $request->status, $correction->date);
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to send correction email: " . $e->getMessage());
            }
        }

        return response()->json($correction->fresh());
    }
}
