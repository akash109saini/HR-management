<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\PerformanceReview;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;

class PerformanceController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = PerformanceReview::query();

        if ($user['role'] === 'employee') {
            $query->where('user_id', $user['id']);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate([
            'employee_id' => 'required', 
            'review_period' => 'required', 
            'rating' => 'required|integer|min:1|max:5'
        ]);

        $employee = User::where('employee_id', $request->employee_id)->first();
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        $review = PerformanceReview::create([
            'user_id' => $employee->id,
            'employee_id' => $request->employee_id,
            'employee_name' => $employee->name ?? '',
            'reviewer_id' => $user['id'],
            'reviewer_name' => $user['name'] ?? '',
            'review_period' => $request->review_period,
            'rating' => (int)$request->rating,
            'goals' => $request->goals ?? '',
            'achievements' => $request->achievements ?? '',
            'areas_of_improvement' => $request->areas_of_improvement ?? '',
            'status' => 'submitted',
        ]);

        return response()->json($review, 201);
    }

    public function update(Request $request, string $reviewId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $review = PerformanceReview::find($reviewId);
        if (!$review) {
            return response()->json(['detail' => 'Review not found'], 404);
        }

        $updates = array_filter($request->only(['rating', 'goals', 'achievements', 'areas_of_improvement', 'status']), fn($v) => $v !== null);
        $review->update($updates);

        return response()->json($review->fresh());
    }

    public function generateAiSummary(Request $request, string $reviewId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $review = PerformanceReview::find($reviewId);
        if (!$review) {
            return response()->json(['detail' => 'Review not found'], 404);
        }

        $apiKey = env('EMERGENT_LLM_KEY', '');
        if (!$apiKey) {
            return response()->json(['detail' => 'AI service not configured'], 500);
        }

        try {
            $prompt = "Generate a professional performance review summary:\n\nEmployee: " . ($review->employee_name ?? 'N/A')
                . "\nPeriod: " . ($review->review_period ?? 'N/A') . "\nRating: " . ($review->rating ?? 'N/A') . "/5"
                . "\nGoals: " . ($review->goals ?? 'N/A') . "\nAchievements: " . ($review->achievements ?? 'N/A')
                . "\nAreas of Improvement: " . ($review->areas_of_improvement ?? 'N/A')
                . "\n\nProvide a 3-4 sentence summary highlighting key strengths, areas for growth, and overall assessment.";

            $proxyUrl = env('INTEGRATION_PROXY_URL', 'https://integrations.emergentagent.com');
            $ch = curl_init("{$proxyUrl}/api/v1/chat/completions");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer {$apiKey}"],
                CURLOPT_POSTFIELDS => json_encode([
                    'model' => 'gpt-5.2',
                    'messages' => [
                        ['role' => 'system', 'content' => 'You are an HR performance review analyst. Generate concise, professional performance summaries.'],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                    'max_tokens' => 300,
                ]),
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                $summary = "Performance Review Summary for {$review->employee_name}: Rated {$review->rating}/5 for {$review->review_period}. Key achievements: {$review->achievements}. Areas for growth: {$review->areas_of_improvement}.";
            } else {
                $data = json_decode($response, true);
                $summary = $data['choices'][0]['message']['content'] ?? 'Summary generation completed.';
            }

            $review->update(['ai_summary' => $summary]);
            return response()->json(['ai_summary' => $summary]);

        } catch (\Exception $e) {
            Log::error("AI summary failed: " . $e->getMessage());
            return response()->json(['detail' => 'AI summary generation failed: ' . $e->getMessage()], 500);
        }
    }
}
