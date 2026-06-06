<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Tenant;
use App\Helpers\AuthHelper;
use Illuminate\Support\Str;

class EmployeeController extends Controller
{
    private function generateEmployeeId(?string $tenantId = null): string
    {
        // In the tenant DB, we just count users
        $count = User::whereIn('role', ['employee', 'hr_manager'])->count();
        
        // We need the tenant name from the landlord DB to prefix the ID correctly
        $prefix = 'EMP';
        if ($tenantId) {
            $tenant = Tenant::on('landlord')->find($tenantId);
            if ($tenant) {
                $prefix = strtoupper(substr($tenant->name, 0, 4));
            }
        }
        
        return "EMP-{$prefix}-" . str_pad($count + 1, 3, '0', STR_PAD_LEFT);
    }

    private function appendRoleName($employee)
    {
        if (!$employee) return null;
        
        $roleName = $employee->role;
        $systemMapping = [
            'super_admin' => 'Super Admin',
            'hr_manager' => 'HR Manager',
            'employee' => 'Employee',
        ];
        if (isset($systemMapping[$employee->role])) {
            $roleName = $systemMapping[$employee->role];
        } else {
            $customRole = \App\Models\CustomRole::find($employee->role);
            if ($customRole) {
                $roleName = $customRole->name;
            }
        }
        
        $arr = $employee->toArray();
        $arr['role_name'] = $roleName;
        return $arr;
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        if ($user['role'] === 'employee') {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        // The tenant connection is already set by the AuthHelper/Middleware
        // Return all users (employees, hr managers, custom roles)
        $employees = User::orderBy('name', 'asc')->get();
        
        $res = $employees->map(fn($emp) => $this->appendRoleName($emp));
        return response()->json($res);
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'mobile' => 'required|string|max:20',
        ]);

        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id');
        if (!$tenantId) {
            return response()->json(['detail' => 'Tenant ID required'], 400);
        }

        $existing = User::where('email', strtolower($request->email))->first();
        if ($existing) {
            return response()->json(['detail' => 'Email already registered'], 400);
        }

        $employeeId = $request->employee_id_custom ?? $this->generateEmployeeId($tenantId);

        $allTypes = \App\Models\LeaveType::all();
        $initialBalance = [];
        foreach ($allTypes as $lt) {
            $initialBalance[strtolower($lt->name)] = $lt->days_allotted;
        }

        // Use custom balances from request if provided (merge with defaults)
        if ($request->has('leave_balance')) {
            $custom = $request->leave_balance;
            foreach ($custom as $k => $v) {
                $initialBalance[strtolower(trim($k))] = (float)$v;
            }
        }

        // Fallback for demo if no types defined at all
        if (empty($initialBalance)) {
            $initialBalance = ['casual leave' => 12, 'sick leave' => 10, 'earned leave' => 15];
        }

        $userData = [
            'name' => $request->name,
            'email' => strtolower($request->email),
            'mobile' => $request->mobile,
            'employee_id' => $employeeId,
            'password' => $request->mobile, // Cast to hashed automatically by model
            'role' => 'employee',
            'department' => $request->department ?? '',
            'designation' => $request->designation ?? '',
            'salary' => (float)($request->salary ?? 0),
            'shift' => $request->shift ?? '',
            'biometric_pin' => $request->biometric_pin ?? null,
            'joining_date' => $request->joining_date ?? now()->format('Y-m-d'),
            'profile_image' => $request->profile_image ?? '',
            'bank_details' => [
                'bank_name' => $request->bank_name ?? '',
                'account_number' => $request->account_number ?? '',
                'ifsc_code' => $request->ifsc_code ?? '',
                'account_holder' => $request->account_holder ?? $request->name,
            ],
            'status' => 'active',
            'first_login' => true,
            'leave_balance' => $initialBalance,
        ];

        $newUser = User::create($userData);

        // Increment employee count in Landlord DB
        $tenant = Tenant::on('landlord')->find($tenantId);
        if ($tenant) {
            $tenant->increment('employee_count');
        }

        // Send welcome email
        try {
            \App\Services\EmailService::sendWelcomeEmail($newUser->email, $newUser->name, $employeeId, $request->mobile);
        } catch (\Exception $e) {
            // Log if email fails, but don't break the process
            \Illuminate\Support\Facades\Log::error("Failed to send welcome email: " . $e->getMessage());
        }

        $response = $this->appendRoleName($newUser);
        $response['initial_password'] = $request->mobile;
        $response['message'] = "Employee created. Initial password is the mobile number: {$request->mobile}";
        
        return response()->json($response, 201);
    }

    public function show(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        $emp = User::where('employee_id', $employeeId)->first();
        
        if (!$emp) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }
        
        if ($user['role'] === 'employee' && ($user['employee_id'] ?? '') !== $employeeId) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }
        
        return response()->json($this->appendRoleName($emp));
    }

    public function update(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $emp = User::where('employee_id', $employeeId)->first();
        if (!$emp) {
            return response()->json(['detail' => 'Employee not found'], 404);
        }

        $updates = array_filter($request->only([
            'name', 'department', 'designation', 'salary', 'mobile', 'status', 
            'shift', 'joining_date', 'profile_image', 'biometric_pin', 'bank_name', 
            'account_number', 'ifsc_code', 'account_holder', 'leave_balance'
        ]), fn($v) => $v !== null);

        if (isset($updates['bank_name']) || isset($updates['account_number'])) {
            $updates['bank_details'] = [
                'bank_name' => $updates['bank_name'] ?? $emp->bank_details['bank_name'] ?? '',
                'account_number' => $updates['account_number'] ?? $emp->bank_details['account_number'] ?? '',
                'ifsc_code' => $updates['ifsc_code'] ?? $emp->bank_details['ifsc_code'] ?? '',
                'account_holder' => $updates['account_holder'] ?? $emp->bank_details['account_holder'] ?? '',
            ];
            unset($updates['bank_name'], $updates['account_number'], $updates['ifsc_code'], $updates['account_holder']);
        }

        if (isset($updates['leave_balance'])) {
            $normalized = [];
            foreach ($updates['leave_balance'] as $k => $v) {
                $normalized[strtolower(trim($k))] = (float)$v;
            }
            $updates['leave_balance'] = $normalized;
        }

        $emp->update($updates);
        return response()->json($this->appendRoleName($emp->fresh()));
    }

    public function suggestId(Request $request)
    {
        $user = $request->auth_user;
        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id');
        return response()->json(['suggested_id' => $this->generateEmployeeId($tenantId)]);
    }
}
