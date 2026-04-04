import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { CreditCard, Check, Zap, Crown, Building2 } from 'lucide-react';

export default function BillingPage() {
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [pRes, hRes] = await Promise.all([api.get('/billing/plans'), api.get('/billing/history')]);
        setPlans(pRes.data); setHistory(hRes.data);
      } catch {} setLoading(false);
    };
    fetch();
  }, []);

  const handleSubscribe = async (plan) => {
    if (plan.price === 0) return;
    setProcessing(plan.id);
    try {
      const { data } = await api.post('/billing/create-order', { plan_id: plan.id, amount: plan.price });

      if (data.demo) {
        // Demo mode - simulate payment
        await api.post('/billing/verify-payment', { order_id: data.order_id, payment_id: 'pay_demo_' + Date.now(), plan_id: plan.id });
        alert('Plan upgraded successfully! (Demo mode)');
        window.location.reload();
        return;
      }

      // Real Razorpay checkout
      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: 'HRMS',
        description: `${plan.name} Plan Subscription`,
        handler: async (response) => {
          await api.post('/billing/verify-payment', {
            order_id: response.razorpay_order_id,
            payment_id: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            plan_id: plan.id,
          });
          alert('Payment successful! Plan upgraded.');
          window.location.reload();
        },
        prefill: { email: 'hr@company.com' },
        theme: { color: '#002FA7' },
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Razorpay SDK not loaded - demo mode
        await api.post('/billing/verify-payment', { order_id: data.order_id, payment_id: 'pay_demo_' + Date.now(), plan_id: plan.id });
        alert('Plan upgraded! (Razorpay SDK not loaded - demo mode)');
        window.location.reload();
      }
    } catch (e) {
      alert('Payment failed: ' + (e.response?.data?.detail || e.message));
    }
    setProcessing(null);
  };

  const planIcons = { free: Zap, basic: CreditCard, premium: Crown, enterprise: Building2 };
  const planColors = { free: 'bg-muted', basic: 'bg-primary/10', premium: 'bg-amber-50 dark:bg-amber-900/20', enterprise: 'bg-violet-50 dark:bg-violet-900/20' };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="billing-page">
        <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Billing & Plans</h1><p className="text-sm text-muted-foreground mt-1">Manage your subscription and billing</p></div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {plans.map((p, i) => {
            const Icon = planIcons[p.id] || CreditCard;
            return (
              <Card key={p.id} className={`border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in ${planColors[p.id] || ''}`} data-testid={`plan-card-${p.id}`}>
                <CardContent className="p-6 text-center">
                  <Icon size={32} className="mx-auto text-primary mb-3" />
                  <h3 className="text-xl font-bold font-['Outfit']">{p.name}</h3>
                  <p className="text-3xl font-bold font-['Outfit'] mt-2">
                    {p.price === 0 ? 'Free' : `₹${(p.price / 100).toLocaleString()}`}
                    {p.price > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Up to {p.max_employees} employees</p>
                  <ul className="mt-4 space-y-2 text-sm text-left">
                    {(p.features || []).map((f, j) => (
                      <li key={j} className="flex items-center gap-2"><Check size={14} className="text-emerald-500 flex-shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <Button className="w-full mt-4" variant={p.id === 'premium' ? 'default' : 'outline'} onClick={() => handleSubscribe(p)} disabled={processing === p.id || p.price === 0} data-testid={`subscribe-${p.id}-btn`}>
                    {processing === p.id ? 'Processing...' : p.price === 0 ? 'Current' : 'Subscribe'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Billing History */}
        {history.length > 0 && (
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Billing History</CardTitle></CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Plan</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Order ID</TableHead></TableRow></TableHeader>
              <TableBody>{history.map((h, i) => (
                <TableRow key={h.id || i}>
                  <TableCell className="text-sm">{new Date(h.created_at).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant="outline">{h.plan_id}</Badge></TableCell>
                  <TableCell className="font-medium">₹{((h.amount || 0) / 100).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={h.status === 'paid' ? 'default' : 'secondary'}>{h.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{h.order_id}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div></CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
