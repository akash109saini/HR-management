<?php

/**
 * Laravel API Gateway for Shared Hosting
 * Domain: hr.dmrhospitals.com
 * 
 * This file sits in: /home2/dmrhospi/public_html/hr/laravel_api.php
 * Laravel app is at: /home2/dmrhospi/laravel_backend/
 */

define('LARAVEL_START', microtime(true));

// If request is for ADMS biometric device (starts with /iclock), map request URI internally to /api/iclock
if (isset($_SERVER['REQUEST_URI']) && str_starts_with($_SERVER['REQUEST_URI'], '/iclock')) {
    $_SERVER['REQUEST_URI'] = '/api' . $_SERVER['REQUEST_URI'];
}

// Absolute path to the Laravel application (outside public_html for security)
$laravelPath = '/home2/dmrhospi/laravel_backend';

// Check maintenance mode
if (file_exists($maintenance = $laravelPath . '/storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register Composer autoloader
require $laravelPath . '/vendor/autoload.php';

// Set working directory to laravel app
chdir($laravelPath);

// Bootstrap Laravel
$app = require_once $laravelPath . '/bootstrap/app.php';

// Handle the incoming request
$app->handleRequest(Illuminate\Http\Request::capture());
