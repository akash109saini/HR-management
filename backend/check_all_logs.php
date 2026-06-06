<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Tenant;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

foreach (Tenant::all() as $tenant) {
    echo "Tenant: {$tenant->name}\n";
    
    Config::set('database.connections.tenant.database', $tenant->database_name);
    DB::purge('tenant');
    DB::reconnect('tenant');
    
    try {
        $logs = DB::connection('tenant')->table('biometric_raw_logs')
            ->orderBy('id', 'desc')
            ->limit(20)
            ->get();
            
        echo "  Latest 20 Logs:\n";
        foreach ($logs as $log) {
            echo "    ID: {$log->id}, SN: {$log->device_sn}, PIN: {$log->user_pin}, Time: {$log->punched_at}, Status: {$log->punch_status}, Synced: {$log->synced}, Error: {$log->sync_error}\n";
        }
    } catch (\Exception $e) {
        echo "  Error: " . $e->getMessage() . "\n";
    }
}
