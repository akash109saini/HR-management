import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Calendar, Plus, Edit, Trash2 } from 'lucide-react';

export default function HolidayManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', date: '', type: 'public', description: '' });
  const [error, setError] = useState('');

  const fetch = async () => { try { const { data } = await api.get('/holidays'); setItems(data); } catch {} setLoading(false); };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setError('');
    try {
      if (editItem) { await api.put(`/holidays/${editItem.id}`, form); setEditItem(null); }
      else { await api.post('/holidays', form); setShowCreate(false); }
      setForm({ name: '', date: '', type: 'public', description: '' }); fetch();
    } catch (e) { setError(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (id) => { if (window.confirm('Delete?')) { await api.delete(`/holidays/${id}`); fetch(); } };
  const openEdit = (h) => { setEditItem(h); setForm({ name: h.name, date: h.date, type: h.type||'public', description: h.description||'' }); };

  const typeColor = (t) => t === 'public' ? 'default' : t === 'optional' ? 'secondary' : 'outline';

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="holiday-management-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Holidays</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage company holidays calendar</p>
          </div>
          <Dialog open={showCreate} onOpenChange={o => { setShowCreate(o); if(!o) setError(''); }}>
            <DialogTrigger asChild>
              <Button data-testid="create-holiday-btn"><Plus size={16} className="mr-2" />Add Holiday</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="space-y-2"><Label>Holiday Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="New Year" data-testid="holiday-name-input" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} data-testid="holiday-date-input" /></div>
                  <div className="space-y-2"><Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="optional">Optional</SelectItem><SelectItem value="restricted">Restricted</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" /></div>
              </div>
              <Button onClick={handleSave} className="w-full mt-4" data-testid="submit-holiday-btn">Create</Button>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {loading ? (
            <div className="col-span-full flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : items.length === 0 ? (
            <p className="col-span-full text-center py-12 text-muted-foreground">No holidays</p>
          ) : (
            items.map((h, i) => (
              <Card key={h.id} className="border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in" data-testid={`holiday-card-${i}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2"><Calendar size={18} className="text-primary" /><h3 className="font-semibold">{h.name}</h3></div>
                    <Badge variant={typeColor(h.type)}>{h.type}</Badge>
                  </div>
                  <p className="text-lg font-bold font-['Outfit'] text-primary">{new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  {h.description && <p className="text-xs text-muted-foreground mt-1">{h.description}</p>}
                  <div className="flex gap-1 mt-3">
                    <Dialog open={editItem?.id === h.id} onOpenChange={o => { if(!o) { setEditItem(null); setError(''); } }}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(h)}><Edit size={14} className="mr-1" />Edit</Button>
                      {editItem?.id === h.id && (
                        <DialogContent>
                          <DialogHeader><DialogTitle>Edit Holiday</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                            <div className="space-y-2"><Label>Holiday Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="New Year" data-testid="holiday-name-input" /></div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} data-testid="holiday-date-input" /></div>
                              <div className="space-y-2"><Label>Type</Label>
                                <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="optional">Optional</SelectItem><SelectItem value="restricted">Restricted</SelectItem></SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" /></div>
                          </div>
                          <Button onClick={handleSave} className="w-full mt-4">Save</Button>
                        </DialogContent>
                      )}
                    </Dialog>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(h.id)} className="text-destructive"><Trash2 size={14} /></Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
