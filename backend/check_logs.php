<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\BiometricDevice;
use App\Models\Tenant;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

echo "=== REGISTERED DEVICES & HEARTBEATS ===\n";
foreach (BiometricDevice::all() as $dev) {
    echo "SN: {$dev->serial_number}, Name: {$dev->name}, Status: {$dev->status}, Last Heartbeat: {$dev->last_heartbeat}, Tenant: {$dev->tenant_id}\n";
}

echo "\n=== TENANT DATABASES LOGS FOR THE LAST 5 DAYS ===\n";
foreach (Tenant::all() as $tenant) {
    echo "Tenant: {$tenant->name} (DB: {$tenant->database_name})\n";
    
    Config::set('database.connections.tenant.database', $tenant->database_name);
    DB::purge('tenant');
    DB::reconnect('tenant');
    
    try {
        $recentLogs = DB::connection('tenant')->table('biometric_raw_logs')
            ->where('punched_at', '>=', Carbon::now()->subDays(5)->toDateString())
            ->orderBy('punched_at', 'desc')
            ->limit(30)
            ->get();
            
        echo "  Raw Logs count: " . count($recentLogs) . "\n";
        foreach ($recentLogs as $log) {
            echo "    ID: {$log->id}, SN: {$log->device_sn}, PIN: {$log->user_pin}, Time: {$log->punched_at}, Status: {$log->punch_status}, Synced: {$log->synced}, Error: {$log->sync_error}\n";
        }
        
    } catch (\Exception $e) {
        echo "  Error querying: " . $e->getMessage() . "\n";
    }
}
