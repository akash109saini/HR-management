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
import { Plus, Search, UserPlus, FileDown, Edit, Eye, Power, Upload } from 'lucide-react';

const getLeaveKey = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/\s*leave\s*/g, '').trim();
};

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
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkSuccess, setBulkSuccess] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

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
      typesRes.data.forEach(t => defaults[getLeaveKey(t.name)] = t.days_allotted);
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
      setForm({ name: '', email: '', mobile: '', department: '', designation: '', salary: 0, shift: '', joining_date: '', biometric_pin: '', bank_name: '', account_number: '', ifsc_code: '', account_holder: '', leave_balance: {} });
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

  const resetBulkState = () => {
    setBulkFile(null);
    setBulkErrors([]);
    setBulkSuccess('');
    setBulkLoading(false);
    const fileInput = document.getElementById('bulk-file-input');
    if (fileInput) fileInput.value = '';
  };

  const downloadTemplate = () => {
    const headers = [
      'Name', 'Email', 'Mobile', 'Joining Date', 'Department', 'Designation', 
      'Shift', 'Salary', 'Biometric PIN', 'Bank Name', 'Account Number', 
      'IFSC Code', 'Account Holder'
    ];
    const sampleRow = [
      'John Smith', 'john.smith@company.com', '9876543210', '2026-06-22', 'I.T.', 'Developer',
      'Day', '600000', '1001', 'State Bank of India', '1234567890', 'SBIN0001234', 'John Smith'
    ];
    const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'employee_upload_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      setBulkErrors(['Please select a CSV file first.']);
      return;
    }
    setBulkLoading(true);
    setBulkErrors([]);
    setBulkSuccess('');

    const formData = new FormData();
    formData.append('file', bulkFile);

    try {
      const res = await api.post('/employees/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setBulkSuccess(res.data.message || 'Employees uploaded successfully!');
      setBulkFile(null);
      const fileInput = document.getElementById('bulk-file-input');
      if (fileInput) fileInput.value = '';
      fetchEmployees();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors && Array.isArray(data.errors)) {
        setBulkErrors(data.errors);
      } else if (data?.detail) {
        setBulkErrors([data.detail]);
      } else {
        setBulkErrors(['An error occurred during upload. Please try again.']);
      }
    } finally {
      setBulkLoading(false);
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
            normalized[getLeaveKey(k)] = v;
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
          {leaveTypes.map(lt => {
            const key = getLeaveKey(lt.name);
            return (
              <div key={lt.id} className="space-y-2">
                <Label>{lt.name}</Label>
                <Input 
                  type="number" 
                  step="0.5"
                  value={(form.leave_balance && form.leave_balance[key]) ?? 0} 
                  onChange={e => setForm({
                    ...form, 
                    leave_balance: { ...(form.leave_balance || {}), [key]: parseFloat(e.target.value) || 0 }
                  })} 
                />
              </div>
            );
          })}
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
            
            <Dialog open={showBulk} onOpenChange={(open) => { setShowBulk(open); if (!open) resetBulkState(); }}>
              <DialogTrigger asChild>
                <Button variant="outline"><Upload size={16} className="mr-2" />Bulk Upload</Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Bulk Upload Employees</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                  <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <p className="font-semibold mb-1">Sheet Format Guidelines:</p>
                    <ul className="list-disc pl-5 space-y-1 text-xs">
                      <li>Supported formats: <strong>Excel (.xlsx, .xls)</strong>, <strong>CSV (.csv)</strong>, <strong>delimited text (.txt, .dxf)</strong>.</li>
                      <li>Required columns: <strong>Name</strong>, <strong>Email</strong>, <strong>Mobile</strong>.</li>
                      <li>Optional columns: <strong>Joining Date</strong> (YYYY-MM-DD), <strong>Department</strong>, <strong>Designation</strong>, <strong>Shift</strong>, <strong>Salary</strong>, <strong>Biometric PIN</strong>, <strong>Bank Name</strong>, <strong>Account Number</strong>, <strong>IFSC Code</strong>, <strong>Account Holder</strong>.</li>
                      <li>Headers are case-insensitive and support spaces or underscores (e.g. "Full Name" or "name").</li>
                      <li><strong>All-or-Nothing Validation:</strong> If any row has errors (such as duplicate email or biometric PIN), the entire file will be rejected to prevent partial uploads.</li>
                    </ul>
                    <div className="mt-3">
                      <Button variant="secondary" size="sm" onClick={downloadTemplate} className="text-xs h-7">
                        <FileDown size={12} className="mr-1.5" /> Download Sample CSV Template
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bulk-file-input" className="text-sm font-medium">Select Spreadsheet File</Label>
                    <Input 
                      id="bulk-file-input" 
                      type="file" 
                      accept=".csv,text/csv,.xlsx,.xls,.txt,.dxf" 
                      onChange={(e) => {
                        setBulkFile(e.target.files?.[0] || null);
                        setBulkErrors([]);
                        setBulkSuccess('');
                      }} 
                    />
                  </div>

                  {bulkErrors.length > 0 && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 max-h-48 overflow-y-auto">
                      <p className="font-semibold text-sm mb-2">Upload Rejected - Errors Found:</p>
                      <ul className="list-disc pl-5 text-xs space-y-1">
                        {bulkErrors.map((err, i) => (
                          <li key={i} className="font-mono">{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {bulkSuccess && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm font-medium">
                      {bulkSuccess}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 border-t border-border pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowBulk(false)} 
                      disabled={bulkLoading}
                    >
                      Close
                    </Button>
                    <Button 
                      onClick={handleBulkUpload} 
                      disabled={bulkLoading || !bulkFile}
                    >
                      {bulkLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                          Uploading...
                        </div>
                      ) : (
                        'Upload Employees'
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

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
                            <Button variant="ghost" size="sm" onClick={() => setViewEmployee(emp)} title="View Employee Details" className="text-blue-600 hover:text-blue-700"><Eye size={14} /></Button>
                            {viewEmployee?.employee_id === emp.employee_id && (
                              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle className="text-xl font-bold">Employee Profile</DialogTitle>
                                </DialogHeader>
                                {/* Header */}
                                <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg border border-border">
                                  {emp.profile_image ? (
                                    <img src={emp.profile_image} className="w-20 h-20 rounded-full object-cover border-2 border-primary/20" alt="" />
                                  ) : (
                                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                                      <span className="text-2xl font-bold text-primary">{(emp.name||'?')[0]}</span>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-xl font-bold">{emp.name}</p>
                                    <p className="text-sm text-muted-foreground">{emp.designation || emp.position || '—'}</p>
                                    <p className="text-xs font-mono text-primary mt-1 bg-primary/10 px-2 py-0.5 rounded inline-block">{emp.employee_id}</p>
                                    <Badge className="ml-2" variant={emp.status === 'active' ? 'default' : 'secondary'}>{emp.status}</Badge>
                                  </div>
                                </div>

                                {/* Contact & Basic */}
                                <div className="mt-4">
                                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Personal Information</p>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border border-border rounded-lg p-3">
                                    <div><span className="text-muted-foreground">Email: </span><span className="font-medium">{emp.email || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Mobile: </span><span className="font-medium">{emp.mobile || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Department: </span><span className="font-medium">{emp.department || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Designation: </span><span className="font-medium">{emp.designation || emp.position || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Shift: </span><span className="font-medium">{emp.shift || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Joining Date: </span><span className="font-medium">{emp.joining_date ? emp.joining_date.split('T')[0] : '—'}</span></div>
                                    <div><span className="text-muted-foreground">Biometric PIN: </span><span className="font-mono font-medium">{emp.biometric_pin || 'Not assigned'}</span></div>
                                    <div><span className="text-muted-foreground">Role: </span><span className="font-medium capitalize">{emp.role_name || emp.role || 'employee'}</span></div>
                                  </div>
                                </div>

                                {/* Salary */}
                                <div className="mt-4">
                                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Compensation</p>
                                  <div className="grid grid-cols-3 gap-3">
                                    {[
                                      { label: 'Annual CTC', value: `₹${(emp.salary||0).toLocaleString('en-IN')}` },
                                      { label: 'Monthly Gross', value: `₹${Math.round((emp.salary||0)/12).toLocaleString('en-IN')}` },
                                      { label: 'Basic / mo', value: `₹${Math.round((emp.salary||0)/12*0.5).toLocaleString('en-IN')}` },
                                    ].map(c => (
                                      <div key={c.label} className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                                        <p className="text-xs text-muted-foreground">{c.label}</p>
                                        <p className="font-bold text-sm mt-1">{c.value}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Leave Balance */}
                                {emp.leave_balance && Object.keys(emp.leave_balance).length > 0 && (
                                  <div className="mt-4">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Leave Balance</p>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(emp.leave_balance).map(([type, days]) => (
                                        <div key={type} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-center min-w-[80px]">
                                          <p className="text-xs text-muted-foreground capitalize">{type}</p>
                                          <p className="font-bold text-blue-600 dark:text-blue-400">{days} days</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Bank Details */}
                                <div className="mt-4">
                                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Bank Details</p>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border border-border rounded-lg p-3">
                                    <div><span className="text-muted-foreground">Bank: </span><span className="font-medium">{emp.bank_details?.bank_name || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Account No: </span><span className="font-mono font-medium">{emp.bank_details?.account_number || '—'}</span></div>
                                    <div><span className="text-muted-foreground">IFSC: </span><span className="font-mono font-medium">{emp.bank_details?.ifsc_code || '—'}</span></div>
                                    <div><span className="text-muted-foreground">Holder: </span><span className="font-medium">{emp.bank_details?.account_holder || emp.name || '—'}</span></div>
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
