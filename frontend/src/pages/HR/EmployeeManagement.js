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
import { Plus, Search, UserPlus, FileDown, Edit, Eye, Power } from 'lucide-react';

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [suggestedId, setSuggestedId] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showCreate, setShowCreate] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  const [form, setForm] = useState({ 
    name: '', email: '', mobile: '', department: '', designation: '', 
    salary: 0, shift: '', joining_date: '', biometric_pin: '', bank_name: '', 
    account_number: '', ifsc_code: '', account_holder: '',
    leave_balance: {}
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchEmployees = async () => {
    try {
      const [empRes, deptRes, desigRes, shiftRes, idRes, typesRes] = await Promise.all([
        api.get('/employees'), api.get('/departments'), api.get('/designations'),
        api.get('/shifts'), api.get('/employees/suggest-id'), api.get('/leave-types')
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
      setShifts(shiftRes.data);
      setSuggestedId(idRes.data.suggested_id || '');
      setLeaveTypes(typesRes.data);
      
      // Initialize default balances in form
      const defaults = {};
      typesRes.data.forEach(t => defaults[t.name.toLowerCase()] = t.days_allotted);
      setForm(prev => ({ ...prev, leave_balance: defaults }));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleCreate = async () => {
    setError(''); setSuccess('');
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
      setForm({ name: '', email: '', mobile: '', department: '', designation: '', salary: 0, shift: '', joining_date: '', biometric_pin: '', bank_name: '', account_number: '', ifsc_code: '', account_holder: '' });
      fetchEmployees();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const handleUpdate = async () => {
    setError(''); setSuccess('');
    try {
      const payload = { ...form };
      delete payload.profile_image_preview;
      delete payload.profile_image_file;
      await api.put(`/employees/${editEmployee.employee_id}`, payload);
      setEditEmployee(null);
      fetchEmployees();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const handleToggleStatus = async (emp) => {
    try {
      const newStatus = emp.status === 'active' ? 'inactive' : 'active';
      await api.put(`/employees/${emp.employee_id}`, { status: newStatus });
      fetchEmployees();
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const openEdit = (emp) => {
    setEditEmployee(emp);
    setForm({
      name: emp.name || '',
      email: emp.email || '',
      mobile: emp.mobile || '',
      department: emp.department || '',
      designation: emp.designation || emp.position || '',
      salary: emp.salary || 0,
      shift: emp.shift || '',
      biometric_pin: emp.biometric_pin || '',
      joining_date: (emp.joining_date && emp.joining_date.split('T')[0]) || '',
      bank_name: emp.bank_details?.bank_name || '',
      account_number: emp.bank_details?.account_number || '',
      ifsc_code: emp.bank_details?.ifsc_code || '',
      account_holder: emp.bank_details?.account_holder || '',
      leave_balance: (() => {
        const normalized = {};
        if (emp.leave_balance) {
          Object.entries(emp.leave_balance).forEach(([k, v]) => {
            normalized[k.toLowerCase().trim()] = v;
          });
        }
        return normalized;
      })()
    });
    setError(''); setSuccess('');
  };

  const filtered = employees.filter(e => {
    const matchSearch = e.name?.toLowerCase().includes(search.toLowerCase()) ||
                        e.email?.toLowerCase().includes(search.toLowerCase()) ||
                        e.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
                        e.department?.toLowerCase().includes(search.toLowerCase());
    const matchDesignation = filterDesignation === 'all' || e.designation === filterDesignation || e.position === filterDesignation;
    const matchDate = !filterDate || (e.joining_date && e.joining_date.startsWith(filterDate));
    return matchSearch && matchDesignation && matchDate;
  });

  const renderFormFields = (isEdit = false) => (
    <div className="space-y-4">
      {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
      {success && !isEdit && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">{success}</div>}

      {!isEdit && (
        <p className="text-xs text-muted-foreground">Suggested Employee ID: <span className="font-mono font-medium text-primary">{suggestedId}</span></p>
      )}

      {/* Profile Image Upload (Creation Only for simplicity) */}
      {!isEdit && (
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
            }} className="flex-1" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Smith" /></div>
        <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@company.com" disabled={isEdit} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Mobile {!isEdit && '(initial password)'}</Label><Input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="9876543210" /></div>
        <div className="space-y-2"><Label>Joining Date</Label><Input type="date" value={form.joining_date} onChange={e => setForm({...form, joining_date: e.target.value})} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Department</Label>
          <Select value={form.department} onValueChange={v => setForm({...form, department: v})}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Designation</Label>
          <Select value={form.designation} onValueChange={v => setForm({...form, designation: v})}>
            <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
            <SelectContent>{designations.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Shift Timing</Label>
          <Select value={form.shift} onValueChange={v => setForm({...form, shift: v})}>
            <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
            <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.name}>{s.name} ({s.start_time} - {s.end_time})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Salary (Annual)</Label><Input type="number" value={form.salary} onChange={e => setForm({...form, salary: parseFloat(e.target.value) || 0})} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Biometric PIN</Label>
          <Input value={form.biometric_pin} onChange={e => setForm({...form, biometric_pin: e.target.value})} placeholder="e.g., 1001 (must match device)" />
          <p className="text-xs text-muted-foreground">Must match the User ID enrolled on the ESSL biometric device</p>
        </div>
        <div></div>
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold mb-3">{isEdit ? 'Manage' : 'Initial'} Leave Balances</h4>
        <div className="grid grid-cols-2 gap-4">
          {leaveTypes.map(lt => (
            <div key={lt.id} className="space-y-2">
              <Label>{lt.name}</Label>
              <Input 
                type="number" 
                step="0.5"
                value={form.leave_balance[lt.name.toLowerCase()] || 0} 
                onChange={e => setForm({
                  ...form, 
                  leave_balance: { ...form.leave_balance, [lt.name.toLowerCase()]: parseFloat(e.target.value) || 0 }
                })} 
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold mb-3">Bank Details</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} placeholder="State Bank" /></div>
          <div className="space-y-2"><Label>Account Number</Label><Input value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} placeholder="1234567890" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-2"><Label>IFSC Code</Label><Input value={form.ifsc_code} onChange={e => setForm({...form, ifsc_code: e.target.value})} placeholder="SBIN0001234" /></div>
          <div className="space-y-2"><Label>Account Holder</Label><Input value={form.account_holder} onChange={e => setForm({...form, account_holder: e.target.value})} placeholder="John Smith" /></div>
        </div>
      </div>

      <Button onClick={isEdit ? handleUpdate : handleCreate} className="w-full">
        {isEdit ? 'Save Changes' : 'Create Employee'}
      </Button>
    </div>
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
            }}>
              <FileDown size={16} className="mr-2" />Export
            </Button>
            <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setError(''); setSuccess(''); } }}>
              <DialogTrigger asChild>
                <Button><UserPlus size={16} className="mr-2" />Add Employee</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add New Employee</DialogTitle></DialogHeader>
                {renderFormFields(false)}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div>
            <Select value={filterDesignation} onValueChange={setFilterDesignation}>
              <SelectTrigger><SelectValue placeholder="All Designations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Designations</SelectItem>
                {designations.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} placeholder="Filter by Joining Date" />
          </div>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
                  ) : filtered.map((emp, i) => (
                    <TableRow key={emp.employee_id || i}>
                      <TableCell className="font-mono text-xs">{emp.employee_id}</TableCell>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>{emp.designation || emp.position || '-'}</TableCell>
                      <TableCell><Badge variant={emp.status === 'active' ? 'default' : 'secondary'}>{emp.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {/* View Modal */}
                          <Dialog open={viewEmployee?.employee_id === emp.employee_id} onOpenChange={o => { if(!o) setViewEmployee(null); }}>
                            <Button variant="ghost" size="sm" onClick={() => setViewEmployee(emp)} title="View"><Eye size={14} /></Button>
                            {viewEmployee?.employee_id === emp.employee_id && (
                              <DialogContent className="max-w-lg">
                                <DialogHeader><DialogTitle>Employee Details: {emp.name}</DialogTitle></DialogHeader>
                                <div className="space-y-4">
                                  <div className="flex items-center gap-4">
                                    {emp.profile_image ? (
                                      <img src={emp.profile_image} className="w-16 h-16 rounded-full object-cover" alt="" />
                                    ) : (
                                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"><UserPlus size={20} className="text-muted-foreground" /></div>
                                    )}
                                    <div>
                                      <p className="font-bold text-lg">{emp.name}</p>
                                      <p className="text-sm text-muted-foreground">{emp.designation || '-'} ({emp.employee_id})</p>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <p><span className="font-semibold">Email:</span> {emp.email}</p>
                                    <p><span className="font-semibold">Mobile:</span> {emp.mobile || '-'}</p>
                                    <p><span className="font-semibold">Department:</span> {emp.department || '-'}</p>
                                    <p><span className="font-semibold">Shift:</span> {emp.shift || '-'}</p>
                                    <p><span className="font-semibold">Joining Date:</span> {emp.joining_date ? emp.joining_date.split('T')[0] : '-'}</p>
                                    <p><span className="font-semibold">Salary:</span> ${emp.salary || 0}</p>
                                    <p><span className="font-semibold">Biometric PIN:</span> <span className="font-mono">{emp.biometric_pin || 'Not assigned'}</span></p>
                                  </div>
                                  <div className="border-t border-border pt-3">
                                    <p className="font-semibold mb-1 text-sm">Bank Details</p>
                                    <p className="text-sm">Bank Name: {emp.bank_details?.bank_name || '-'}</p>
                                    <p className="text-sm">Acc Number: {emp.bank_details?.account_number || '-'}</p>
                                    <p className="text-sm">IFSC: {emp.bank_details?.ifsc_code || '-'}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            )}
                          </Dialog>

                          {/* Edit Modal */}
                          <Dialog open={editEmployee?.employee_id === emp.employee_id} onOpenChange={o => { if(!o) { setEditEmployee(null); setError(''); } }}>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(emp)} title="Edit"><Edit size={14} /></Button>
                            {editEmployee?.employee_id === emp.employee_id && (
                              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
                                {renderFormFields(true)}
                              </DialogContent>
                            )}
                          </Dialog>

                          {/* Toggle Active/Inactive */}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleToggleStatus(emp)} 
                            title={emp.status === 'active' ? "Deactivate" : "Activate"}
                            className={emp.status === 'active' ? 'text-destructive' : 'text-emerald-600'}
                          >
                            <Power size={14} />
                          </Button>
                        </div>
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
