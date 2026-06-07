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
            $arr['biometric_pin'] = $u ? $u->biometric_pin : null;
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

        // Find or create attendance record for this date
        $attendance = Attendance::where('user_id', $user['id'])
            ->where('date', $request->date)
            ->first();

        if (!$attendance) {
            $attendance = Attendance::create([
                'user_id' => $user['id'],
                'date' => $request->date,
                'status' => 'absent',
                'total_hours' => 0,
            ]);
        }

        $correctedTime = Carbon::parse($request->date . ' ' . $request->requested_time);

        $correction = PunchCorrection::create([
            'attendance_id' => $attendance->id,
            'user_id' => $user['id'],
            'type' => $request->correction_type,
            'corrected_time' => $correctedTime,
            'reason' => $request->reason,
            'status' => 'pending',
        ]);

        $arr = $correction->toArray();
        $arr['correction_type'] = $correction->type;
        $arr['date'] = $request->date;
        $arr['requested_time'] = $request->requested_time;
        return response()->json($arr);
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

        // Enrich with user name & user_id details
        $userIds = $records->pluck('user_id')->unique();
        $users = User::whereIn('id', $userIds)->get()->keyBy('id');

        $enriched = $records->map(function ($record) use ($users) {
            $arr = $record->toArray();
            $arr['correction_type'] = $record->type;

            // Extract date and time from corrected_time
            $correctedTime = Carbon::parse($record->corrected_time);
            $arr['date'] = $correctedTime->format('Y-m-d');
            $arr['requested_time'] = $correctedTime->format('H:i');

            $u = $users->get($record->user_id);
            $arr['user_name'] = $u ? $u->name : '';
            $arr['user_id'] = $u ? ($u->employee_id ?? $record->user_id) : $record->user_id;
            return $arr;
        });

        return response()->json($enriched);
    }

    public function reviewCorrection(Request $request, string $correctionId)
    {
        $user = $request->auth_user;
        $request->validate(['status' => 'required']);
        
        $correction = PunchCorrection::find($correctionId);
        if (!$correction) {
            return response()->json(['detail' => 'Correction not found'], 404);
        }

        // Find requester
        $requester = User::find($correction->user_id);
        if (!$requester) {
            return response()->json(['detail' => 'Requester not found'], 404);
        }

        // Check if reviewer is authorized
        $isAuthorized = false;
        if (in_array($user['role'], ['super_admin', 'hr_manager'])) {
            $isAuthorized = true;
        } else {
            // Check if reviewer is a level 1 employee and requester is level > 1
            $requesterDesignationName = $requester->designation ?? '';
            $requesterDesignation = null;
            if ($requesterDesignationName) {
                $requesterDesignation = \App\Models\Designation::where('name', $requesterDesignationName)->first();
            }
            $requesterLevel = $requesterDesignation ? $requesterDesignation->level : null;

            if ($requesterLevel && $requesterLevel > 1) {
                // Reviewer must have level 1 designation
                $reviewerUser = User::find($user['id']);
                $reviewerDesignationName = $reviewerUser->designation ?? '';
                if ($reviewerDesignationName) {
                    $reviewerDesignation = \App\Models\Designation::where('name', $reviewerDesignationName)->first();
                    if ($reviewerDesignation && $reviewerDesignation->level === 1) {
                        $isAuthorized = true;
                    }
                }
            }
        }

        if (!$isAuthorized) {
            return response()->json(['detail' => 'Not authorized to approve this correction'], 403);
        }

        $correction->update([
            'status' => $request->status,
            'reviewed_by' => $user['name'] ?? ($user['email'] ?? 'System'),
            'reviewer_note' => $request->reviewer_note ?? '',
            'reviewed_at' => now(),
        ]);

        if ($request->status === 'approved') {
            // Use the date and time from the correction's corrected_time column
            $correctedTime = Carbon::parse($correction->corrected_time);
            
            $attendance = Attendance::find($correction->attendance_id);
            if (!$attendance) {
                // Fallback search by date
                $attendance = Attendance::where('user_id', $correction->user_id)
                    ->where('date', $correctedTime->format('Y-m-d'))
                    ->first();
            }

            if ($correction->type === 'both') {
                // Resolve shift times for user
                $employee = User::find($correction->user_id);
                $shiftStart = '09:00';
                $shiftEnd = '18:00';
                $shiftName = $employee->shift ?? '';
                if ($shiftName) {
                    $shift = \App\Models\Shift::where('name', $shiftName)->first();
                    if ($shift) {
                        $shiftStart = substr($shift->start_time, 0, 5);
                        $shiftEnd = substr($shift->end_time, 0, 5);
                    }
                }
                $dateStr = $correctedTime->format('Y-m-d');
                $fullIsoIn = Carbon::parse($dateStr . ' ' . $shiftStart, 'Asia/Kolkata')->toIso8601String();
                $fullIsoOut = Carbon::parse($dateStr . ' ' . $shiftEnd, 'Asia/Kolkata')->toIso8601String();
                
                if ($attendance) {
                    $attendance->update([
                        'clock_in' => $fullIsoIn,
                        'clock_out' => $fullIsoOut,
                        'status' => 'present',
                    ]);
                } else {
                    $attendance = Attendance::create([
                        'user_id' => $correction->user_id,
                        'date' => $dateStr,
                        'clock_in' => $fullIsoIn,
                        'clock_out' => $fullIsoOut,
                        'status' => 'present',
                        'total_hours' => 0,
                    ]);
                }
            } elseif ($correction->type === 'missed_punch') {
                // Resolve shift times for user
                $employee = User::find($correction->user_id);
                $shiftStart = '09:00';
                $shiftEnd = '18:00';
                $shiftName = $employee->shift ?? '';
                if ($shiftName) {
                    $shift = \App\Models\Shift::where('name', $shiftName)->first();
                    if ($shift) {
                        $shiftStart = substr($shift->start_time, 0, 5);
                        $shiftEnd = substr($shift->end_time, 0, 5);
                    }
                }
                $dateStr = $correctedTime->format('Y-m-d');
                $fullIsoIn = Carbon::parse($dateStr . ' ' . $shiftStart, 'Asia/Kolkata')->toIso8601String();
                $fullIsoOut = Carbon::parse($dateStr . ' ' . $shiftEnd, 'Asia/Kolkata')->toIso8601String();

                if ($attendance) {
                    if (!$attendance->clock_in && !$attendance->clock_out) {
                        $attendance->update([
                            'clock_in' => $fullIsoIn,
                            'clock_out' => $fullIsoOut,
                            'status' => 'present',
                        ]);
                    } elseif (!$attendance->clock_in) {
                        $attendance->update([
                            'clock_in' => $fullIsoIn,
                            'status' => 'present',
                        ]);
                    } else {
                        $attendance->update([
                            'clock_out' => $fullIsoOut,
                            'status' => 'present',
                        ]);
                    }
                } else {
                    $attendance = Attendance::create([
                        'user_id' => $correction->user_id,
                        'date' => $dateStr,
                        'clock_in' => $fullIsoIn,
                        'status' => 'present',
                        'total_hours' => 0,
                    ]);
                }
            } else {
                $fullIso = $correctedTime->toIso8601String();
                $field = $correction->type === 'clock_in' ? 'clock_in' : 'clock_out';

                if ($attendance) {
                    $attendance->update([
                        $field => $fullIso,
                        'status' => 'present',
                    ]);
                } else {
                    $attendance = Attendance::create([
                        'user_id' => $correction->user_id,
                        'date' => $correctedTime->format('Y-m-d'),
                        $field => $fullIso,
                        'status' => 'present',
                        'total_hours' => 0,
                    ]);
                }
            }

            // Recalculate total hours if both are set
            if ($attendance && $attendance->clock_in && $attendance->clock_out) {
                $in = Carbon::parse($attendance->clock_in);
                $out = Carbon::parse($attendance->clock_out);
                $attendance->update([
                    'total_hours' => round(abs($out->diffInSeconds($in)) / 3600, 2)
                ]);
            }
        }

        // Send email notification
        $emp = User::find($correction->user_id);
        if ($emp && $emp->email) {
            try {
                \App\Services\EmailService::sendPunchCorrectionUpdate(
                    $emp->email, 
                    $request->status, 
                    Carbon::parse($correction->corrected_time)->format('Y-m-d')
                );
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to send correction email: " . $e->getMessage());
            }
        }

        $updated = $correction->fresh();
        $arr = $updated->toArray();
        $arr['correction_type'] = $updated->type;
        $correctedTime = Carbon::parse($updated->corrected_time);
        $arr['date'] = $correctedTime->format('Y-m-d');
        $arr['requested_time'] = $correctedTime->format('H:i');
        return response()->json($arr);
    }

    public function getCalendar(Request $request)
    {
        $user = $request->auth_user;
        $monthParam = $request->query('month');
        if (!$monthParam) {
            return response()->json(['detail' => 'month param required (YYYY-MM)'], 400);
        }

        if (!preg_match('/^\d{4}-\d{2}$/', $monthParam)) {
            return response()->json(['detail' => 'Invalid month format'], 400);
        }

        [$year, $mon] = explode('-', $monthParam);
        $year = (int)$year;
        $mon = (int)$mon;

        // Resolve which employee to show
        if ($user['role'] === 'employee') {
            $targetUserId = $user['id'];
        } elseif (in_array($user['role'], ['hr_manager', 'super_admin'])) {
            $empIdParam = $request->query('employee_id');
            if ($empIdParam) {
                // Find user by id (UUID) or employee_id (e.g. EMP-ACME-002)
                $emp = User::where('id', $empIdParam)
                    ->orWhere('employee_id', $empIdParam)
                    ->first();
                if (!$emp) {
                    return response()->json(['detail' => 'Employee not found'], 404);
                }
                $targetUserId = $emp->id;
            } else {
                $targetUserId = $user['id'];
            }
        } else {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        // Fetch employee details
        $employee = User::find($targetUserId);
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        $shiftStart = '09:00';
        $shiftEnd = '18:00';
        $shiftName = $employee->shift ?? '';
        if ($shiftName) {
            $shift = \App\Models\Shift::where('name', $shiftName)->first();
            if ($shift) {
                $shiftStart = substr($shift->start_time, 0, 5); // Ensure HH:MM
                $shiftEnd = substr($shift->end_time, 0, 5); // Ensure HH:MM
            }
        }

        $shiftStartMins = $this->timeToMinutes($shiftStart);
        $shiftEndMins = $this->timeToMinutes($shiftEnd);

        // Fetch biometric raw logs for this month
        $bioPin = $employee->biometric_pin;
        $normalizedPin = ltrim((string)$bioPin, '0');
        if ($normalizedPin === '') {
            $normalizedPin = '0';
        }

        $rawLogs = \App\Models\BiometricRawLog::where(function ($query) use ($bioPin, $normalizedPin, $employee) {
            $query->where('user_pin', $bioPin)
                  ->orWhere('user_pin', $normalizedPin)
                  ->orWhereRaw("TRIM(LEADING '0' FROM user_pin) = ?", [$normalizedPin]);
            if ($employee->employee_id) {
                $query->orWhere('user_pin', $employee->employee_id);
            }
        })
        ->orderBy('punched_at', 'asc')
        ->get();

        $monthPrefix = sprintf('%04d-%02d', $year, $mon);

        // Group biometric punches by date (YYYY-MM-DD in Asia/Kolkata)
        $bioByDate = [];
        foreach ($rawLogs as $log) {
            $punchedAt = $this->parseToLocalTime($log->punched_at, true);
            if (!$punchedAt) {
                continue;
            }
            $dStr = $punchedAt->format('Y-m-d');
            if (str_starts_with($dStr, $monthPrefix)) {
                $bioByDate[$dStr][] = $punchedAt;
            }
        }

        // Fetch holidays for this month
        $holidays = \App\Models\Holiday::where('date', 'like', "{$monthPrefix}%")->get();
        $holidaySet = [];
        foreach ($holidays as $h) {
            $dateVal = $h->date;
            if ($dateVal instanceof Carbon) {
                $holidaySet[$dateVal->format('Y-m-d')] = true;
            } else {
                $holidaySet[substr((string)$dateVal, 0, 10)] = true;
            }
        }

        // Fetch attendance records for this month
        $attRecords = Attendance::where('user_id', $targetUserId)
            ->where('date', 'like', "{$monthPrefix}%")
            ->get()
            ->keyBy('date');

        $daysInMonth = Carbon::createFromDate($year, $mon, 1)->daysInMonth;
        $rows = [];

        for ($day = 1; $day <= $daysInMonth; $day++) {
            $dateStr = sprintf('%04d-%02d-%02d', $year, $mon, $day);
            $carbonDate = Carbon::createFromDate($year, $mon, $day);
            $weekday = $carbonDate->format('l');
            $isWeekend = $carbonDate->isSunday(); // Sunday only
            $isHoliday = isset($holidaySet[$dateStr]);

            $dayPunches = $bioByDate[$dateStr] ?? [];
            $attRec = $attRecords->get($dateStr);

            $firstPunchMins = null;
            $lastPunchMins = null;
            $inTimeStr = '-';
            $outTimeStr = '-';

            if (!empty($dayPunches)) {
                $fp = $dayPunches[0];
                $lp = end($dayPunches);
                $firstPunchMins = $fp->hour * 60 + $fp->minute;
                $lastPunchMins = $lp->hour * 60 + $lp->minute;
                $inTimeStr = $fp->format('H:i');
                $outTimeStr = (count($dayPunches) > 1) ? $lp->format('H:i') : '-';
            } elseif ($attRec) {
                $isBiometric = ($attRec->source === 'biometric');
                $dtIn = $this->parseToLocalTime($attRec->clock_in, $isBiometric);
                $dtOut = $this->parseToLocalTime($attRec->clock_out, $isBiometric);
                if ($dtIn) {
                    $firstPunchMins = $dtIn->hour * 60 + $dtIn->minute;
                    $inTimeStr = $dtIn->format('H:i');
                }
                if ($dtOut) {
                    $lastPunchMins = $dtOut->hour * 60 + $dtOut->minute;
                    $outTimeStr = $dtOut->format('H:i');
                }
            }

            $status = $this->computeDayStatus(
                $firstPunchMins,
                $lastPunchMins,
                $shiftStartMins,
                $shiftEndMins,
                $isWeekend,
                $isHoliday
            );

            // Working hours
            $workingHour = '-';
            if ($firstPunchMins !== null && $lastPunchMins !== null && $lastPunchMins > $firstPunchMins) {
                $totalMins = $lastPunchMins - $firstPunchMins;
                $workingHour = sprintf('%d:%02d', intdiv($totalMins, 60), $totalMins % 60);
            }

            // Late by
            $lateBy = '-';
            if ($firstPunchMins !== null && $firstPunchMins > $shiftStartMins && !in_array($status, ['WO', 'H'])) {
                $diff = $firstPunchMins - $shiftStartMins;
                $lateBy = sprintf('%d:%02d', intdiv($diff, 60), $diff % 60);
            }

            // Early by
            $earlyBy = '-';
            if ($lastPunchMins !== null && $lastPunchMins < $shiftEndMins && !in_array($status, ['WO', 'H', 'AA'])) {
                $diff = $shiftEndMins - $lastPunchMins;
                $earlyBy = sprintf('%d:%02d', intdiv($diff, 60), $diff % 60);
            }

            $isToday = ($dateStr === Carbon::now('Asia/Kolkata')->format('Y-m-d'));

            $rows[] = [
                'date' => $dateStr,
                'display_date' => $carbonDate->format('d M Y'),
                'weekday' => $weekday,
                'shift_time' => "{$shiftStart} - {$shiftEnd}",
                'in_time' => $inTimeStr,
                'out_time' => $outTimeStr,
                'working_hour' => $workingHour,
                'late_by' => $lateBy,
                'early_by' => $earlyBy,
                'status' => $status,
                'is_today' => $isToday,
            ];
        }

        return response()->json([
            'employee_id' => $employee->employee_id ?? $employee->id,
            'employee_name' => $employee->name ?? '',
            'shift' => $shiftName,
            'shift_time' => "{$shiftStart} - {$shiftEnd}",
            'month' => $monthParam,
            'rows' => $rows,
        ]);
    }

    private function timeToMinutes(string $timeStr): int
    {
        try {
            $parts = explode(':', $timeStr);
            $h = (int)($parts[0] ?? 0);
            $m = (int)($parts[1] ?? 0);
            return $h * 60 + $m;
        } catch (\Exception $e) {
            return 0;
        }
    }

    private function computeDayStatus(
        ?int $firstPunchMins,
        ?int $lastPunchMins,
        int $shiftStartMins,
        int $shiftEndMins,
        bool $isWeekend,
        bool $isHoliday
    ): string {
        if ($isHoliday) {
            return 'H';
        }
        if ($isWeekend) {
            return 'WO';
        }
        if ($firstPunchMins === null) {
            return 'AA';
        }

        $lateIn = $firstPunchMins > $shiftStartMins;
        $earlyOut = $lastPunchMins !== null && $lastPunchMins < $shiftEndMins;

        if ($lateIn && $earlyOut) {
            return 'AA';
        }
        if (!$lateIn && !$earlyOut) {
            return 'P';
        }
        return 'AHD';
    }

    private function parseToLocalTime($timeVal, $treatAsLocal = false)
    {
        if (!$timeVal) {
            return null;
        }
        try {
            if ($treatAsLocal) {
                if ($timeVal instanceof Carbon) {
                    $str = $timeVal->format('Y-m-d H:i:s');
                } else {
                    $str = (string)$timeVal;
                    if (str_contains($str, 'T')) {
                        $parts = explode('T', $str);
                        $datePart = $parts[0];
                        $timePart = substr($parts[1], 0, 8);
                        $str = "{$datePart} {$timePart}";
                    }
                }
                return Carbon::parse($str, 'Asia/Kolkata');
            } else {
                if (is_string($timeVal)) {
                    if (str_contains($timeVal, 'T') && (str_contains($timeVal, 'Z') || preg_match('/[+-]\d{2}:\d{2}/', $timeVal))) {
                        return Carbon::parse($timeVal)->setTimezone('Asia/Kolkata');
                    } else {
                        return Carbon::parse($timeVal, 'Asia/Kolkata');
                    }
                }
                if ($timeVal instanceof Carbon) {
                    return (clone $timeVal)->setTimezone('Asia/Kolkata');
                }
                return Carbon::parse($timeVal)->setTimezone('Asia/Kolkata');
            }
        } catch (\Exception $e) {
            return null;
        }
    }

    public function getCorrectionDetails(Request $request)
    {
        $user = $request->auth_user;
        $dateParam = $request->query('date');
        if (!$dateParam) {
            return response()->json(['detail' => 'date param required (YYYY-MM-DD)'], 400);
        }

        $employee = User::find($user['id']);
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        // 1. Resolve Shift Start and End
        $shiftStart = '09:00';
        $shiftEnd = '18:00';
        $shiftName = $employee->shift ?? '';
        if ($shiftName) {
            $shift = \App\Models\Shift::where('name', $shiftName)->first();
            if ($shift) {
                $shiftStart = substr($shift->start_time, 0, 5);
                $shiftEnd = substr($shift->end_time, 0, 5);
            }
        }

        // 2. Fetch Actual punches from BiometricRawLog (if any) or Attendance
        $actualIn = '-';
        $actualOut = '-';

        $bioPin = $employee->biometric_pin;
        $normalizedPin = ltrim((string)$bioPin, '0');
        if ($normalizedPin === '') {
            $normalizedPin = '0';
        }

        $rawLogs = \App\Models\BiometricRawLog::where(function ($query) use ($bioPin, $normalizedPin, $employee) {
            $query->where('user_pin', $bioPin)
                  ->orWhere('user_pin', $normalizedPin)
                  ->orWhereRaw("TRIM(LEADING '0' FROM user_pin) = ?", [$normalizedPin]);
            if ($employee->employee_id) {
                $query->orWhere('user_pin', $employee->employee_id);
            }
        })
        ->orderBy('punched_at', 'asc')
        ->get();

        $dayPunches = [];
        foreach ($rawLogs as $log) {
            $punchedAt = $this->parseToLocalTime($log->punched_at, true);
            if ($punchedAt && $punchedAt->format('Y-m-d') === $dateParam) {
                $dayPunches[] = $punchedAt;
            }
        }

        if (!empty($dayPunches)) {
            $fp = $dayPunches[0];
            $lp = end($dayPunches);
            $actualIn = $fp->format('H:i');
            $actualOut = (count($dayPunches) > 1) ? $lp->format('H:i') : '-';
        } else {
            // Fallback to Attendance table
            $attendance = Attendance::where('user_id', $user['id'])
                ->where('date', $dateParam)
                ->first();
            if ($attendance) {
                $dtIn = $this->parseToLocalTime($attendance->clock_in, ($attendance->source === 'biometric'));
                $dtOut = $this->parseToLocalTime($attendance->clock_out, ($attendance->source === 'biometric'));
                if ($dtIn) {
                    $actualIn = $dtIn->format('H:i');
                }
                if ($dtOut) {
                    $actualOut = $dtOut->format('H:i');
                }
            }
        }

        $count = \App\Models\PunchCorrection::where('user_id', $user['id'])
            ->whereDate('corrected_time', $dateParam)
            ->count();

        // Resolve Approval Authority
        $approvalAuthority = [];
        $requesterDesignationName = $employee->designation ?? '';
        $requesterDesignation = null;
        if ($requesterDesignationName) {
            $requesterDesignation = \App\Models\Designation::where('name', $requesterDesignationName)->first();
        }
        $requesterLevel = $requesterDesignation ? $requesterDesignation->level : null;

        if ($requesterLevel === 1 || !$requesterLevel) {
            // Level 1 approval goes to admin/HR
            $admins = User::whereIn('role', ['super_admin', 'hr_manager'])->get();
            foreach ($admins as $admin) {
                $approvalAuthority[] = $admin->name . ($admin->employee_id ? '(' . $admin->employee_id . ')' : '');
            }
            if (empty($approvalAuthority)) {
                $approvalAuthority[] = "Admin";
            }
        } else {
            // All other levels go to Level 1 designation
            $level1Designations = \App\Models\Designation::where('level', 1)->pluck('name');
            $approvers = User::whereIn('designation', $level1Designations)->get();
            foreach ($approvers as $appr) {
                $approvalAuthority[] = $appr->name . ($appr->employee_id ? '(' . $appr->employee_id . ')' : '');
            }
            if (empty($approvalAuthority)) {
                $admins = User::whereIn('role', ['super_admin', 'hr_manager'])->get();
                foreach ($admins as $admin) {
                    $approvalAuthority[] = $admin->name . ($admin->employee_id ? '(' . $admin->employee_id . ')' : '');
                }
            }
        }

        return response()->json([
            'shift_start' => $shiftStart,
            'shift_end' => $shiftEnd,
            'actual_in' => $actualIn,
            'actual_out' => $actualOut,
            'count' => $count,
            'approval_authority' => $approvalAuthority,
        ]);
    }

    /**
     * List biometric punches for the authenticated employee (or all for HR).
     * GET /api/attendance/punches
     */
    public function punches(Request $request)
    {
        $user = $request->auth_user;
        $role = $user['role'] ?? 'employee';

        $query = \App\Models\BiometricRawLog::query();

        if ($month = $request->query('month')) {
            $query->where('punched_at', 'like', "{$month}%");
        }

        if ($role === 'employee') {
            $dbUser = User::find($user['id']);
            if (!$dbUser || !$dbUser->biometric_pin) {
                return response()->json([]);
            }

            $userPin = $dbUser->biometric_pin;
            $normalizedPin = ltrim($userPin, '0');
            if ($normalizedPin === '') {
                $normalizedPin = '0';
            }

            $query->where(function ($q) use ($userPin, $normalizedPin) {
                $q->where('user_pin', $userPin)
                  ->orWhere('user_pin', $normalizedPin)
                  ->orWhereRaw("TRIM(LEADING '0' FROM user_pin) = ?", [$normalizedPin]);
            });
        } elseif (in_array($role, ['super_admin', 'hr_manager'])) {
            if ($empIdParam = $request->query('employee_id')) {
                $dbUser = User::where('employee_id', $empIdParam)->first();
                if ($dbUser && $dbUser->biometric_pin) {
                    $userPin = $dbUser->biometric_pin;
                    $normalizedPin = ltrim($userPin, '0');
                    if ($normalizedPin === '') {
                        $normalizedPin = '0';
                    }
                    $query->where(function ($q) use ($userPin, $normalizedPin) {
                        $q->where('user_pin', $userPin)
                          ->orWhere('user_pin', $normalizedPin)
                          ->orWhereRaw("TRIM(LEADING '0' FROM user_pin) = ?", [$normalizedPin]);
                    });
                } else {
                    return response()->json([]);
                }
            }
        } else {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $logs = $query->orderBy('punched_at', 'desc')->limit(1000)->get();

        $mapped = $logs->map(function ($log) {
            $status = 'check_in';
            if ($log->punch_status === 1) {
                $status = 'check_out';
            } elseif ($log->punch_status === 2) {
                $status = 'break_out';
            } elseif ($log->punch_status === 3) {
                $status = 'break_in';
            } elseif ($log->punch_status === 4) {
                $status = 'ot_in';
            } elseif ($log->punch_status === 5) {
                $status = 'ot_out';
            }

            $verifyMode = 'unknown';
            if ($log->verify_mode === 0 || $log->verify_mode === 3) {
                $verifyMode = 'password';
            } elseif ($log->verify_mode === 1 || $log->verify_mode === 4) {
                $verifyMode = 'fingerprint';
            } elseif ($log->verify_mode === 2) {
                $verifyMode = 'card';
            } elseif ($log->verify_mode === 15) {
                $verifyMode = 'face';
            }

            $emp = User::where('biometric_pin', $log->user_pin)->first();

            return [
                'punch_id' => $log->id,
                'device_sn' => $log->device_sn,
                'device_name' => "Realtime Device " . $log->device_sn,
                'user_pin' => $log->user_pin,
                'employee_id' => $emp ? $emp->employee_id : null,
                'employee_name' => $emp ? $emp->name : null,
                'timestamp' => $log->punched_at ? $log->punched_at->format('Y-m-d H:i:s') : null,
                'status' => $status,
                'verify_mode' => $verifyMode,
                'source' => 'realtime_push',
                'matched' => (bool)$emp,
                'received_at' => $log->created_at ? $log->created_at->toIso8601String() : null,
            ];
        });

        return response()->json($mapped);
    }
}


