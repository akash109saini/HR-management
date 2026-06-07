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

class RealtimeBiometricController extends Controller
{
    /**
     * Handle real-time biometric logs push from Api_Realtime.com webhook.
     */
    public function handleRealtimePush(Request $request)
    {
        // 1. Parse request payload
        $payload = [];
        if ($request->isJson()) {
            $parsed = $request->json()->all();
            if (is_array($parsed)) {
                // If it is a list of logs, or a single dictionary
                if (array_key_exists(0, $parsed)) {
                    $payload = $parsed;
                } else {
                    $payload = [$parsed];
                }
            }
        } else {
            $payload = [$request->all()];
        }

        if (empty($payload) || (count($payload) === 1 && empty($payload[0]))) {
            $payload = [$request->query()];
        }

        // 2. Extract Token from headers, query params, or body
        $token = null;
        if ($request->hasHeader('x-biometric-token')) {
            $token = $request->header('x-biometric-token');
        } elseif ($request->hasHeader('Authorization')) {
            $authHeader = $request->header('Authorization');
            if (str_starts_with(strtolower($authHeader), 'bearer ')) {
                $token = substr($authHeader, 7);
            } else {
                $token = $authHeader;
            }
        }

        if (!$token) {
            $tokenKeys = ['token', 'Token', 'authorization', 'Authorization', 'x-biometric-token', 'X-Biometric-Token', 'access_token', 'auth_token'];
            foreach ($tokenKeys as $key) {
                if ($request->has($key)) {
                    $val = $request->input($key);
                    if (str_starts_with(strtolower($val), 'bearer ')) {
                        $token = substr($val, 7);
                    } else {
                        $token = $val;
                    }
                    break;
                }
            }
        }

        if (!$token && count($payload) === 1) {
            $item = $payload[0];
            $tokenKeys = ['token', 'Token', 'authorization', 'Authorization', 'x-biometric-token', 'X-Biometric-Token', 'access_token', 'auth_token'];
            foreach ($tokenKeys as $key) {
                if (isset($item[$key])) {
                    $val = $item[$key];
                    if (str_starts_with(strtolower($val), 'bearer ')) {
                        $token = substr($val, 7);
                    } else {
                        $token = $val;
                    }
                    break;
                }
            }
        }

        $token = $token ? trim($token) : null;

        // Validate Token
        $allowedTokens = [
            env('BIOMETRIC_AUTH_TOKEN', 'realtime_t304f_auth_token_2026'),
            'realtime_t304f_auth_token_2026',
            'time_t304f_auth_token_2026'
        ];

        if (!$token || !in_array($token, $allowedTokens)) {
            Log::warning("Unauthorized biometric access attempt with token: " . ($token ?? 'None'));
            return response()->json(['detail' => 'Invalid or missing biometric auth token'], 401);
        }

        Log::info("Received authenticated realtime biometric push: " . count($payload) . " records");
        $processedCount = 0;

        foreach ($payload as $item) {
            // Extract keys dynamically
            $deviceSn = $item['SerialNo'] ?? $item['DeviceSrno'] ?? $item['DeviceNo'] ?? $item['DevicesId'] ?? $item['DeviceID'] ?? $item['device_id'] ?? $item['SN'] ?? null;
            $userPin = trim($item['EmployeeCode'] ?? $item['EnrollmentId'] ?? $item['BiometricID'] ?? $item['UserID'] ?? $item['user_id'] ?? $item['pin'] ?? '');
            $logTime = $item['SystemDate'] ?? $item['PunchDateAndTime'] ?? $item['LogDateTime'] ?? $item['LogTime'] ?? $item['time'] ?? $item['timestamp'] ?? null;
            $verifyModeRaw = $item['PunchMode'] ?? $item['VerifyMode'] ?? $item['mode'] ?? 'unknown';
            $statusRaw = $item['Direction'] ?? $item['Status'] ?? $item['status'] ?? 'check_in';

            if (!$deviceSn || !$userPin || !$logTime) {
                Log::warning("Skipping malformed biometric record: " . json_encode($item));
                continue;
            }

            // Look up device
            $device = BiometricDevice::where('serial_number', $deviceSn)->first();
            if (!$device) {
                // Auto-register under default tenant
                $defaultTenant = Tenant::first();
                if ($defaultTenant) {
                    $device = BiometricDevice::create([
                        'tenant_id' => $defaultTenant->id,
                        'serial_number' => $deviceSn,
                        'name' => "Realtime Device {$deviceSn}",
                        'status' => 'active',
                        'last_heartbeat' => now(),
                    ]);
                    Log::info("Auto-registered device SN={$deviceSn} to default tenant {$defaultTenant->name}");
                } else {
                    Log::error("Cannot auto-register device SN={$deviceSn} because no tenants exist");
                    continue;
                }
            } else {
                $device->update(['last_heartbeat' => now()]);
            }

            // Switch to tenant DB
            $tenant = Tenant::find($device->tenant_id);
            if (!$tenant) {
                Log::error("Tenant not found for device SN={$deviceSn}");
                continue;
            }

            Config::set('database.connections.tenant.database', $tenant->database_name);
            DB::purge('tenant');
            DB::reconnect('tenant');

            // Parse status and verify mode
            $punchStatus = 0; // Check-In
            if (is_numeric($statusRaw)) {
                $punchStatus = (int) $statusRaw;
            } else {
                $statusStr = strtolower((string) $statusRaw);
                if (str_contains($statusStr, 'out') || str_contains($statusStr, 'exit')) {
                    $punchStatus = 1; // Check-Out
                } elseif (str_contains($statusStr, 'breakin')) {
                    $punchStatus = 3;
                } elseif (str_contains($statusStr, 'breakout')) {
                    $punchStatus = 2;
                }
            }

            $verifyMode = 15; // Face (default)
            if (is_numeric($verifyModeRaw)) {
                $verifyMode = (int) $verifyModeRaw;
            } else {
                $vStr = strtolower((string) $verifyModeRaw);
                if (str_contains($vStr, 'face')) {
                    $verifyMode = 15;
                } elseif (str_contains($vStr, 'finger') || str_contains($vStr, 'fp')) {
                    $verifyMode = 1;
                } elseif (str_contains($vStr, 'card') || str_contains($vStr, 'rfid')) {
                    $verifyMode = 4;
                } elseif (str_contains($vStr, 'pass') || str_contains($vStr, 'pwd') || str_contains($vStr, 'code')) {
                    $verifyMode = 3;
                }
            }

            try {
                $punchedAt = Carbon::parse($logTime, 'Asia/Kolkata');

                // Create raw log
                $rawLog = BiometricRawLog::create([
                    'device_sn' => $deviceSn,
                    'user_pin' => $userPin,
                    'punched_at' => $punchedAt,
                    'punch_status' => $punchStatus,
                    'verify_mode' => $verifyMode,
                    'raw_line' => json_encode($item),
                    'synced' => false,
                ]);

                // Sync into attendance
                $this->syncLogToAttendance($rawLog, $deviceSn, $punchedAt, $punchStatus);
                $processedCount++;
            } catch (\Exception $e) {
                Log::error("Error processing realtime punch: " . $e->getMessage(), ['item' => $item]);
            }
        }

        return response()->json(['status' => 'success', 'processed_records' => $processedCount]);
    }

