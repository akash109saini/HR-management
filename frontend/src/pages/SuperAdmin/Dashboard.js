import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Building2, Users, Briefcase, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(225, 100%, 33%)', 'hsl(160, 60%, 45%)', 'hsl(30, 80%, 55%)', 'hsl(280, 65%, 60%)'];

export default function SADashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div></DashboardLayout>;

  const stats = [
    { label: 'Total Tenants', value: data?.total_tenants || 0, icon: Building2, color: 'text-primary' },
    { label: 'Active Tenants', value: data?.active_tenants || 0, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Total Employees', value: data?.total_employees || 0, icon: Users, color: 'text-blue-400' },
    { label: 'Open Jobs', value: data?.total_open_jobs || 0, icon: Briefcase, color: 'text-amber-500' },
  ];

  const planData = data?.plan_distribution ? Object.entries(data.plan_distribution).map(([name, value]) => ({ name, value })) : [];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="super-admin-dashboard">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">System Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Global HRMS metrics and tenant management</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {stats.map((s, i) => (
            <Card key={i} className="border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in" data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">{s.label}</p>
                    <p className="text-3xl font-bold mt-2 font-['Outfit']">{s.value}</p>
                  </div>
                  <s.icon size={24} className={s.color} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan Distribution */}
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Subscription Plans</CardTitle></CardHeader>
            <CardContent>
              {planData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={planData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                      {planData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground text-center py-12">No data yet</p>}
            </CardContent>
          </Card>

          {/* Recent Tenants */}
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Recent Tenants</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.recent_tenants || []).map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.domain}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                        {t.status}
                      </Badge>
                      <Badge variant="outline">{t.subscription_plan}</Badge>
                    </div>
                  </div>
                ))}
                {(!data?.recent_tenants || data.recent_tenants.length === 0) && (
                  <p className="text-muted-foreground text-center py-8">No tenants yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
