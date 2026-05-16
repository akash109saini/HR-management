import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { PiggyBank, Plus, Search, Trash2, Calendar, User, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

export default function AdvanceSalary() {
  const [advances, setAdvances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  
  const [form, setForm] = useState({
    employee_id: '',
    amount: '',
    reason: '',
    date_issued: format(new Date(), 'yyyy-MM-dd')
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [advRes, empRes] = await Promise.all([
        api.get('/salary-advances'),
        api.get('/employees')
      ]);
      setAdvances(advRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = async () => {
    setError('');
    setSuccess('');
    try {
      await api.post('/salary-advances', form);
      setSuccess('Advance issued successfully!');
      setForm({
        employee_id: '',
        amount: '',
        reason: '',
        date_issued: format(new Date(), 'yyyy-MM-dd')
      });
      setShowAdd(false);
      fetchData();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this advance record?")) return;
    try {
      await api.delete(`/salary-advances/${id}`);
      fetchData();
    } catch (err) {
      alert(formatApiError(err.response?.data?.detail));
    }
  };

  const filtered = advances.filter(a => 
    a.employee_id.toLowerCase().includes(search.toLowerCase()) ||
    (employees.find(e => e.employee_id === a.employee_id)?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit'] flex items-center gap-2">
              <PiggyBank className="text-primary" /> Advance Salary
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage and track salary advances issued to employees</p>
          </div>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button><Plus size={16} className="mr-2" /> Issue Advance</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Issue Salary Advance</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm({...form, employee_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(e => (
                        <SelectItem key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Amount</Label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="pl-8" placeholder="Enter amount" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Date Issued</Label>
                  <Input type="date" value={form.date_issued} onChange={e => setForm({...form, date_issued: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Personal/Medical etc." />
                </div>

                <Button onClick={handleAdd} className="w-full mt-2">Submit Advance</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date Issued</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
                  ) : filtered.map((adv) => (
                    <TableRow key={adv.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{employees.find(e => e.employee_id === adv.employee_id)?.name || 'Unknown'}</span>
                          <span className="text-xs text-muted-foreground font-mono">{adv.employee_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>{adv.date_issued}</TableCell>
                      <TableCell className="font-semibold text-primary">${parseFloat(adv.amount).toLocaleString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={adv.reason}>{adv.reason || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={adv.status === 'paid' ? 'default' : 'secondary'}>
                          {adv.status === 'paid' ? 'Deducted' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {adv.status === 'pending' && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(adv.id)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </TableCell>
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