    /**
     * Synchronize a raw log to the tenant's attendance records.
     */
    private function syncLogToAttendance(BiometricRawLog $log, string $deviceSn, Carbon $punchedAt, int $punchStatus): void
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
                'synced' => false,
                'sync_error' => "No employee found with biometric_pin={$userPin} or normalized={$normalizedPin}",
            ]);
            Log::warning("RealtimeBiometric: No employee found for user_pin={$userPin}");
            return;
        }

        $punchDate = $punchedAt->format('Y-m-d');
        $punchTime = $punchedAt->toIso8601String();

        $attendance = Attendance::where('user_id', $user->id)
            ->where('date', $punchDate)
            ->first();

        if ($punchStatus === 0) {
            // CHECK-IN
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
            } else {
                if (!$attendance->clock_in) {
                    $attendance->update([
                        'clock_in' => $punchTime,
                        'source' => 'biometric',
                        'device_sn' => $deviceSn,
                    ]);
                } else {
                    $existingClockIn = Carbon::parse($attendance->clock_in);
                    if ($punchedAt->lessThan($existingClockIn)) {
                        // Move old clock_in to clock_out if clock_out is empty
                        $newClockOut = $attendance->clock_out;
                        if (!$newClockOut) {
                            $newClockOut = $attendance->clock_in;
                        }
                        $attendance->update([
                            'clock_in' => $punchTime,
                            'clock_out' => $newClockOut,
                        ]);
                    } else {
                        // Incoming check-in is later than existing clock_in. In auto-mode, this is a clock_out!
                        if (!$attendance->clock_out) {
                            $attendance->update([
                                'clock_out' => $punchTime,
                            ]);
                        } else {
                            $existingClockOut = Carbon::parse($attendance->clock_out);
                            if ($punchedAt->greaterThan($existingClockOut)) {
                                $attendance->update([
                                    'clock_out' => $punchTime,
                                ]);
                            }
                        }
                    }
                }
            }
        } elseif ($punchStatus === 1) {
            // CHECK-OUT
            if (!$attendance) {
                Attendance::create([
                    'user_id' => $user->id,
                    'date' => $punchDate,
                    'clock_out' => $punchTime,
                    'status' => 'present',
                    'source' => 'biometric',
                    'device_sn' => $deviceSn,
                    'total_hours' => 0,
                ]);
            } else {
                if (!$attendance->clock_out) {
                    $attendance->update([
                        'clock_out' => $punchTime,
                        'source' => 'biometric',
                        'device_sn' => $deviceSn,
                    ]);
                } else {
                    $existingClockOut = Carbon::parse($attendance->clock_out);
                    if ($punchedAt->greaterThan($existingClockOut)) {
                        $attendance->update([
                            'clock_out' => $punchTime,
                        ]);
                    }
                }

                // If clock_in is present and clock_out is earlier than clock_in, swap them
                if ($attendance->clock_in) {
                    $existingClockIn = Carbon::parse($attendance->clock_in);
                    $existingClockOut = Carbon::parse($attendance->clock_out);
                    if ($existingClockOut->lessThan($existingClockIn)) {
                        $attendance->update([
                            'clock_in' => $attendance->clock_out,
                            'clock_out' => $attendance->clock_in,
                        ]);
                    }
                } else {
                    // No clock_in yet, set it as clock_in for now
                    $attendance->update([
                        'clock_in' => $punchTime,
                        'clock_out' => null,
                    ]);
                }
            }
        } else {
            // Break or OT or other
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

        // Recalculate total hours if both clock_in and clock_out are set
        if ($attendance) {
            $attendance = $attendance->fresh();
            if ($attendance->clock_in && $attendance->clock_out) {
                $clockIn = Carbon::parse($attendance->clock_in);
                $clockOut = Carbon::parse($attendance->clock_out);
                $totalHours = abs(round($clockOut->diffInSeconds($clockIn) / 3600, 2));
                $attendance->update([
                    'total_hours' => $totalHours,
                ]);
            }
        }

        $log->update(['synced' => true, 'sync_error' => null]);
    }
}
