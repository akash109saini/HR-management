<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Tenant;
use App\Models\BiometricRawLog;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

$tenant = Tenant::where('name', 'Acme Corp')->first();
Config::set('database.connections.tenant.database', $tenant->database_name);
DB::purge('tenant');
DB::reconnect('tenant');

// Delete any existing simulation first to be clean
BiometricRawLog::where('user_pin', '00000001')
    ->whereDate('punched_at', '2026-06-01')
    ->delete();

// Create the simulated raw log
$log = BiometricRawLog::create([
    'device_sn' => 'TEST_REALTIME_DEVICE_12345',
    'user_pin' => '00000001',
    'punched_at' => Carbon::parse('2026-06-01 18:15:22', 'Asia/Kolkata'),
    'punch_status' => 0, // Check-In
    'verify_mode' => 15, // Face
    'raw_line' => 'SIMULATED PUNCH',
    'synced' => false,
]);

echo "Simulated punch created with ID: {$log->id}\n";
?>
