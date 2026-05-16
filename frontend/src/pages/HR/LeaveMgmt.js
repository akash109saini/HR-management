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
  const [dateFilter, setDateFilter] = useState('all');

  const fetchLeaves = async () => {
    try {
      const q = new URLSearchParams();
      if (filter !== 'all') q.set('status', filter);
      if (dateFilter !== 'all') q.set('date_filter', dateFilter);
      
      const { data } = await api.get(`/leaves?${q.toString()}`);
      setLeaves(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchLeaves(); }, [filter, dateFilter]);

  const handleAction = async (id, status) => {
    try {
      await api.put(`/leaves/${id}`, { status, reviewer_note: '' });
      fetchLeaves();
    } catch { /* ignore */ }
  };

  const handleRollover = async (id) => {
    try {
      await api.post(`/leaves/${id}/rollover`);
      fetchLeaves();
    } catch { /* ignore */ }
  };

  const statusBadge = (s) => {
    const map = { pending: 'secondary', approved: 'default', rejected: 'destructive', cancelled: 'outline' };
    return map[s] || 'secondary';
  };

  const isUpcoming = (dateStr) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = new Date(dateStr);
    return start >= today;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-leave-management-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Leave Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and manage leave applications</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-xs font-semibold uppercase text-muted-foreground mb-1">Status Filter</p>
            {['all', 'pending', 'approved', 'rejected', 'cancelled'].map(f => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} data-testid={`filter-${f}-btn`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-xs font-semibold uppercase text-muted-foreground mb-1">Date Applied</p>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7_days', label: 'Last 7 Days' },
              { id: '30_days', label: 'Last Month' }
            ].map(f => (
              <Button key={f.id} variant={dateFilter === f.id ? 'default' : 'outline'} size="sm" onClick={() => setDateFilter(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <Card className="border border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From/To</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                  ) : leaves.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests found</TableCell></TableRow>
                  ) : leaves.map((l, i) => (
                    <TableRow key={l.id || i} data-testid={`leave-row-${i}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{l.user_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{l.user_id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex flex-col items-start gap-0 h-auto py-1">
                          <span>{l.leave_type}</span>
                          {l.duration_type === 'half' && (
                            <span className="text-[9px] uppercase font-bold text-muted-foreground">Half Day ({l.half_day_slot?.replace('_', ' ')})</span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p>{l.start_date}</p>
                        <p className="text-muted-foreground">to {l.end_date}</p>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{l.reason}</TableCell>
                      <TableCell><Badge variant={statusBadge(l.status)}>{l.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {l.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => handleAction(l.id, 'approved')} className="text-emerald-600 h-8 px-2" data-testid={`approve-leave-${i}-btn`}>
                                <CheckCircle size={14} className="mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleAction(l.id, 'rejected')} className="text-destructive h-8 px-2" data-testid={`reject-leave-${i}-btn`}>
                                <XCircle size={14} className="mr-1" />Reject
                              </Button>
                            </>
                          )}
                          {l.status === 'approved' && isUpcoming(l.start_date) && (
                            <Button size="sm" variant="outline" onClick={() => handleRollover(l.id)} className="h-8 px-2 text-amber-600">
                              Rollover
                            </Button>
                          )}
                          {(l.status !== 'pending' && (!isUpcoming(l.start_date) || l.status !== 'approved')) && (
                             <span className="text-xs text-muted-foreground">{l.reviewed_by || '-'}</span>
                          )}
                        </div>
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
