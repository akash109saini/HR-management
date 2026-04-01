<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
use App\Helpers\AuthHelper;

class EmployeeController extends Controller
{
    private function generateEmployeeId(string $tenantId): string
    {
        $count = MongoService::count('users', ['tenant_id' => $tenantId, 'role' => ['$in' => ['employee', 'hr_manager']]]);
        $tenant = MongoService::findOneNoId('tenants', ['id' => $tenantId]);
        $prefix = $tenant ? strtoupper(substr($tenant['name'], 0, 4)) : 'EMP';
        return "EMP-{$prefix}-" . str_pad($count + 1, 3, '0', STR_PAD_LEFT);
    }

    public function index(Request $request)
    {
        $user = $request->auth_user;
        $filter = ['role' => ['$in' => ['employee', 'hr_manager']]];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        elseif ($user['role'] === 'super_admin' && $request->query('tenant_id')) $filter['tenant_id'] = $request->query('tenant_id');
        elseif ($user['role'] === 'employee') return response()->json(['detail' => 'Not authorized'], 403);

        $employees = MongoService::find('users', $filter, ['projection' => ['_id' => 0, 'password_hash' => 0]]);
        return response()->json($employees);
    }

    public function store(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $request->validate(['name' => 'required', 'email' => 'required|email', 'mobile' => 'required']);

        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id');
        if (!$tenantId) return response()->json(['detail' => 'Tenant ID required'], 400);

        $existing = MongoService::findOneNoId('users', ['email' => strtolower($request->email)]);
        if ($existing) return response()->json(['detail' => 'Email already registered'], 400);

        $employeeId = $request->employee_id_custom ?? $this->generateEmployeeId($tenantId);

        $newUser = [
            'email' => strtolower($request->email), 'name' => $request->name, 'mobile' => $request->mobile,
            'employee_id' => $employeeId, 'password_hash' => AuthHelper::hashPassword($request->mobile),
            'role' => 'employee', 'tenant_id' => $tenantId, 'department' => $request->department ?? '',
            'designation' => $request->designation ?? '', 'salary' => (float)($request->salary ?? 0),
            'shift' => $request->shift ?? '', 'joining_date' => $request->joining_date ?? now()->format('Y-m-d'),
            'profile_image' => $request->profile_image ?? '',
            'bank_details' => [
                'bank_name' => $request->bank_name ?? '',
                'account_number' => $request->account_number ?? '',
                'ifsc_code' => $request->ifsc_code ?? '',
                'account_holder' => $request->account_holder ?? $request->name,
            ],
            'status' => 'active', 'first_login' => true,
            'leave_balance' => ['casual' => 12, 'sick' => 10, 'earned' => 15],
            'created_at' => now()->toISOString(), 'updated_at' => now()->toISOString(),
        ];
        MongoService::insertOne('users', $newUser);
        MongoService::increment('tenants', ['id' => $tenantId], 'employee_count');

        unset($newUser['password_hash']);
        $newUser['initial_password'] = $request->mobile;
        $newUser['message'] = "Employee created. Initial password is the mobile number: {$request->mobile}";
        return response()->json($newUser, 201);
    }

    public function show(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        $emp = MongoService::findOneNoId('users', ['employee_id' => $employeeId]);
        if (!$emp) return response()->json(['detail' => 'Employee not found'], 404);
        unset($emp['password_hash']);
        if ($user['role'] === 'employee' && ($user['employee_id'] ?? '') !== $employeeId) return response()->json(['detail' => 'Not authorized'], 403);
        return response()->json($emp);
    }

    public function update(Request $request, string $employeeId)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) return response()->json(['detail' => 'Not authorized'], 403);
        $updates = array_filter($request->only(['name', 'department', 'designation', 'salary', 'mobile', 'status', 'shift', 'joining_date', 'profile_image', 'bank_name', 'account_number', 'ifsc_code', 'account_holder']), fn($v) => $v !== null);
        if (isset($updates['bank_name']) || isset($updates['account_number'])) {
            $updates['bank_details'] = [
                'bank_name' => $updates['bank_name'] ?? '', 'account_number' => $updates['account_number'] ?? '',
                'ifsc_code' => $updates['ifsc_code'] ?? '', 'account_holder' => $updates['account_holder'] ?? '',
            ];
            unset($updates['bank_name'], $updates['account_number'], $updates['ifsc_code'], $updates['account_holder']);
        }
        $updates['updated_at'] = now()->toISOString();
        MongoService::updateOne('users', ['employee_id' => $employeeId], $updates);
        $emp = MongoService::findOneNoId('users', ['employee_id' => $employeeId]);
        unset($emp['password_hash']);
        return response()->json($emp);
    }

    public function suggestId(Request $request)
    {
        $user = $request->auth_user;
        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id', '');
        if (!$tenantId) return response()->json(['suggested_id' => 'EMP-001']);
        return response()->json(['suggested_id' => $this->generateEmployeeId($tenantId)]);
    }
}
