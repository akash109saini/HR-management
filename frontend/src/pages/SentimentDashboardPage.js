import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Heart, TrendingUp, TrendingDown, MessageCircle, AlertTriangle,
  Loader2, RefreshCw, Send, Smile, Frown, Meh, BarChart3, Tag, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const CATS = [
  { value: 'general', label: 'General' },
  { value: 'work_environment', label: 'Work Environment' },
  { value: 'management', label: 'Management' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'growth', label: 'Growth & Development' },
];

const SENTIMENT_STYLES = {
  positive: { color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Smile },
  negative: { color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: Frown },
  neutral:  { color: 'text-gray-600', bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: Meh },
  mixed:    { color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertCircle },
};

function StatCard({ label, value, sub, icon: Icon, color = 'text-foreground' }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          {Icon && <Icon className={`w-8 h-8 opacity-30 ${color}`} />}
        </div>
      </CardContent>
    </Card>
  );
}

function SentimentBar({ counts, total }) {
  if (!total) return <div className="text-sm text-muted-foreground">No data</div>;
  const order = ['positive', 'mixed', 'neutral', 'negative'];
  const colorMap = { positive: 'bg-emerald-500', mixed: 'bg-amber-500', neutral: 'bg-gray-400', negative: 'bg-red-500' };
  return (
    <div>
      <div className="h-3 w-full rounded-full overflow-hidden flex">
        {order.map(k => {
          const pct = ((counts[k] || 0) / total) * 100;
          return pct > 0 ? <div key={k} className={colorMap[k]} style={{ width: `${pct}%` }} title={`${k}: ${counts[k]} (${pct.toFixed(0)}%)`} /> : null;
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        {order.map(k => (
          <div key={k} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${colorMap[k]}`} />
            <span className="capitalize text-muted-foreground">{k}:</span>
            <span className="font-medium">{counts[k] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SentimentDashboardPage() {
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];
  const isHR = user?.role === 'super_admin' || user?.role === 'hr_manager' || userPermissions.some(p => !p.startsWith('self_') && p !== 'announcements');

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(30);

  // Submit form (any user)
  const [text, setText] = useState('');
  const [category, setCategory] = useState('general');
  const [rating, setRating] = useState(0);
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const loadDashboard = async (d = period) => {
    if (!isHR) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/ai/sentiment-dashboard?days=${d}`);
      setDashboard(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDashboard(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) { toast.error('Please share your thoughts'); return; }
    setSubmitting(true);
    setLastResult(null);
    try {
      const { data } = await api.post('/ai/feedback', {
        text: text.trim(), category, anonymous, rating: rating || null,
      });
      setLastResult(data.feedback);
      setText('');
      setRating(0);
      toast.success('Thanks for sharing! 💜');
      if (isHR) await loadDashboard();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSubmitting(false); }
  };

  const sentimentStyle = (s) => SENTIMENT_STYLES[s] || SENTIMENT_STYLES.neutral;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="sentiment-dashboard-page">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-6 h-6 text-pink-500" />
              <h1 className="text-2xl font-bold tracking-tight">Pulse & Sentiment</h1>
              <Badge variant="outline" className="ml-2">AI-powered</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {isHR
                ? 'Real-time employee sentiment analytics across feedback channels.'
                : 'Share how you feel about work — anonymously if you prefer. AI helps HR act on it.'}
            </p>
          </div>
          {isHR && (
            <div className="flex items-center gap-2">
              <select value={period} onChange={(e) => { setPeriod(Number(e.target.value)); loadDashboard(Number(e.target.value)); }}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm" data-testid="period-select">
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last year</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => loadDashboard()} data-testid="refresh-btn">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>
          )}
        </div>

        {/* Feedback submission form — visible to everyone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5" /> Share Feedback</CardTitle>
            <CardDescription>Tell us how things are going. AI auto-detects sentiment — no one needs to read every message.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl" data-testid="feedback-form">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cat">Category</Label>
                  <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" data-testid="category-select">
                    {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Overall rating (optional)</Label>
                  <div className="flex gap-1 mt-2" role="radiogroup" data-testid="rating-group">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => setRating(rating === n ? 0 : n)}
                        className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors ${
                          rating >= n ? 'bg-amber-400 text-amber-950 border-amber-500' : 'border-border hover:bg-muted'
                        }`}
                        data-testid={`rating-${n}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="t">Your feedback</Label>
                <Textarea id="t" value={text} onChange={(e) => setText(e.target.value)}
                  rows={4} placeholder="What's on your mind?" data-testid="feedback-text" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)}
                  className="rounded" data-testid="anonymous-check" />
                Submit anonymously (your name won't be attached)
              </label>
              <Button type="submit" disabled={submitting} data-testid="submit-feedback">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Submit Feedback
              </Button>
            </form>

            {lastResult && (
              <div className={`mt-6 p-4 rounded-lg border ${sentimentStyle(lastResult.sentiment).bg} ${sentimentStyle(lastResult.sentiment).border}`}
                data-testid="feedback-result">
                <div className="flex items-center gap-2 mb-2">
                  {React.createElement(sentimentStyle(lastResult.sentiment).icon, { className: `w-5 h-5 ${sentimentStyle(lastResult.sentiment).color}` })}
                  <span className={`font-semibold capitalize ${sentimentStyle(lastResult.sentiment).color}`}>{lastResult.sentiment}</span>
                  <span className="text-sm text-muted-foreground ml-2">Score: {lastResult.score?.toFixed(2)}</span>
                </div>
                <p className="text-sm">{lastResult.summary}</p>
                {lastResult.key_themes?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {lastResult.key_themes.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* HR dashboard */}
        {isHR && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : dashboard ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Feedbacks" value={dashboard.total_feedbacks} icon={MessageCircle} />
                  <StatCard
                    label="Avg Sentiment"
                    value={dashboard.average_score?.toFixed(2)}
                    sub={dashboard.average_score > 0 ? 'Trending positive' : dashboard.average_score < 0 ? 'Needs attention' : 'Neutral'}
                    icon={dashboard.average_score >= 0 ? TrendingUp : TrendingDown}
                    color={dashboard.average_score > 0.2 ? 'text-emerald-600' : dashboard.average_score < -0.2 ? 'text-red-600' : 'text-amber-600'}
                  />
                  <StatCard label="Action Needed" value={dashboard.action_needed_count}
                    sub="High-priority items"
                    icon={AlertTriangle}
                    color={dashboard.action_needed_count > 0 ? 'text-red-600' : 'text-emerald-600'} />
                  <StatCard label="Categories" value={Object.keys(dashboard.category_distribution || {}).length}
                    sub="Coverage areas" icon={Tag} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Sentiment Breakdown</CardTitle>
                    <CardDescription>Last {dashboard.period_days} days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SentimentBar counts={dashboard.sentiment_distribution || {}} total={dashboard.total_feedbacks} />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Themes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(dashboard.top_themes || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No themes detected yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {dashboard.top_themes.map(t => (
                            <div key={t.label} className="flex items-center justify-between">
                              <span className="text-sm capitalize">{t.label}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${(t.count / dashboard.top_themes[0].count) * 100}%` }} />
                                </div>
                                <span className="text-xs font-mono text-muted-foreground w-6 text-right">{t.count}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Emotions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(dashboard.top_emotions || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {dashboard.top_emotions.map(t => (
                            <Badge key={t.label} variant="secondary" className="capitalize">
                              {t.label} · {t.count}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-5 h-5" /> Action Required
                    </CardTitle>
                    <CardDescription>AI flagged these as needing HR attention</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(dashboard.action_needed_items || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">🎉 Nothing flagged — team feels good!</p>
                    ) : (
                      <div className="space-y-3">
                        {dashboard.action_needed_items.map(item => {
                          const st = sentimentStyle(item.sentiment);
                          return (
                            <div key={item.feedback_id}
                              className={`p-3 rounded-lg border ${st.border} ${st.bg}`}
                              data-testid="action-item">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="capitalize">{item.category}</Badge>
                                <Badge className={`capitalize ${st.color} ${st.bg} ${st.border}`}>{item.sentiment}</Badge>
                              </div>
                              <p className="text-sm font-medium mb-1">"{item.text}"</p>
                              <p className="text-xs text-muted-foreground">{item.summary}</p>
                              {item.recommended_action && (
                                <p className="text-xs text-primary mt-2"><strong>→ Suggested action:</strong> {item.recommended_action}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Feedback</CardTitle>
                    <CardDescription>Latest 10 entries</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(dashboard.recent_feedbacks || []).map(f => {
                        const st = sentimentStyle(f.sentiment);
                        return (
                          <div key={f.feedback_id} className="p-3 rounded-lg border border-border" data-testid="recent-feedback">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize text-xs">{f.category}</Badge>
                                <Badge className={`capitalize text-xs ${st.color} ${st.bg} ${st.border}`}>{f.sentiment}</Badge>
                                {f.anonymous ? (
                                  <span className="text-xs text-muted-foreground">Anonymous</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">— {f.employee_name}</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{f.created_at?.slice(0, 10)}</span>
                            </div>
                            <p className="text-sm">{f.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet. Submit feedback or run the demo seeder.</p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
