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
import { Plus, Edit, Trash2, Clock } from 'lucide-react';

export default function ShiftManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', start_time: '09:00', end_time: '17:00', break_duration: 60, working_hours: 8 });
  const [error, setError] = useState('');

  const fetch = async () => { try { const { data } = await api.get('/shifts'); setItems(data); } catch {} setLoading(false); };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setError('');
    try {
      if (editItem) { await api.put(`/shifts/${editItem.id}`, form); setEditItem(null); }
      else { await api.post('/shifts', form); setShowCreate(false); }
      setForm({ name: '', start_time: '09:00', end_time: '17:00', break_duration: 60, working_hours: 8 });
      fetch();
    } catch (e) { setError(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (id) => { if (window.confirm('Delete this shift?')) { await api.delete(`/shifts/${id}`); fetch(); } };
  const openEdit = (s) => { setEditItem(s); setForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, break_duration: s.break_duration || 60, working_hours: s.working_hours || 8 }); };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="shift-management-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Shift Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage work shifts and timings</p>
          </div>
          <Dialog open={showCreate} onOpenChange={o => { setShowCreate(o); if(!o) setError(''); }}>
            <DialogTrigger asChild>
              <Button data-testid="create-shift-btn"><Plus size={16} className="mr-2" />Add Shift</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Shift</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="space-y-2"><Label>Shift Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Morning Shift" data-testid="shift-name-input" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} data-testid="shift-start-input" /></div>
                  <div className="space-y-2"><Label>End Time</Label><Input type="time" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} data-testid="shift-end-input" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Break (min)</Label><Input type="number" value={form.break_duration} onChange={e => setForm({...form, break_duration: parseInt(e.target.value)||0})} /></div>
                  <div className="space-y-2"><Label>Working Hours</Label><Input type="number" value={form.working_hours} onChange={e => setForm({...form, working_hours: parseInt(e.target.value)||0})} /></div>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full mt-4" data-testid="submit-shift-btn">Create</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shift</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Break</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : items.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No shifts</TableCell></TableRow>
                  ) : (
                    items.map((s, i) => (
                      <TableRow key={s.id} data-testid={`shift-row-${i}`}>
                        <TableCell><div className="flex items-center gap-2"><Clock size={16} className="text-primary" /><span className="font-medium">{s.name}</span></div></TableCell>
                        <TableCell>{s.start_time}</TableCell>
                        <TableCell>{s.end_time}</TableCell>
                        <TableCell>{s.break_duration}min</TableCell>
                        <TableCell>{s.working_hours}h</TableCell>
                        <TableCell><Badge variant={s.status === 'active' ? 'default' : 'secondary'}>{s.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Dialog open={editItem?.id === s.id} onOpenChange={o => { if(!o) { setEditItem(null); setError(''); } }}>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Edit size={14} /></Button>
                              {editItem?.id === s.id && (
                                <DialogContent>
                                  <DialogHeader><DialogTitle>Edit Shift</DialogTitle></DialogHeader>
                                  <div className="space-y-4">
                                    {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                                    <div className="space-y-2"><Label>Shift Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Morning Shift" data-testid="shift-name-input" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} data-testid="shift-start-input" /></div>
                                      <div className="space-y-2"><Label>End Time</Label><Input type="time" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} data-testid="shift-end-input" /></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2"><Label>Break (min)</Label><Input type="number" value={form.break_duration} onChange={e => setForm({...form, break_duration: parseInt(e.target.value)||0})} /></div>
                                      <div className="space-y-2"><Label>Working Hours</Label><Input type="number" value={form.working_hours} onChange={e => setForm({...form, working_hours: parseInt(e.target.value)||0})} /></div>
                                    </div>
                                  </div>
                                  <Button onClick={handleSave} className="w-full mt-4">Save</Button>
                                </DialogContent>
                              )}
                            </Dialog>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-destructive"><Trash2 size={14} /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
