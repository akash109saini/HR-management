<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use App\Services\StorageService;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;

class FileUploadController extends Controller
{
    public function upload(Request $request)
    {
        $user = $request->auth_user;
        $file = $request->file('file');
        if (!$file) return response()->json(['detail' => 'No file uploaded'], 400);

        $ext = $file->getClientOriginalExtension() ?: 'bin';
        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array(strtolower($ext), $allowedExts)) {
            return response()->json(['detail' => 'Only image files are allowed (jpg, png, gif, webp)'], 400);
        }
        if ($file->getSize() > 5 * 1024 * 1024) {
            return response()->json(['detail' => 'File too large (max 5MB)'], 400);
        }

        $uuid = (string)Str::uuid();
        $path = "hrms/uploads/{$uuid}.{$ext}";

        try {
            $result = StorageService::putObject($path, file_get_contents($file->getPathname()), $file->getMimeType() ?? 'image/jpeg');

            $fileRecord = [
                'id' => $uuid,
                'storage_path' => $result['path'] ?? $path,
                'original_filename' => $file->getClientOriginalName(),
                'content_type' => $file->getMimeType(),
                'size' => $result['size'] ?? $file->getSize(),
                'uploaded_by' => $user['employee_id'] ?? $user['email'],
                'tenant_id' => $user['tenant_id'] ?? '',
                'is_deleted' => false,
                'created_at' => now()->toISOString(),
            ];
            MongoService::insertOne('files', $fileRecord);
            return response()->json(['id' => $uuid, 'path' => $result['path'] ?? $path, 'url' => "/api/files/{$uuid}"]);
        } catch (\Exception $e) {
            Log::error("Upload failed: " . $e->getMessage());
            // Fallback: store as base64 in MongoDB
            $base64 = base64_encode(file_get_contents($file->getPathname()));
            $fileRecord = [
                'id' => $uuid,
                'storage_path' => "base64:{$uuid}",
                'base64_data' => $base64,
                'original_filename' => $file->getClientOriginalName(),
                'content_type' => $file->getMimeType(),
                'size' => $file->getSize(),
                'uploaded_by' => $user['employee_id'] ?? $user['email'],
                'tenant_id' => $user['tenant_id'] ?? '',
                'is_deleted' => false,
                'created_at' => now()->toISOString(),
            ];
            MongoService::insertOne('files', $fileRecord);
            return response()->json(['id' => $uuid, 'path' => "base64:{$uuid}", 'url' => "/api/files/{$uuid}"]);
        }
    }

    public function download(Request $request, string $fileId)
    {
        $record = MongoService::findOneNoId('files', ['id' => $fileId, 'is_deleted' => false]);
        if (!$record) return response()->json(['detail' => 'File not found'], 404);

        $contentType = $record['content_type'] ?? 'application/octet-stream';

        // Base64 fallback
        if (isset($record['base64_data'])) {
            $data = base64_decode($record['base64_data']);
            return response($data)->header('Content-Type', $contentType)->header('Cache-Control', 'public, max-age=86400');
        }

        try {
            $result = StorageService::getObject($record['storage_path']);
            return response($result['data'])->header('Content-Type', $contentType)->header('Cache-Control', 'public, max-age=86400');
        } catch (\Exception $e) {
            return response()->json(['detail' => 'File retrieval failed'], 500);
        }
    }
}
