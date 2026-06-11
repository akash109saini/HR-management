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

class ADMSController extends Controller
{
    /**
     * Handle /iclock/cdata endpoint.
     * GET = Device handshake/initialization.
     * POST = Device pushing attendance data (ATTLOG, OPERLOG, etc.).
     */
    public function handleCdata(Request $request)
    {
        $sn = $request->query('SN', '');
        $table = $request->query('table', '');

        if ($request->isMethod('get')) {
            return $this->handshake($sn);
        }

        // POST — device is pushing data
        if ($table === 'ATTLOG') {
            return $this->receiveAttLog($request, $sn);
        }

        // Other table types (OPERLOG, etc.) — just acknowledge
        Log::info("ADMS: Received {$table} data from SN={$sn}");
        return response("OK", 200)->header('Content-Type', 'text/plain');
    }

    /**
     * Device handshake — respond with configuration parameters.
     * The device sends a GET request on boot/reconnect to verify connectivity
     * and receive server-side configuration.
     */
    private function handshake(string $sn)
    {
        Log::info("ADMS: Handshake from device SN={$sn}");

        // Update last_heartbeat for the device
        $device = BiometricDevice::where('serial_number', $sn)->first();
        if ($device) {
            $device->update(['last_heartbeat' => now()]);
        } else {
            Log::warning("ADMS: Unknown device SN={$sn} attempted handshake");
        }

        // Respond with device configuration
        $config = "GET OPTION FROM: {$sn}\r\n";
        $config .= "ATTLOGStamp=0\r\n";
        $config .= "OPERLOGStamp=0\r\n";
        $config .= "ATTPHOTOStamp=0\r\n";
        $config .= "ErrorDelay=30\r\n";
        $config .= "Delay=10\r\n";
        $config .= "TransTimes=00:00;14:05\r\n";
        $config .= "TransInterval=1\r\n";
        $config .= "TransFlag=TransData AttLog\r\n";
        $config .= "Realtime=1\r\n";
        $config .= "ServerVer=2.4.1\r\n";

        return response($config, 200)->header('Content-Type', 'text/plain');
    }

    /**
     * Receive ATTLOG (attendance log) data from the device.
     * The raw body contains tab-separated records, one per line:
     * PIN\tTimestamp\tStatus\tVerifyMode\t...\n
     */
    private function receiveAttLog(Request $request, string $sn)
    {
        // 1. Validate device and resolve tenant
        $device = BiometricDevice::where('serial_number', $sn)
            ->where('status', 'active')
            ->first();

        if (!$device) {
            Log::warning("ADMS: ATTLOG from unregistered/inactive device SN={$sn}");
            return response("OK", 200)->header('Content-Type', 'text/plain');
        }

        // Update heartbeat
        $device->update(['last_heartbeat' => now()]);

        // 2. Resolve tenant database
        $tenant = Tenant::find($device->tenant_id);
        if (!$tenant) {
            Log::error("ADMS: Tenant not found for device SN={$sn}");
            return response("OK", 200)->header('Content-Type', 'text/plain');
        }

        // Switch to tenant database
        Config::set('database.connections.tenant.database', $tenant->database_name);
        DB::purge('tenant');
        DB::reconnect('tenant');

        // 3. Parse the raw ATTLOG body
        $rawBody = $request->getContent();
        $lines = array_filter(explode("\n", trim($rawBody)));

        Log::info("ADMS: Received ATTLOG from SN={$sn}, " . count($lines) . " records");

        $processedCount = 0;
        $errorCount = 0;

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            $fields = explode("\t", $line);

            // Minimum 3 fields required: PIN, Timestamp, Status
            if (count($fields) < 3) {
                Log::warning("ADMS: Invalid ATTLOG line from SN={$sn}: {$line}");
                $errorCount++;
                continue;
            }

            $userPin = trim($fields[0]);
            $timestamp = trim($fields[1]);
            $punchStatus = (int) trim($fields[2]);
            $verifyMode = isset($fields[3]) ? (int) trim($fields[3]) : 15;

            // 4. Store raw log
            try {
                $rawLog = BiometricRawLog::create([
                    'device_sn' => $sn,
                    'user_pin' => $userPin,
                    'punched_at' => Carbon::parse($timestamp),
                    'punch_status' => $punchStatus,
                    'verify_mode' => $verifyMode,
                    'raw_line' => $line,
                    'synced' => false,
                ]);

                // 5. Sync to attendance record
                $this->syncLogToAttendance($rawLog, $sn);
                $processedCount++;
            } catch (\Exception $e) {
                Log::error("ADMS: Error processing ATTLOG line from SN={$sn}: " . $e->getMessage(), [
                    'line' => $line,
                ]);
                $errorCount++;
            }
        }

