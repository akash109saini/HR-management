<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Leave;
use App\Models\Attendance;
use App\Models\PerformanceReview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiController extends Controller
{
    private function callGemini($payload)
    {
        $apiKey = env('GOOGLE_GENERATIVE_AI_API_KEY');
        if (!$apiKey) {
            throw new \Exception('Google Gemini API key not configured in .env');
        }

        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}";
        
        $response = Http::withHeaders([
            'Content-Type' => 'application/json'
        ])->post($url, $payload);

        if ($response->failed()) {
            throw new \Exception('Gemini API call failed: ' . $response->body());
        }

        $data = $response->json();
        $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        
        if (empty($text)) {
            throw new \Exception('Invalid empty response from Gemini API');
        }

        return $text;
    }

    private function cleanJsonResponse($text)
    {
        $text = trim($text);
        if (str_starts_with($text, '```json')) {
            $text = substr($text, 7);
        } elseif (str_starts_with($text, '```')) {
            $text = substr($text, 3);
        }
        
        if (str_ends_with($text, '```')) {
            $text = substr($text, 0, -3);
        }
        
        return trim($text);
    }

    public function chat(Request $request)
    {
        $request->validate([
            'message' => 'required|string',
        ]);

        $message = $request->message;
        $files = $request->files_payload ?? $request->files ?? [];

        try {
            $parts = [];
            $parts[] = ['text' => $message];

            if (!empty($files) && is_array($files)) {
                foreach ($files as $file) {
                    if (isset($file['type']) && isset($file['data'])) {
                        $parts[] = [
                            'inlineData' => [
                                'mimeType' => $file['type'],
                                'data' => $file['data']
                            ]
                        ];
                    }
                }
            }

            $payload = [
                'contents' => [
                    [
                        'parts' => $parts
                    ]
                ],
                'systemInstruction' => [
                    'parts' => [
                        ['text' => 'You are a professional HR assistant. You help employees and managers with leaves, policies, payslips, and career guidance. Be helpful, concise, and professional.']
                    ]
                ]
            ];

            $response = $this->callGemini($payload);

            return response()->json([
                'response' => $response,
                'session_id' => $request->session_id ?? ('chat_' . uniqid())
            ]);

        } catch (\Exception $e) {
            Log::error("Gemini Chat error: " . $e->getMessage());
            return response()->json(['detail' => $e->getMessage()], 500);
        }
    }

    public function sentiment(Request $request)
    {
        $request->validate([
            'text' => 'required|string',
        ]);

        $text = $request->text;
        $context = $request->context ?? 'HR feedback';

        try {
            $prompt = "Analyze the sentiment of the following text:\n\"{$text}\"\nContext: {$context}\n\n"
                . "Output a valid JSON object matching the following structure EXACTLY. "
                . "Do not output markdown code blocks (like ```json). Respond with only the raw JSON string.\n"
                . "JSON Schema:\n"
                . "{\n"
                . "  \"sentiment\": \"positive\" | \"negative\" | \"neutral\" | \"mixed\",\n"
                . "  \"score\": (float between -1.0 and 1.0, where -1 is highly negative, 1 is highly positive, 0 is neutral),\n"
                . "  \"confidence\": (float between 0.0 and 1.0),\n"
                . "  \"emotions\": (array of strings representing detected emotions, e.g. [\"joy\", \"frustration\"]),\n"
                . "  \"summary\": (string, 1-2 sentence summary of feedback),\n"
                . "  \"action_needed\": (boolean, true if negative or critical feedback needing urgent HR review),\n"
                . "  \"recommended_action\": (string, suggestion for HR manager on how to address this feedback)\n"
                . "}";

            $payload = [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ]
            ];

            $response = $this->callGemini($payload);
            $jsonString = $this->cleanJsonResponse($response);
            $parsed = json_decode($jsonString, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \Exception('Failed to parse JSON response from AI: ' . $jsonString);
            }

            return response()->json($parsed);

        } catch (\Exception $e) {
            Log::error("Gemini Sentiment error: " . $e->getMessage());
            return response()->json(['detail' => $e->getMessage()], 500);
        }
    }

    private function getEmployeeStats($employee)
    {
        $leavesCount = Leave::where('user_id', $employee->id)->count();
        $leavesApproved = Leave::where('user_id', $employee->id)->where('status', 'approved')->count();
        $leavesRejected = Leave::where('user_id', $employee->id)->where('status', 'rejected')->count();

        $attendanceCount = Attendance::where('user_id', $employee->id)->count();

        $reviews = PerformanceReview::where('user_id', $employee->id)->get();
        $reviewsStr = "";
        foreach ($reviews as $r) {
            $reviewsStr .= "- Period: {$r->review_period}, Rating: {$r->rating}/5, Summary: {$r->ai_summary}\n";
        }

        return [
            'leavesCount' => $leavesCount,
            'leavesApproved' => $leavesApproved,
            'leavesRejected' => $leavesRejected,
            'attendanceCount' => $attendanceCount,
            'reviewsStr' => $reviewsStr ?: "None available"
        ];
    }

    public function attritionRisk(Request $request, string $employeeId)
    {
        $employee = null;
        if ($employeeId !== 'null' && $employeeId !== 'undefined' && !empty($employeeId)) {
            $employee = User::where('employee_id', $employeeId)->orWhere('id', $employeeId)->first();
        }
        if (!$employee) {
            $employee = User::find($request->auth_user['id'] ?? null);
        }
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        try {
            $stats = $this->getEmployeeStats($employee);

            $prompt = "You are an HR analyst. Assess the attrition risk of the following employee based on their metrics:\n\n"
                . "Name: {$employee->name}\n"
                . "Position: {$employee->position}\n"
                . "Department: {$employee->department}\n"
                . "Role: {$employee->role}\n"
                . "Date Joined: " . ($employee->created_at ? $employee->created_at->toDateString() : 'N/A') . "\n"
                . "Current Leave Balance: {$employee->leave_balance} days\n"
                . "Total Leave Applications: {$stats['leavesCount']} (Approved: {$stats['leavesApproved']}, Rejected: {$stats['leavesRejected']})\n"
                . "Total Attendance Records: {$stats['attendanceCount']} days\n"
                . "Performance Reviews:\n{$stats['reviewsStr']}\n\n"
                . "Output a valid JSON object matching the following structure EXACTLY. "
                . "Do not output markdown code blocks (like ```json). Respond with only the raw JSON string.\n"
                . "JSON Schema:\n"
                . "{\n"
                . "  \"risk_score\": (integer between 0 and 100, where 0 is no risk and 100 is critical risk),\n"
                . "  \"risk_level\": \"low\" | \"medium\" | \"high\",\n"
                . "  \"summary\": (string, 2-3 sentence overview of why the score was assigned),\n"
                . "  \"key_factors\": (array of strings, e.g. [\"Frequent leaves\", \"Low performance rating\"]),\n"
                . "  \"recommendations\": (array of strings, e.g. [\"Conduct a stay interview\", \"Review salary structure\"])\n"
                . "}";

            $payload = [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ]
            ];

            $response = $this->callGemini($payload);
            $jsonString = $this->cleanJsonResponse($response);
            $parsed = json_decode($jsonString, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \Exception('Failed to parse JSON response from AI: ' . $jsonString);
            }

            return response()->json($parsed);

        } catch (\Exception $e) {
            Log::error("Gemini Attrition error: " . $e->getMessage());
            return response()->json(['detail' => $e->getMessage()], 500);
        }
    }

    public function careerPath(Request $request, string $employeeId)
    {
        $employee = null;
        if ($employeeId !== 'null' && $employeeId !== 'undefined' && !empty($employeeId)) {
            $employee = User::where('employee_id', $employeeId)->orWhere('id', $employeeId)->first();
        }
        if (!$employee) {
            $employee = User::find($request->auth_user['id'] ?? null);
        }
        if (!$employee) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        try {
            $stats = $this->getEmployeeStats($employee);

            $prompt = "You are an HR career advisor. Suggest a professional career path and training opportunities for this employee:\n\n"
                . "Name: {$employee->name}\n"
                . "Position: {$employee->position}\n"
                . "Department: {$employee->department}\n"
                . "Role: {$employee->role}\n"
                . "Date Joined: " . ($employee->created_at ? $employee->created_at->toDateString() : 'N/A') . "\n"
                . "Performance Reviews:\n{$stats['reviewsStr']}\n\n"
                . "Output a valid JSON object matching the following structure EXACTLY. "
                . "Do not output markdown code blocks (like ```json). Respond with only the raw JSON string.\n"
                . "JSON Schema:\n"
                . "{\n"
                . "  \"suggested_next_roles\": (array of strings of potential next titles they can grow into),\n"
                . "  \"timeline\": (string, estimated timeline e.g. \"12-18 months\"),\n"
                . "  \"recommended_courses\": (array of objects, e.g. [{\"name\": \"Advanced Project Management\", \"platform\": \"Coursera\", \"duration\": \"4 weeks\", \"priority\": \"High\"}]),\n"
                . "  \"career_summary\": (string, 3-4 sentence detailed career advice and transition summary)\n"
                . "}";

            $payload = [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ]
            ];

            $response = $this->callGemini($payload);
            $jsonString = $this->cleanJsonResponse($response);
            $parsed = json_decode($jsonString, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \Exception('Failed to parse JSON response from AI: ' . $jsonString);
            }

            return response()->json($parsed);

        } catch (\Exception $e) {
            Log::error("Gemini Career Path error: " . $e->getMessage());
            return response()->json(['detail' => $e->getMessage()], 500);
        }
    }
}
