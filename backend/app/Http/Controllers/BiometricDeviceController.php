<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\BiometricDevice;
use App\Models\BiometricRawLog;
use App\Models\Attendance;
use App\Models\User;
use App\Models\Tenant;
use Carbon\Carbon;

class BiometricDeviceController extends Controller
{
    /**
     * List all biometric devices for the current tenant.
     */
    public function index(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $tenantId = $user['tenant_id'] ?? null;

        // Super admin can filter by tenant_id query param
        if ($user['role'] === 'super_admin') {
            $tenantId = $request->query('tenant_id', $tenantId);
        }

        if (!$tenantId) {
            return response()->json(['detail' => 'Tenant ID required'], 400);
        }

        $devices = BiometricDevice::where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($devices);
    }

    /**
     * Register a new biometric device for the current tenant.
     */
    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $validated = $request->validate([
            'serial_number' => 'required|string|max:100',
            'name' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
        ]);

        $tenantId = $user['tenant_id'] ?? null;
        if ($user['role'] === 'super_admin') {
            $tenantId = $request->input('tenant_id', $tenantId);
        }

        if (!$tenantId) {
            return response()->json(['detail' => 'Tenant ID required'], 400);
        }

        // Check if serial number already exists
        $existing = BiometricDevice::where('serial_number', $validated['serial_number'])->first();
        if ($existing) {
            return response()->json(['detail' => 'Device with this serial number is already registered'], 409);
        }

        $device = BiometricDevice::create([
            'tenant_id' => $tenantId,
            'serial_number' => $validated['serial_number'],
            'name' => $validated['name'],
            'location' => $validated['location'] ?? null,
            'status' => 'active',
        ]);

