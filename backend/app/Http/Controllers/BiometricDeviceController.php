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

        $tenantId = $this->resolveTenantConnection($request, $user);

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

        $tenantId = $this->resolveTenantConnection($request, $user);

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
     * Wake up (ping) a device by updating its heartbeat.
     */
    public function ping(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $device = BiometricDevice::find($id);
        if (!$device) {
            return response()->json(['detail' => 'Device not found'], 404);
        }

        $tenantId = $this->resolveTenantConnection($request, $user);
        if ($tenantId && $device->tenant_id !== $tenantId) {
            return response()->json(['detail' => 'Device does not belong to your organization'], 403);
        }

        $device->update(['last_heartbeat' => now()]);

        return response()->json([
            'message' => 'Device woke up successfully',
            'device' => $device->fresh(),
        ]);
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

        $this->resolveTenantConnection($request, $user);

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
        $userPin = $log->user_pin;
        $normalizedPin = ltrim($userPin, '0');
        if ($normalizedPin === '') {
            $normalizedPin = '0';
        }

        $user = User::where(function ($query) use ($userPin, $normalizedPin) {
            $query->where('biometric_pin', $userPin)
                  ->orWhere('biometric_pin', $normalizedPin)
                  ->orWhere('employee_id', $userPin)
                  ->orWhere('employee_id', $normalizedPin)
                  ->orWhereRaw("TRIM(LEADING '0' FROM biometric_pin) = ?", [$normalizedPin])
                  ->orWhereRaw("TRIM(LEADING '0' FROM employee_id) = ?", [$normalizedPin]);
        })->first();

        if (!$user) {
            $log->update([
                'sync_error' => "No employee found with biometric_pin={$log->user_pin} (normalized: {$normalizedPin})",
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
                $totalHours = abs(round($log->punched_at->diffInSeconds($clockIn) / 3600, 2));
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
            'device_sn' => 'nullable|string',
            'user_pin' => 'required|string',
            'punch_status' => 'sometimes|integer|in:0,1,2,3,4,5',
            'status' => 'sometimes|integer|in:0,1,2,3,4,5',
            'verify_mode' => 'nullable|integer',
            'timestamp' => 'nullable|string',
        ]);

        $deviceSn = $request->device_sn ?? 'SIMULATOR-001';
        $userPin = $request->user_pin;
        $punchStatus = (int) ($request->has('punch_status') ? $request->punch_status : ($request->has('status') ? $request->status : 0));
        $verifyMode = (int) ($request->verify_mode ?? 15);
        $timestamp = $request->timestamp ? Carbon::parse($request->timestamp) : now();

        $tenantId = $this->resolveTenantConnection($request, $user);
        $device = BiometricDevice::where('serial_number', $deviceSn)->first();

        if (!$device) {
            $defaultTenant = Tenant::first();
            $device = BiometricDevice::create([
                'tenant_id' => $tenantId ?? ($defaultTenant ? $defaultTenant->id : null),
                'serial_number' => $deviceSn,
                'name' => "Simulator Device",
                'location' => 'Virtual',
                'status' => 'active',
                'last_heartbeat' => now(),
            ]);
        }

        if ($tenantId && $device->tenant_id !== $tenantId) {
            return response()->json(['detail' => 'Device does not belong to your organization'], 403);
        }

        // Update heartbeat
        $device->update(['last_heartbeat' => now()]);

        // Build the ATTLOG line exactly as the device would send it
        $rawLine = "{$userPin}\t{$timestamp->format('Y-m-d H:i:s')}\t{$punchStatus}\t{$verifyMode}\t\t0\t0";

        // Create raw log (same as real device would)
        $rawLog = BiometricRawLog::create([
            'device_sn' => $deviceSn,
            'user_pin' => $userPin,
            'punched_at' => $timestamp,
            'punch_status' => $punchStatus,
            'verify_mode' => $verifyMode,
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
            'punch' => [
                'punch_id' => $rawLog->id,
                'device_sn' => $deviceSn,
                'device_name' => $device->name,
                'user_pin' => $userPin,
                'employee_id' => $employee ? $employee->employee_id : null,
                'employee_name' => $employee ? $employee->name : null,
                'timestamp' => $timestamp->toIso8601String(),
                'status' => $rawLog->punch_status_label,
                'verify_mode' => $rawLog->verify_mode_label,
                'matched' => $rawLog->synced,
            ],
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
     * List recent punch events (for live punches tab).
     * GET /api/biometric/punches
     */
    public function punches(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $this->resolveTenantConnection($request, $user);

        $query = BiometricRawLog::query();

        if ($deviceSn = $request->query('device_sn')) {
            $query->where('device_sn', $deviceSn);
        }

        if ($status = $request->query('status')) {
            $statusCode = match ($status) {
                'check_in' => 0,
                'check_out' => 1,
                'break_out' => 2,
                'break_in' => 3,
                default => null,
            };
            if ($statusCode !== null) {
                $query->where('punch_status', $statusCode);
            }
        }

        if ($source = $request->query('source')) {
            if ($source === 'simulator') {
                $query->where('raw_line', 'LIKE', '%[SIMULATED]%');
            } elseif ($source === 'device_push') {
                $query->where('raw_line', 'NOT LIKE', '%[SIMULATED]%')
                      ->orWhereNull('raw_line');
            }
        }

        if ($date = $request->query('date')) {
            $query->whereDate('punched_at', $date);
        }

        if ($search = $request->query('search')) {
            $matchingPins = User::where('name', 'LIKE', "%{$search}%")
                ->orWhere('employee_id', 'LIKE', "%{$search}%")
                ->orWhere('biometric_pin', 'LIKE', "%{$search}%")
                ->pluck('biometric_pin')
                ->filter()
                ->unique()
                ->toArray();

            $query->where(function ($q) use ($matchingPins, $search) {
                $q->whereIn('user_pin', $matchingPins)
                  ->orWhere('user_pin', 'LIKE', "%{$search}%");
            });
        }

        $limit = $request->query('limit', 1000);
        $logs = $query->orderBy('punched_at', 'asc')->limit($limit)->get();

        $pins = $logs->pluck('user_pin')->unique();
        $employees = User::whereIn('biometric_pin', $pins)->get()->keyBy('biometric_pin');

        $enriched = $logs->map(function ($log) use ($employees) {
            $emp = $employees->get($log->user_pin);
            $source = 'device_push';
            if ($log->raw_line && strpos($log->raw_line, '[SIMULATED]') !== false) {
                $source = 'simulator';
            }
            return [
                'punch_id'      => $log->id,
                'device_sn'     => $log->device_sn,
                'device_name'   => "Realtime Device " . $log->device_sn,
                'user_pin'      => $log->user_pin,
                'employee_id'   => $emp ? $emp->employee_id : null,
                'employee_name' => $emp ? $emp->name : null,
                'timestamp'     => $log->punched_at->toIso8601String(),
                'status'        => strtolower(str_replace('-', '_', $log->punch_status_label)),
                'verify_mode'   => $log->verify_mode_label,
                'source'        => $source,
                'matched'       => (bool)$emp,
            ];
        });

        // ── DEDUPLICATION ──────────────────────────────────────────────────────────
        // The device pushes its buffer repeatedly, so the same physical punch can
        // appear multiple times with timestamps 1-5 seconds apart.
        // Keep only the FIRST punch per user_pin per 60-second window (oldest = real).
        $lastSeenTs = [];     // [user_pin => unix timestamp of last kept punch]
        $deduped = $enriched->filter(function ($p) use (&$lastSeenTs) {
            $pin = $p['user_pin'];
            $ts  = $p['timestamp'] ? strtotime($p['timestamp']) : 0;
            if (!isset($lastSeenTs[$pin]) || ($ts - $lastSeenTs[$pin]) > 60) {
                $lastSeenTs[$pin] = $ts;
                return true;   // keep – it is a fresh punch event
            }
            return false;      // drop – within 60 s of previous punch for same pin
        });
        // ──────────────────────────────────────────────────────────────────────────

        return response()->json($deduped->sortByDesc('timestamp')->values());
    }

    /**
     * Get biometric device setup configuration for the user.
     * GET /api/biometric/setup-guide
     */
    public function setupGuide(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $host = $request->header('host', 'hr.dmrhospitals.com');
        $scheme = $request->secure() ? 'https' : 'http';

        return response()->json([
            'model' => 'Realtime T304F+ (and other ADMS/Push-capable devices)',
            'menu_path' => 'Api_Realtime.com Parallel Export / Device Comm Setting',
            'config' => [
                'Server Address (Domain)' => $host,
                'Server Port' => $scheme === 'https' ? '443' : '80',
                'Server Path' => '/api/iclock',
                'Webhook Endpoint' => "{$scheme}://{$host}/api/realtime-biometric/push",
                'Authorization Token' => env('BIOMETRIC_AUTH_TOKEN', 'realtime_t304f_auth_token_2026'),
            ],
            'webhook_endpoints' => [
                'handshake' => "{$scheme}://{$host}/api/iclock/cdata",
                'push_attendance' => "{$scheme}://{$host}/api/realtime-biometric/push",
            ],
            'next_steps' => [
                '1. Configure your local Api_Realtime.com exporter settings.',
                '2. Enter the Webhook URL and Authorization Token shown above.',
                '3. Save settings. Devices will auto-register on the live server upon the first punch!',
                '4. Set employee biometric PINs in the directory to automatically sync punches to attendance.',
            ],
        ]);
    }

    /**
     * Get biometric integration stats for dashboard cards.
     * GET /api/biometric/status
     */
    public function status(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $tenantId = $this->resolveTenantConnection($request, $user);

        $devicesQuery = BiometricDevice::query();
        if ($tenantId) {
            $devicesQuery->where('tenant_id', $tenantId);
        }
        $devicesTotal = $devicesQuery->count();

        $cutoff = now()->subMinutes(30);
        $devicesOnlineQuery = BiometricDevice::query()->where('last_heartbeat', '>=', $cutoff);
        if ($tenantId) {
            $devicesOnlineQuery->where('tenant_id', $tenantId);
        }
        $devicesOnline = $devicesOnlineQuery->count();

        $punchesToday = BiometricRawLog::whereDate('punched_at', today())->count();

        return response()->json([
            'devices_total' => $devicesTotal,
            'devices_online' => $devicesOnline,
            'punches_today' => $punchesToday,
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

        $this->resolveTenantConnection($request, $user);

        $employees = User::whereNotNull('biometric_pin')
            ->where('biometric_pin', '!=', '')
            ->select('id', 'name', 'employee_id', 'biometric_pin', 'department', 'designation')
            ->orderBy('name')
            ->get();

        return response()->json($employees);
    }

    /**
     * Resolve and configure the tenant database connection.
     */
    private function resolveTenantConnection(Request $request, $user)
    {
        $tenantId = $user['tenant_id'] ?? null;
        if ($user['role'] === 'super_admin') {
            $tenantId = $request->query('tenant_id', $request->input('tenant_id', $tenantId));
        }
        if (!$tenantId) {
            $defaultTenant = Tenant::first();
            $tenantId = $defaultTenant ? $defaultTenant->id : null;
        }

        if ($tenantId) {
            $tenant = Tenant::find($tenantId);
            if ($tenant) {
                Config::set('database.connections.tenant.database', $tenant->database_name);
                DB::purge('tenant');
                DB::reconnect('tenant');
            }
        }
        return $tenantId;
    }
}
