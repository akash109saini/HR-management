import React, { useEffect, useState } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Save, Send, Calculator } from 'lucide-react';

const INR = (v) => `\u20b9${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const FIELDS_OLD = [
  ['section_80c', 'Section 80C (PF, ELSS, PPF, LIC etc.)'],
  ['section_80d_self', 'Section 80D \u2014 Self & family medical insurance'],
  ['section_80d_parents', 'Section 80D \u2014 Parents medical insurance'],
  ['section_80ccd_1b', 'Section 80CCD(1B) \u2014 NPS additional'],
  ['section_80e', 'Section 80E \u2014 Education loan interest'],
  ['section_80g', 'Section 80G \u2014 Donations'],
  ['section_24_home_loan', 'Section 24 \u2014 Home loan interest'],
  ['hra_rent_paid', 'Annual rent paid (for HRA exemption)'],
  ['lta_claimed', 'LTA claimed'],
  ['other_exemptions', 'Other exemptions'],
];

export default function MyTaxDeclaration() {
  const [decl, setDecl] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [{ data: d }, { data: c }] = await Promise.all([
        api.get('/tax/declarations/me'),
        api.get('/tax/compare/me'),
      ]);
      setDecl(d);
      setComparison(c);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const updateField = (key, value) => {
    const v = value === '' ? 0 : Number(value);
    setDecl({ ...decl, declarations: { ...(decl?.declarations || {}), [key]: v } });
  };

  const save = async (newStatus) => {
    if (newStatus === 'submitted') setSubmitting(true); else setSaving(true);
    setError(''); setSuccess('');
    try {
      await api.put('/tax/declarations/me', {
        financial_year: decl.financial_year,
        regime: decl.regime,
        declarations: decl.declarations || {},
        status: newStatus,
      });
      setSuccess(newStatus === 'submitted' ? 'Submitted for HR approval.' : 'Saved as draft.');
      await load();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
    setSaving(false); setSubmitting(false);
  };

  if (!decl) return <DashboardLayout><div className="p-8">Loading\u2026</div></DashboardLayout>;

  const d = decl.declarations || {};
  const isLocked = decl.status === 'approved';

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-tax-declaration-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My Tax Declaration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            FY {decl.financial_year} \u2014 status:&nbsp;
            <Badge variant={isLocked ? 'default' : decl.status === 'submitted' ? 'secondary' : 'outline'}>{decl.status}</Badge>
          </p>
        </div>

        {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
        {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">{success}</div>}

        <Tabs defaultValue="declaration">
          <TabsList>
            <TabsTrigger value="declaration" data-testid="tab-declare">Declaration</TabsTrigger>
            <TabsTrigger value="compare" data-testid="tab-compare">Old vs New regime</TabsTrigger>
          </TabsList>

          <TabsContent value="declaration" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Regime</CardTitle></CardHeader>
              <CardContent className="max-w-md">
                <Label>Choose your tax regime</Label>
                <Select value={decl.regime} onValueChange={(v) => setDecl({ ...decl, regime: v })} disabled={true}>
                  <SelectTrigger data-testid="my-regime-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New regime (lower slabs, fewer exemptions)</SelectItem>
                    <SelectItem value="old">Old regime (deductions like 80C, 80D, HRA)</SelectItem>
                  </SelectContent>
                </Select>
                {decl.regime === 'new' && (
                  <p className="text-xs text-muted-foreground mt-2">New regime: most exemptions and deductions (80C, 80D, HRA etc.) are NOT allowed. Standard deduction \u20b975,000 applies automatically.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Investments & exemptions (annual \u20b9)</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                {FIELDS_OLD.map(([key, label]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input
                      type="number"
                      value={d[key] ?? 0}
                      onChange={(e) => updateField(key, e.target.value)}
                      disabled={true}
                      data-testid={`field-${key}`}
                    />
                  </div>
                ))}
                <div>
                  <Label>HRA city type</Label>
                  <Select value={d.hra_city || 'non-metro'} onValueChange={(v) => updateField('hra_city', v)} disabled={true}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metro">Metro (Delhi, Mumbai, Kolkata, Chennai)</SelectItem>
                      <SelectItem value="non-metro">Non-metro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="compare">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator size={14} /> Live regime comparison</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!comparison ? <p className="text-sm text-muted-foreground">Loading\u2026</p> : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[['new_regime', 'New regime'], ['old_regime', 'Old regime']].map(([k, label]) => {
                      const r = comparison[k];
                      const winner = comparison.cheaper_regime === k.replace('_regime', '');
                      return (
                        <Card key={k} className={winner ? 'border-emerald-500 border-2' : ''} data-testid={`compare-${k}`}>
                          <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm">{label}</CardTitle>
                            {winner && <Badge>Cheaper</Badge>}
                          </CardHeader>
                          <CardContent className="space-y-1 text-sm">
                            <div className="flex justify-between"><span>Gross annual</span><b>{INR(r.gross_annual)}</b></div>
                            <div className="flex justify-between"><span>Std deduction</span><b>-{INR(r.standard_deduction)}</b></div>
                            <div className="flex justify-between"><span>Exemptions</span><b>-{INR(r.total_exemptions)}</b></div>
                            <div className="flex justify-between"><span>Chapter VI-A</span><b>-{INR(r.total_chapter_via)}</b></div>
                            <div className="flex justify-between border-t pt-1"><span>Taxable income</span><b>{INR(r.taxable_income)}</b></div>
                            <div className="flex justify-between"><span>Slab tax</span><b>{INR(r.slab_tax)}</b></div>
                            <div className="flex justify-between"><span>Rebate 87A</span><b>-{INR(r.rebate_87a)}</b></div>
                            <div className="flex justify-between"><span>Cess</span><b>{INR(r.cess)}</b></div>
                            <div className="flex justify-between text-base border-t pt-1"><span>Annual tax</span><b className="text-destructive">{INR(r.total_tax_annual)}</b></div>
                            <div className="flex justify-between"><span>Monthly TDS</span><b className="text-destructive">{INR(r.monthly_tds)}</b></div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