        Log::info("ADMS: Processed {$processedCount} records from SN={$sn}, {$errorCount} errors");

        return response("OK", 200)->header('Content-Type', 'text/plain');
    }

    /**
     * Sync a single raw biometric log entry into the attendances table.
     *
     * Logic:
     * - Match user_pin → users.biometric_pin
     * - punch_status 0 (Check-In) → set clock_in
     * - punch_status 1 (Check-Out) → set clock_out + calculate hours
     * - If no status distinction, use first punch as in, last as out
     */
    private function syncLogToAttendance(BiometricRawLog $log, string $deviceSn): void
    {
        $userPin = $log->user_pin;
        $normalizedPin = ltrim($userPin, '0');
        if ($normalizedPin === '') {
            $normalizedPin = '0';
        }

        // Find employee by biometric PIN or normalized PIN
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
                'synced' => false,
                'sync_error' => "No employee found with biometric_pin={$log->user_pin}",
            ]);
            Log::warning("ADMS: No employee for PIN={$log->user_pin} from SN={$deviceSn}");
            return;
        }

        $punchDate = $log->punched_at->format('Y-m-d');
        $punchTime = $log->punched_at->toIso8601String();

        // Find or create attendance record for this employee on this date
        $attendance = Attendance::where('user_id', $user->id)
            ->where('date', $punchDate)
            ->first();

        if ($log->punch_status === 0) {
            // ===== CHECK-IN =====
            if (!$attendance) {
                // No record for today — create with clock_in
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_in' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $deviceSn,
                    'total_hours' => 0,
                ]);
            } elseif (!$attendance->clock_in) {
                // Record exists but no clock_in (shouldn't happen, but handle it)
                $attendance->update([
                    'clock_in' => $punchTime,
                    'source' => 'biometric',
                    'device_sn' => $deviceSn,
                ]);
            }
            // If already clocked in, ignore duplicate check-in
        } elseif ($log->punch_status === 1) {
            // ===== CHECK-OUT =====
            if ($attendance && $attendance->clock_in && !$attendance->clock_out) {
                $clockIn = Carbon::parse($attendance->clock_in);
                $clockOut = $log->punched_at;
                $totalHours = round($clockOut->diffInSeconds($clockIn) / 3600, 2);

                $attendance->update([
                    'clock_out' => $punchTime,
                    'total_hours' => $totalHours,
                    'source' => 'biometric',
                    'device_sn' => $deviceSn,
                ]);
            } elseif ($attendance && $attendance->clock_out) {
                // Already clocked out — update if this is a later punch
                $existingClockOut = Carbon::parse($attendance->clock_out);
                if ($log->punched_at->greaterThan($existingClockOut)) {
                    $clockIn = Carbon::parse($attendance->clock_in);
                    $totalHours = round($log->punched_at->diffInSeconds($clockIn) / 3600, 2);

                    $attendance->update([
                        'clock_out' => $punchTime,
                        'total_hours' => $totalHours,
                    ]);
                }
            } elseif (!$attendance) {
                // Check-out without check-in — create record with just clock_out
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_out' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $deviceSn,
                    'total_hours' => 0,
                ]);
            }
        } else {
            // Other statuses (break, OT) — store as check-in if no record, else update clock_out
            if (!$attendance) {
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_in' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $deviceSn,
                    'total_hours' => 0,
                ]);
            }
        }

        // Mark raw log as synced
        $log->update(['synced' => true, 'sync_error' => null]);
    }

    /**
     * POST /hdata.aspx — FkWeb Protocol handler for Realtime brand biometric devices.
     * The device pushes a binary+JSON hybrid payload to this endpoint.
     * Must respond with "result=OK" and "Connection: close" header.
     */
    public function handleFkWeb(Request $request)
    {
        $rawBody = $request->getContent();

        // Extract Cloud ID / Serial Number from headers or query
        $sn = $request->header('CloudId', 
              $request->query('CloudId', 
              $request->query('SN', 
              $request->query('cloudid', ''))));

        Log::info("FkWeb: Request from SN={$sn}", [
            'method' => $request->method(),
            'query'  => $request->query(),
            'body_length' => strlen($rawBody),
            'headers' => $request->headers->all(),
        ]);

        // Try to extract JSON from binary+JSON hybrid payload
        $jsonStart = strpos($rawBody, '{');
        $jsonEnd   = strrpos($rawBody, '}');
        $payload   = null;

        if ($jsonStart !== false && $jsonEnd !== false) {
            $jsonStr = substr($rawBody, $jsonStart, $jsonEnd - $jsonStart + 1);
            $payload = json_decode($jsonStr, true);
        }

        // Extract SN from payload if not in headers/query
        if (empty($sn) && is_array($payload)) {
            $sn = $payload['CloudId'] ?? $payload['SN'] ?? $payload['cloudid'] ?? $payload['sn'] ?? '';
        }

        Log::info("FkWeb: Parsed payload SN={$sn}", ['payload' => $payload]);

        // Update heartbeat if device is registered
        if (!empty($sn)) {
            $device = BiometricDevice::where('serial_number', $sn)->first();
            if ($device) {
                $device->update(['last_heartbeat' => now()]);
                Log::info("FkWeb: Heartbeat updated for SN={$sn}");
            } else {
                Log::warning("FkWeb: Unknown device SN={$sn} - auto-registering");
                // Auto-register device so it can sync immediately
                try {
                    BiometricDevice::create([
                        'serial_number'  => $sn,
                        'name'           => 'Realtime Device ' . $sn,
                        'status'         => 'active',
                        'last_heartbeat' => now(),
                        'tenant_id'      => \DB::table('tenants')->first()->id ?? null,
                    ]);
                } catch (\Exception $e) {
                    Log::error("FkWeb: Failed to auto-register device SN={$sn}: " . $e->getMessage());
                }
            }
        }

        // Process attendance logs if present in payload
        if (is_array($payload) && isset($payload['Punch'])) {
            $punches = is_array($payload['Punch']) ? $payload['Punch'] : [$payload['Punch']];
            Log::info("FkWeb: Processing " . count($punches) . " punches from SN={$sn}");

            foreach ($punches as $punch) {
                try {
                    $userPin    = $punch['UID'] ?? $punch['PinId'] ?? $punch['pin'] ?? null;
                    $punchTime  = $punch['DateTime'] ?? $punch['datetime'] ?? $punch['time'] ?? null;
                    $punchMode  = $punch['IoMode'] ?? $punch['io_mode'] ?? $punch['Status'] ?? 0;

                    if (!$userPin || !$punchTime) continue;

                    // Determine check-in (0) or check-out (1) from bitmask
                    $punchStatus = ((int)$punchMode & 1) ? 1 : 0;

                    $rawLog = BiometricRawLog::create([
                        'device_sn'    => $sn,
                        'user_pin'     => (string) $userPin,
                        'punched_at'   => Carbon::parse($punchTime),
                        'punch_status' => $punchStatus,
                        'verify_mode'  => (int)$punchMode,
                        'raw_line'     => json_encode($punch),
                        'synced'       => false,
                    ]);

                    $this->syncLogToAttendance($rawLog, $sn);
                } catch (\Exception $e) {
                    Log::error("FkWeb: Error processing punch from SN={$sn}: " . $e->getMessage(), ['punch' => $punch]);
                }
            }
        }

        // FkWeb protocol REQUIRES "result=OK" body + "Connection: close" header
        return response("result=OK\r\n", 200)
            ->header('Content-Type', 'text/plain')
            ->header('Connection', 'close');
    }

    /**
     * GET /iclock/getrequest — Device polls for pending commands.
     * For now, we return empty (no pending commands).
     */
    public function getRequest(Request $request)
    {
        $sn = $request->query('SN', '');

        // Update heartbeat
        $device = BiometricDevice::where('serial_number', $sn)->first();
        if ($device) {
            $device->update(['last_heartbeat' => now()]);
        }

        // Return empty — no pending commands
        return response("OK", 200)->header('Content-Type', 'text/plain');
    }

    /**
     * POST /iclock/devicecmd — Device reports command execution result.
     * For now, just acknowledge.
     */
    public function commandResult(Request $request)
    {
        $sn = $request->query('SN', '');
        Log::info("ADMS: Command result from SN={$sn}", [
            'body' => $request->getContent(),
        ]);

        return response("OK", 200)->header('Content-Type', 'text/plain');
    }
}
