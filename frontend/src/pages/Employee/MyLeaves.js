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
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ leave_type: '', start_date: '', end_date: '', duration_type: 'full', half_day_slot: 'first_half', reason: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [lRes, bRes, tRes] = await Promise.all([
        api.get('/leaves'), 
        api.get('/leaves/balance'),
        api.get('/leave-types')
      ]);
      setLeaves(lRes.data);
      
      // Normalize balance keys to lowercase
      const rawBal = bRes.data || {};
      const normBal = {};
      Object.entries(rawBal).forEach(([k, v]) => {
        normBal[k.toLowerCase().trim()] = v;
      });
      setBalance(normBal);

      setLeaveTypes(tRes.data);
      
      if (tRes.data.length > 0 && !form.leave_type) {
        setForm(prev => ({ ...prev, leave_type: tRes.data[0].name }));
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const calculateDays = () => {
    if (!form.start_date || !form.end_date) return 0;
    if (form.duration_type === 'half') return 0.5;
    const s = new Date(form.start_date);
    const e = new Date(form.end_date);
    const diffTime = Math.abs(e - s);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleApply = async () => {
    setError('');
    setSuccess('');
    try {
      await api.post('/leaves', form);
      setSuccess('Leave application submitted!');
      setShowCreate(false);
      setForm({ leave_type: leaveTypes[0]?.name || '', start_date: '', end_date: '', duration_type: 'full', half_day_slot: 'first_half', reason: '' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const currentBal = () => {
    const type = form.leave_type?.toLowerCase()?.trim();
    if (!type) return 0;
    const first = type.split(' ')[0];
    return balance[type] || balance[first] || 0;
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
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                
                <div className="space-y-2">
                  <Label>Leave Type (Balance: {currentBal()})</Label>
                    <Select value={form.leave_type} onValueChange={v => setForm({...form, leave_type: v})}>
                      <SelectTrigger data-testid="leave-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map(t => (
                          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duration Type</Label>
                    <Select value={form.duration_type} onValueChange={v => setForm({...form, duration_type: v, end_date: v === 'half' ? form.start_date : form.end_date})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Day</SelectItem>
                        <SelectItem value="half">Half Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.duration_type === 'half' && (
                    <div className="space-y-2">
                      <Label>Slot</Label>
                      <Select value={form.half_day_slot} onValueChange={v => setForm({...form, half_day_slot: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="first_half">First Half</SelectItem>
                          <SelectItem value="second_half">Second Half</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value, end_date: form.duration_type === 'half' ? e.target.value : form.end_date})} data-testid="leave-start-date-input" />
                  </div>
                  {form.duration_type === 'full' && (
                    <div className="space-y-2">
                      <Label>To Date</Label>
                      <Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} data-testid="leave-end-date-input" />
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-semibold">Duration Preview:</p>
                  <p className="text-lg font-bold text-primary">{calculateDays()} Days</p>
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
