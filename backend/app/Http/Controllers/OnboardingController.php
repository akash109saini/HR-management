<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\OnboardingTemplate;
use App\Models\OnboardingChecklist;
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
            $checklist = OnboardingChecklist::where('employee_id', $employeeId)->first();
            
            if (!$checklist) {
                // Create from tenant-specific template
                $template = OnboardingTemplate::orderBy('order', 'asc')->get();
                
                $items = array_map(function($t) {
                    return [
                        'id' => (string)Str::uuid(), 
                        'title' => $t['title'], 
                        'description' => $t['description'] ?? '', 
                        'category' => $t['category'] ?? 'general', 
                        'completed' => false, 
                        'completed_at' => null
                    ];
                }, $template->toArray());

                $checklist = OnboardingChecklist::create([
                    'employee_id' => $employeeId,
                    'items' => $items, 
                    'progress' => 0, 
                    'status' => 'in_progress',
                ]);
            }
            return response()->json($checklist);
        }

        // List all onboarding checklists for this tenant
        $query = OnboardingChecklist::query();
        if ($user['role'] === 'employee') {
            $query->where('employee_id', $user['employee_id'] ?? '');
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    // Update checklist item status
    public function updateItem(Request $request, string $checklistId, string $itemId)
    {
        $checklist = OnboardingChecklist::find($checklistId);
        if (!$checklist) {
            return response()->json(['detail' => 'Checklist not found'], 404);
        }

        $items = $checklist->items ?? [];
        $updated = false;
        
        foreach ($items as &$item) {
            if (($item['id'] ?? '') === $itemId) {
                $item['completed'] = $request->completed ?? true;
                $item['completed_at'] = $item['completed'] ? now()->toIso8601String() : null;
                $updated = true;
                break;
            }
        }
        
        if (!$updated) {
            return response()->json(['detail' => 'Item not found'], 404);
        }

        $completedCount = count(array_filter($items, fn($i) => $i['completed'] ?? false));
        $progress = count($items) > 0 ? round(($completedCount / count($items)) * 100) : 0;
        $status = $progress >= 100 ? 'completed' : 'in_progress';

        $checklist->update([
            'items' => $items, 
            'progress' => (int)$progress, 
            'status' => $status
        ]);

        return response()->json($checklist->fresh());
    }

    // Manage onboarding templates
    public function listTemplates(Request $request)
    {
        return response()->json(OnboardingTemplate::orderBy('order', 'asc')->get());
    }

    public function createTemplate(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['title' => 'required']);

        $template = OnboardingTemplate::create([
            'title' => $request->title, 
            'description' => $request->description ?? '',
            'category' => $request->category ?? 'general', 
            'order' => (int)($request->order ?? 0),
        ]);

        return response()->json($template, 201);
    }

    public function deleteTemplate(Request $request, string $id)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        OnboardingTemplate::destroy($id);
        return response()->json(['message' => 'Deleted']);
    }
}
