import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Clock, CalendarDays, AlertCircle, Megaphone, LogIn, LogOut } from 'lucide-react';

export default function EmpDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);

  const fetchDashboard = async () => {
    try {
      const { data: d } = await api.get('/dashboard');
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchDashboard(); }, []);

  const handleClockIn = async () => {
    setClockingIn(true);
    try {
      await api.post('/attendance/clock-in', { note: '' });
      fetchDashboard();
    } catch { /* ignore */ }
    setClockingIn(false);
  };

  const handleClockOut = async () => {
    setClockingOut(true);
    try {
      await api.post('/attendance/clock-out');
      fetchDashboard();
    } catch { /* ignore */ }
    setClockingOut(false);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div></DashboardLayout>;

  const todayRecord = data?.today_attendance;
  const isClockedIn = todayRecord?.clock_in && !todayRecord?.clock_out;
  const isClockedOut = todayRecord?.clock_out;
  const leaveBalance = data?.leave_balance || {};

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="employee-dashboard">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Welcome, {user?.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user?.employee_id} | {user?.department} | {user?.position}</p>
        </div>

        {/* Clock In/Out CTA */}
        <Card className="border border-border bg-primary/5">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isClockedIn ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-muted'}`}>
                  <Clock size={24} className={isClockedIn ? 'text-emerald-600' : 'text-muted-foreground'} />
                </div>
                <div>
                  <p className="font-semibold">
                    {isClockedOut ? 'Done for today' : isClockedIn ? 'Currently Working' : 'Not clocked in'}
                  </p>
                  {todayRecord?.clock_in && (
                    <p className="text-xs text-muted-foreground">
                      In: {new Date(todayRecord.clock_in).toLocaleTimeString()}
                      {todayRecord.clock_out && ` | Out: ${new Date(todayRecord.clock_out).toLocaleTimeString()}`}
                      {todayRecord.total_hours > 0 && ` | ${todayRecord.total_hours}h`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {!todayRecord?.clock_in && (
                  <Button onClick={handleClockIn} disabled={clockingIn} className="animate-pulse-glow" data-testid="clock-in-btn">
                    <LogIn size={16} className="mr-2" />{clockingIn ? 'Clocking in...' : 'Clock In'}
                  </Button>
                )}
                {isClockedIn && (
                  <Button onClick={handleClockOut} disabled={clockingOut} variant="outline" data-testid="clock-out-btn">
                    <LogOut size={16} className="mr-2" />{clockingOut ? 'Clocking out...' : 'Clock Out'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          <Card className="border border-border animate-fade-in" data-testid="stat-days-present">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Days Present</p>
              <p className="text-3xl font-bold mt-2 font-['Outfit']">{data?.days_present_this_month || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>
          <Card className="border border-border animate-fade-in" data-testid="stat-pending-leaves">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Pending Leaves</p>
              <p className="text-3xl font-bold mt-2 font-['Outfit']">{data?.pending_leaves || 0}</p>
            </CardContent>
          </Card>
          <Card className="border border-border animate-fade-in" data-testid="stat-pending-corrections">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Pending Corrections</p>
              <p className="text-3xl font-bold mt-2 font-['Outfit']">{data?.pending_corrections || 0}</p>
            </CardContent>
          </Card>
          <Card className="border border-border animate-fade-in" data-testid="stat-leave-balance">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Leave Balance</p>
              <div className="flex gap-3 mt-2">
                {Object.entries(leaveBalance).map(([type, val]) => (
                  <div key={type} className="text-center">
                    <p className="text-lg font-bold font-['Outfit']">{val}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">{type}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Announcements */}
        {(data?.recent_announcements || []).length > 0 && (
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit'] flex items-center gap-2"><Megaphone size={18} />Recent Announcements</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recent_announcements.map((a, i) => (
                  <div key={i} className="p-4 rounded-md bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-sm">{a.title}</h4>
                      <Badge variant={a.priority === 'high' ? 'destructive' : a.priority === 'medium' ? 'secondary' : 'outline'}>{a.priority}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">By {a.created_by} | {new Date(a.created_at).toLocaleDateString()}</p>
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
