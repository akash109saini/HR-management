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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { CalendarDays, Plus } from 'lucide-react';

export default function MyLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [balance, setBalance] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ leave_type: 'casual', start_date: '', end_date: '', reason: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [lRes, bRes] = await Promise.all([api.get('/leaves'), api.get('/leaves/balance')]);
      setLeaves(lRes.data);
      setBalance(bRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleApply = async () => {
    setError('');
    setSuccess('');
    try {
      await api.post('/leaves', form);
      setSuccess('Leave application submitted!');
      setShowCreate(false);
      setForm({ leave_type: 'casual', start_date: '', end_date: '', reason: '' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-leaves-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My Leaves</h1>
            <p className="text-sm text-muted-foreground mt-1">Apply for leave and track requests</p>
          </div>
          <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setError(''); setSuccess(''); } }}>
            <DialogTrigger asChild>
              <Button data-testid="apply-leave-btn"><Plus size={16} className="mr-2" />Apply Leave</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">{success}</div>}
                <div className="space-y-2">
                  <Label>Leave Type</Label>
                  <Select value={form.leave_type} onValueChange={v => setForm({...form, leave_type: v})}>
                    <SelectTrigger data-testid="leave-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="earned">Earned Leave</SelectItem>
                      <SelectItem value="maternity">Maternity Leave</SelectItem>
                      <SelectItem value="paternity">Paternity Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} data-testid="leave-start-date-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} data-testid="leave-end-date-input" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Reason for leave..." rows={3} data-testid="leave-reason-input" />
                </div>
                <Button onClick={handleApply} className="w-full" data-testid="submit-leave-btn">Submit Application</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Leave Balance */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(balance).map(([type, val]) => (
            <Card key={type} className="border border-border" data-testid={`balance-${type}`}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold font-['Outfit']">{val}</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{type}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Leave History */}
        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : leaves.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
                  ) : leaves.map((l, i) => (
                    <TableRow key={l.id || i} data-testid={`leave-row-${i}`}>
                      <TableCell><Badge variant="outline">{l.leave_type}</Badge></TableCell>
                      <TableCell>{l.start_date}</TableCell>
                      <TableCell>{l.end_date}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{l.reason}</TableCell>
                      <TableCell><Badge variant={l.status === 'approved' ? 'default' : l.status === 'rejected' ? 'destructive' : 'secondary'}>{l.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.reviewed_by || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
