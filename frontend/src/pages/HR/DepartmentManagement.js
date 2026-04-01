import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Plus, Edit, Trash2, Building, Users } from 'lucide-react';

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', head: '' });
  const [error, setError] = useState('');

  const fetchDepts = async () => {
    try {
      const { data } = await api.get('/departments');
      setDepartments(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchDepts(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/departments', form);
      setShowCreate(false);
      setForm({ name: '', description: '', head: '' });
      fetchDepts();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const handleUpdate = async () => {
    setError('');
    try {
      await api.put(`/departments/${editDept.id}`, form);
      setEditDept(null);
      setForm({ name: '', description: '', head: '' });
      fetchDepts();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this department?')) return;
    await api.delete(`/departments/${id}`);
    fetchDepts();
  };

  const openEdit = (d) => {
    setEditDept(d);
    setForm({ name: d.name, description: d.description || '', head: d.head || '' });
    setError('');
  };

  const FormFields = () => (
    <div className="space-y-4">
      {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
      <div className="space-y-2">
        <Label>Department Name</Label>
        <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Engineering" data-testid="dept-name-input" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Department description..." rows={3} data-testid="dept-desc-input" />
      </div>
      <div className="space-y-2">
        <Label>Department Head</Label>
        <Input value={form.head} onChange={e => setForm({...form, head: e.target.value})} placeholder="John Smith" data-testid="dept-head-input" />
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="department-management-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Departments</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage organizational departments</p>
          </div>
          <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setError(''); }}>
            <DialogTrigger asChild>
              <Button data-testid="create-dept-btn"><Plus size={16} className="mr-2" />Add Department</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
              <FormFields />
              <Button onClick={handleCreate} className="w-full" data-testid="submit-create-dept-btn">Create</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Head</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : departments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No departments</TableCell></TableRow>
                  ) : departments.map((d, i) => (
                    <TableRow key={d.id || i} data-testid={`dept-row-${i}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                            <Building size={16} className="text-primary" />
                          </div>
                          <span className="font-medium">{d.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{d.description || '-'}</TableCell>
                      <TableCell className="text-sm">{d.head || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users size={14} className="text-muted-foreground" />
                          <span className="text-sm font-medium">{d.employee_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Dialog open={editDept?.id === d.id} onOpenChange={(o) => { if (!o) { setEditDept(null); setError(''); } }}>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(d)} data-testid={`edit-dept-${i}-btn`}><Edit size={14} /></Button>
                            {editDept?.id === d.id && (
                              <DialogContent>
                                <DialogHeader><DialogTitle>Edit Department</DialogTitle></DialogHeader>
                                <FormFields />
                                <Button onClick={handleUpdate} className="w-full" data-testid="submit-edit-dept-btn">Save</Button>
                              </DialogContent>
                            )}
                          </Dialog>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)} className="text-destructive hover:text-destructive" data-testid={`delete-dept-${i}-btn`}><Trash2 size={14} /></Button>
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
