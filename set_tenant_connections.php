<?php
$modelsDir = __DIR__ . '/backend/app/Models';
$files = glob($modelsDir . '/*.php');

$landlordModels = ['Tenant.php', 'BillingOrder.php', 'SuperAdmin.php', 'OnboardingTemplate.php'];

foreach ($files as $file) {
    if (in_array(basename($file), $landlordModels)) {
        continue;
    }
    
    $content = file_get_contents($file);
    
    // Check if it already has connection
    if (strpos($content, 'protected $connection') !== false) {
        continue;
    }

    // Insert after "use HasFactory;" or similar, or just after opening brace of class
    $pattern = '/(class\s+\w+\s+extends\s+Model\s*\{(?:\s*use\s+[\w\\\\, ]+;)?)/i';
    
    // Special case for User model which extends Authenticatable
    $pattern2 = '/(class\s+User\s+extends\s+Authenticatable\b.*?\{(?:\s*use\s+[\w\\\\, ]+;)?)/is';
    
    if (preg_match($pattern2, $content, $matches)) {
        $replacement = $matches[0] . "\n\n    protected \$connection = 'tenant';\n";
        $content = str_replace($matches[0], $replacement, $content);
    } elseif (preg_match($pattern, $content, $matches)) {
        $replacement = $matches[0] . "\n\n    protected \$connection = 'tenant';\n";
        $content = str_replace($matches[0], $replacement, $content);
    } else {
        echo "Could not parse model: " . basename($file) . "\n";
        continue;
    }

    file_put_contents($file, $content);
    echo "Set tenant connection on: " . basename($file) . "\n";
}
