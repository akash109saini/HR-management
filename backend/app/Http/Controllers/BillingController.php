<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BillingOrder;
use App\Models\Tenant;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Razorpay\Api\Api;

class BillingController extends Controller
{
    private function getRazorpay(): Api
    {
        return new Api(env('RAZORPAY_KEY_ID', ''), env('RAZORPAY_KEY_SECRET', ''));
    }

    public function getPlans(Request $request)
    {
        $plans = [
            ['id' => 'free', 'name' => 'Free', 'price' => 0, 'currency' => 'INR', 'max_employees' => 5, 'features' => ['Basic HR', '5 Employees', 'Attendance']],
            ['id' => 'basic', 'name' => 'Basic', 'price' => 99900, 'currency' => 'INR', 'max_employees' => 50, 'features' => ['All HR Modules', '50 Employees', 'Payroll', 'Reports']],
            ['id' => 'premium', 'name' => 'Premium', 'price' => 249900, 'currency' => 'INR', 'max_employees' => 200, 'features' => ['Everything in Basic', '200 Employees', 'AI Features', 'Priority Support']],
            ['id' => 'enterprise', 'name' => 'Enterprise', 'price' => 499900, 'currency' => 'INR', 'max_employees' => 999, 'features' => ['Unlimited', 'Custom Integrations', 'Dedicated Support', 'SLA']],
        ];
        return response()->json($plans);
    }

    public function createOrder(Request $request)
    {
        $user = $request->auth_user;
        $request->validate(['plan_id' => 'required', 'amount' => 'required|integer']);

        $keyId = env('RAZORPAY_KEY_ID', '');
        
        // Use Landlord connection for Billing Orders
        $orderData = [
            'tenant_id' => $user['tenant_id'] ?? '',
            'plan_id' => $request->plan_id,
            'amount' => $request->amount,
            'currency' => 'INR',
            'status' => 'created',
            'created_by' => $user['name'] ?? $user['email'],
        ];

        if (!$keyId || str_contains($keyId, 'placeholder')) {
            // Mock order for demo
            $orderData['order_id'] = 'order_demo_' . Str::random(16);
            $newOrder = BillingOrder::create($orderData);
            
            return response()->json([
                'order_id' => $orderData['order_id'], 
                'amount' => $request->amount, 
                'currency' => 'INR', 
                'key_id' => $keyId, 
                'demo' => true
            ]);
        }

        try {
            $api = $this->getRazorpay();
            $order = $api->order->create([
                'receipt' => 'rcpt_' . substr(Str::uuid(), 0, 20),
                'amount' => $request->amount,
                'currency' => 'INR',
                'payment_capture' => 1,
            ]);

            $orderData['order_id'] = $order['id'];
            BillingOrder::create($orderData);
            
            return response()->json([
                'order_id' => $order['id'], 
                'amount' => $order['amount'], 
                'currency' => $order['currency'], 
                'key_id' => $keyId
            ]);
        } catch (\Exception $e) {
            Log::error("Razorpay order creation failed: " . $e->getMessage());
            return response()->json(['detail' => 'Payment order creation failed: ' . $e->getMessage()], 500);
        }
    }

    public function verifyPayment(Request $request)
    {
        $user = $request->auth_user;
        $request->validate(['order_id' => 'required', 'payment_id' => 'required', 'plan_id' => 'required']);

        $keyId = env('RAZORPAY_KEY_ID', '');
        $tenantId = $user['tenant_id'] ?? '';

        if (!$keyId || str_contains($keyId, 'placeholder')) {
            // Demo mode: update landlord DB
            $order = BillingOrder::where('order_id', $request->order_id)->first();
            if ($order) {
                $order->update(['status' => 'paid', 'payment_id' => $request->payment_id]);
            }
            if ($tenantId) {
                $plan = $request->plan_id;
                $maxEmp = ['free' => 5, 'basic' => 50, 'premium' => 200, 'enterprise' => 999][$plan] ?? 50;
                Tenant::on('landlord')->where('id', $tenantId)->update([
                    'subscription_plan' => $plan, 
                    'max_employees' => $maxEmp
                ]);
            }
            return response()->json(['status' => 'success', 'message' => 'Plan upgraded (demo mode)', 'demo' => true]);
        }

        try {
            $api = $this->getRazorpay();
            $api->utility->verifyPaymentSignature([
                'razorpay_order_id' => $request->order_id,
                'razorpay_payment_id' => $request->payment_id,
                'razorpay_signature' => $request->signature ?? '',
            ]);

            $order = BillingOrder::where('order_id', $request->order_id)->first();
            if ($order) {
                $order->update(['status' => 'paid', 'payment_id' => $request->payment_id]);
            }

            if ($tenantId) {
                $plan = $request->plan_id;
                $maxEmp = ['free' => 5, 'basic' => 50, 'premium' => 200, 'enterprise' => 999][$plan] ?? 50;
                Tenant::on('landlord')->where('id', $tenantId)->update([
                    'subscription_plan' => $plan, 
                    'max_employees' => $maxEmp
                ]);
            }
            return response()->json(['status' => 'success', 'message' => 'Payment verified and plan upgraded']);
        } catch (\Exception $e) {
            Log::error("Razorpay payment verification failed: " . $e->getMessage());
            return response()->json(['detail' => 'Payment verification failed'], 400);
        }
    }

    public function billingHistory(Request $request)
    {
        $user = $request->auth_user;
        $query = BillingOrder::query();
        
        if ($user['role'] === 'hr_manager') {
            $query->where('tenant_id', $user['tenant_id'] ?? '');
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }
}
