<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Leave;
use App\Models\User;
use Illuminate\Support\Str;
use Carbon\Carbon;

class LeaveController extends Controller
{
    public function store(Request $request)
    {
        $user = $request->auth_user;
        $request->validate([
            'leave_type' => 'required|string|exists:tenant.leave_types,name',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'duration_type' => 'sometimes|string|in:full,half',
            'half_day_slot' => 'sometimes|nullable|string|in:first_half,second_half',
            'reason' => 'required|string',
        ]);

        $start = Carbon::parse($request->start_date);
        $end = Carbon::parse($request->end_date);
        
        $duration = 0;
        if ($request->duration_type === 'half') {
            $duration = 0.5;
        } else {
            $duration = $start->diffInDays($end) + 1;
        }

        // Check Balance Cap
        $userDoc = User::find($user['id']);
        if ($userDoc) {
            $balance = $userDoc->leave_balance ?? [];
            $typeRaw = strtolower(trim($request->leave_type));
            $typeShort = explode(' ', $typeRaw)[0];
            
            $foundKey = null;
            if (isset($balance[$typeRaw])) $foundKey = $typeRaw;
            elseif (isset($balance[$typeShort])) $foundKey = $typeShort;
            
            $currentBal = 0;
            if ($foundKey) {
                $currentBal = (float)($balance[$foundKey] ?? 0);
            }

            if ($duration > $currentBal) {
                return response()->json(['detail' => "Insufficient balance. You only have {$currentBal} days remaining for {$request->leave_type}."], 422);
            }
        }

        // Check for date overlaps
        $overlap = Leave::where('user_id', $user['id'])
            ->whereNotIn('status', ['rejected', 'cancelled'])
            ->where(function($q) use ($request) {
                $q->whereBetween('start_date', [$request->start_date, $request->end_date])
                  ->orWhereBetween('end_date', [$request->start_date, $request->end_date])
                  ->orWhere(function($sq) use ($request) {
                      $sq->where('start_date', '<=', $request->start_date)
                         ->where('end_date', '>=', $request->end_date);
                  });
            })
            ->first();

        if ($overlap) {
            return response()->json(['detail' => 'You already have a leave application for these dates.'], 422);
        }

        $leave = Leave::create([
            'user_id' => $user['id'],
            'user_name' => $user['name'] ?? '',
            'leave_type' => $request->leave_type,
            'duration_type' => $request->duration_type ?? 'full',
            'half_day_slot' => $request->half_day_slot,
            'start_date' => $request->start_date,
            'end_date' => $request->end_date,
            'reason' => $request->reason,
            'status' => 'pending',
        ]);

        return response()->json($leave);
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        $query = Leave::query();

        if ($user['role'] === 'employee') {
            $query->where('user_id', $user['id']);
        }

        // Filters
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($filter = $request->query('date_filter')) {
            switch ($filter) {
                case 'today':
                    $query->whereDate('created_at', now());
                    break;
                case 'yesterday':
                    $query->whereDate('created_at', now()->subDay());
                    break;
                case '7_days':
                    $query->where('created_at', '>=', now()->subDays(7));
                    break;
                case '30_days':
                    $query->where('created_at', '>=', now()->subDays(30));
                    break;
                case 'custom':
                    if ($request->start && $request->end) {
                        $query->whereBetween('created_at', [$request->start, $request->end]);
                    }
                    break;
            }
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

    public function update(Request $request, string $leaveId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate(['status' => 'required|string|in:approved,rejected,cancelled']);
        
        $leave = Leave::find($leaveId);
        if (!$leave) {
            return response()->json(['detail' => 'Leave not found'], 404);
        }

        $oldStatus = $leave->status;
        $leave->update([
            'status' => $request->status,
            'reviewed_by' => $user['name'] ?? $user['email'],
            'reviewer_note' => $request->reviewer_note ?? '',
            'reviewed_at' => now(),
        ]);

        if ($request->status === 'approved' && $oldStatus === 'pending') {
            $start = Carbon::parse($leave->start_date);
            $end = Carbon::parse($leave->end_date);
            
            $days = 0;
            if ($leave->duration_type === 'half') {
                $days = 0.5;
            } else {
                $days = $start->diffInDays($end) + 1;
            }
            
            $targetUser = User::find($leave->user_id);
            if ($targetUser) {
                $balance = $targetUser->leave_balance ?? [];
                
                // Super robust key matching
                $typeRaw = strtolower(trim($leave->leave_type));
                $typeWords = explode(' ', $typeRaw);
                $firstWord = $typeWords[0];
                
                $foundKey = null;
                if (isset($balance[$typeRaw])) $foundKey = $typeRaw;
                elseif (isset($balance[$firstWord])) $foundKey = $firstWord;
                else {
                    foreach (array_keys($balance) as $k) {
                        $kLower = strtolower($k);
                        if (str_contains($kLower, $firstWord) || str_contains($typeRaw, $kLower)) {
                            $foundKey = $k;
                            break;
                        }
                    }
                }
                
                if ($foundKey) {
                    $oldVal = (float)($balance[$foundKey] ?? 0);
                    $newVal = max(0, $oldVal - $days);
                    $balance[$foundKey] = $newVal;
                    
                    $targetUser->update(['leave_balance' => $balance]);
                    \Illuminate\Support\Facades\Log::info("SUCCESS: Deducted {$days} days for '{$foundKey}' (User: {$targetUser->email}). {$oldVal} -> {$newVal}");
                }
            }
        }

        // Send email notification
        $emp = User::find($leave->user_id);
        if ($emp && $emp->email) {
            try {
                \App\Services\EmailService::sendLeaveApproval(
                    $emp->email, 
                    $request->status, 
                    $leave->leave_type, 
                    "{$leave->start_date} to {$leave->end_date}"
                );
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to send leave email: " . $e->getMessage());
            }
        }

        return response()->json($leave->fresh());
    }

    public function rollover(Request $request, string $leaveId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $leave = Leave::find($leaveId);
        if (!$leave) return response()->json(['detail' => 'Leave not found'], 404);

        if (now()->startOfDay()->gt(Carbon::parse($leave->start_date))) {
            return response()->json(['detail' => 'Cannot rollover leave that has already started or passed.'], 422);
        }

        $oldStatus = $leave->status;
        $leave->update(['status' => 'cancelled', 'reviewer_note' => 'Rolled over by HR']);

        if ($oldStatus === 'approved') {
            // Refund balance
            $start = Carbon::parse($leave->start_date);
            $end = Carbon::parse($leave->end_date);
            $days = ($leave->duration_type === 'half') ? 0.5 : ($start->diffInDays($end) + 1);

            $targetUser = User::find($leave->user_id);
            if ($targetUser) {
                $balance = $targetUser->leave_balance ?? [];
                $typeRaw = strtolower(trim($leave->leave_type));
                $firstWord = explode(' ', $typeRaw)[0];
                
                $foundKey = null;
                if (isset($balance[$typeRaw])) $foundKey = $typeRaw;
                elseif (isset($balance[$firstWord])) $foundKey = $firstWord;
                
                if ($foundKey) {
                    $balance[$foundKey] += $days;
                    $targetUser->update(['leave_balance' => $balance]);
                    \Illuminate\Support\Facades\Log::info("REFUND: Added back {$days} days for '{$foundKey}' (User: {$targetUser->email}).");
                }
            }
        }

        // Notify employee
        $emp = User::find($leave->user_id);
        if ($emp && $emp->email) {
            try {
                \App\Services\EmailService::sendLeaveApproval(
                    $emp->email, 
                    'cancelled', 
                    $leave->leave_type, 
                    "{$leave->start_date} to {$leave->end_date} (Rolled over by HR)"
                );
            } catch (\Exception $e) {}
        }

        return response()->json($leave->fresh());
    }

    public function balance(Request $request)
    {
        $user = $request->auth_user;
        $userDoc = User::find($user['id']);
        return response()->json($userDoc->leave_balance ?? ['casual' => 12, 'sick' => 10, 'earned' => 15]);
    }
}
