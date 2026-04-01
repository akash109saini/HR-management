<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $empId = $user['employee_id'] ?? $user['email'];
        $filter = ['user_id' => $empId];
        // HR also gets tenant-wide notifications
        if ($user['role'] === 'hr_manager') {
            $filter = ['$or' => [['user_id' => $empId], ['tenant_id' => $user['tenant_id'] ?? '', 'user_id' => ['$exists' => false]]]];
        }
        $notifications = MongoService::find('notifications', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1], 'limit' => 50]);
        $unreadCount = MongoService::count('notifications', array_merge($filter, ['read' => false]));
        return response()->json(['notifications' => $notifications, 'unread_count' => $unreadCount]);
    }

    public function markRead(Request $request, string $id)
    {
        MongoService::updateOne('notifications', ['id' => $id], ['read' => true]);
        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllRead(Request $request)
    {
        $user = $request->auth_user;
        $empId = $user['employee_id'] ?? $user['email'];
        MongoService::collection('notifications')->updateMany(['user_id' => $empId, 'read' => false], ['$set' => ['read' => true]]);
        return response()->json(['message' => 'All marked as read']);
    }
}
