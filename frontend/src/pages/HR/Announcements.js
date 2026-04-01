import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Megaphone, Trash2, Edit } from 'lucide-react';

export default function HRAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', priority: 'medium' });
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const { data } = await api.get('/announcements');
      setAnnouncements(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/announcements', form);
      setShowCreate(false);
      setForm({ title: '', content: '', priority: 'medium' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    await api.delete(`/announcements/${id}`);
    fetchData();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-announcements-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Announcements</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage company announcements</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button data-testid="create-announcement-btn"><Plus size={16} className="mr-2" />New Announcement</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Announcement</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Announcement title" data-testid="announcement-title-input" />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Announcement details..." rows={4} data-testid="announcement-content-input" />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                    <SelectTrigger data-testid="announcement-priority-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full" data-testid="submit-announcement-btn">Publish</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : announcements.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <Megaphone size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No announcements yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4 stagger-children">
            {announcements.map((a, i) => (
              <Card key={a.id} className="border border-border animate-fade-in" data-testid={`announcement-card-${i}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                        <Megaphone size={18} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{a.title}</h3>
                        <p className="text-xs text-muted-foreground">By {a.created_by} | {new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.priority === 'high' ? 'destructive' : a.priority === 'medium' ? 'secondary' : 'outline'}>{a.priority}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} className="text-destructive" data-testid={`delete-announcement-${i}-btn`}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{a.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
