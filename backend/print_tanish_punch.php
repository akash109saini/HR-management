<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Tenant;
use App\Models\BiometricRawLog;
use App\Models\User;
use App\Models\Attendance;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

$tenant = Tenant::where('name', 'Acme Corp')->first();
Config::set('database.connections.tenant.database', $tenant->database_name);
DB::purge('tenant');
DB::reconnect('tenant');

$log = BiometricRawLog::where('user_pin', '00000001')
    ->whereDate('punched_at', '2026-06-01')
    ->first();

if (!$log) {
    echo "No log found for Tanish on 2026-06-01!\n";
    exit;
}

$user = User::where('biometric_pin', '00000001')->first();
$att = Attendance::where('user_id', $user->id)
    ->where('date', '2026-06-01')
    ->first();

echo "=== TANISH PUNCH TIME CHECK ===\n";
echo "1. Device Local Punch Time: 2026-06-01 18:15:22 (IST)\n";
echo "2. BiometricRawLog -> punched_at (saved in DB): " . $log->getRawOriginal('punched_at') . "\n";
echo "3. BiometricRawLog -> created_at (received_at): " . $log->getRawOriginal('created_at') . "\n";
echo "4. Attendance -> clock_in: " . ($att ? $att->clock_in : 'None') . "\n";
echo "5. Attendance -> clock_out: " . ($att ? $att->clock_out : 'None') . "\n";

// Diff calculation
$actualPunch = Carbon\Carbon::parse('2026-06-01 18:15:22', 'Asia/Kolkata');
$dbPunch = Carbon\Carbon::parse($log->getRawOriginal('punched_at')); // UTC

$diffSecs = $dbPunch->diffInSeconds($actualPunch);
$diffHours = $diffSecs / 3600;

echo "\n=== TIMEZONE OFFSET COMPARISON ===\n";
echo "Actual Local Punch (IST): " . $actualPunch->toIso8601String() . "\n";
echo "DB Saved DateTime (UTC): " . $dbPunch->toIso8601String() . "\n";
echo "Difference: " . $diffSecs . " seconds (" . $diffHours . " hours)\n";
?>
