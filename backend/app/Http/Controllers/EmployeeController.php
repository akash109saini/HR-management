<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Tenant;
use App\Helpers\AuthHelper;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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

    public function bulkUpload(Request $request)
    {
        $user = $request->auth_user;
        if (!in_array($user['role'], ['super_admin', 'hr_manager'])) {
            return response()->json(['detail' => 'Not authorized'], 403);
        }

        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id');
        if (!$tenantId) {
            return response()->json(['detail' => 'Tenant ID required'], 400);
        }

        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:4096',
        ]);

        $file = $request->file('file');
        $handle = fopen($file->getRealPath(), 'r');
        if (!$handle) {
            return response()->json(['detail' => 'Failed to open uploaded file'], 400);
        }

        $headers = fgetcsv($handle);
        if (!$headers) {
            fclose($handle);
            return response()->json(['detail' => 'The uploaded file is empty'], 400);
        }

        // Clean headers and build a mapping to indices
        $headerMap = [];
        foreach ($headers as $index => $header) {
            $h = strtolower(trim($header));
            $h = str_replace(['_', '-'], ' ', $h);
            if (in_array($h, ['name', 'full name'])) {
                $headerMap['name'] = $index;
            } elseif (in_array($h, ['email', 'email address'])) {
                $headerMap['email'] = $index;
            } elseif (in_array($h, ['mobile', 'mobile number', 'phone', 'phone number'])) {
                $headerMap['mobile'] = $index;
            } elseif (in_array($h, ['joining date', 'joining_date', 'date of joining', 'doj'])) {
                $headerMap['joining_date'] = $index;
            } elseif ($h === 'department') {
                $headerMap['department'] = $index;
            } elseif (in_array($h, ['designation', 'position', 'role'])) {
                $headerMap['designation'] = $index;
            } elseif (in_array($h, ['shift', 'shift timing'])) {
                $headerMap['shift'] = $index;
            } elseif (in_array($h, ['salary', 'ctc', 'annual ctc'])) {
                $headerMap['salary'] = $index;
            } elseif (in_array($h, ['biometric pin', 'biometric id', 'pin', 'biometric_pin'])) {
                $headerMap['biometric_pin'] = $index;
            } elseif (in_array($h, ['bank name', 'bank_name'])) {
                $headerMap['bank_name'] = $index;
            } elseif (in_array($h, ['account number', 'account_number', 'bank account number'])) {
                $headerMap['account_number'] = $index;
            } elseif (in_array($h, ['ifsc', 'ifsc code', 'ifsc_code'])) {
                $headerMap['ifsc_code'] = $index;
            } elseif (in_array($h, ['account holder', 'account holder name', 'account_holder'])) {
                $headerMap['account_holder'] = $index;
            }
        }

        // Validate that minimum required headers are present
        $missingHeaders = [];
        if (!isset($headerMap['name'])) $missingHeaders[] = 'Name';
        if (!isset($headerMap['email'])) $missingHeaders[] = 'Email';
        if (!isset($headerMap['mobile'])) $missingHeaders[] = 'Mobile';

        if (count($missingHeaders) > 0) {
            fclose($handle);
            return response()->json([
                'detail' => 'Missing required column headers: ' . implode(', ', $missingHeaders) . '. Ensure your CSV has column names like Name, Email, and Mobile.'
            ], 400);
        }

        $errors = [];
        $rowsToInsert = [];
        $emailsSeen = [];
        $biometricPinsSeen = [];
        $rowNum = 1; // Row 1 is headers

        $allLeaveTypes = \App\Models\LeaveType::all();
        $defaultBalances = [];
        foreach ($allLeaveTypes as $lt) {
            $defaultBalances[strtolower($lt->name)] = $lt->days_allotted;
        }
        if (empty($defaultBalances)) {
            $defaultBalances = ['casual leave' => 12, 'sick leave' => 10, 'earned leave' => 15];
        }

        while (($row = fgetcsv($handle)) !== false) {
            $rowNum++;
            
            // Skip empty rows
            if (empty(array_filter($row))) {
                continue;
            }

            // Helper to get row value safely
            $getValue = function($key) use ($row, $headerMap) {
                if (isset($headerMap[$key]) && isset($row[$headerMap[$key]])) {
                    return trim($row[$headerMap[$key]]);
                }
                return null;
            };

            $name = $getValue('name');
            $email = strtolower($getValue('email') ?? '');
            $mobile = $getValue('mobile');
            $joiningDate = $getValue('joining_date');
            $department = $getValue('department') ?? '';
            $designation = $getValue('designation') ?? '';
            $shift = $getValue('shift') ?? '';
            $salary = $getValue('salary');
            $biometricPin = $getValue('biometric_pin');
            $bankName = $getValue('bank_name') ?? '';
            $accountNumber = $getValue('account_number') ?? '';
            $ifscCode = $getValue('ifsc_code') ?? '';
            $accountHolder = $getValue('account_holder');

            $rowErrors = [];

            // 1. Required checks
            if (empty($name)) {
                $rowErrors[] = "Name is required";
            }
            if (empty($email)) {
                $rowErrors[] = "Email is required";
            } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $rowErrors[] = "Email format is invalid";
            }
            if (empty($mobile)) {
                $rowErrors[] = "Mobile is required";
            }

            // 2. Email uniqueness
            if (!empty($email) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                if (in_array($email, $emailsSeen)) {
                    $rowErrors[] = "Duplicate email in sheet: '{$email}'";
                } else {
                    $emailsSeen[] = $email;
                    $existing = User::where('email', $email)->first();
                    if ($existing) {
                        $rowErrors[] = "Email '{$email}' is already registered";
                    }
                }
            }

            // 3. Biometric PIN uniqueness
            if (!empty($biometricPin)) {
                if (in_array($biometricPin, $biometricPinsSeen)) {
                    $rowErrors[] = "Duplicate biometric PIN in sheet: '{$biometricPin}'";
                } else {
                    $biometricPinsSeen[] = $biometricPin;
                    $normPin = ltrim($biometricPin, '0');
                    if ($normPin === '') $normPin = '0';
                    $existingPin = User::where('biometric_pin', $biometricPin)
                        ->orWhere('biometric_pin', $normPin)
                        ->orWhereRaw("TRIM(LEADING '0' FROM biometric_pin) = ?", [$normPin])
                        ->first();
                    if ($existingPin) {
                        $rowErrors[] = "Biometric PIN '{$biometricPin}' is already assigned to " . $existingPin->name;
                    }
                }
            }

            // 4. Joining Date validation
            if (!empty($joiningDate)) {
                $d = \DateTime::createFromFormat('Y-m-d', $joiningDate);
                if (!$d || $d->format('Y-m-d') !== $joiningDate) {
                    $time = strtotime($joiningDate);
                    if ($time) {
                        $joiningDate = date('Y-m-d', $time);
                    } else {
                        $rowErrors[] = "Joining Date '{$joiningDate}' is invalid (expected format: YYYY-MM-DD)";
                    }
                }
            } else {
                $joiningDate = now()->format('Y-m-d');
            }

            if (count($rowErrors) > 0) {
                $errors[] = "Row {$rowNum}: " . implode(", ", $rowErrors);
            } else {
                $rowsToInsert[] = [
                    'name' => $name,
                    'email' => $email,
                    'mobile' => $mobile,
                    'joining_date' => $joiningDate,
                    'department' => $department,
                    'designation' => $designation,
                    'shift' => $shift,
                    'salary' => (float)($salary ?? 0),
                    'biometric_pin' => empty($biometricPin) ? null : $biometricPin,
                    'bank_name' => $bankName,
                    'account_number' => $accountNumber,
                    'ifsc_code' => $ifscCode,
                    'account_holder' => $accountHolder,
                ];
            }
        }

        fclose($handle);

        // Reject the whole sheet if there are any errors
        if (count($errors) > 0) {
            return response()->json([
                'detail' => 'The uploaded sheet contains errors. All rows were rejected.',
                'errors' => $errors
            ], 422);
        }

        // Insert everything inside a transaction
        DB::connection('tenant')->beginTransaction();
        try {
            $insertedCount = 0;
            foreach ($rowsToInsert as $empData) {
                $employeeId = $this->generateEmployeeId($tenantId);
                
                $userData = [
                    'name' => $empData['name'],
                    'email' => $empData['email'],
                    'mobile' => $empData['mobile'],
                    'employee_id' => $employeeId,
                    'password' => $empData['mobile'], // automatically hashed by User model
                    'role' => 'employee',
                    'department' => $empData['department'],
                    'designation' => $empData['designation'],
                    'salary' => $empData['salary'],
                    'shift' => $empData['shift'],
                    'biometric_pin' => $empData['biometric_pin'],
                    'joining_date' => $empData['joining_date'],
                    'profile_image' => '',
                    'bank_details' => [
                        'bank_name' => $empData['bank_name'],
                        'account_number' => $empData['account_number'],
                        'ifsc_code' => $empData['ifsc_code'],
                        'account_holder' => empty($empData['account_holder']) ? $empData['name'] : $empData['account_holder'],
                    ],
                    'status' => 'active',
                    'first_login' => true,
                    'leave_balance' => $defaultBalances,
                ];

                $newUser = User::create($userData);

                // Increment employee count in Landlord DB
                $tenant = Tenant::on('landlord')->find($tenantId);
                if ($tenant) {
                    $tenant->increment('employee_count');
                }

                // Send welcome email (optional, handle exception)
                try {
                    \App\Services\EmailService::sendWelcomeEmail($newUser->email, $newUser->name, $employeeId, $empData['mobile']);
                } catch (\Exception $e) {
                    Log::warning("Failed to send welcome email for bulk upload: " . $e->getMessage());
                }

                $insertedCount++;
            }
            DB::connection('tenant')->commit();

            return response()->json([
                'message' => "Successfully uploaded {$insertedCount} employees.",
                'count' => $insertedCount
            ], 201);

        } catch (\Exception $e) {
            DB::connection('tenant')->rollBack();
            Log::error("Bulk upload transaction failed: " . $e->getMessage());
            return response()->json(['detail' => 'Database error during bulk upload: ' . $e->getMessage()], 500);
        }
    }

    public function suggestId(Request $request)
    {
        $user = $request->auth_user;
        $tenantId = $user['tenant_id'] ?? $request->query('tenant_id');
        return response()->json(['suggested_id' => $this->generateEmployeeId($tenantId)]);
    }
}
