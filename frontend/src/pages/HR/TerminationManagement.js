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
import { Plus, Edit, Trash2, UserX } from 'lucide-react';

export default function TerminationManagement() {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employee_id: '', termination_type: 'layoff', termination_date: '', description: '' });
  const [error, setError] = useState('');

  const fetch = async () => {
    try { const [t, e] = await Promise.all([api.get('/terminations'), api.get('/employees')]); setItems(t.data); setEmployees(e.data); } catch {} setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setError('');
    try { await api.post('/terminations', form); setShowCreate(false); setForm({ employee_id: '', termination_type: 'layoff', termination_date: '', description: '' }); fetch(); }
    catch (e) { setError(e.response?.data?.detail || 'Error'); }
  };

  const handleStatus = async (id, status) => { await api.put(`/terminations/${id}`, { status }); fetch(); };
  const handleDelete = async (id) => { if (window.confirm('Delete?')) { await api.delete(`/terminations/${id}`); fetch(); } };
  const statusColor = (s) => ({ pending: 'secondary', completed: 'destructive', cancelled: 'outline' }[s] || 'secondary');

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="termination-management-page">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Terminations</h1><p className="text-sm text-muted-foreground mt-1">Manage employee termination records</p></div>
          <Dialog open={showCreate} onOpenChange={o => { setShowCreate(o); if(!o) setError(''); }}>
            <DialogTrigger asChild><Button data-testid="add-termination-btn"><Plus size={16} className="mr-2" />Add Termination</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Termination</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="space-y-2"><Label>Employee</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm({...form, employee_id: v})}>
                    <SelectTrigger data-testid="term-employee-select"><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>{employees.filter(e => e.role === 'employee' && e.status === 'active').map(e => (
                      <SelectItem key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Termination Type</Label>
                  <Select value={form.termination_type} onValueChange={v => setForm({...form, termination_type: v})}>
                    <SelectTrigger data-testid="term-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="layoff">Layoff</SelectItem><SelectItem value="misconduct">Misconduct</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem><SelectItem value="mutual">Mutual Agreement</SelectItem>
                      <SelectItem value="retirement">Retirement</SelectItem><SelectItem value="contract_end">Contract End</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Termination Date</Label><Input type="date" value={form.termination_date} onChange={e => setForm({...form, termination_date: e.target.value})} data-testid="term-date-input" /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} placeholder="Reason for termination..." data-testid="term-desc-input" /></div>
              </div>
              <Button onClick={handleSave} className="w-full mt-4" data-testid="submit-termination-btn">Save Termination Entry</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border border-border"><CardContent className="p-0"><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
            : items.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No termination records</TableCell></TableRow>
            : items.map((t, i) => (
              <TableRow key={t.id} data-testid={`termination-row-${i}`}>
                <TableCell><div className="flex items-center gap-2"><UserX size={16} className="text-destructive" /><div><p className="font-medium text-sm">{t.employee_name}</p><p className="text-xs text-muted-foreground">{t.employee_id}</p></div></div></TableCell>
                <TableCell><Badge variant="outline">{t.termination_type}</Badge></TableCell>
                <TableCell className="text-sm">{t.termination_date}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.description || '-'}</TableCell>
                <TableCell><Badge variant={statusColor(t.status)}>{t.status}</Badge></TableCell>
                <TableCell><div className="flex gap-1">
                  {t.status === 'pending' && <>
                    <Button size="sm" variant="outline" onClick={() => handleStatus(t.id, 'completed')} className="text-destructive" data-testid={`complete-term-${i}-btn`}>Complete</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleStatus(t.id, 'cancelled')}>Cancel</Button>
                  </>}
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-destructive"><Trash2 size={14} /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
