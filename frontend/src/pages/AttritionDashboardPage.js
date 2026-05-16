import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  TrendingDown, AlertTriangle, Loader2, RefreshCw, Users, Brain, Zap, Shield,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AttritionDashboardPage() {
  const [employees, setEmployees] = useState([]);
  const [risks, setRisks] = useState({}); // {employee_id: {risk_score, risk_level, ...}}
  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data || []);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadEmployees(); }, []);

  const analyze = async (emp) => {
    if (!emp.employee_id) return;
    setAnalyzingId(emp.employee_id);
    try {
      const { data } = await api.get(`/ai/attrition-risk/${emp.employee_id}`);
      setRisks(prev => ({ ...prev, [emp.employee_id]: data }));
    } catch (e) {
      toast.error(`${emp.name}: ${formatApiError(e)}`);
    } finally { setAnalyzingId(null); }
  };

  const analyzeAll = async () => {
    for (const emp of employees) {
      if (risks[emp.employee_id]) continue;
      await analyze(emp);
    }
    toast.success('Analysis complete');
  };

  const riskStyle = (level) => {
    const map = {
      low: { color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
      medium: { color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
      high: { color: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
      critical: { color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    };
    return map[level?.toLowerCase()] || map.low;
  };

  const analyzed = Object.values(risks);
  const avg = analyzed.length ? analyzed.reduce((s, r) => s + (r.risk_score || 0), 0) / analyzed.length : 0;
  const high = analyzed.filter(r => ['high', 'critical'].includes((r.risk_level || '').toLowerCase())).length;
  const sorted = [...employees].sort((a, b) => (risks[b.employee_id]?.risk_score || 0) - (risks[a.employee_id]?.risk_score || 0));

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="attrition-dashboard">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-6 h-6 text-purple-600" />
              <h1 className="text-2xl font-bold tracking-tight">Predictive Attrition</h1>
              <Badge variant="outline">AI-powered</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              AI scores each employee's flight risk based on engagement signals and recommends retention actions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadEmployees} data-testid="refresh-btn">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Button size="sm" onClick={analyzeAll} disabled={!!analyzingId} data-testid="analyze-all-btn">
              <Brain className="w-4 h-4 mr-2" /> Analyze All
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Employees</p>
                <p className="text-3xl font-bold" data-testid="stat-employees">{employees.length}</p>
              </div>
              <Users className="w-8 h-8 opacity-20" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Analyzed</p>
                <p className="text-3xl font-bold" data-testid="stat-analyzed">{analyzed.length}</p>
              </div>
              <Brain className="w-8 h-8 opacity-20" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Avg Risk</p>
                <p className={`text-3xl font-bold ${avg > 70 ? 'text-red-600' : avg > 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {avg.toFixed(0)}
                </p>
              </div>
              <Zap className="w-8 h-8 opacity-20" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">High Risk</p>
                <p className={`text-3xl font-bold ${high > 0 ? 'text-red-600' : 'text-emerald-600'}`} data-testid="stat-high">
                  {high}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 opacity-20" />
            </CardContent>
          </Card>
        </div>

        {/* Risk Table */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Risk Scores</CardTitle>
            <CardDescription>Click "Analyze" for individual scoring or "Analyze All" for a bulk sweep.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            ) : employees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No employees yet.</p>
            ) : (
              <div className="space-y-2">
                {sorted.map(emp => {
                  const risk = risks[emp.employee_id];
                  const st = risk ? riskStyle(risk.risk_level) : null;
                  return (
                    <div key={emp.employee_id} className={`p-3 rounded-lg border ${st?.border || 'border-border'} ${st?.bg || ''}`}
                      data-testid={`risk-row-${emp.employee_id}`}>
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{emp.name}</span>
                            <Badge variant="secondary" className="text-xs">{emp.employee_id}</Badge>
                            <span className="text-xs text-muted-foreground">{emp.department} · {emp.position}</span>
                            {risk && (
                              <Badge className={`text-xs capitalize ${st.color} ${st.bg} ${st.border}`}>
                                {risk.risk_level} risk
                              </Badge>
                            )}
                          </div>
                          {risk?.recommended_actions?.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              <span className="font-medium">Suggested actions:</span> {risk.recommended_actions.slice(0, 2).join(' · ')}
                            </div>
                          )}
                          {risk?.key_factors?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {risk.key_factors.slice(0, 4).map((f, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {risk && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Score</p>
                              <p className={`text-2xl font-bold ${st.color}`}>{risk.risk_score}</p>
                            </div>
                          )}
                          <Button size="sm" variant="outline" onClick={() => analyze(emp)}
                            disabled={analyzingId === emp.employee_id} data-testid="analyze-btn">
                            {analyzingId === emp.employee_id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
                            {risk ? 'Re-analyze' : 'Analyze'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
