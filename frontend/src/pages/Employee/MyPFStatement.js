import React, { useEffect, useState } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

const INR = (v) => `\u20b9${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function MyPFStatement() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/pf/statement/me')
      .then((r) => setData(r.data))
      .catch((err) => setError(formatApiError(err.response?.data?.detail)));
  }, []);

  if (error) return <DashboardLayout><div className="p-8 text-destructive">{error}</div></DashboardLayout>;
  if (!data) return <DashboardLayout><div className="p-8">Loading\u2026</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-pf-statement-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My PF Statement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            UAN: <Badge variant="outline">{data.uan || 'Not set'}</Badge>&nbsp;
            PF A/C: <Badge variant="outline">{data.pf_account_no || 'Not set'}</Badge>
          </p>
        </div>

        <div className="grid sm:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Employee PF</p><p className="text-xl font-bold mt-1">{INR(data.totals?.employee_pf)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Employer EPF</p><p className="text-xl font-bold mt-1">{INR(data.totals?.employer_epf)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Employer EPS</p><p className="text-xl font-bold mt-1">{INR(data.totals?.employer_eps)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Grand total</p><p className="text-xl font-bold mt-1 text-emerald-600">{INR(data.totals?.grand_total)}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Month-wise contributions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>PF Wage</TableHead>
                  <TableHead>Employee PF</TableHead>
                  <TableHead>Employer EPF</TableHead>
                  <TableHead>Employer EPS</TableHead>
                  <TableHead>Running (Employee)</TableHead>
                  <TableHead>Running (Employer)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows || []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No payslips yet</TableCell></TableRow>
                ) : data.rows.map((r) => (
                  <TableRow key={r.period} data-testid={`pf-row-${r.period}`}>
                    <TableCell>{r.period}</TableCell>
                    <TableCell>{INR(r.pf_wage)}</TableCell>
                    <TableCell className="text-destructive">{INR(r.employee_pf)}</TableCell>
                    <TableCell>{INR(r.employer_epf)}</TableCell>
                    <TableCell>{INR(r.employer_eps)}</TableCell>
                    <TableCell><b>{INR(r.running_employee_total)}</b></TableCell>
                    <TableCell><b>{INR(r.running_employer_total)}</b></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
