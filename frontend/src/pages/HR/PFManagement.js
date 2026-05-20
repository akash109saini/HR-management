import React, { useEffect, useState } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Save, RefreshCw, FileDown, Calculator } from 'lucide-react';

const INR = (v) => `\u20b9${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function PFManagement() {
  const [settings, setSettings] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [statutory, setStatutory] = useState(null);
  const [preview, setPreview] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [s, e] = await Promise.all([api.get('/pf/settings'), api.get('/employees')]);
      setSettings(s.data);
      setEmployees(e.data || []);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.put('/pf/settings', settings);
      setSuccess('PF & ESI settings saved.');
      await load();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
    setSaving(false);
  };
  const reset = async () => {
    try {
      const { data } = await api.post('/pf/settings/reset');
      setSettings(data); setSuccess('Reset to statutory defaults.');
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const loadStatutory = async (empId) => {
    setSelectedEmp(empId); setStatutory(null); setPreview(null);
    if (!empId) return;
    try {
      const [{ data: s }, { data: p }] = await Promise.all([
        api.get(`/pf/employees/${empId}/statutory`),
        api.get(`/pf/compute/${empId}`),
      ]);
      setStatutory(s); setPreview(p);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const saveStatutory = async () => {
    setError(''); setSuccess('');
    try {
      await api.put(`/pf/employees/${selectedEmp}/statutory`, statutory);
      setSuccess('Employee statutory info saved.');
      await loadStatutory(selectedEmp);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const downloadChallan = async () => {
    try {
      const res = await api.get('/pf/reports/challan', { params: { month: reportMonth }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `pf_challan_${reportMonth}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const downloadFormReport = async (form) => {
    setError('');
    try {
      const res = await api.get(`/pf/reports/${form}`, { params: { month: reportMonth }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `epfo_${form}_${reportMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // err.response.data is a Blob on failure — try to extract message
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try { setError(formatApiError(JSON.parse(text).detail)); }
        catch { setError(text || 'Failed to download report'); }
      } else {
        setError(formatApiError(err.response?.data?.detail));
      }
    }
  };

  if (!settings) return <DashboardLayout><div className="p-8">Loading\u2026</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-pf-mgmt-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">PF & ESI Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Provident Fund, EPS, EDLI and ESI configuration & reports</p>
          </div>
          <Button variant="outline" onClick={load} data-testid="pf-reload-btn"><RefreshCw size={14} className="mr-1" />Reload</Button>
        </div>

        {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
        {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">{success}</div>}

        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings" data-testid="tab-pf-settings">Settings</TabsTrigger>
            <TabsTrigger value="employees" data-testid="tab-pf-employees">Employee Statutory Info</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-pf-reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Provident Fund (EPF + EPS + EDLI)</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                <div><Label>Employee PF %</Label><Input type="number" step="0.01" value={settings.pf_employee_rate} onChange={(e) => setSettings({ ...settings, pf_employee_rate: Number(e.target.value) })} data-testid="pf-emp-rate-input" /></div>
                <div><Label>Employer total %</Label><Input type="number" step="0.01" value={settings.pf_employer_rate} onChange={(e) => setSettings({ ...settings, pf_employer_rate: Number(e.target.value) })} /></div>
                <div><Label>Employer EPS %</Label><Input type="number" step="0.01" value={settings.pf_employer_eps_rate} onChange={(e) => setSettings({ ...settings, pf_employer_eps_rate: Number(e.target.value) })} /></div>
                <div><Label>PF wage ceiling (\u20b9)</Label><Input type="number" value={settings.pf_wage_ceiling} onChange={(e) => setSettings({ ...settings, pf_wage_ceiling: Number(e.target.value) })} data-testid="pf-ceiling-input" /></div>
                <div><Label>EPS wage ceiling (\u20b9)</Label><Input type="number" value={settings.eps_wage_ceiling} onChange={(e) => setSettings({ ...settings, eps_wage_ceiling: Number(e.target.value) })} /></div>
                <div className="flex items-center gap-2 pt-6"><Switch checked={!!settings.pf_apply_ceiling} onCheckedChange={(v) => setSettings({ ...settings, pf_apply_ceiling: v })} data-testid="pf-apply-ceiling-switch" /><Label>Apply wage ceiling</Label></div>
                <div><Label>EDLI rate %</Label><Input type="number" step="0.01" value={settings.edli_rate} onChange={(e) => setSettings({ ...settings, edli_rate: Number(e.target.value) })} /></div>
                <div><Label>PF Admin charges %</Label><Input type="number" step="0.01" value={settings.admin_charges_rate} onChange={(e) => setSettings({ ...settings, admin_charges_rate: Number(e.target.value) })} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Employee State Insurance (ESI)</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 pt-6"><Switch checked={!!settings.esi_enabled} onCheckedChange={(v) => setSettings({ ...settings, esi_enabled: v })} data-testid="esi-enabled-switch" /><Label>ESI enabled</Label></div>
                <div><Label>Employee ESI %</Label><Input type="number" step="0.01" value={settings.esi_employee_rate} onChange={(e) => setSettings({ ...settings, esi_employee_rate: Number(e.target.value) })} /></div>
                <div><Label>Employer ESI %</Label><Input type="number" step="0.01" value={settings.esi_employer_rate} onChange={(e) => setSettings({ ...settings, esi_employer_rate: Number(e.target.value) })} /></div>
                <div><Label>ESI gross wage limit (\u20b9)</Label><Input type="number" value={settings.esi_wage_limit} onChange={(e) => setSettings({ ...settings, esi_wage_limit: Number(e.target.value) })} data-testid="esi-limit-input" /></div>
              </CardContent>
            </Card>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} data-testid="reset-pf-btn">Reset to defaults</Button>
              <Button onClick={save} disabled={saving} data-testid="save-pf-btn"><Save size={14} className="mr-1" /> {saving ? 'Saving\u2026' : 'Save settings'}</Button>
            </div>
          </TabsContent>

          <TabsContent value="employees" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Per-employee statutory info</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-md">
                  <Label>Select employee</Label>
                  <Select value={selectedEmp} onValueChange={loadStatutory}>
                    <SelectTrigger data-testid="emp-select-pf"><SelectValue placeholder="Choose an employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {statutory && (
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div><Label>PAN</Label><Input value={statutory.pan || ''} onChange={(e) => setStatutory({ ...statutory, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" data-testid="pan-input" /></div>
                    <div><Label>Aadhaar (last 4)</Label><Input value={statutory.aadhaar_last4 || ''} onChange={(e) => setStatutory({ ...statutory, aadhaar_last4: e.target.value })} maxLength={4} /></div>
                    <div><Label>UAN</Label><Input value={statutory.uan || ''} onChange={(e) => setStatutory({ ...statutory, uan: e.target.value })} data-testid="uan-input" /></div>
                    <div><Label>PF account no.</Label><Input value={statutory.pf_account_no || ''} onChange={(e) => setStatutory({ ...statutory, pf_account_no: e.target.value })} /></div>
                    <div><Label>PF join date</Label><Input type="date" value={(statutory.pf_join_date || '').slice(0, 10)} onChange={(e) => setStatutory({ ...statutory, pf_join_date: e.target.value })} /></div>
                    <div className="flex items-center gap-2 pt-6"><Switch checked={!!statutory.pf_opt_in} onCheckedChange={(v) => setStatutory({ ...statutory, pf_opt_in: v })} data-testid="pf-opt-in-switch" /><Label>PF opt-in</Label></div>
                    <div><Label>ESI number</Label><Input value={statutory.esi_number || ''} onChange={(e) => setStatutory({ ...statutory, esi_number: e.target.value })} /></div>
                    <div className="flex items-center gap-2 pt-6"><Switch checked={!!statutory.esi_opt_in} onCheckedChange={(v) => setStatutory({ ...statutory, esi_opt_in: v })} /><Label>ESI opt-in</Label></div>
                    <div className="flex items-center gap-2 pt-6"><Switch checked={!!statutory.nps_opt_in} onCheckedChange={(v) => setStatutory({ ...statutory, nps_opt_in: v })} data-testid="nps-opt-in-switch" /><Label>NPS 80CCD(2) opt-in</Label></div>
                    <div className="flex items-end"><Button onClick={saveStatutory} className="w-full" data-testid="save-statutory-btn"><Save size={14} className="mr-1" /> Save</Button></div>
                  </div>
                )}

                {preview && (
                  <Card className="bg-muted/40">
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calculator size={14} /> Live PF/ESI preview (monthly)</CardTitle></CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-3 text-sm" data-testid="pf-preview">
                      <div className="space-y-1">
                        <div className="flex justify-between"><span>Monthly gross</span><b>{INR(preview.monthly_gross)}</b></div>
                        <div className="flex justify-between"><span>Monthly basic</span><b>{INR(preview.monthly_basic)}</b></div>
                        <div className="flex justify-between"><span>PF wage</span><b>{INR(preview.pf?.pf_wage)}</b></div>
                        <div className="flex justify-between"><span>Employee PF</span><b className="text-destructive">{INR(preview.pf?.employee_pf)}</b></div>
                        <div className="flex justify-between"><span>Employer EPF</span><b>{INR(preview.pf?.employer_epf)}</b></div>
                        <div className="flex justify-between"><span>Employer EPS</span><b>{INR(preview.pf?.employer_eps)}</b></div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between"><span>EDLI</span><b>{INR(preview.pf?.edli)}</b></div>
                        <div className="flex justify-between"><span>Admin charges</span><b>{INR(preview.pf?.admin_charges)}</b></div>
                        <div className="flex justify-between border-t pt-1"><span>ESI applicable</span><Badge variant={preview.esi?.applicable ? 'default' : 'outline'}>{preview.esi?.applicable ? 'Yes' : 'No'}</Badge></div>
                        <div className="flex justify-between"><span>Employee ESI</span><b className="text-destructive">{INR(preview.esi?.employee_esi)}</b></div>
                        <div className="flex justify-between"><span>Employer ESI</span><b>{INR(preview.esi?.employer_esi)}</b></div>
                        <div className="flex justify-between border-t pt-1"><span>Employer NPS 80CCD(2)</span><b>{INR(preview.nps?.employer_nps)}</b></div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader><CardTitle className="text-base">PF / ESI Challan</CardTitle></CardHeader>
              <CardContent className="flex items-end gap-3">
                <div>
                  <Label>Month (YYYY-MM)</Label>
                  <Input value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} placeholder="2026-05" data-testid="challan-month-input" />
                </div>
                <Button onClick={downloadChallan} data-testid="download-challan-btn"><FileDown size={14} className="mr-1" /> Download CSV</Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">EPFO Statutory Returns</CardTitle>
                <p className="text-xs text-muted-foreground">Form 5 lists employees who <b>joined</b> PF this month. Form 10 lists those who <b>left</b>.</p>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <Label>Month (YYYY-MM)</Label>
                  <Input value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} placeholder="2026-05" data-testid="form5-10-month-input" />
                </div>
                <Button variant="outline" onClick={() => downloadFormReport('form5')} data-testid="download-form5-btn">
                  <FileDown size={14} className="mr-1" /> Form 5 (Joiners)
                </Button>
                <Button variant="outline" onClick={() => downloadFormReport('form10')} data-testid="download-form10-btn">
                  <FileDown size={14} className="mr-1" /> Form 10 (Leavers)
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
