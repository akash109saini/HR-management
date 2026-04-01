import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Clock, AlertCircle, Plus } from 'lucide-react';

export default function MyAttendance() {
  const [attendance, setAttendance] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ date: '', correction_type: 'clock_in', requested_time: '', reason: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const handleSubmitCorrection = async () => {
    setError('');
    setSuccess('');
    try {
      await api.post('/attendance/punch-correction', form);
      setSuccess('Punch correction submitted!');
      setShowCreate(false);
      setForm({ date: '', correction_type: 'clock_in', requested_time: '', reason: '' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-attendance-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My Attendance</h1>
            <p className="text-sm text-muted-foreground mt-1">View attendance log and submit corrections</p>
          </div>
          <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setError(''); setSuccess(''); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="submit-correction-btn"><AlertCircle size={16} className="mr-2" />Punch Correction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Submit Punch Correction</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">{success}</div>}
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} data-testid="correction-date-input" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.correction_type} onValueChange={v => setForm({...form, correction_type: v})}>
                    <SelectTrigger data-testid="correction-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clock_in">Clock In</SelectItem>
                      <SelectItem value="clock_out">Clock Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Requested Time</Label>
                  <Input type="time" value={form.requested_time} onChange={e => setForm({...form, requested_time: e.target.value})} data-testid="correction-time-input" />
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Forgot to clock out..." rows={3} data-testid="correction-reason-input" />
                </div>
                <Button onClick={handleSubmitCorrection} className="w-full" data-testid="submit-correction-form-btn">Submit Request</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="attendance">
          <TabsList>
            <TabsTrigger value="attendance">Attendance Log</TabsTrigger>
            <TabsTrigger value="corrections">
              My Corrections
              {corrections.filter(c => c.status === 'pending').length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
                  {corrections.filter(c => c.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                      ) : attendance.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No records</TableCell></TableRow>
                      ) : attendance.map((a, i) => (
                        <TableRow key={a.id || i} data-testid={`attendance-row-${i}`}>
                          <TableCell className="font-medium">{a.date}</TableCell>
                          <TableCell>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : '-'}</TableCell>
                          <TableCell>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : '-'}</TableCell>
                          <TableCell>{a.total_hours || '-'}h</TableCell>
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
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Requested Time</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reviewed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {corrections.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No corrections</TableCell></TableRow>
                      ) : corrections.map((c, i) => (
                        <TableRow key={c.id || i}>
                          <TableCell>{c.date}</TableCell>
                          <TableCell><Badge variant="outline">{c.correction_type}</Badge></TableCell>
                          <TableCell>{c.requested_time}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{c.reason}</TableCell>
                          <TableCell><Badge variant={c.status === 'approved' ? 'default' : c.status === 'rejected' ? 'destructive' : 'secondary'}>{c.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.reviewed_by || '-'}</TableCell>
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
