import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Plus, Edit, Trash2, DollarSign } from 'lucide-react';

export default function SalarySlabManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', grade: '', min_salary: 0, max_salary: 0, basic_percentage: 50, hra_percentage: 20, pf_percentage: 12 });
  const [error, setError] = useState('');

  const fetch = async () => { try { const { data } = await api.get('/salary-slabs'); setItems(data); } catch {} setLoading(false); };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setError('');
    try {
      if (editItem) { await api.put(`/salary-slabs/${editItem.id}`, form); setEditItem(null); }
      else { await api.post('/salary-slabs', form); setShowCreate(false); }
      setForm({ name: '', grade: '', min_salary: 0, max_salary: 0, basic_percentage: 50, hra_percentage: 20, pf_percentage: 12 }); fetch();
    } catch (e) { setError(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (id) => { if (window.confirm('Delete?')) { await api.delete(`/salary-slabs/${id}`); fetch(); } };
  const openEdit = (s) => { setEditItem(s); setForm({ name: s.name, grade: s.grade||'', min_salary: s.min_salary, max_salary: s.max_salary, basic_percentage: s.basic_percentage||50, hra_percentage: s.hra_percentage||20, pf_percentage: s.pf_percentage||12 }); };

  const FormFields = () => (
    <div className="space-y-4">
      {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Slab Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Grade A" data-testid="slab-name-input" /></div>
        <div className="space-y-2"><Label>Grade</Label><Input value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} placeholder="A" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Min Salary ($)</Label><Input type="number" value={form.min_salary} onChange={e => setForm({...form, min_salary: parseFloat(e.target.value)||0})} /></div>
        <div className="space-y-2"><Label>Max Salary ($)</Label><Input type="number" value={form.max_salary} onChange={e => setForm({...form, max_salary: parseFloat(e.target.value)||0})} /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Basic %</Label><Input type="number" value={form.basic_percentage} onChange={e => setForm({...form, basic_percentage: parseFloat(e.target.value)||0})} /></div>
        <div className="space-y-2"><Label>HRA %</Label><Input type="number" value={form.hra_percentage} onChange={e => setForm({...form, hra_percentage: parseFloat(e.target.value)||0})} /></div>
        <div className="space-y-2"><Label>PF %</Label><Input type="number" value={form.pf_percentage} onChange={e => setForm({...form, pf_percentage: parseFloat(e.target.value)||0})} /></div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="salary-slab-page">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Salary Slabs</h1><p className="text-sm text-muted-foreground mt-1">Configure salary grades and structures</p></div>
          <Dialog open={showCreate} onOpenChange={o => { setShowCreate(o); if(!o) setError(''); }}>
            <DialogTrigger asChild><Button data-testid="create-slab-btn"><Plus size={16} className="mr-2" />Add Slab</Button></DialogTrigger>
            <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Create Salary Slab</DialogTitle></DialogHeader><FormFields /><Button onClick={handleSave} className="w-full mt-4" data-testid="submit-slab-btn">Create</Button></DialogContent>
          </Dialog>
        </div>
        <Card className="border border-border"><CardContent className="p-0"><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Slab</TableHead><TableHead>Grade</TableHead><TableHead>Min Salary</TableHead><TableHead>Max Salary</TableHead><TableHead>Basic/HRA/PF</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
            : items.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No salary slabs</TableCell></TableRow>
            : items.map((s, i) => (
              <TableRow key={s.id} data-testid={`slab-row-${i}`}>
                <TableCell><div className="flex items-center gap-2"><DollarSign size={16} className="text-primary" /><span className="font-medium">{s.name}</span></div></TableCell>
                <TableCell><Badge variant="outline">{s.grade || '-'}</Badge></TableCell>
                <TableCell className="font-medium">${Number(s.min_salary).toLocaleString()}</TableCell>
                <TableCell className="font-medium">${Number(s.max_salary).toLocaleString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.basic_percentage}% / {s.hra_percentage}% / {s.pf_percentage}%</TableCell>
                <TableCell><div className="flex gap-1">
                  <Dialog open={editItem?.id === s.id} onOpenChange={o => { if(!o) { setEditItem(null); setError(''); } }}>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Edit size={14} /></Button>
                    {editItem?.id === s.id && <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Edit Salary Slab</DialogTitle></DialogHeader><FormFields /><Button onClick={handleSave} className="w-full mt-4">Save</Button></DialogContent>}
                  </Dialog>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-destructive"><Trash2 size={14} /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
