import React, { useEffect, useState, useRef } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Save, RefreshCw, Plus, Trash2, FileDown, CheckCircle2, XCircle, Calculator, Upload, FileText, Archive } from 'lucide-react';

const INR = (v) => `\u20b9${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function SlabEditor({ title, slabs, onChange }) {
  const update = (i, field, value) => {
    const copy = slabs.map((s) => ({ ...s }));
    copy[i][field] = field === 'rate' || field === 'from' || field === 'to'
      ? (value === '' ? null : Number(value))
      : value;
    onChange(copy);
  };
  const addRow = () => onChange([...slabs, { from: 0, to: null, rate: 0 }]);
  const removeRow = (i) => onChange(slabs.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{title}</Label>
        <Button size="sm" variant="outline" onClick={addRow} data-testid={`add-slab-${title}-btn`}>
          <Plus size={14} className="mr-1" /> Add slab
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>From (\u20b9)</TableHead>
            <TableHead>To (\u20b9, empty = no upper)</TableHead>
            <TableHead>Rate %</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slabs.map((s, i) => (
            <TableRow key={i}>
              <TableCell><Input type="number" value={s.from ?? 0} onChange={(e) => update(i, 'from', e.target.value)} /></TableCell>
              <TableCell><Input type="number" value={s.to ?? ''} placeholder="No upper limit" onChange={(e) => update(i, 'to', e.target.value)} /></TableCell>
              <TableCell><Input type="number" step="0.01" value={s.rate ?? 0} onChange={(e) => update(i, 'rate', e.target.value)} /></TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => removeRow(i)} data-testid={`del-slab-${title}-${i}-btn`}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TaxManagement() {
  const [settings, setSettings] = useState(null);
  const [fy, setFy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [declarations, setDeclarations] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [computePreview, setComputePreview] = useState(null);
  const [computeForm, setComputeForm] = useState({ gross_annual: 1200000, regime: 'new' });
  const [form16EmpId, setForm16EmpId] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef(null);
  const pendingFileRef = useRef(null);

  const load = async () => {
    setError('');
    try {
      const { data } = await api.get('/tax/settings', { params: fy ? { financial_year: fy } : {} });
      setSettings(data);
      if (!fy) setFy(data.financial_year);
      const { data: decls } = await api.get('/tax/declarations', { params: fy ? { financial_year: fy } : {} });
      setDeclarations(decls || []);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.put('/tax/settings', { ...settings, financial_year: fy });
      setSuccess('Tax settings saved.');
      await load();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const reset = async () => {
    setError(''); setSuccess('');
    try {
      const { data } = await api.post('/tax/settings/reset', null, { params: { financial_year: fy } });
      setSettings(data);
      setSuccess('Reset to FY 2025-26 statutory defaults.');
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const decide = async (id, action) => {
    try {
      await api.post(`/tax/declarations/${id}/decision`, { action });
      await load();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  const downloadTDS = async () => {
    try {
      const res = await api.get('/tax/reports/tds-summary', { params: { financial_year: fy }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `tds_summary_${fy}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const _downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const _readBlobError = async (err) => {
    if (err.response?.data instanceof Blob) {
      const text = await err.response.data.text();
      try { return formatApiError(JSON.parse(text).detail); }
      catch { return text || 'Failed to download'; }
    }
    return formatApiError(err.response?.data?.detail);
  };

  const downloadForm16Single = async () => {
    setError(''); setSuccess('');
    if (!form16EmpId) {
      setError('Please choose an employee from the declarations list first.');
      return;
    }
    try {
      const res = await api.get(`/tax/reports/form16/${form16EmpId}`, { params: { financial_year: fy }, responseType: 'blob' });
      _downloadBlob(new Blob([res.data], { type: 'application/pdf' }), `form16_${form16EmpId}_${fy}.pdf`);
    } catch (err) {
      setError(await _readBlobError(err));
    }
  };

  const downloadForm16Bulk = async () => {
    setError(''); setSuccess('');
    try {
      const res = await api.get('/tax/reports/form16-bulk', { params: { financial_year: fy }, responseType: 'blob' });
      _downloadBlob(new Blob([res.data], { type: 'application/zip' }), `form16_bulk_${fy}.zip`);
    } catch (err) {
      setError(await _readBlobError(err));
    }
  };

  const downloadImportTemplate = async () => {
    try {
      const res = await api.get('/tax/declarations/bulk-import/template', { responseType: 'blob' });
      _downloadBlob(new Blob([res.data]), 'declarations_template.csv');
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const onPreviewFileSelected = async (file) => {
    setError(''); setSuccess(''); setImportPreview(null);
    if (!file) return;
    pendingFileRef.current = file;
    const fd = new FormData(); fd.append('file', file);
    try {
      const { data } = await api.post('/tax/declarations/bulk-import/preview', fd, {
        params: { financial_year: fy },
      });
      setImportPreview(data);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const commitImport = async () => {
    if (!pendingFileRef.current) { setError('Select a CSV first.'); return; }
    if (!importPreview?.valid) { setError('Fix all validation errors first.'); return; }
    setImporting(true); setError(''); setSuccess('');
    try {
      const fd = new FormData(); fd.append('file', pendingFileRef.current);
      const { data } = await api.post('/tax/declarations/bulk-import/commit', fd, {
        params: { financial_year: fy },
      });
      setSuccess(`Import committed: ${data.inserted} inserted, ${data.updated} updated (of ${data.total_rows} rows).`);
      setImportPreview(null);
      pendingFileRef.current = null;
      if (importFileRef.current) importFileRef.current.value = '';
      await load();
    } catch (err) {
      const d = err.response?.data?.detail;
      if (d && typeof d === 'object' && d.rejected) {
        setImportPreview({ ...importPreview, rejected: d.rejected, valid: false });
        setError(d.message || 'Import rejected.');
      } else {
        setError(formatApiError(d));
      }
    }
    setImporting(false);
  };

  const runCompute = async () => {
    try {
      const { data } = await api.post('/tax/compute', computeForm);
      setComputePreview(data);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const filteredDecls = declarations.filter((d) => filterStatus === 'all' || d.status === filterStatus);

  if (!settings) return <DashboardLayout><div className="p-8">Loading\u2026</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-tax-mgmt-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Tax Management</h1>
            <p className="text-sm text-muted-foreground mt-1">India Income Tax (FY {fy}) \u2014 slabs, regimes, declarations & TDS reports</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">FY</Label>
            <Input className="w-28" value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2025-26" data-testid="tax-fy-input" />
            <Button variant="outline" onClick={load} data-testid="tax-reload-btn"><RefreshCw size={14} className="mr-1" />Reload</Button>
          </div>
        </div>

        {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
        {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">{success}</div>}

        <Tabs defaultValue="settings" className="w-full">
          <TabsList>
            <TabsTrigger value="settings" data-testid="tab-tax-settings">Settings</TabsTrigger>
            <TabsTrigger value="declarations" data-testid="tab-tax-declarations">Employee Declarations</TabsTrigger>
            <TabsTrigger value="compute" data-testid="tab-tax-compute">Tax Calculator</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-tax-reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">General</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Default regime</Label>
                  <Select value={settings.default_regime} onValueChange={(v) => setSettings({ ...settings, default_regime: v })}>
                    <SelectTrigger data-testid="default-regime-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New regime</SelectItem>
                      <SelectItem value="old">Old regime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Standard deduction (New)</Label><Input type="number" value={settings.standard_deduction_new ?? 75000} onChange={(e) => setSettings({ ...settings, standard_deduction_new: Number(e.target.value) })} data-testid="std-ded-new-input" /></div>
                <div><Label>Standard deduction (Old)</Label><Input type="number" value={settings.standard_deduction_old ?? 50000} onChange={(e) => setSettings({ ...settings, standard_deduction_old: Number(e.target.value) })} data-testid="std-ded-old-input" /></div>
                <div><Label>Cess %</Label><Input type="number" step="0.01" value={settings.cess_rate ?? 4} onChange={(e) => setSettings({ ...settings, cess_rate: Number(e.target.value) })} data-testid="cess-input" /></div>
                <div><Label>87A rebate limit (New)</Label><Input type="number" value={settings.rebate_87a_limit_new ?? 1200000} onChange={(e) => setSettings({ ...settings, rebate_87a_limit_new: Number(e.target.value) })} /></div>
                <div><Label>87A max rebate (New)</Label><Input type="number" value={settings.rebate_87a_max_new ?? 60000} onChange={(e) => setSettings({ ...settings, rebate_87a_max_new: Number(e.target.value) })} /></div>
                <div><Label>87A rebate limit (Old)</Label><Input type="number" value={settings.rebate_87a_limit_old ?? 500000} onChange={(e) => setSettings({ ...settings, rebate_87a_limit_old: Number(e.target.value) })} /></div>
                <div><Label>87A max rebate (Old)</Label><Input type="number" value={settings.rebate_87a_max_old ?? 12500} onChange={(e) => setSettings({ ...settings, rebate_87a_max_old: Number(e.target.value) })} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Slab structure</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <SlabEditor title="new" slabs={settings.new_regime_slabs || []} onChange={(s) => setSettings({ ...settings, new_regime_slabs: s })} />
                <SlabEditor title="old" slabs={settings.old_regime_slabs || []} onChange={(s) => setSettings({ ...settings, old_regime_slabs: s })} />
                <SlabEditor title="surcharge" slabs={settings.surcharge_slabs || []} onChange={(s) => setSettings({ ...settings, surcharge_slabs: s })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Chapter VI-A limits (Old regime)</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                <div><Label>80C max</Label><Input type="number" value={settings.max_80c ?? 150000} onChange={(e) => setSettings({ ...settings, max_80c: Number(e.target.value) })} /></div>
                <div><Label>80D self max</Label><Input type="number" value={settings.max_80d_self ?? 25000} onChange={(e) => setSettings({ ...settings, max_80d_self: Number(e.target.value) })} /></div>
                <div><Label>80D parents max</Label><Input type="number" value={settings.max_80d_parents ?? 50000} onChange={(e) => setSettings({ ...settings, max_80d_parents: Number(e.target.value) })} /></div>
                <div><Label>80CCD(1B) NPS max</Label><Input type="number" value={settings.max_80ccd_1b ?? 50000} onChange={(e) => setSettings({ ...settings, max_80ccd_1b: Number(e.target.value) })} /></div>
                <div><Label>Section 24 home loan max</Label><Input type="number" value={settings.max_24_home_loan ?? 200000} onChange={(e) => setSettings({ ...settings, max_24_home_loan: Number(e.target.value) })} /></div>
              </CardContent>
            </Card>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} data-testid="reset-tax-settings-btn">Reset to defaults</Button>
              <Button onClick={save} disabled={saving} data-testid="save-tax-settings-btn"><Save size={14} className="mr-1" /> {saving ? 'Saving\u2026' : 'Save settings'}</Button>
            </div>
          </TabsContent>

          <TabsContent value="declarations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Employee Declarations \u2014 FY {fy}</CardTitle>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-44" data-testid="decl-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Regime</TableHead>
                      <TableHead>80C</TableHead>
                      <TableHead>80D</TableHead>
                      <TableHead>HRA Rent</TableHead>
                      <TableHead>Home Loan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDecls.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No declarations</TableCell></TableRow>
                    ) : filteredDecls.map((d) => (
                      <TableRow key={d.id} data-testid={`decl-row-${d.employee_id}`}>
                        <TableCell>{d.employee_id}</TableCell>
                        <TableCell><Badge>{d.regime?.toUpperCase()}</Badge></TableCell>
                        <TableCell>{INR(d.declarations?.section_80c)}</TableCell>
                        <TableCell>{INR((d.declarations?.section_80d_self || 0) + (d.declarations?.section_80d_parents || 0))}</TableCell>
                        <TableCell>{INR(d.declarations?.hra_rent_paid)}</TableCell>
                        <TableCell>{INR(d.declarations?.section_24_home_loan)}</TableCell>
                        <TableCell><Badge variant={d.status === 'approved' ? 'default' : d.status === 'submitted' ? 'secondary' : 'outline'}>{d.status}</Badge></TableCell>
                        <TableCell>
                          {d.status === 'submitted' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="default" onClick={() => decide(d.id, 'approve')} data-testid={`approve-${d.employee_id}-btn`}><CheckCircle2 size={14} className="mr-1" /> Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => decide(d.id, 'reject')} data-testid={`reject-${d.employee_id}-btn`}><XCircle size={14} className="mr-1" /> Reject</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compute">
            <Card>
              <CardHeader><CardTitle className="text-base">Quick tax calculator</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div><Label>Gross annual (\u20b9)</Label><Input type="number" value={computeForm.gross_annual} onChange={(e) => setComputeForm({ ...computeForm, gross_annual: Number(e.target.value) })} data-testid="compute-gross-input" /></div>
                  <div>
                    <Label>Regime</Label>
                    <Select value={computeForm.regime} onValueChange={(v) => setComputeForm({ ...computeForm, regime: v })}>
                      <SelectTrigger data-testid="compute-regime-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="old">Old</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end"><Button onClick={runCompute} className="w-full" data-testid="run-compute-btn"><Calculator size={14} className="mr-1" /> Compute</Button></div>
                </div>
                {computePreview && (
                  <div className="grid sm:grid-cols-2 gap-4 mt-2" data-testid="compute-preview">
                    <Card><CardContent className="p-4 space-y-1 text-sm">
                      <div className="flex justify-between"><span>Gross annual</span><b>{INR(computePreview.gross_annual)}</b></div>
                      <div className="flex justify-between"><span>Std deduction</span><b>-{INR(computePreview.standard_deduction)}</b></div>
                      <div className="flex justify-between"><span>Exemptions</span><b>-{INR(computePreview.total_exemptions)}</b></div>
                      <div className="flex justify-between"><span>Chapter VI-A</span><b>-{INR(computePreview.total_chapter_via)}</b></div>
                      <div className="flex justify-between border-t pt-1"><span>Taxable income</span><b>{INR(computePreview.taxable_income)}</b></div>
                    </CardContent></Card>
                    <Card><CardContent className="p-4 space-y-1 text-sm">
                      <div className="flex justify-between"><span>Slab tax</span><b>{INR(computePreview.slab_tax)}</b></div>
                      <div className="flex justify-between"><span>87A rebate</span><b>-{INR(computePreview.rebate_87a)}</b></div>
                      <div className="flex justify-between"><span>Surcharge</span><b>{INR(computePreview.surcharge)}</b></div>
                      <div className="flex justify-between"><span>Cess</span><b>{INR(computePreview.cess)}</b></div>
                      <div className="flex justify-between border-t pt-1 text-base"><span>Annual tax</span><b className="text-destructive">{INR(computePreview.total_tax_annual)}</b></div>
                      <div className="flex justify-between text-base"><span>Monthly TDS</span><b className="text-destructive">{INR(computePreview.monthly_tds)}</b></div>
                    </CardContent></Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader><CardTitle className="text-base">Statutory reports</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <p className="font-medium">Annual TDS Summary (Form 16 style)</p>
                    <p className="text-xs text-muted-foreground">CSV of every employee's annual TDS for FY {fy}</p>
                  </div>
                  <Button onClick={downloadTDS} data-testid="download-tds-summary-btn"><FileDown size={14} className="mr-1" /> Download CSV</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
