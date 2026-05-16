<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\JobPosting;
use App\Models\Applicant;
use Illuminate\Support\Str;

class RecruitmentController extends Controller
{
    public function listJobs(Request $request)
    {
        $user = $request->auth_user;
        $query = JobPosting::query();

        if ($user['role'] === 'employee') {
            $query->where('status', 'open');
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function createJob(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['title' => 'required', 'department' => 'required', 'description' => 'required']);

        $job = JobPosting::create([
            'title' => $request->title,
            'department' => $request->department,
            'description' => $request->description,
            'requirements' => $request->requirements ?? '',
            'location' => $request->location ?? '',
            'salary_range' => $request->salary_range ?? '',
            'status' => 'open',
            'applicant_count' => 0,
            'created_by' => $user['name'] ?? $user['email'],
        ]);

        return response()->json($job, 201);
    }

    public function updateJob(Request $request, string $jobId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $job = JobPosting::find($jobId);
        if (!$job) {
            return response()->json(['detail' => 'Job not found'], 404);
        }

        $updates = array_filter($request->only(['title', 'department', 'description', 'requirements', 'status', 'location', 'salary_range']), fn($v) => $v !== null);
        $job->update($updates);

        return response()->json($job->fresh());
    }

    public function listApplicants(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $query = Applicant::query();
        if ($jobId = $request->query('job_id')) {
            $query->where('job_id', $jobId);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function createApplicant(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['job_id' => 'required', 'name' => 'required', 'email' => 'required']);

        $job = JobPosting::find($request->job_id);
        if (!$job) {
            return response()->json(['detail' => 'Job not found'], 404);
        }

        $applicant = Applicant::create([
            'job_id' => $request->job_id,
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone ?? '',
            'resume_text' => $request->resume_text ?? '',
            'status' => 'applied',
            'notes' => '',
        ]);

        $job->increment('applicant_count');

        return response()->json($applicant, 201);
    }

    public function updateApplicant(Request $request, string $applicantId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $applicant = Applicant::find($applicantId);
        if (!$applicant) {
            return response()->json(['detail' => 'Applicant not found'], 404);
        }

        $updates = array_filter($request->only(['status', 'notes']), fn($v) => $v !== null);
        $applicant->update($updates);

        return response()->json($applicant->fresh());
    }
}
