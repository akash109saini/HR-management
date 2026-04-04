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
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [suggestedId, setSuggestedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', mobile: '', department: '', designation: '', salary: 0, shift: '', joining_date: '', bank_name: '', account_number: '', ifsc_code: '', account_holder: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchEmployees = async () => {
    try {
      const [empRes, deptRes, desigRes, shiftRes, idRes] = await Promise.all([
        api.get('/employees'), api.get('/departments'), api.get('/designations'),
        api.get('/shifts'), api.get('/employees/suggest-id')
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
      setShifts(shiftRes.data);
      setSuggestedId(idRes.data.suggested_id || '');
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleCreate = async () => {
    setError('');
    setSuccess('');
    try {
      let profileImageUrl = '';
      if (form.profile_image_file) {
        const formData = new FormData();
        formData.append('file', form.profile_image_file);
        try {
          const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          profileImageUrl = uploadRes.data.url || '';
        } catch { /* continue without image */ }
      }
      const payload = { ...form, profile_image: profileImageUrl };
      delete payload.profile_image_preview;
      delete payload.profile_image_file;
      const { data } = await api.post('/employees', payload);
      setSuccess(`Employee created! ID: ${data.employee_id}. Initial password: ${data.initial_password}`);
      setForm({ name: '', email: '', mobile: '', department: '', designation: '', salary: 0, shift: '', joining_date: '', bank_name: '', account_number: '', ifsc_code: '', account_holder: '' });
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Employee</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md" data-testid="employee-create-success">{success}</div>}

                <p className="text-xs text-muted-foreground">Suggested Employee ID: <span className="font-mono font-medium text-primary">{suggestedId}</span></p>

                {/* Profile Image Upload */}
                <div className="space-y-2">
                  <Label>Profile Image</Label>
                  <div className="flex items-center gap-4">
                    {form.profile_image_preview ? (
                      <img src={form.profile_image_preview} alt="Preview" className="w-16 h-16 rounded-md object-cover border border-border" />
                    ) : (
                      <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center border border-border"><UserPlus size={20} className="text-muted-foreground" /></div>
                    )}
                    <Input type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const preview = URL.createObjectURL(file);
                      setForm(prev => ({...prev, profile_image_preview: preview, profile_image_file: file}));
                    }} data-testid="emp-image-input" className="flex-1" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Smith" data-testid="emp-name-input" /></div>
                  <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@company.com" data-testid="emp-email-input" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Mobile (initial password)</Label><Input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="9876543210" data-testid="emp-mobile-input" /></div>
                  <div className="space-y-2"><Label>Joining Date</Label><Input type="date" value={form.joining_date} onChange={e => setForm({...form, joining_date: e.target.value})} data-testid="emp-joining-input" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Department</Label>
                    <Select value={form.department} onValueChange={v => setForm({...form, department: v})}>
                      <SelectTrigger data-testid="emp-dept-select"><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Designation</Label>
                    <Select value={form.designation} onValueChange={v => setForm({...form, designation: v})}>
                      <SelectTrigger data-testid="emp-desig-select"><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>{designations.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Shift Timing</Label>
                    <Select value={form.shift} onValueChange={v => setForm({...form, shift: v})}>
                      <SelectTrigger data-testid="emp-shift-select"><SelectValue placeholder="Select shift" /></SelectTrigger>
                      <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.name}>{s.name} ({s.start_time} - {s.end_time})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Salary (Annual)</Label><Input type="number" value={form.salary} onChange={e => setForm({...form, salary: parseFloat(e.target.value) || 0})} data-testid="emp-salary-input" /></div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold mb-3">Bank Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} placeholder="State Bank" data-testid="emp-bank-input" /></div>
                    <div className="space-y-2"><Label>Account Number</Label><Input value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} placeholder="1234567890" data-testid="emp-account-input" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="space-y-2"><Label>IFSC Code</Label><Input value={form.ifsc_code} onChange={e => setForm({...form, ifsc_code: e.target.value})} placeholder="SBIN0001234" data-testid="emp-ifsc-input" /></div>
                    <div className="space-y-2"><Label>Account Holder</Label><Input value={form.account_holder} onChange={e => setForm({...form, account_holder: e.target.value})} placeholder="John Smith" /></div>
                  </div>
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
                    <TableHead>Designation</TableHead>
                    <TableHead>Shift</TableHead>
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
                      <TableCell>{emp.designation || emp.position || '-'}</TableCell>
                      <TableCell>{emp.shift || '-'}</TableCell>
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
