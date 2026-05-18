import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Download, FileText } from 'lucide-react';

export default function MyPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/payroll').then(r => { setPayslips(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

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

  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-payslips-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My Payslips</h1>
          <p className="text-sm text-muted-foreground mt-1">View and download your payslips</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : payslips.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <FileText size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No payslips available yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {payslips.map((p, i) => (
              <Card key={p.id} className="border border-border hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200" data-testid={`payslip-card-${i}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                        <FileText size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{months[p.month]} {p.year}</h3>
                        <p className="text-xs text-muted-foreground">{p.department} | {p.position}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Gross</p>
                        <p className="font-medium">{p.currency_symbol || '\u20b9'}{Number(p.gross_salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Deductions</p>
                        <p className="font-medium text-destructive">-{p.currency_symbol || '\u20b9'}{Number(p.total_deductions || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Net</p>
                        <p className="font-bold text-emerald-600 text-lg">{p.currency_symbol || '\u20b9'}{Number(p.net_salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                      </div>
                      <Button variant="outline" onClick={() => downloadPdf(p.id)} data-testid={`download-payslip-${i}-btn`}>
                        <Download size={14} className="mr-2" />PDF
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-4 text-xs text-muted-foreground border-t border-border pt-3">
                    <div>Basic: <span className="text-foreground">{p.currency_symbol || '\u20b9'}{Number(p.basic_salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                    <div>HRA: <span className="text-foreground">{p.currency_symbol || '\u20b9'}{Number(p.hra || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                    <div>PF: <span className="text-foreground">-{p.currency_symbol || '\u20b9'}{Number(p.pf_deduction || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                    {p.advance_deduction > 0 && <div>Advance: <span className="text-destructive">-{p.currency_symbol || '\u20b9'}{Number(p.advance_deduction || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>}
                    <div>Days: <span className="text-foreground">{p.days_worked}/{p.days_worked + p.days_absent}</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
