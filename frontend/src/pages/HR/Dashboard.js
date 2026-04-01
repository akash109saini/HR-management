import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Users, CalendarDays, Clock, Briefcase, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function HRDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div></DashboardLayout>;

  const stats = [
    { label: 'Total Employees', value: data?.total_employees || 0, icon: Users, color: 'text-primary' },
    { label: 'Today Present', value: data?.today_attendance || 0, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Pending Leaves', value: data?.pending_leaves || 0, icon: CalendarDays, color: 'text-amber-500' },
    { label: 'Pending Corrections', value: data?.pending_corrections || 0, icon: AlertCircle, color: 'text-red-400' },
    { label: 'Open Jobs', value: data?.open_jobs || 0, icon: Briefcase, color: 'text-blue-400' },
    { label: 'Applicants', value: data?.total_applicants || 0, icon: Users, color: 'text-violet-400' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-dashboard">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">HR Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Workforce overview and pending actions</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {stats.map((s, i) => (
            <Card key={i} className="border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in" data-testid={`hr-stat-${s.label.toLowerCase().replace(/\s+/g, '-')}`}>
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
          {/* Attendance Trend */}
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Attendance This Month</CardTitle></CardHeader>
            <CardContent>
              {(data?.attendance_trend || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.attendance_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(8)} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground text-center py-12">No attendance data yet</p>}
            </CardContent>
          </Card>

          {/* Pending Leaves */}
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Pending Leave Requests</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.recent_pending_leaves || []).map((l, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                    <div>
                      <p className="font-medium text-sm">{l.user_name}</p>
                      <p className="text-xs text-muted-foreground">{l.leave_type} | {l.start_date} to {l.end_date}</p>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                ))}
                {(!data?.recent_pending_leaves || data.recent_pending_leaves.length === 0) && (
                  <p className="text-muted-foreground text-center py-8">No pending leaves</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Corrections */}
        {(data?.recent_pending_corrections || []).length > 0 && (
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Pending Punch Corrections</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recent_pending_corrections.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                    <div>
                      <p className="font-medium text-sm">{c.user_name}</p>
                      <p className="text-xs text-muted-foreground">{c.correction_type} on {c.date} - {c.reason}</p>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
