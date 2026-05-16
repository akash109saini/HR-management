<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Announcement;
use Illuminate\Support\Str;

class AnnouncementController extends Controller
{
    public function index(Request $request)
    {
        // No tenant_id filter needed as connection is tenant-specific
        return response()->json(Announcement::orderBy('created_at', 'desc')->limit(100)->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['title' => 'required', 'content' => 'required']);

        $announcement = Announcement::create([
            'title' => $request->title,
            'content' => $request->content,
            'priority' => $request->priority ?? 'medium',
            'created_by' => $user['name'] ?? $user['email'],
        ]);

        return response()->json($announcement, 201);
    }

    public function update(Request $request, string $announcementId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $announcement = Announcement::find($announcementId);
        if (!$announcement) {
            return response()->json(['detail' => 'Announcement not found'], 404);
        }

        $updates = array_filter($request->only(['title', 'content', 'priority']), fn($v) => $v !== null);
        $announcement->update($updates);

        return response()->json($announcement->fresh());
    }

    public function destroy(Request $request, string $announcementId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        Announcement::destroy($announcementId);
        return response()->json(['message' => 'Deleted']);
    }
}
