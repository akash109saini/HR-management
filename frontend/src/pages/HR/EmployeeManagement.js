import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Plus, Search, UserPlus, FileDown } from 'lucide-react';

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', mobile: '', department: '', position: '', salary: 0, role: 'employee' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchEmployees = async () => {
    try {
      const { data } = await api.get('/employees');
      setEmployees(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleCreate = async () => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/employees', form);
      setSuccess(`Employee created! ID: ${data.employee_id}. Initial password: ${data.initial_password}`);
      setForm({ name: '', email: '', mobile: '', department: '', position: '', salary: 0, role: 'employee' });
      fetchEmployees();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const filtered = employees.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="employee-management-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Employees</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage workforce ({employees.length} total)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => {
              try {
                const response = await api.get('/export/employees', { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'employees_export.csv';
                link.click();
                window.URL.revokeObjectURL(url);
              } catch { /* ignore */ }
            }} data-testid="export-employees-csv-btn">
              <FileDown size={16} className="mr-2" />Export
            </Button>
            <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setError(''); setSuccess(''); } }}>
            <DialogTrigger asChild>
              <Button data-testid="add-employee-btn"><UserPlus size={16} className="mr-2" />Add Employee</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add New Employee</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md" data-testid="employee-create-success">{success}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Smith" data-testid="emp-name-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@company.com" data-testid="emp-email-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mobile (initial password)</Label>
                    <Input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="9876543210" data-testid="emp-mobile-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                      <SelectTrigger data-testid="emp-role-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="hr_manager">HR Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="Engineering" data-testid="emp-dept-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Input value={form.position} onChange={e => setForm({...form, position: e.target.value})} placeholder="Senior Developer" data-testid="emp-position-input" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Salary (Annual)</Label>
                  <Input type="number" value={form.salary} onChange={e => setForm({...form, salary: parseFloat(e.target.value) || 0})} data-testid="emp-salary-input" />
                </div>
                <Button onClick={handleCreate} className="w-full" data-testid="submit-create-employee-btn">Create Employee</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="employee-search-input" />
        </div>

        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
                  ) : filtered.map((emp, i) => (
                    <TableRow key={emp.employee_id || i} data-testid={`employee-row-${i}`}>
                      <TableCell className="font-mono text-xs">{emp.employee_id}</TableCell>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>{emp.position}</TableCell>
                      <TableCell><Badge variant="outline">{emp.role}</Badge></TableCell>
                      <TableCell><Badge variant={emp.status === 'active' ? 'default' : 'secondary'}>{emp.status}</Badge></TableCell>
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
