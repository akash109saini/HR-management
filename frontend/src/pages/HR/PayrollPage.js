import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { DollarSign, FileText, Download, FileDown } from 'lucide-react';

export default function PayrollPage() {
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [pRes, eRes] = await Promise.all([
        api.get('/payroll'),
        api.get('/employees')
      ]);
      setPayslips(pRes.data);
      setEmployees(eRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerate = async () => {
    setError('');
    setSuccess('');
    setGenerating(true);
    try {
      if (selectedEmp) {
        await api.post('/payroll/generate', { employee_id: selectedEmp, month, year });
        setSuccess('Payslip generated successfully!');
      } else {
        const { data } = await api.post('/payroll/generate-bulk', { month, year });
        setSuccess(`Generated ${data.generated} payslips!`);
      }
      fetchData();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
    setGenerating(false);
  };

  const downloadPdf = async (id) => {
    try {
      const response = await api.get(`/payroll/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `payslip_${id}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const exportCSV = async () => {
    try {
      const response = await api.get('/export/payroll', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'payroll_export.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-payroll-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Payroll Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Generate payslips and manage compensation</p>
          </div>
          <Button variant="outline" onClick={exportCSV} data-testid="export-payroll-csv-btn">
            <FileDown size={16} className="mr-2" />Export CSV
          </Button>
        </div>

        {/* Generate Controls */}
        <Card className="border border-border">
          <CardHeader><CardTitle className="text-lg font-['Outfit']">Generate Payslips</CardTitle></CardHeader>
          <CardContent>
            {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md mb-4">{error}</div>}
            {success && <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-md mb-4">{success}</div>}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 flex-1">
                <Label>Employee (leave empty for bulk)</Label>
                <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                  <SelectTrigger data-testid="payroll-emp-select"><SelectValue placeholder="All Employees" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All Employees</SelectItem>
                    {employees.map(e => (
                      <SelectItem key={e.employee_id} value={e.employee_id}>{e.name} ({e.employee_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                  <SelectTrigger className="w-32" data-testid="payroll-month-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-24" data-testid="payroll-year-input" />
              </div>
              <Button onClick={handleGenerate} disabled={generating} data-testid="generate-payslips-btn">
                <FileText size={16} className="mr-2" />
                {generating ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payslips Table */}
        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : payslips.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payslips generated yet</TableCell></TableRow>
                  ) : payslips.map((p, i) => (
                    <TableRow key={p.id || i} data-testid={`payslip-row-${i}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{p.employee_id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{months[p.month - 1]} {p.year}</TableCell>
                      <TableCell className="text-sm font-medium">{p.currency_symbol || '\u20b9'}{Number(p.gross_salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm text-destructive">-{p.currency_symbol || '\u20b9'}{Number(p.total_deductions || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-600">{p.currency_symbol || '\u20b9'}{Number(p.net_salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm">{p.days_worked}/{p.days_worked + p.days_absent}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(p.id)} data-testid={`download-payslip-${i}-btn`}>
                          <Download size={14} className="mr-1" />PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
