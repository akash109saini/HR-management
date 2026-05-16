<?php
$dir = __DIR__ . '/backend/database/migrations/tenant';
$files = glob($dir . '/*.php');

foreach ($files as $file) {
    $content = file_get_contents($file);
    
    // Remove individual column creations
    $content = preg_replace('/^\s*\$table->(string|uuid|foreignUuid|unsignedBigInteger|integer)\([\'"]tenant_id[\'"]\).*?;$/m', '', $content);
    // Remove dropColumn
    $content = preg_replace('/^\s*\$table->dropColumn\([\'"]tenant_id[\'"]\).*?;$/m', '', $content);
    // Remove foreign keys targeting tenant_id
    $content = preg_replace('/^\s*\$table->foreign\([\'"]tenant_id[\'"]\).*?;$/m', '', $content);
    $content = preg_replace('/^\s*\$table->dropForeign\(\[[\'"]tenant_id[\'"]\]\).*?;$/m', '', $content);
    // Remove indexes using tenant_id
    $content = preg_replace('/^\s*\$table->index\([\'"]tenant_id[\'"]\).*?;$/m', '', $content);

    // It's possible tenant_id is nested inside array definitions: like $table->unique(['tenant_id', 'employee_id']);
    // We replace 'tenant_id', with empty string, then cleanup empty arrays if necessary.
    $content = str_replace("['tenant_id', ", "[", $content);
    $content = str_replace(", 'tenant_id'", "", $content);

    // Remove empty lines created by removals
    $content = preg_replace('/^\h*\v+/m', "\n", $content);
    
    file_put_contents($file, $content);
    echo "Processed: " . basename($file) . "\n";
}
