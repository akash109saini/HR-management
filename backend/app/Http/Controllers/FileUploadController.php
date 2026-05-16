<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\File;
use App\Services\StorageService;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;

class FileUploadController extends Controller
{
    public function upload(Request $request)
    {
        $user = $request->auth_user;
        $file = $request->file('file');
        if (!$file) {
            return response()->json(['detail' => 'No file uploaded'], 400);
        }

        $ext = $file->getClientOriginalExtension() ?: 'bin';
        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
        if (!in_array(strtolower($ext), $allowedExts)) {
            return response()->json(['detail' => 'Invalid file type'], 400);
        }
        if ($file->getSize() > 10 * 1024 * 1024) {
            return response()->json(['detail' => 'File too large (max 10MB)'], 400);
        }

        $uuid = (string)Str::uuid();
        $path = "hrms/uploads/{$uuid}.{$ext}";

        try {
            // Attempt cloud/S3 storage if configured
            $result = StorageService::putObject($path, file_get_contents($file->getPathname()), $file->getMimeType() ?? 'application/octet-stream');
            
            $fileRecord = File::create([
                'id' => $uuid,
                'storage_path' => $result['path'] ?? $path,
                'original_filename' => $file->getClientOriginalName(),
                'content_type' => $file->getMimeType(),
                'size' => $result['size'] ?? $file->getSize(),
                'uploaded_by' => $user['employee_id'] ?? $user['email'],
                'is_deleted' => false,
            ]);

            return response()->json([
                'id' => $uuid, 
                'path' => $result['path'] ?? $path, 
                'url' => "/api/files/{$uuid}"
            ]);

        } catch (\Exception $e) {
            Log::warning("Cloud upload failed, falling back to database base64: " . $e->getMessage());
            
            $base64 = base64_encode(file_get_contents($file->getPathname()));
            $fileRecord = File::create([
                'id' => $uuid,
                'storage_path' => "base64:{$uuid}",
                'base64_data' => $base64,
                'original_filename' => $file->getClientOriginalName(),
                'content_type' => $file->getMimeType(),
                'size' => $file->getSize(),
                'uploaded_by' => $user['employee_id'] ?? $user['email'],
                'is_deleted' => false,
            ]);

            return response()->json([
                'id' => $uuid, 
                'path' => "base64:{$uuid}", 
                'url' => "/api/files/{$uuid}"
            ]);
        }
    }

    public function download(Request $request, string $fileId)
    {
        $record = File::where('id', $fileId)->where('is_deleted', false)->first();
        if (!$record) {
            return response()->json(['detail' => 'File not found'], 404);
        }

        $contentType = $record->content_type ?? 'application/octet-stream';

        if ($record->base64_data) {
            $data = base64_decode($record->base64_data);
            return response($data)->header('Content-Type', $contentType);
        }

        try {
            $result = StorageService::getObject($record->storage_path);
            return response($result['data'])->header('Content-Type', $contentType);
        } catch (\Exception $e) {
            return response()->json(['detail' => 'File retrieval failed'], 500);
        }
    }
}
