import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { CheckCircle, XCircle, Clock, Search } from 'lucide-react';

export default function AttendanceMgmt() {
  const [attendance, setAttendance] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    try {
      const [attRes, corrRes] = await Promise.all([
        api.get('/attendance'),
        api.get('/attendance/punch-corrections')
      ]);
      setAttendance(attRes.data);
      setCorrections(corrRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCorrectionAction = async (id, status) => {
    try {
      await api.put(`/attendance/punch-corrections/${id}`, { status, reviewer_note: '' });
      fetchData();
    } catch { /* ignore */ }
  };

  const filteredAttendance = attendance.filter(a =>
    a.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.user_id?.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (s) => {
    const map = { pending: 'secondary', approved: 'default', rejected: 'destructive' };
    return map[s] || 'secondary';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-attendance-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor attendance and review punch corrections</p>
        </div>

        <Tabs defaultValue="attendance">
          <TabsList data-testid="attendance-tabs">
            <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance Log</TabsTrigger>
            <TabsTrigger value="corrections" data-testid="tab-corrections">
              Punch Corrections
              {corrections.filter(c => c.status === 'pending').length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                  {corrections.filter(c => c.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-4">
            <div className="relative max-w-sm mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                      ) : filteredAttendance.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No records</TableCell></TableRow>
                      ) : filteredAttendance.slice(0, 50).map((a, i) => (
                        <TableRow key={a.id || i}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{a.user_name}</p>
                              <p className="text-xs text-muted-foreground">{a.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{a.date}</TableCell>
                          <TableCell className="text-sm">{a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : '-'}</TableCell>
                          <TableCell className="text-sm">{a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : '-'}</TableCell>
                          <TableCell className="text-sm">{a.total_hours || '-'}h</TableCell>
                          <TableCell><Badge variant={a.status === 'present' ? 'default' : 'secondary'}>{a.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="corrections" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Requested Time</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {corrections.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No corrections</TableCell></TableRow>
                      ) : corrections.map((c, i) => (
                        <TableRow key={c.id || i} data-testid={`correction-row-${i}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{c.user_name}</p>
                              <p className="text-xs text-muted-foreground">{c.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.date}</TableCell>
                          <TableCell><Badge variant="outline">{c.correction_type}</Badge></TableCell>
                          <TableCell className="text-sm">{c.requested_time}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{c.reason}</TableCell>
                          <TableCell><Badge variant={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                          <TableCell>
                            {c.status === 'pending' ? (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleCorrectionAction(c.id, 'approved')} className="text-emerald-600" data-testid={`approve-correction-${i}-btn`}>
                                  <CheckCircle size={14} />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleCorrectionAction(c.id, 'rejected')} className="text-destructive" data-testid={`reject-correction-${i}-btn`}>
                                  <XCircle size={14} />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{c.reviewed_by}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
