<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class AnnouncementController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if (in_array($user['role'], ['hr_manager', 'employee'])) $filter['tenant_id'] = $user['tenant_id'] ?? '';
        return response()->json(MongoService::find('announcements', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1], 'limit' => 100]));
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['title' => 'required', 'content' => 'required']);
        $announcement = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '', 'title' => $request->title,
            'content' => $request->content, 'priority' => $request->priority ?? 'medium',
            'created_by' => $user['name'] ?? $user['email'], 'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('announcements', $announcement);
        return response()->json($announcement, 201);
    }

    public function update(Request $request, string $announcementId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['title', 'content', 'priority']), fn($v) => $v !== null);
        MongoService::updateOne('announcements', ['id' => $announcementId], $updates);
        return response()->json(MongoService::findOneNoId('announcements', ['id' => $announcementId]));
    }

    public function destroy(Request $request, string $announcementId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('announcements', ['id' => $announcementId]);
        return response()->json(['message' => 'Deleted']);
    }
}
