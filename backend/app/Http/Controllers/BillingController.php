<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\MongoService;
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
        if (!$keyId || str_contains($keyId, 'placeholder')) {
            // Mock order for demo
            $orderId = 'order_demo_' . Str::random(16);
            MongoService::insertOne('billing_orders', [
                'id' => (string)Str::uuid(), 'order_id' => $orderId,
                'tenant_id' => $user['tenant_id'] ?? '', 'plan_id' => $request->plan_id,
                'amount' => $request->amount, 'currency' => 'INR', 'status' => 'created',
                'created_by' => $user['name'] ?? $user['email'], 'created_at' => now()->toISOString(),
            ]);
            return response()->json(['order_id' => $orderId, 'amount' => $request->amount, 'currency' => 'INR', 'key_id' => $keyId, 'demo' => true]);
        }

        try {
            $api = $this->getRazorpay();
            $order = $api->order->create([
                'receipt' => 'rcpt_' . substr(Str::uuid(), 0, 20),
                'amount' => $request->amount,
                'currency' => 'INR',
                'payment_capture' => 1,
            ]);

            MongoService::insertOne('billing_orders', [
                'id' => (string)Str::uuid(), 'order_id' => $order['id'],
                'tenant_id' => $user['tenant_id'] ?? '', 'plan_id' => $request->plan_id,
                'amount' => $request->amount, 'currency' => 'INR', 'status' => 'created',
                'created_by' => $user['name'] ?? $user['email'], 'created_at' => now()->toISOString(),
            ]);
            return response()->json(['order_id' => $order['id'], 'amount' => $order['amount'], 'currency' => $order['currency'], 'key_id' => $keyId]);
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
        if (!$keyId || str_contains($keyId, 'placeholder')) {
            // Demo mode: just update tenant plan
            $order = MongoService::findOneNoId('billing_orders', ['order_id' => $request->order_id]);
            if ($order) {
                MongoService::updateOne('billing_orders', ['order_id' => $request->order_id], ['status' => 'paid', 'payment_id' => $request->payment_id]);
            }
            $tenantId = $user['tenant_id'] ?? '';
            if ($tenantId) {
                $plan = $request->plan_id;
                $maxEmp = ['free' => 5, 'basic' => 50, 'premium' => 200, 'enterprise' => 999][$plan] ?? 50;
                MongoService::updateOne('tenants', ['id' => $tenantId], ['subscription_plan' => $plan, 'max_employees' => $maxEmp]);
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

            MongoService::updateOne('billing_orders', ['order_id' => $request->order_id], ['status' => 'paid', 'payment_id' => $request->payment_id]);

            $tenantId = $user['tenant_id'] ?? '';
            if ($tenantId) {
                $plan = $request->plan_id;
                $maxEmp = ['free' => 5, 'basic' => 50, 'premium' => 200, 'enterprise' => 999][$plan] ?? 50;
                MongoService::updateOne('tenants', ['id' => $tenantId], ['subscription_plan' => $plan, 'max_employees' => $maxEmp]);
            }
            return response()->json(['status' => 'success', 'message' => 'Payment verified and plan upgraded']);
        } catch (\Exception $e) {
            return response()->json(['detail' => 'Payment verification failed'], 400);
        }
    }

    public function billingHistory(Request $request)
    {
        $user = $request->auth_user;
        $filter = [];
        if ($user['role'] === 'hr_manager') $filter['tenant_id'] = $user['tenant_id'] ?? '';
        return response()->json(MongoService::find('billing_orders', $filter, ['projection' => ['_id' => 0], 'sort' => ['created_at' => -1]]));
    }
}
