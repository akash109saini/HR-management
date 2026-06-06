<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Tenant;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

foreach (Tenant::all() as $tenant) {
    echo "Tenant: {$tenant->name} (DB: {$tenant->database_name})\n";
    
    Config::set('database.connections.tenant.database', $tenant->database_name);
    DB::purge('tenant');
    DB::reconnect('tenant');
    
    // Find all raw logs for pin '00000001' or '1'
    try {
        $logs = DB::connection('tenant')->table('biometric_raw_logs')
            ->where(function($q) {
                $q->where('user_pin', '00000001')
                  ->orWhere('user_pin', '1');
            })
            ->orderBy('punched_at', 'desc')
            ->limit(5)
            ->get();
            
        echo "  Raw Logs count: " . count($logs) . "\n";
        foreach ($logs as $log) {
            echo "    ID: {$log->id}, Time: {$log->punched_at}, Synced: {$log->synced}, Error: {$log->sync_error}\n";
        }
        
        // Also check attendance records for Tanish (EMP-ACME-002 -> user ID matching)
        $tanish = DB::connection('tenant')->table('users')->where('biometric_pin', '00000001')->orWhere('biometric_pin', '1')->first();
        if ($tanish) {
            $attendance = DB::connection('tenant')->table('attendances')
                ->where('user_id', $tanish->id)
                ->where('date', '2026-06-01')
                ->first();
                
            if ($attendance) {
                echo "  Attendance Record for 2026-06-01:\n";
                echo "    Clock In: " . ($attendance->clock_in ?? 'NULL') . "\n";
                echo "    Clock Out: " . ($attendance->clock_out ?? 'NULL') . "\n";
                echo "    Status: " . $attendance->status . "\n";
            } else {
                echo "  No Attendance Record for 2026-06-01\n";
            }
        }
    } catch (\Exception $e) {
        echo "  Error: " . $e->getMessage() . "\n";
    }
}
