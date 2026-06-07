<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Tenant;
use App\Models\BiometricRawLog;
use App\Models\Attendance;
use App\Models\User;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

echo "=== RETROACTIVE PUNCH LOG TIME CORRECTION ===\n";

foreach (Tenant::all() as $tenant) {
    echo "\nProcessing Tenant: {$tenant->name} (DB: {$tenant->database_name})\n";
    
    // Switch to Tenant DB
    Config::set('database.connections.tenant.database', $tenant->database_name);
    DB::purge('tenant');
    DB::reconnect('tenant');
    
    try {
        // Fetch all raw logs
        $rawLogs = DB::connection('tenant')->table('biometric_raw_logs')->get();
        echo "Found " . count($rawLogs) . " raw logs total.\n";
        
        $updatedCount = 0;
        $affectedUsersAndDates = []; // Format: ['user_id' => ['YYYY-MM-DD' => true]]
        
        foreach ($rawLogs as $log) {
            $rawLine = $log->raw_line;
            if (empty($rawLine)) continue;
            
            $payload = json_decode($rawLine, true);
            if (!is_array($payload)) continue;
            
            // Check if SystemDate is present
            $correctTimeStr = $payload['SystemDate'] ?? null;
            if (!$correctTimeStr) continue;
            
            $correctTime = Carbon::parse($correctTimeStr);
            $currentTime = Carbon::parse($log->punched_at);
            
            if ($correctTime->format('Y-m-d H:i:s') !== $currentTime->format('Y-m-d H:i:s')) {
                echo "  Log ID {$log->id} for PIN {$log->user_pin}: '{$currentTime->format('Y-m-d H:i:s')}' -> '{$correctTime->format('Y-m-d H:i:s')}'\n";
                
                // Update raw log in DB
                DB::connection('tenant')->table('biometric_raw_logs')
                    ->where('id', $log->id)
                    ->update([
                        'punched_at' => $correctTime,
                        'synced' => 0,
                        'sync_error' => null
                    ]);
                
                $updatedCount++;
                
                // Track affected user pin and date
                $affectedUsersAndDates[$log->user_pin][$correctTime->format('Y-m-d')] = true;
                $affectedUsersAndDates[$log->user_pin][$currentTime->format('Y-m-d')] = true; // also clean old wrong date if it shifted
            }
        }
        
        echo "Updated {$updatedCount} raw log timestamps.\n";
        
        if (count($affectedUsersAndDates) > 0) {
            echo "Rebuilding attendance records for affected dates...\n";
            
            foreach ($affectedUsersAndDates as $userPin => $dates) {
                // Find matching user
                $normalizedPin = ltrim($userPin, '0');
                if ($normalizedPin === '') $normalizedPin = '0';
                
                $user = DB::connection('tenant')->table('users')
                    ->where('biometric_pin', $userPin)
                    ->orWhere('biometric_pin', $normalizedPin)
                    ->orWhere('employee_id', $userPin)
                    ->orWhere('employee_id', $normalizedPin)
                    ->first();
                
                if (!$user) {
                    echo "  No user found for PIN {$userPin}, skipping attendance rebuild.\n";
                    continue;
                }
                
                foreach (array_keys($dates) as $dateStr) {
                    echo "  Rebuilding Attendance for User: {$user->name} (PIN: {$userPin}) on Date: {$dateStr}\n";
                    
                    // 1. Delete existing attendance record for this date to avoid duplication
                    DB::connection('tenant')->table('attendances')
                        ->where('user_id', $user->id)
                        ->where('date', $dateStr)
                        ->delete();
                    
                    // 2. Fetch all raw logs for this user on this date, ordered by punched_at ASC
                    $logsForDay = DB::connection('tenant')->table('biometric_raw_logs')
                        ->where('user_pin', $userPin)
                        ->whereDate('punched_at', $dateStr)
                        ->orderBy('punched_at', 'asc')
                        ->get();
                    
                    // 3. Re-sync each log sequentially
                    foreach ($logsForDay as $rawLogObj) {
                        // Find attendance record again (or create one)
                        $attendance = DB::connection('tenant')->table('attendances')
                            ->where('user_id', $user->id)
                            ->where('date', $dateStr)
                            ->first();
                        
                        $punchedAt = Carbon::parse($rawLogObj->punched_at);
                        $punchTime = $punchedAt->toIso8601String();
                        $punchStatus = (int)$rawLogObj->punch_status;
                        
                        if ($punchStatus === 0) {
                            if (!$attendance) {
                                DB::connection('tenant')->table('attendances')->insert([
                                    'id' => (string)\Illuminate\Support\Str::uuid(),
                                    'user_id' => $user->id,
                                    'date' => $dateStr,
                                    'clock_in' => $punchTime,
                                    'clock_out' => null,
                                    'status' => 'present',
                                    'source' => 'biometric',
                                    'device_sn' => $rawLogObj->device_sn,
                                    'total_hours' => 0,
                                    'created_at' => now(),
                                    'updated_at' => now(),
                                ]);
                            } else {
                                if (!$attendance->clock_in) {
                                    DB::connection('tenant')->table('attendances')
                                        ->where('id', $attendance->id)
                                        ->update([
                                            'clock_in' => $punchTime,
                                            'source' => 'biometric',
                                            'device_sn' => $rawLogObj->device_sn,
                                            'updated_at' => now(),
                                        ]);
                                } else {
                                    $existingClockIn = Carbon::parse($attendance->clock_in);
                                    if ($punchedAt->lessThan($existingClockIn)) {
                                        $newClockOut = $attendance->clock_out;
                                        if (!$newClockOut) {
                                            $newClockOut = $attendance->clock_in;
                                        }
                                        DB::connection('tenant')->table('attendances')
                                            ->where('id', $attendance->id)
                                            ->update([
                                                'clock_in' => $punchTime,
                                                'clock_out' => $newClockOut,
                                                'updated_at' => now(),
                                            ]);
                                    } else {
                                        if (!$attendance->clock_out) {
                                            DB::connection('tenant')->table('attendances')
                                                ->where('id', $attendance->id)
                                                ->update([
                                                    'clock_out' => $punchTime,
                                                    'updated_at' => now(),
                                                ]);
                                        } else {
                                            $existingClockOut = Carbon::parse($attendance->clock_out);
                                            if ($punchedAt->greaterThan($existingClockOut)) {
                                                DB::connection('tenant')->table('attendances')
                                                    ->where('id', $attendance->id)
                                                    ->update([
                                                        'clock_out' => $punchTime,
                                                        'updated_at' => now(),
                                                    ]);
                                            }
                                        }
                                    }
                                }
                            }
                        } elseif ($punchStatus === 1) {
                            if (!$attendance) {
                                DB::connection('tenant')->table('attendances')->insert([
                                    'id' => (string)\Illuminate\Support\Str::uuid(),
                                    'user_id' => $user->id,
                                    'date' => $dateStr,
                                    'clock_in' => null,
                                    'clock_out' => $punchTime,
                                    'status' => 'present',
                                    'source' => 'biometric',
                                    'device_sn' => $rawLogObj->device_sn,
                                    'total_hours' => 0,
                                    'created_at' => now(),
                                    'updated_at' => now(),
                                ]);
                            } else {
                                if (!$attendance->clock_out) {
                                    DB::connection('tenant')->table('attendances')
                                        ->where('id', $attendance->id)
                                        ->update([
                                            'clock_out' => $punchTime,
                                            'source' => 'biometric',
                                            'device_sn' => $rawLogObj->device_sn,
                                            'updated_at' => now(),
                                        ]);
                                } else {
                                    $existingClockOut = Carbon::parse($attendance->clock_out);
                                    if ($punchedAt->greaterThan($existingClockOut)) {
                                        DB::connection('tenant')->table('attendances')
                                            ->where('id', $attendance->id)
                                            ->update([
                                                'clock_out' => $punchTime,
                                                'updated_at' => now(),
                                            ]);
                                    }
                                }
                                
                                if ($attendance->clock_in) {
                                    $existingClockIn = Carbon::parse($attendance->clock_in);
                                    $existingClockOut = Carbon::parse($attendance->clock_out);
                                    if ($existingClockOut->lessThan($existingClockIn)) {
                                        DB::connection('tenant')->table('attendances')
                                            ->where('id', $attendance->id)
                                            ->update([
                                                'clock_in' => $attendance->clock_out,
                                                'clock_out' => $attendance->clock_in,
                                                'updated_at' => now(),
                                            ]);
                                    }
                                } else {
                                    DB::connection('tenant')->table('attendances')
                                        ->where('id', $attendance->id)
                                        ->update([
                                            'clock_in' => $punchTime,
                                            'clock_out' => null,
                                            'updated_at' => now(),
                                        ]);
                                }
                            }
                        } else {
                            if (!$attendance) {
                                DB::connection('tenant')->table('attendances')->insert([
                                    'id' => (string)\Illuminate\Support\Str::uuid(),
                                    'user_id' => $user->id,
                                    'date' => $dateStr,
                                    'clock_in' => $punchTime,
                                    'clock_out' => null,
                                    'status' => 'present',
                                    'source' => 'biometric',
                                    'device_sn' => $rawLogObj->device_sn,
                                    'total_hours' => 0,
                                    'created_at' => now(),
                                    'updated_at' => now(),
                                ]);
                            }
                        }
                        
                        // Recalculate total hours
                        $attendance = DB::connection('tenant')->table('attendances')
                            ->where('user_id', $user->id)
                            ->where('date', $dateStr)
                            ->first();
                            
                        if ($attendance && $attendance->clock_in && $attendance->clock_out) {
                            $clockIn = Carbon::parse($attendance->clock_in);
                            $clockOut = Carbon::parse($attendance->clock_out);
                            $totalHours = abs(round($clockOut->diffInSeconds($clockIn) / 3600, 2));
                            DB::connection('tenant')->table('attendances')
                                ->where('id', $attendance->id)
                                ->update([
                                    'total_hours' => $totalHours,
                                    'updated_at' => now(),
                                ]);
                        }
                        
                        // Mark raw log as synced
                        DB::connection('tenant')->table('biometric_raw_logs')
                            ->where('id', $rawLogObj->id)
                            ->update([
                                'synced' => 1,
                                'sync_error' => null
                            ]);
                    }
                }
            }
        }
        
    } catch (\Exception $e) {
        echo "Error: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
    }
}
echo "\n=== ALL TENANTS PROCESSED ===\n";
