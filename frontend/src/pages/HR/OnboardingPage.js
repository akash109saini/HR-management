import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Progress } from '../../components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Plus, Trash2, ClipboardCheck, CheckCircle2 } from 'lucide-react';

export default function OnboardingPage() {
  const [checklists, setChecklists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [activeChecklist, setActiveChecklist] = useState(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ title: '', description: '', category: 'general' });
  const [error, setError] = useState('');

  const fetch = async () => {
    try {
      const [cRes, tRes, eRes] = await Promise.all([api.get('/onboarding'), api.get('/onboarding/templates'), api.get('/employees')]);
      setChecklists(cRes.data); setTemplates(tRes.data); setEmployees(eRes.data);
    } catch {} setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const loadChecklist = async (empId) => {
    setSelectedEmp(empId);
    try {
      const { data } = await api.get(`/onboarding?employee_id=${empId}`);
      setActiveChecklist(data);
    } catch {}
  };

  const toggleItem = async (checklistId, itemId, completed) => {
    try {
      const { data } = await api.put(`/onboarding/${checklistId}/items/${itemId}`, { completed: !completed });
      setActiveChecklist(data);
      fetch();
    } catch {}
  };

  const handleCreateTemplate = async () => {
    setError('');
    try { await api.post('/onboarding/templates', templateForm); setShowCreateTemplate(false); setTemplateForm({ title: '', description: '', category: 'general' }); fetch(); }
    catch (e) { setError(formatApiError(e.response?.data?.detail)); }
  };

  const handleDeleteTemplate = async (id) => { if (window.confirm('Delete?')) { await api.delete(`/onboarding/templates/${id}`); fetch(); } };
  const categoryColors = { documentation: 'default', finance: 'secondary', it_setup: 'outline', policies: 'secondary', orientation: 'default', training: 'outline', general: 'secondary' };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="onboarding-page">
        <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Onboarding</h1><p className="text-sm text-muted-foreground mt-1">Manage employee onboarding checklists</p></div>

        <Tabs defaultValue="checklists">
          <TabsList><TabsTrigger value="checklists">Employee Checklists</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger></TabsList>

          <TabsContent value="checklists" className="mt-4 space-y-4">
            <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-1 max-w-xs">
                <Label>Select Employee</Label>
                <Select value={selectedEmp} onValueChange={v => loadChecklist(v)}>
                  <SelectTrigger data-testid="onboarding-emp-select"><SelectValue placeholder="Choose employee" /></SelectTrigger>
                  <SelectContent>{employees.filter(e => e.role !== 'super_admin' && e.role !== 'hr_manager').map(e => <SelectItem key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {activeChecklist && (
              <Card className="border border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-['Outfit'] flex items-center gap-2"><ClipboardCheck size={20} className="text-primary" />Onboarding Progress</CardTitle>
                    <Badge variant={activeChecklist.status === 'completed' ? 'default' : 'secondary'}>{activeChecklist.progress}% Complete</Badge>
                  </div>
                  <Progress value={activeChecklist.progress || 0} className="mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(activeChecklist.items || []).map((item, i) => (
                      <div key={item.id} className={`flex items-start gap-3 p-3 rounded-md border transition-all ${item.completed ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-muted/30 border-border'}`} data-testid={`onboarding-item-${i}`}>
                        <Checkbox checked={item.completed} onCheckedChange={() => toggleItem(activeChecklist.id, item.id, item.completed)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${item.completed ? 'line-through text-muted-foreground' : ''}`}>{item.title}</p>
                            <Badge variant={categoryColors[item.category] || 'secondary'} className="text-[10px]">{item.category}</Badge>
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                          {item.completed_at && <p className="text-[10px] text-emerald-600 mt-1">Completed {new Date(item.completed_at).toLocaleDateString()}</p>}
                        </div>
                        {item.completed && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!activeChecklist && !loading && <p className="text-center py-12 text-muted-foreground">Select an employee to view their onboarding checklist</p>}
          </TabsContent>

          <TabsContent value="templates" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={showCreateTemplate} onOpenChange={o => { setShowCreateTemplate(o); if (!o) setError(''); }}>
                <DialogTrigger asChild><Button data-testid="create-template-btn"><Plus size={16} className="mr-2" />Add Item</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Onboarding Template Item</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                    <div className="space-y-2"><Label>Title</Label><Input value={templateForm.title} onChange={e => setTemplateForm({...templateForm, title: e.target.value})} placeholder="Complete tax forms" data-testid="template-title-input" /></div>
                    <div className="space-y-2"><Label>Description</Label><Input value={templateForm.description} onChange={e => setTemplateForm({...templateForm, description: e.target.value})} placeholder="Description..." /></div>
                    <div className="space-y-2"><Label>Category</Label>
                      <Select value={templateForm.category} onValueChange={v => setTemplateForm({...templateForm, category: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['general', 'documentation', 'finance', 'it_setup', 'policies', 'orientation', 'training'].map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleCreateTemplate} className="w-full mt-4" data-testid="submit-template-btn">Add</Button>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="border border-border"><CardContent className="p-0">
              <div className="divide-y divide-border">
                {templates.length === 0 ? <p className="text-center py-8 text-muted-foreground">No templates. Add items to create onboarding checklist.</p>
                : templates.map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between p-4" data-testid={`template-row-${i}`}>
                    <div>
                      <p className="font-medium text-sm">{t.title}</p>
                      {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={categoryColors[t.category] || 'secondary'}>{t.category}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t.id)} className="text-destructive"><Trash2 size={14} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
