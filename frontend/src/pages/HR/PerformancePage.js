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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Star, Sparkles, Plus } from 'lucide-react';

export default function PerformancePage() {
  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(null);
  const [form, setForm] = useState({ employee_id: '', review_period: '', rating: 3, goals: '', achievements: '', areas_of_improvement: '' });
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [rRes, eRes] = await Promise.all([api.get('/performance'), api.get('/employees')]);
      setReviews(rRes.data);
      setEmployees(eRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/performance', form);
      setShowCreate(false);
      setForm({ employee_id: '', review_period: '', rating: 3, goals: '', achievements: '', areas_of_improvement: '' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const generateAISummary = async (reviewId) => {
    setGeneratingAI(reviewId);
    try {
      const { data } = await api.post(`/performance/${reviewId}/ai-summary`);
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, ai_summary: data.ai_summary } : r));
    } catch { /* ignore */ }
    setGeneratingAI(null);
  };

  const renderStars = (rating) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} className={i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'} />
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-performance-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Performance Reviews</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage employee performance and get AI insights</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button data-testid="create-review-btn"><Plus size={16} className="mr-2" />New Review</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Performance Review</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={form.employee_id} onValueChange={v => setForm({...form, employee_id: v})}>
                      <SelectTrigger data-testid="review-emp-select"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {employees.filter(e => e.role !== 'super_admin' && e.role !== 'hr_manager').map(e => (
                          <SelectItem key={e.employee_id} value={e.employee_id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Period</Label>
                    <Input value={form.review_period} onChange={e => setForm({...form, review_period: e.target.value})} placeholder="Q1 2026" data-testid="review-period-input" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rating (1-5)</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(r => (
                      <Button key={r} type="button" variant={form.rating === r ? 'default' : 'outline'} size="sm" onClick={() => setForm({...form, rating: r})} data-testid={`rating-${r}-btn`}>
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2"><Label>Goals</Label><Textarea value={form.goals} onChange={e => setForm({...form, goals: e.target.value})} rows={2} data-testid="review-goals-input" /></div>
                <div className="space-y-2"><Label>Achievements</Label><Textarea value={form.achievements} onChange={e => setForm({...form, achievements: e.target.value})} rows={2} data-testid="review-achievements-input" /></div>
                <div className="space-y-2"><Label>Areas of Improvement</Label><Textarea value={form.areas_of_improvement} onChange={e => setForm({...form, areas_of_improvement: e.target.value})} rows={2} data-testid="review-improvement-input" /></div>
                <Button onClick={handleCreate} className="w-full" data-testid="submit-review-btn">Submit Review</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger-children">
          {loading ? (
            <div className="col-span-full flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : reviews.length === 0 ? (
            <p className="col-span-full text-center py-12 text-muted-foreground">No performance reviews yet</p>
          ) : reviews.map((r, i) => (
            <Card key={r.id} className="border border-border animate-fade-in" data-testid={`review-card-${i}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{r.employee_name}</h3>
                    <p className="text-xs text-muted-foreground">{r.review_period} | Reviewed by {r.reviewer_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderStars(r.rating)}
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {r.goals && <div><span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Goals:</span><p className="text-muted-foreground mt-0.5">{r.goals}</p></div>}
                  {r.achievements && <div><span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Achievements:</span><p className="text-muted-foreground mt-0.5">{r.achievements}</p></div>}
                  {r.areas_of_improvement && <div><span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Improvement:</span><p className="text-muted-foreground mt-0.5">{r.areas_of_improvement}</p></div>}
                </div>

                {r.ai_summary ? (
                  <div className="mt-4 p-4 rounded-md bg-primary/5 border border-primary/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary via-emerald-400 to-primary" />
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-primary" />
                      <span className="text-xs uppercase tracking-wider font-semibold text-primary">AI Summary</span>
                    </div>
                    <p className="text-sm text-foreground">{r.ai_summary}</p>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => generateAISummary(r.id)} disabled={generatingAI === r.id} data-testid={`ai-summary-${i}-btn`}>
                    <Sparkles size={14} className="mr-2" />
                    {generatingAI === r.id ? 'Generating...' : 'Generate AI Summary'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
