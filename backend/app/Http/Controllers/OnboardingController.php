<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class OnboardingController extends Controller
{
    // Get checklist template or employee-specific checklist
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $employeeId = $request->query('employee_id');

        if ($employeeId) {
            // Get specific employee's onboarding checklist
            $checklist = MongoService::findOneNoId('onboarding_checklists', ['employee_id' => $employeeId]);
            if (!$checklist) {
                // Create from template
                $template = MongoService::find('onboarding_templates', ['tenant_id' => $user['tenant_id'] ?? '']);
                $items = array_map(fn($t) => ['id' => (string)Str::uuid(), 'title' => $t['title'], 'description' => $t['description'] ?? '', 'category' => $t['category'] ?? 'general', 'completed' => false, 'completed_at' => null], $template);
                $checklist = [
                    'id' => (string)Str::uuid(), 'employee_id' => $employeeId, 'tenant_id' => $user['tenant_id'] ?? '',
                    'items' => $items, 'progress' => 0, 'status' => 'in_progress', 'created_at' => now()->toISOString(),
                ];
                MongoService::insertOne('onboarding_checklists', $checklist);
            }
            return response()->json($checklist);
        }

        // List all onboarding checklists
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        elseif ($user['role'] === 'employee') $filter['employee_id'] = $user['employee_id'] ?? '';
        return response()->json(MongoService::find('onboarding_checklists', $filter));
    }

    // Update checklist item status
    public function updateItem(Request $request, string $checklistId, string $itemId)
    {
        $checklist = MongoService::findOneNoId('onboarding_checklists', ['id' => $checklistId]);
        if (!$checklist) return response()->json(['detail' => 'Checklist not found'], 404);

        $items = $checklist['items'] ?? [];
        $updated = false;
        foreach ($items as &$item) {
            if (($item['id'] ?? '') === $itemId) {
                $item['completed'] = $request->completed ?? true;
                $item['completed_at'] = $item['completed'] ? now()->toISOString() : null;
                $updated = true;
                break;
            }
        }
        if (!$updated) return response()->json(['detail' => 'Item not found'], 404);

        $completedCount = count(array_filter($items, fn($i) => $i['completed'] ?? false));
        $progress = count($items) > 0 ? round(($completedCount / count($items)) * 100) : 0;
        $status = $progress >= 100 ? 'completed' : 'in_progress';

        MongoService::collection('onboarding_checklists')->updateOne(
            ['id' => $checklistId],
            ['$set' => ['items' => $items, 'progress' => $progress, 'status' => $status]]
        );

        $checklist['items'] = $items;
        $checklist['progress'] = $progress;
        $checklist['status'] = $status;
        return response()->json($checklist);
    }

    // Manage onboarding templates
    public function listTemplates(Request $request)
    {
        $user = $request->auth_user;
        return response()->json(MongoService::find('onboarding_templates', ['tenant_id' => $user['tenant_id'] ?? '']));
    }

    public function createTemplate(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['title' => 'required']);
        $template = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '',
            'title' => $request->title, 'description' => $request->description ?? '',
            'category' => $request->category ?? 'general', 'order' => (int)($request->order ?? 0),
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('onboarding_templates', $template);
        return response()->json($template, 201);
    }

    public function deleteTemplate(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        MongoService::deleteOne('onboarding_templates', ['id' => $id]);
        return response()->json(['message' => 'Deleted']);
    }
}
