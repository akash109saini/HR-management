<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Notification;
use Illuminate\Support\Str;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $userId = $user['id'];

        $query = Notification::query();
        
        // HR also gets tenant-wide notifications (ones without a specific user_id)
        if ($user['role'] === 'hr_manager') {
            $query->where(function($q) use ($userId) {
                $q->where('user_id', $userId)
                  ->orWhereNull('user_id');
            });
        } else {
            $query->where('user_id', $userId);
        }

        $notifications = $query->orderBy('created_at', 'desc')->limit(50)->get();
        $unreadCount = $query->where('is_read', false)->count();

        return response()->json([
            'notifications' => $notifications, 
            'unread_count' => $unreadCount
        ]);
    }

    public function markRead(Request $request, string $id)
    {
        Notification::where('id', $id)->update(['is_read' => true]);
        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllRead(Request $request)
    {
        $user = $request->auth_user;
        $userId = $user['id'];
        
        Notification::where('user_id', $userId)
                    ->where('is_read', false)
                    ->update(['is_read' => true]);
                    
        return response()->json(['message' => 'All marked as read']);
    }
}
