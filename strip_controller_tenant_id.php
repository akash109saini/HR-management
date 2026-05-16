<?php
$dir = __DIR__ . '/backend/app/Http/Controllers';
$files = glob($dir . '/*.php');

foreach ($files as $file) {
    if (basename($file) === 'Controller.php' || basename($file) === 'TenantController.php' || basename($file) === 'AuthController.php') {
        continue; // Keep these intact as they deal with actual Tenant models and Auth cross-db mapping
    }

    $content = file_get_contents($file);
    
    // 1. Remove `->where('tenant_id', ...)` 
    $content = preg_replace('/->where\([\'"]tenant_id[\'"],.*?\)/is', '', $content);
    
    // 2. Remove `$query->where('tenant_id', ...);` variations
    $content = preg_replace('/\$[a-zA-Z0-9_]+->where\([\'"]tenant_id[\'"],.*?\);/is', '', $content);
    
    // 3. Remove `'tenant_id' => ... ,`
    $content = preg_replace('/[\'"]tenant_id[\'"]\s*=>\s*.*?,/is', '', $content);
    // and without comma at the end of array
    $content = preg_replace('/[\'"]tenant_id[\'"]\s*=>\s*[^,\]}]+/is', '', $content);
    
    // 4. Remove any loose checks like `if ($req->query('tenant_id'))` or variables `$tenantId = ...`
    // It's safer just to remove `$tenantId = $user['tenant_id'] ?? $request->query('tenant_id', '');` entirely.
    $content = preg_replace('/\$tenantId\s*=\s*.*?;/is', '', $content);

    // 5. Some loops and updates might look like ->where('tenant_id', $dept->tenant_id). Let's remove any object property accesses to tenant_id
    $content = preg_replace('/\$[a-zA-Z0-9_]+->tenant_id/is', 'null', $content); // Replace with null to avoid undefined property just in case, or rather just leave them if they were used in where clauses which we already stripped.
    
    file_put_contents($file, $content);
    echo "Processed: " . basename($file) . "\n";
}