        return response()->json($device, 201);
    }

    /**
     * Update a biometric device.
     */
    public function update(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $device = BiometricDevice::find($id);
        if (!$device) {
            return response()->json(['detail' => 'Device not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'location' => 'nullable|string|max:255',
            'status' => 'sometimes|required|string|in:active,inactive',
        ]);

        $device->update($validated);

        return response()->json($device->fresh());
    }

    /**
     * Delete a biometric device.
     */
    public function destroy(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $device = BiometricDevice::find($id);
        if (!$device) {
            return response()->json(['detail' => 'Device not found'], 404);
        }

        $device->delete();

        return response()->json(['message' => 'Device deleted']);
    }

    /**
     * List raw biometric logs for the current tenant.
     * Supports filtering by date, user_pin, synced status.
     */
    public function rawLogs(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $query = BiometricRawLog::query();

        if ($date = $request->query('date')) {
            $query->whereDate('punched_at', $date);
        }

        if ($pin = $request->query('user_pin')) {
            $query->where('user_pin', $pin);
        }

        if ($request->has('synced')) {
            $query->where('synced', $request->boolean('synced'));
        }

        if ($deviceSn = $request->query('device_sn')) {
            $query->where('device_sn', $deviceSn);
        }

        $logs = $query->orderBy('punched_at', 'desc')->limit(500)->get();

        // Enrich with employee name
        $pins = $logs->pluck('user_pin')->unique();
        $employees = User::whereIn('biometric_pin', $pins)
            ->get()
            ->keyBy('biometric_pin');

        $enriched = $logs->map(function ($log) use ($employees) {
            $arr = $log->toArray();
            $emp = $employees->get($log->user_pin);
            $arr['employee_name'] = $emp ? $emp->name : null;
            $arr['employee_id'] = $emp ? $emp->employee_id : null;
            return $arr;
        });

        return response()->json($enriched);
    }

    /**
     * Manually re-sync all unsynced biometric raw logs to attendance records.
     */
    public function syncLogs(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $unsyncedLogs = BiometricRawLog::where('synced', false)
            ->orderBy('punched_at', 'asc')
            ->limit(1000)
            ->get();

        $synced = 0;
        $errors = 0;

        foreach ($unsyncedLogs as $log) {
            try {
                $this->syncSingleLog($log);
                $synced++;
            } catch (\Exception $e) {
                $log->update(['sync_error' => $e->getMessage()]);
                $errors++;
            }
        }

        return response()->json([
            'message' => "Sync complete: {$synced} synced, {$errors} errors",
            'synced' => $synced,
            'errors' => $errors,
            'remaining' => BiometricRawLog::where('synced', false)->count(),
        ]);
    }

    /**
     * Sync a single raw log to attendance (same logic as ADMSController).
     */
    private function syncSingleLog(BiometricRawLog $log): void
    {
        $user = User::where('biometric_pin', $log->user_pin)->first();
        if (!$user) {
            $log->update([
                'sync_error' => "No employee found with biometric_pin={$log->user_pin}",
            ]);
            return;
        }

        $punchDate = $log->punched_at->format('Y-m-d');
        $punchTime = $log->punched_at->toIso8601String();

        $attendance = Attendance::where('user_id', $user->id)
            ->where('date', $punchDate)
            ->first();

        if ($log->punch_status === 0) {
            if (!$attendance) {
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_in' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $log->device_sn,
                    'total_hours' => 0,
                ]);
            } elseif (!$attendance->clock_in) {
                $attendance->update([
                    'clock_in' => $punchTime,
                    'source' => 'biometric',
                    'device_sn' => $log->device_sn,
                ]);
            }
        } elseif ($log->punch_status === 1) {
            if ($attendance && $attendance->clock_in && !$attendance->clock_out) {
                $clockIn = Carbon::parse($attendance->clock_in);
                $totalHours = round($log->punched_at->diffInSeconds($clockIn) / 3600, 2);
                $attendance->update([
                    'clock_out' => $punchTime,
                    'total_hours' => $totalHours,
                    'source' => 'biometric',
                    'device_sn' => $log->device_sn,
                ]);
            } elseif (!$attendance) {
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_out' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $log->device_sn,
                    'total_hours' => 0,
                ]);
            }
        } else {
            if (!$attendance) {
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_in' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $log->device_sn,
                    'total_hours' => 0,
                ]);
            }
        }

        $log->update(['synced' => true, 'sync_error' => null]);
    }

    /**
     * 🧪 SIMULATOR: Simulate a biometric punch without physical hardware.
     * This creates the exact same raw log + attendance record that a real
     * ESSL device would produce via ADMS PUSH.
     *
     * POST /api/biometric/simulate-punch
     * Body: { device_sn, user_pin, punch_status (0=in, 1=out), timestamp? }
     */
    public function simulatePunch(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate([
            'device_sn' => 'required|string',
            'user_pin' => 'required|string',
            'punch_status' => 'required|integer|in:0,1,2,3,4,5',
            'timestamp' => 'nullable|string',
        ]);

        $deviceSn = $request->device_sn;
        $userPin = $request->user_pin;
        $punchStatus = (int) $request->punch_status;
        $timestamp = $request->timestamp ? Carbon::parse($request->timestamp) : now();

        // Verify device exists and belongs to this tenant
        $tenantId = $user['tenant_id'] ?? null;
        $device = BiometricDevice::where('serial_number', $deviceSn)->first();

        if (!$device) {
            return response()->json(['detail' => 'Device not found. Register it first in the Biometric Devices tab.'], 404);
        }

        if ($tenantId && $device->tenant_id !== $tenantId) {
            return response()->json(['detail' => 'Device does not belong to your organization'], 403);
        }

        // Update heartbeat
        $device->update(['last_heartbeat' => now()]);

        // Build the ATTLOG line exactly as the device would send it
        $rawLine = "{$userPin}\t{$timestamp->format('Y-m-d H:i:s')}\t{$punchStatus}\t15\t\t0\t0";

        // Create raw log (same as real device would)
        $rawLog = BiometricRawLog::create([
            'device_sn' => $deviceSn,
            'user_pin' => $userPin,
            'punched_at' => $timestamp,
            'punch_status' => $punchStatus,
            'verify_mode' => 15, // Face (simulated)
            'raw_line' => "[SIMULATED] " . $rawLine,
            'synced' => false,
        ]);

        // Sync to attendance (same pipeline as real device)
        $this->syncSingleLog($rawLog);

        // Reload to get sync status
        $rawLog->refresh();

        // Find employee for response
        $employee = User::where('biometric_pin', $userPin)->first();

        return response()->json([
            'message' => $rawLog->synced
                ? '✅ Punch simulated successfully!'
                : '⚠️ Punch recorded but sync failed: ' . ($rawLog->sync_error ?? 'Unknown error'),
            'raw_log' => $rawLog,
            'employee' => $employee ? [
                'name' => $employee->name,
                'employee_id' => $employee->employee_id,
                'biometric_pin' => $employee->biometric_pin,
            ] : null,
            'punch_type' => $punchStatus === 0 ? 'Check-In' : ($punchStatus === 1 ? 'Check-Out' : 'Other'),
            'timestamp' => $timestamp->toIso8601String(),
        ]);
    }

    /**
     * List employees with biometric PINs assigned (for simulator dropdown).
     * GET /api/biometric/employees-with-pin
     */
    public function employeesWithPin(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $employees = User::whereNotNull('biometric_pin')
            ->where('biometric_pin', '!=', '')
            ->select('id', 'name', 'employee_id', 'biometric_pin', 'department', 'designation')
            ->orderBy('name')
            ->get();

        return response()->json($employees);
    }
}
