import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Users, CalendarDays, Clock, Briefcase, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

export default function HRDashboard() {
  const nowStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
  const [dateFilter, setDateFilter] = useState(nowStr);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/dashboard?date=${dateFilter}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFilter]);

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div></DashboardLayout>;

  const stats = [
    { label: 'Total Employees', value: data?.total_employees || 0, icon: Users, color: 'text-primary' },
    { label: 'Today Present', value: data?.today_attendance || 0, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Pending Leaves', value: data?.pending_leaves || 0, icon: CalendarDays, color: 'text-amber-500' },
    { label: 'Pending Corrections', value: data?.pending_corrections || 0, icon: AlertCircle, color: 'text-red-400' },
    { label: 'Open Jobs', value: data?.open_jobs || 0, icon: Briefcase, color: 'text-blue-400' },
    { label: 'Applicants', value: data?.total_applicants || 0, icon: Users, color: 'text-violet-400' },
  ];

  const dateStats = [
    { label: 'Total Present', value: data?.total_present || 0, icon: CheckCircle2, bg: 'from-emerald-500 to-teal-600' },
    { label: 'Total Absent', value: data?.total_absent || 0, icon: AlertCircle, bg: 'from-rose-500 to-red-600' },
    { label: 'Punch Corrections', value: data?.today_punch_corrections_count || 0, icon: Clock, bg: 'from-amber-500 to-orange-600' },
    { label: 'Missed Punches', value: data?.today_misspunches_count || 0, icon: AlertCircle, bg: 'from-violet-500 to-purple-600' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-dashboard">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">HR Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Workforce overview and pending actions</p>
          </div>
          
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
            <CalendarDays size={16} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="h-8 text-xs sm:text-sm border border-input rounded-md px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>

        {/* Global Stats Grid */}
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

        {/* Daily Status Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <h2 className="text-lg font-bold tracking-tight font-['Outfit'] text-primary">
              Daily Status Overview: {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {dateStats.map((s, i) => (
              <Card key={i} className="border border-border overflow-hidden shadow-sm">
                <div className={`h-1 w-full bg-gradient-to-r ${s.bg}`} />
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold font-['Outfit']">{s.value}</p>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</p>
                  </div>
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center text-white shadow`}>
                    <s.icon size={18} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabbed Lists */}
          <Card className="border border-border">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-base font-semibold">Lists for {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="absent">
                <div className="px-4 border-b border-border bg-muted/20">
                  <TabsList className="flex-wrap h-auto py-1.5 gap-1 bg-transparent">
                    <TabsTrigger value="absent" className="text-xs">Absent List ({data?.absent_list?.length || 0})</TabsTrigger>
                    <TabsTrigger value="misspunch" className="text-xs">Missed Punches ({data?.misspunch_list?.length || 0})</TabsTrigger>
                    <TabsTrigger value="correction" className="text-xs">Corrections ({data?.punch_correction_list?.length || 0})</TabsTrigger>
                    <TabsTrigger value="leave" className="text-xs">Leaves Approved ({data?.leave_approval_list?.length || 0})</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="absent" className="m-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Designation</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(!data?.absent_list || data.absent_list.length === 0) ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">No employees absent on this date</TableCell>
                          </TableRow>
                        ) : data.absent_list.map((emp, idx) => (
                          <TableRow key={emp.id || idx} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs text-primary">{emp.employee_id || '—'}</TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{emp.name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{emp.department || '—'}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{emp.designation || '—'}</TableCell>
                            <TableCell>
                              {emp.on_leave ? (
                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 text-[10px] px-1.5 py-0.5">On Leave</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">Absent</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="misspunch" className="m-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Clock In</TableHead>
                          <TableHead>Clock Out</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(!data?.misspunch_list || data.misspunch_list.length === 0) ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">No missed punches on this date</TableCell>
                          </TableRow>
                        ) : data.misspunch_list.map((m, idx) => (
                          <TableRow key={m.user_id || idx} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs text-primary">{m.employee_id || '—'}</TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{m.user_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{m.department || '—'}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{m.clock_in ? new Date(m.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{m.clock_out ? new Date(m.clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="correction" className="m-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Requested Time</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(!data?.punch_correction_list || data.punch_correction_list.length === 0) ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">No corrections for this date</TableCell>
                          </TableRow>
                        ) : data.punch_correction_list.map((c, idx) => (
                          <TableRow key={c.id || idx} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs text-primary">{c.employee_id || '—'}</TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{c.user_name}</TableCell>
                            <TableCell className="text-xs capitalize">{c.type === 'both' ? 'Punch Correction' : (c.type === 'missed_punch' ? 'Missed Punch' : c.type)}</TableCell>
                            <TableCell className="font-mono text-xs">{c.requested_time}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs sm:text-sm" title={c.reason}>{c.reason}</TableCell>
                            <TableCell>
                              <Badge variant={c.status === 'approved' ? 'default' : c.status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0.5">
                                {c.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="leave" className="m-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Leave Type</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(!data?.leave_approval_list || data.leave_approval_list.length === 0) ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">No active leaves on this date</TableCell>
                          </TableRow>
                        ) : data.leave_approval_list.map((l, idx) => (
                          <TableRow key={l.id || idx} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs text-primary">{l.employee_id || '—'}</TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{l.user_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{l.leave_type}</TableCell>
                            <TableCell className="font-mono text-xs">{l.start_date}</TableCell>
                            <TableCell className="font-mono text-xs">{l.end_date}</TableCell>
                            <TableCell className="max-w-[150px] truncate text-xs sm:text-sm" title={l.reason}>{l.reason}</TableCell>
                            <TableCell>
                              <Badge variant={l.status === 'approved' ? 'default' : l.status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0.5">
                                {l.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
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
