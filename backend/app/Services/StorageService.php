<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class StorageService
{
    private static ?string $storageKey = null;
    private static string $storageUrl = '';

    public static function init(): string
    {
        if (self::$storageKey) return self::$storageKey;

        self::$storageUrl = env('STORAGE_URL', 'https://integrations.emergentagent.com/objstore/api/v1/storage');
        $emergentKey = env('EMERGENT_LLM_KEY', '');

        $ch = curl_init(self::$storageUrl . '/init');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['emergent_key' => $emergentKey]),
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            Log::error("Storage init failed: {$httpCode} - {$response}");
            throw new \Exception('Storage initialization failed');
        }

        $data = json_decode($response, true);
        self::$storageKey = $data['storage_key'] ?? '';
        return self::$storageKey;
    }

    public static function putObject(string $path, string $data, string $contentType): array
    {
        $key = self::init();
        $ch = curl_init(self::$storageUrl . "/objects/{$path}");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => 'PUT', CURLOPT_TIMEOUT => 120,
            CURLOPT_HTTPHEADER => ["X-Storage-Key: {$key}", "Content-Type: {$contentType}"],
            CURLOPT_POSTFIELDS => $data,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            Log::error("Storage upload failed: {$httpCode}");
            throw new \Exception('File upload failed');
        }
        return json_decode($response, true) ?? [];
    }

    public static function getObject(string $path): array
    {
        $key = self::init();
        $ch = curl_init(self::$storageUrl . "/objects/{$path}");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => ["X-Storage-Key: {$key}"],
            CURLOPT_HEADER => true,
        ]);
        $response = curl_exec($ch);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $headers = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);
        curl_close($ch);

        $contentType = 'application/octet-stream';
        if (preg_match('/Content-Type:\s*(.+)/i', $headers, $m)) {
            $contentType = trim($m[1]);
        }
        return ['data' => $body, 'content_type' => $contentType];
    }
}
