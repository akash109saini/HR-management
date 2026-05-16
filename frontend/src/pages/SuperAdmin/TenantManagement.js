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
import { Building2, Plus, Edit, Trash2 } from 'lucide-react';


const FormFields = ({ form, setForm, error, uploadingLogo, onLogoUpload }) => (
  <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
    {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Company Name</Label>
        <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Acme Corp" />
      </div>
      <div className="space-y-2">
        <Label>Domain</Label>
        <Input value={form.domain} onChange={e => setForm({...form, domain: e.target.value})} placeholder="acme.com" />
      </div>
    </div>

    <div className="space-y-2">
      <Label>Company Logo</Label>
      <div className="flex items-center gap-4">
        {form.logo && (
          <div className="w-12 h-12 rounded border flex items-center justify-center overflow-hidden bg-muted">
            <img src={form.logo} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
          </div>
        )}
        <div className="flex-1">
          <Input 
            type="file" 
            accept="image/*" 
            onChange={onLogoUpload} 
            disabled={uploadingLogo}
            className="cursor-pointer"
          />
          {uploadingLogo && <p className="text-[10px] text-primary animate-pulse mt-1">Uploading...</p>}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Company Email</Label>
        <Input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} placeholder="contact@acme.com" />
      </div>
      <div className="space-y-2">
        <Label>Contact Number</Label>
        <Input value={form.contact_number || ''} onChange={e => setForm({...form, contact_number: e.target.value})} placeholder="+1 234 567 890" />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Contact Person</Label>
        <Input value={form.contact_person || ''} onChange={e => setForm({...form, contact_person: e.target.value})} placeholder="John Doe" />
      </div>
      <div className="space-y-2">
        <Label>Tenant Number</Label>
        <Input value={form.tenant_number || ''} onChange={e => setForm({...form, tenant_number: e.target.value})} placeholder="T-1001" />
      </div>
    </div>

    <div className="space-y-2">
      <Label>Company Address</Label>
      <textarea 
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        value={form.address || ''} 
        onChange={e => setForm({...form, address: e.target.value})} 
        placeholder="123 Business St, Suite 100, City, Country"
      />
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Plan</Label>
        <Select value={form.subscription_plan} onValueChange={v => setForm({...form, subscription_plan: v})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Max Employees</Label>
        <Input type="number" value={form.max_employees} onChange={e => setForm({...form, max_employees: parseInt(e.target.value) || 0})} />
      </div>
    </div>
    <div className="space-y-2">
      <Label>Billing Cycle</Label>
      <Select value={form.billing_cycle} onValueChange={v => setForm({...form, billing_cycle: v})}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="monthly">Monthly</SelectItem>
          <SelectItem value="yearly">Yearly</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
);

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const initialForm = { 
    name: '', 
    logo: '',
    domain: '', 
    email: '',
    contact_number: '',
    contact_person: '',
    tenant_number: '',
    address: '',
    subscription_plan: 'basic', 
    max_employees: 50, 
    billing_cycle: 'monthly' 
  };
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const fetchTenants = async () => {
    try {
      const { data } = await api.get('/tenants');
      setTenants(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setForm(prev => ({ ...prev, logo: data.url }));
    } catch (err) {
      setError('Logo upload failed. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/tenants', form);
      setShowCreate(false);
      setForm(initialForm);
      fetchTenants();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail || err.response?.data?.message));
    }
  };

  const handleUpdate = async () => {
    setError('');
    try {
      await api.put(`/tenants/${editTenant.id}`, form);
      setEditTenant(null);
      fetchTenants();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail || err.response?.data?.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    await api.delete(`/tenants/${id}`);
    fetchTenants();
  };

  const openEdit = (t) => {
    setEditTenant(t);
    setForm({ 
      name: t.name, 
      logo: t.logo || '',
      domain: t.domain || '', 
      email: t.email || '',
      contact_number: t.contact_number || '',
      contact_person: t.contact_person || '',
      tenant_number: t.tenant_number || '',
      address: t.address || '',
      subscription_plan: t.subscription_plan, 
      max_employees: t.max_employees, 
      billing_cycle: t.billing_cycle 
    });
  };

  const statusColor = (s) => {
    if (s === 'active') return 'default';
    if (s === 'suspended') return 'secondary';
    return 'destructive';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="tenant-management-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Tenant Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage client organizations</p>
          </div>
          <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setForm(initialForm); }}>
            <DialogTrigger asChild>
              <Button data-testid="create-tenant-btn"><Plus size={16} className="mr-2" />Add Tenant</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader><DialogTitle>Create Tenant</DialogTitle></DialogHeader>
              <FormFields 
                form={form} 
                setForm={setForm} 
                error={error} 
                uploadingLogo={uploadingLogo} 
                onLogoUpload={handleLogoUpload} 
              />
              <Button onClick={handleCreate} className="w-full" disabled={uploadingLogo}>Create</Button>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {tenants.filter(t => t.status !== 'deleted').map((t, i) => (
              <Card key={t.id} className="border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden">
                        {t.logo ? (
                          <img src={t.logo} alt={t.name} className="w-full h-full object-cover" />
                        ) : (
                          <Building2 size={20} className="text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{t.name}</h3>
                        <p className="text-xs text-muted-foreground">{t.domain}</p>
                      </div>
                    </div>
                    <Badge variant={statusColor(t.status)}>{t.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-4">
                    <div>Plan: <span className="text-foreground font-medium">{t.subscription_plan}</span></div>
                    <div>Billing: <span className="text-foreground font-medium">{t.billing_cycle}</span></div>
                    <div>Contact: <span className="text-foreground font-medium">{t.contact_person || 'N/A'}</span></div>
                    <div>Max Emps: <span className="text-foreground font-medium">{t.max_employees}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={editTenant?.id === t.id} onOpenChange={(open) => { if (!open) setEditTenant(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Edit size={14} className="mr-1" />Edit</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader><DialogTitle>Edit Tenant</DialogTitle></DialogHeader>
                        <FormFields 
                          form={form} 
                          setForm={setForm} 
                          error={error} 
                          uploadingLogo={uploadingLogo} 
                          onLogoUpload={handleLogoUpload} 
                        />
                        <Button onClick={handleUpdate} className="w-full" disabled={uploadingLogo}>Save Changes</Button>
                      </DialogContent>
                    </Dialog>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(t.id)} className="text-destructive hover:text-destructive"><Trash2 size={14} /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
