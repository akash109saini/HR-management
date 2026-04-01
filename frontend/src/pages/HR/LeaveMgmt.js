import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { CheckCircle, XCircle } from 'lucide-react';

export default function LeaveMgmt() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchLeaves = async () => {
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const { data } = await api.get(`/leaves${params}`);
      setLeaves(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchLeaves(); }, [filter]);

  const handleAction = async (id, status) => {
    try {
      await api.put(`/leaves/${id}`, { status, reviewer_note: '' });
      fetchLeaves();
    } catch { /* ignore */ }
  };

  const statusBadge = (s) => {
    const map = { pending: 'secondary', approved: 'default', rejected: 'destructive' };
    return map[s] || 'secondary';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-leave-management-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Leave Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and manage leave applications</p>
        </div>

        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} data-testid={`filter-${f}-btn`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && leaves.filter(l => l.status === 'pending').length > 0 && (
                <span className="ml-1 text-xs">({leaves.filter(l => l.status === 'pending').length})</span>
              )}
            </Button>
          ))}
        </div>

        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : leaves.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
                  ) : leaves.map((l, i) => (
                    <TableRow key={l.id || i} data-testid={`leave-row-${i}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{l.user_name}</p>
                          <p className="text-xs text-muted-foreground">{l.user_id}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{l.leave_type}</Badge></TableCell>
                      <TableCell className="text-sm">{l.start_date}</TableCell>
                      <TableCell className="text-sm">{l.end_date}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{l.reason}</TableCell>
                      <TableCell><Badge variant={statusBadge(l.status)}>{l.status}</Badge></TableCell>
                      <TableCell>
                        {l.status === 'pending' ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => handleAction(l.id, 'approved')} className="text-emerald-600" data-testid={`approve-leave-${i}-btn`}>
                              <CheckCircle size={14} className="mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleAction(l.id, 'rejected')} className="text-destructive" data-testid={`reject-leave-${i}-btn`}>
                              <XCircle size={14} className="mr-1" />Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{l.reviewed_by}</span>
                        )}
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
