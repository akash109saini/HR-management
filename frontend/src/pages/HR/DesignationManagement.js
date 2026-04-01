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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Plus, Edit, Trash2, Award, Users } from 'lucide-react';

export default function DesignationManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', level: 1, description: '' });
  const [error, setError] = useState('');

  const fetch = async () => { try { const { data } = await api.get('/designations'); setItems(data); } catch {} setLoading(false); };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setError('');
    try {
      if (editItem) { await api.put(`/designations/${editItem.id}`, form); setEditItem(null); }
      else { await api.post('/designations', form); setShowCreate(false); }
      setForm({ name: '', level: 1, description: '' }); fetch();
    } catch (e) { setError(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (id) => { if (window.confirm('Delete?')) { await api.delete(`/designations/${id}`); fetch(); } };
  const openEdit = (d) => { setEditItem(d); setForm({ name: d.name, level: d.level || 1, description: d.description || '' }); };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="designation-management-page">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Designations</h1><p className="text-sm text-muted-foreground mt-1">Manage employee designations and levels</p></div>
          <Dialog open={showCreate} onOpenChange={o => { setShowCreate(o); if(!o) setError(''); }}>
            <DialogTrigger asChild><Button data-testid="create-designation-btn"><Plus size={16} className="mr-2" />Add Designation</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Create Designation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Senior Developer" data-testid="desig-name-input" /></div>
                <div className="space-y-2"><Label>Level</Label><Input type="number" value={form.level} onChange={e => setForm({...form, level: parseInt(e.target.value)||1})} min={1} max={10} data-testid="desig-level-input" /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
              </div>
              <Button onClick={handleSave} className="w-full mt-4" data-testid="submit-desig-btn">Create</Button>
            </DialogContent>
          </Dialog>
        </div>
        <Card className="border border-border"><CardContent className="p-0"><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Designation</TableHead><TableHead>Level</TableHead><TableHead>Description</TableHead><TableHead>Employees</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
            : items.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No designations</TableCell></TableRow>
            : items.map((d, i) => (
              <TableRow key={d.id} data-testid={`desig-row-${i}`}>
                <TableCell><div className="flex items-center gap-2"><Award size={16} className="text-primary" /><span className="font-medium">{d.name}</span></div></TableCell>
                <TableCell><Badge variant="outline">Level {d.level}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{d.description || '-'}</TableCell>
                <TableCell><div className="flex items-center gap-1"><Users size={14} className="text-muted-foreground" /><span className="text-sm">{d.employee_count || 0}</span></div></TableCell>
                <TableCell><div className="flex gap-1">
                  <Dialog open={editItem?.id === d.id} onOpenChange={o => { if(!o) { setEditItem(null); setError(''); } }}>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Edit size={14} /></Button>
                    {editItem?.id === d.id && <DialogContent><DialogHeader><DialogTitle>Edit Designation</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                        <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                        <div className="space-y-2"><Label>Level</Label><Input type="number" value={form.level} onChange={e => setForm({...form, level: parseInt(e.target.value)||1})} /></div>
                        <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
                      </div>
                      <Button onClick={handleSave} className="w-full mt-4">Save</Button>
                    </DialogContent>}
                  </Dialog>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)} className="text-destructive"><Trash2 size={14} /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
