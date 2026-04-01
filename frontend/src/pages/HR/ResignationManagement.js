import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Plus, CheckCircle, XCircle, UserMinus } from 'lucide-react';

export default function ResignationManagement() {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employee_id: '', resignation_date: '', last_working_date: '', notice_period: 30, reason: '' });
  const [error, setError] = useState('');

  const fetch = async () => {
    try { const [r, e] = await Promise.all([api.get('/resignations'), api.get('/employees')]); setItems(r.data); setEmployees(e.data); } catch {} setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setError('');
    try { await api.post('/resignations', form); setShowCreate(false); setForm({ employee_id: '', resignation_date: '', last_working_date: '', notice_period: 30, reason: '' }); fetch(); }
    catch (e) { setError(e.response?.data?.detail || 'Error'); }
  };

  const handleAction = async (id, status) => { await api.put(`/resignations/${id}`, { status }); fetch(); };
  const statusColor = (s) => ({ pending: 'secondary', approved: 'default', rejected: 'destructive', withdrawn: 'outline' }[s] || 'secondary');

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="resignation-management-page">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Resignations</h1><p className="text-sm text-muted-foreground mt-1">Manage employee resignation requests</p></div>
          <Dialog open={showCreate} onOpenChange={o => { setShowCreate(o); if(!o) setError(''); }}>
            <DialogTrigger asChild><Button data-testid="add-resignation-btn"><Plus size={16} className="mr-2" />Add Resignation</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Resignation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="space-y-2"><Label>Employee</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm({...form, employee_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>{employees.filter(e => e.role === 'employee' && e.status === 'active').map(e => (
                      <SelectItem key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Resignation Date</Label><Input type="date" value={form.resignation_date} onChange={e => setForm({...form, resignation_date: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Last Working Date</Label><Input type="date" value={form.last_working_date} onChange={e => setForm({...form, last_working_date: e.target.value})} /></div>
                </div>
                <div className="space-y-2"><Label>Notice Period (days)</Label><Input type="number" value={form.notice_period} onChange={e => setForm({...form, notice_period: parseInt(e.target.value)||30})} /></div>
                <div className="space-y-2"><Label>Reason</Label><Textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} rows={3} placeholder="Reason for resignation..." /></div>
              </div>
              <Button onClick={handleSave} className="w-full mt-4" data-testid="submit-resignation-btn">Submit</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border border-border"><CardContent className="p-0"><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Resignation Date</TableHead><TableHead>Last Working</TableHead><TableHead>Notice</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
            : items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No resignations</TableCell></TableRow>
            : items.map((r, i) => (
              <TableRow key={r.id} data-testid={`resignation-row-${i}`}>
                <TableCell><div className="flex items-center gap-2"><UserMinus size={16} className="text-amber-500" /><div><p className="font-medium text-sm">{r.employee_name}</p><p className="text-xs text-muted-foreground">{r.employee_id}</p></div></div></TableCell>
                <TableCell className="text-sm">{r.resignation_date}</TableCell>
                <TableCell className="text-sm">{r.last_working_date || '-'}</TableCell>
                <TableCell className="text-sm">{r.notice_period}d</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{r.reason}</TableCell>
                <TableCell><Badge variant={statusColor(r.status)}>{r.status}</Badge></TableCell>
                <TableCell>{r.status === 'pending' && <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => handleAction(r.id, 'approved')} className="text-emerald-600"><CheckCircle size={14} className="mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(r.id, 'rejected')} className="text-destructive"><XCircle size={14} /></Button>
                </div>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
