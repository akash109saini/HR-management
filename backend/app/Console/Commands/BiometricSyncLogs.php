<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Tenant;
use App\Models\BiometricRawLog;
use App\Models\User;
use App\Models\Attendance;
use Carbon\Carbon;

class BiometricSyncLogs extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'biometric:sync-logs';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Synchronize pending/unsynced biometric raw logs to attendance records across all tenants';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info("Starting biometric logs synchronization...");
        Log::info("BiometricSyncLogs: Starting sync command.");

        $tenants = Tenant::all();
        if ($tenants->isEmpty()) {
            $this->warn("No tenants found in the database.");
            return Command::SUCCESS;
        }

        foreach ($tenants as $tenant) {
            $this->info("Processing tenant: {$tenant->name} (DB: {$tenant->database_name})");
            
            try {
                // Switch connection to tenant database dynamically
                Config::set('database.connections.tenant.database', $tenant->database_name);
                DB::purge('tenant');
                DB::reconnect('tenant');

                $unsyncedLogs = BiometricRawLog::where('synced', false)
                    ->orderBy('punched_at', 'asc')
                    ->limit(100)
                    ->get();

                if ($unsyncedLogs->isEmpty()) {
                    $this->info("  No unsynced logs found.");
                    continue;
                }

                $synced = 0;
                $errors = 0;

                foreach ($unsyncedLogs as $log) {
                    try {
                        $this->syncSingleLog($log);
                        $synced++;
                    } catch (\Exception $e) {
                        $log->update(['sync_error' => $e->getMessage()]);
                        $errors++;
                        $this->error("  Error syncing log ID {$log->id}: " . $e->getMessage());
                    }
                }

                $this->info("  Sync complete: {$synced} logs synced, {$errors} errors.");
                Log::info("BiometricSyncLogs: Tenant {$tenant->name} sync complete: {$synced} synced, {$errors} errors.");

            } catch (\Exception $e) {
                $this->error("  Database connection error for tenant {$tenant->name}: " . $e->getMessage());
                Log::error("BiometricSyncLogs: Tenant {$tenant->name} connection error: " . $e->getMessage());
            }
        }

        $this->info("Biometric logs synchronization finished.");
        Log::info("BiometricSyncLogs: Sync command finished.");
        return Command::SUCCESS;
    }

    /**
     * Sync a single raw log to attendance (same logic as BiometricDeviceController).
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
            // CHECK-IN
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
            // CHECK-OUT
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
            // Break/Other
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
}
