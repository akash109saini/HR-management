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

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [form, setForm] = useState({ name: '', domain: '', subscription_plan: 'basic', max_employees: 50, billing_cycle: 'monthly' });
  const [error, setError] = useState('');

  const fetchTenants = async () => {
    try {
      const { data } = await api.get('/tenants');
      setTenants(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/tenants', form);
      setShowCreate(false);
      setForm({ name: '', domain: '', subscription_plan: 'basic', max_employees: 50, billing_cycle: 'monthly' });
      fetchTenants();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const handleUpdate = async () => {
    setError('');
    try {
      await api.put(`/tenants/${editTenant.id}`, form);
      setEditTenant(null);
      fetchTenants();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    await api.delete(`/tenants/${id}`);
    fetchTenants();
  };

  const openEdit = (t) => {
    setEditTenant(t);
    setForm({ name: t.name, domain: t.domain, subscription_plan: t.subscription_plan, max_employees: t.max_employees, billing_cycle: t.billing_cycle });
  };

  const statusColor = (s) => {
    if (s === 'active') return 'default';
    if (s === 'suspended') return 'secondary';
    return 'destructive';
  };

  const FormFields = () => (
    <div className="space-y-4">
      {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
      <div className="space-y-2">
        <Label>Company Name</Label>
        <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Acme Corp" data-testid="tenant-name-input" />
      </div>
      <div className="space-y-2">
        <Label>Domain</Label>
        <Input value={form.domain} onChange={e => setForm({...form, domain: e.target.value})} placeholder="acme.com" data-testid="tenant-domain-input" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Plan</Label>
          <Select value={form.subscription_plan} onValueChange={v => setForm({...form, subscription_plan: v})}>
            <SelectTrigger data-testid="tenant-plan-select"><SelectValue /></SelectTrigger>
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
          <Input type="number" value={form.max_employees} onChange={e => setForm({...form, max_employees: parseInt(e.target.value) || 0})} data-testid="tenant-max-emp-input" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Billing Cycle</Label>
        <Select value={form.billing_cycle} onValueChange={v => setForm({...form, billing_cycle: v})}>
          <SelectTrigger data-testid="tenant-billing-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="tenant-management-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Tenant Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage client organizations</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button data-testid="create-tenant-btn"><Plus size={16} className="mr-2" />Add Tenant</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Tenant</DialogTitle></DialogHeader>
              <FormFields />
              <Button onClick={handleCreate} className="w-full" data-testid="submit-create-tenant-btn">Create</Button>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {tenants.filter(t => t.status !== 'deleted').map((t, i) => (
              <Card key={t.id} className="border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in" data-testid={`tenant-card-${i}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                        <Building2 size={20} className="text-primary" />
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
                    <div>Employees: <span className="text-foreground font-medium">{t.employee_count || 0}</span></div>
                    <div>Max: <span className="text-foreground font-medium">{t.max_employees}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={editTenant?.id === t.id} onOpenChange={(open) => { if (!open) setEditTenant(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => openEdit(t)} data-testid={`edit-tenant-${i}-btn`}><Edit size={14} className="mr-1" />Edit</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Edit Tenant</DialogTitle></DialogHeader>
                        <FormFields />
                        <Button onClick={handleUpdate} className="w-full" data-testid="submit-edit-tenant-btn">Save Changes</Button>
                      </DialogContent>
                    </Dialog>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(t.id)} className="text-destructive hover:text-destructive" data-testid={`delete-tenant-${i}-btn`}><Trash2 size={14} /></Button>
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
