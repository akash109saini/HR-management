<?php
// Secure deployment script for Bluehost hr.dmrhospitals.com
define('DEPLOY_TOKEN', 'dmr_bh_deploy_token_2026_x87a912bf');

// Resolve headers case-insensitively
$headers = getallheaders();
$token = '';
foreach ($headers as $key => $value) {
    if (strtolower($key) === 'x-deploy-token') {
        $token = $value;
        break;
    }
}

if ($token !== DEPLOY_TOKEN) {
    header('HTTP/1.1 403 Forbidden');
    echo 'Forbidden: Invalid Deploy Token';
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    echo 'Method Not Allowed';
    exit;
}

if (!isset($_FILES['file'])) {
    header('HTTP/1.1 400 Bad Request');
    echo 'Bad Request: No file uploaded';
    exit;
}

$uploadedFile = $_FILES['file']['tmp_name'];
$fileName = $_FILES['file']['name'];

if (pathinfo($fileName, PATHINFO_EXTENSION) !== 'zip') {
    header('HTTP/1.1 400 Bad Request');
    echo 'Bad Request: Only ZIP files allowed';
    exit;
}

$zip = new ZipArchive();
if ($zip->open($uploadedFile) === TRUE) {
    // Extract everything to the current folder (public_html/hr/)
    $zip->extractTo(__DIR__);
    $zip->close();
    
    echo 'SUCCESS: React frontend deployed and extracted successfully!';
} else {
    header('HTTP/1.1 500 Internal Server Error');
    echo 'Internal Error: Failed to open ZIP file';
}
