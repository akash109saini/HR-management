<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use Illuminate\Support\Str;

class RecruitmentController extends Controller
{
    public function listJobs(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        elseif ($user['role'] === 'employee') { $filter['tenant_id'] = $user['tenant_id'] ?? ''; $filter['status'] = 'open'; }
        return response()->json(MongoService::find('job_postings', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function createJob(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['title' => 'required', 'department' => 'required', 'description' => 'required']);
        $job = [
            'id' => (string)Str::uuid(), 'tenant_id' => $user['tenant_id'] ?? '', 'title' => $request->title,
            'department' => $request->department, 'description' => $request->description,
            'requirements' => $request->requirements ?? '', 'location' => $request->location ?? '',
            'salary_range' => $request->salary_range ?? '', 'status' => 'open', 'applicant_count' => 0,
            'created_by' => $user['name'] ?? $user['email'], 'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('job_postings', $job);
        return response()->json($job, 201);
    }

    public function updateJob(Request $request, string $jobId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['title', 'department', 'description', 'requirements', 'status', 'location', 'salary_range']), fn($v) => $v !== null);
        MongoService::updateOne('job_postings', ['id' => $jobId], $updates);
        return response()->json(MongoService::findOneNoId('job_postings', ['id' => $jobId]));
    }

    public function listApplicants(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        if ($jobId = $request->query('job_id')) $filter['job_id'] = $jobId;
        return response()->json(MongoService::find('applicants', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }

    public function createApplicant(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['job_id' => 'required', 'name' => 'required', 'email' => 'required']);
        $job = MongoService::findOneNoId('job_postings', ['id' => $request->job_id]);
        if (!$job) return response()->json(['detail' => 'Job not found'], 404);
        $applicant = [
            'id' => (string)Str::uuid(), 'job_id' => $request->job_id, 'tenant_id' => $job['tenant_id'] ?? '',
            'name' => $request->name, 'email' => $request->email, 'phone' => $request->phone ?? '',
            'resume_text' => $request->resume_text ?? '', 'status' => 'applied', 'notes' => '',
            'created_at' => now()->toISOString(),
        ];
        MongoService::insertOne('applicants', $applicant);
        MongoService::increment('job_postings', ['id' => $request->job_id], 'applicant_count');
        return response()->json($applicant, 201);
    }

    public function updateApplicant(Request $request, string $applicantId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['status', 'notes']), fn($v) => $v !== null);
        MongoService::updateOne('applicants', ['id' => $applicantId], $updates);
        return response()->json(MongoService::findOneNoId('applicants', ['id' => $applicantId]));
    }
}
