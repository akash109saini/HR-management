import React, { useState, useEffect, useCallback } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AlertCircle, CalendarDays, ClipboardList, ChevronLeft, ChevronRight, Download } from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────────────── */
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const STATUS_CONFIG = {
  P:   { label: 'Present',  short: 'P',   bg: '#dcfce7', color: '#166534', border: '#bbf7d0', dot: '#16a34a' },
  AA:  { label: 'Absent',   short: 'AA',  bg: '#fee2e2', color: '#991b1b', border: '#fecaca', dot: '#dc2626' },
  AHD: { label: 'Half Day', short: 'HD',  bg: '#fef9c3', color: '#854d0e', border: '#fde68a', dot: '#d97706' },
  WO:  { label: 'Week Off', short: 'WO',  bg: '#f3f4f6', color: '#374151', border: '#d1d5db', dot: '#6b7280' },
  H:   { label: 'Holiday',  short: 'H',   bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
};

function getStatusConfig(s) {
  return STATUS_CONFIG[s] || { label: s || '-', short: s || '-', bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb', dot: '#9ca3af' };
}

/* ─── Export helpers ──────────────────────────────────────────────── */
function exportCSV(rows, month) {
  const headers = ['Date','Week Day','Shift Time','In Time','Out Time','Working Hours','Late By','Early By','Status'];
  const lines = [headers.join(','), ...rows.map(r => [
    r.display_date, r.weekday, r.shift_time,
    r.in_time, r.out_time, r.working_hour,
    r.late_by, r.early_by, getStatusConfig(r.status).label,
  ].map(v => `"${v || '-'}"`).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `My_Attendance_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Main Component ────────────────────────────────────────────────── */
export default function MyAttendance() {
  const now = new Date();

  /* Calendar state */
  const [calMonth,  setCalMonth]  = useState(now.getMonth() + 1);   // 1-12
  const [calYear,   setCalYear]   = useState(now.getFullYear());
  const [calData,   setCalData]   = useState(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError,  setCalError]  = useState('');

  /* Punch corrections state */
  const [corrections, setCorrections] = useState([]);
  const [corrLoading, setCorrLoading] = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setForm]               = useState({ date: '', correction_type: 'both', requested_time: '', reason: '' });
  const [details, setDetails]         = useState({ actual_in: '-', actual_out: '-', shift_start: '-', shift_end: '-', count: 0, approval_authority: [] });
  const [formError,   setFormError]   = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  /* ── Fetch calendar for selected month ────────────────────────────── */
  const fetchCalendar = useCallback(async (month, year) => {
    setCalLoading(true);
    setCalError('');
    try {
      const monthStr = `${year}-${String(month).padStart(2,'0')}`;
      const res = await api.get(`/attendance/calendar?month=${monthStr}`);
      setCalData(res.data);
    } catch (err) {
      setCalError(err.response?.data?.detail || 'Failed to load calendar');
    }
    setCalLoading(false);
  }, []);

  /* ── Fetch corrections ────────────────────────────────────────────── */
  const fetchCorrections = useCallback(async () => {
    try {
      const res = await api.get('/attendance/punch-corrections');
      setCorrections(res.data);
    } catch { /* ignore */ }
    setCorrLoading(false);
  }, []);

  /* Auto-load current month on mount */
  useEffect(() => {
    fetchCalendar(now.getMonth() + 1, now.getFullYear());
    fetchCorrections();
  }, []); // eslint-disable-line

  /* ── Navigate months ──────────────────────────────────────────────── */
  const goMonth = (delta) => {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }
    setCalMonth(m);
    setCalYear(y);
    fetchCalendar(m, y);
  };

  /* ── Submit punch correction ──────────────────────────────────────── */
  /* ── Submit punch correction ──────────────────────────────────────── */
  const handleDateChange = async (dateVal) => {
    setForm(prev => ({ ...prev, date: dateVal }));
    if (!dateVal) {
      setDetails({ actual_in: '-', actual_out: '-', shift_start: '-', shift_end: '-', count: 0, approval_authority: [] });
      return;
    }
    try {
      const res = await api.get(`/attendance/correction-details?date=${dateVal}`);
      setDetails({
        actual_in: res.data.actual_in || '-',
        actual_out: res.data.actual_out || '-',
        shift_start: res.data.shift_start || '-',
        shift_end: res.data.shift_end || '-',
        count: res.data.count || 0,
        approval_authority: res.data.approval_authority || []
      });
      setForm(prev => ({
        ...prev,
        date: dateVal,
        correction_type: 'both',
        requested_time: res.data.shift_start || '09:00'
      }));
    } catch (err) {
      console.error(err);
      setDetails({ actual_in: '-', actual_out: '-', shift_start: '-', shift_end: '-', count: 0, approval_authority: [] });
    }
  };

  // Auto-detect requested_time based on correction_type and which punch is missing
  useEffect(() => {
    if (form.correction_type === 'missed_punch') {
      if (details.actual_in === '-' || !details.actual_in) {
        setForm(prev => ({ ...prev, requested_time: details.shift_start || '09:00' }));
      } else if (details.actual_out === '-' || !details.actual_out) {
        setForm(prev => ({ ...prev, requested_time: details.shift_end || '18:00' }));
      } else {
        setForm(prev => ({ ...prev, requested_time: details.shift_start || '09:00' }));
      }
    } else {
      setForm(prev => ({ ...prev, requested_time: details.shift_start || '09:00' }));
    }
  }, [form.correction_type, details.actual_in, details.actual_out, details.shift_start, details.shift_end]);

  const handleSubmitCorrection = async () => {
    setFormError('');
    setFormSuccess('');
    try {
      await api.post('/attendance/punch-correction', form);
      setFormSuccess('Punch correction submitted successfully!');
      setForm({ date: '', correction_type: 'both', requested_time: '', reason: '' });
      setDetails({ actual_in: '-', actual_out: '-', shift_start: '-', shift_end: '-', count: 0, approval_authority: [] });
      fetchCorrections();
    } catch (err) { setFormError(formatApiError(err.response?.data?.detail)); }
  };

  /* ── Summary counts ───────────────────────────────────────────────── */
  const summary = calData?.rows?.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const pendingCorrections = corrections.filter(c => c.status === 'pending').length;

  const yearOptions = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-attendance-page">

        {/* ── Page Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My Attendance</h1>
            <p className="text-sm text-muted-foreground mt-1">View your monthly attendance calendar and submit punch corrections</p>
          </div>
          <Dialog open={showCreate} onOpenChange={(open) => { 
            setShowCreate(open); 
            if (!open) { 
              setFormError(''); 
              setFormSuccess(''); 
              setForm({ date: '', correction_type: 'both', requested_time: '', reason: '' });
              setDetails({ actual_in: '-', actual_out: '-', shift_start: '-', shift_end: '-', count: 0, approval_authority: [] });
            } 
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="submit-correction-btn" className="gap-2">
                <AlertCircle size={16} /> Punch Correction
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-background border border-border rounded-lg shadow-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold font-['Outfit'] border-b pb-2 text-primary">
                  PUNCH CORRECTION
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm mt-2">
                {/* Notices */}
                <div className="space-y-1">
                  <p className="text-destructive font-semibold">Note:-For Missed Punch (submit camera/punch proof to HR)</p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Note : Approval Authority : 1 ) {details.approval_authority?.[0] || 'Admin'} . 2)({details.approval_authority?.[1] || ''})
                  </p>
                </div>

                {formError && (
                  <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20 font-medium">
                    {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="p-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-md border border-emerald-200 dark:border-emerald-900/30 font-medium">
                    {formSuccess}
                  </div>
                )}

                {/* Form Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Punch Type - Span 3 columns */}
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs text-muted-foreground font-semibold">Punch Type</Label>
                    <Select 
                      value={form.correction_type} 
                      onValueChange={v => setForm({ ...form, correction_type: v })}
                    >
                      <SelectTrigger data-testid="correction-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Punch Correction</SelectItem>
                        <SelectItem value="missed_punch">Missed Punch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date of Punch */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-semibold">Date of Punch</Label>
                    <Input 
                      type="date" 
                      value={form.date} 
                      onChange={e => handleDateChange(e.target.value)} 
                      data-testid="correction-date-input" 
                    />
                  </div>

                  {/* Actual Time (From) */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-semibold">Actual Time(From)</Label>
                    <Input 
                      type="text" 
                      value={details.actual_in} 
                      disabled 
                      className="bg-muted font-mono" 
                    />
                  </div>

                  {/* To Time */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-semibold">To Time</Label>
                    <Input 
                      type="text" 
                      value={details.actual_out} 
                      disabled 
                      className="bg-muted font-mono" 
                    />
                  </div>

                  {/* Allowed Time(Correct) */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-semibold">Allowed Time(Correct)</Label>
                    <Input 
                      type="text" 
                      value={details.shift_start} 
                      disabled 
                      className="bg-muted font-mono" 
                    />
                  </div>

                  {/* To Time */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-semibold">To Time</Label>
                    <Input 
                      type="text" 
                      value={details.shift_end} 
                      disabled 
                      className="bg-muted font-mono" 
                    />
                  </div>

                  {/* Count */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-semibold">Count</Label>
                    <Input 
                      type="text" 
                      value={details.count} 
                      disabled 
                      className="bg-muted font-mono" 
                    />
                  </div>

                  {/* Remarks/Reason - Span 3 columns */}
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs text-muted-foreground font-semibold">Remarks / Reason</Label>
                    <Textarea 
                      value={form.reason} 
                      onChange={e => setForm({...form, reason: e.target.value})} 
                      placeholder="Enter reason for punch correction..." 
                      rows={3} 
                      data-testid="correction-reason-input" 
                      className="resize-none"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end pt-2">
                  <Button 
                    onClick={handleSubmitCorrection} 
                    data-testid="submit-correction-form-btn"
                    className="px-6 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Send For Approval
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="calendar">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="calendar" className="gap-1.5" data-testid="tab-calendar">
              <CalendarDays size={14} /> Attendance Calendar
            </TabsTrigger>
            <TabsTrigger value="corrections" className="gap-1.5" data-testid="tab-corrections">
              <ClipboardList size={14} /> My Corrections
              {pendingCorrections > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">{pendingCorrections}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ══════════ CALENDAR TAB ══════════ */}
          <TabsContent value="calendar" className="mt-4 space-y-4">

            {/* ── Filter Bar ── */}
            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3">

                  {/* Prev month */}
                  <button
                    onClick={() => goMonth(-1)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #d1d5db', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Previous Month"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {/* Month selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Month</span>
                    <select
                      value={calMonth}
                      onChange={e => { const m = Number(e.target.value); setCalMonth(m); fetchCalendar(m, calYear); }}
                      id="att-cal-month"
                      style={selectSt}
                    >
                      {MONTH_NAMES.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
                    </select>
                  </div>

                  {/* Year selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Year</span>
                    <select
                      value={calYear}
                      onChange={e => { const y = Number(e.target.value); setCalYear(y); fetchCalendar(calMonth, y); }}
                      id="att-cal-year"
                      style={selectSt}
                    >
                      {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>

                  {/* Next month */}
                  <button
                    onClick={() => goMonth(1)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #d1d5db', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Next Month"
                  >
                    <ChevronRight size={16} />
                  </button>

                  {/* Current month shortcut */}
                  <button
                    onClick={() => { setCalMonth(now.getMonth()+1); setCalYear(now.getFullYear()); fetchCalendar(now.getMonth()+1, now.getFullYear()); }}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1.5px solid #d1d5db', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
                  >
                    Today's Month
                  </button>

                  {/* Export */}
                  {calData && (
                    <button
                      onClick={() => exportCSV(calData.rows, calData.month)}
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
                      id="att-export-btn"
                    >
                      <Download size={14} /> Export CSV
                    </button>
                  )}
                </div>

                {/* Month title */}
                {calData && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>
                      {MONTH_NAMES[calMonth - 1]} {calYear}
                    </span>
                    {calData.shift_time && (
                      <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                        🕐 Shift: {calData.shift_time}
                      </span>
                    )}
                    {/* Summary chips */}
                    {summary && Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                      const count = summary[key] || 0;
                      if (!count) return null;
                      return (
                        <span key={key} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 600 }}>
                          {cfg.label}: {count}
                        </span>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Error ── */}
            {calError && (
              <div style={{ padding: '10px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 14 }}>
                ⚠ {calError}
              </div>
            )}

            {/* ── Loading spinner ── */}
            {calLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <div className="animate-spin w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full" />
              </div>
            )}

            {/* ── Calendar Table ── */}
            {!calLoading && calData && (
              <>
                {/* Status Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 6, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                      {cfg.short} – {cfg.label}
                    </span>
                  ))}
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 2px 10px rgba(0,0,0,.07)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                    <thead>
                      <tr>
                        {['Date','Week Day','Shift Time','In Time','Out Time','Working Hours','Late By','Early By','Status'].map(h => (
                          <th key={h} style={thSt}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {calData.rows.map((row) => {
                        const cfg     = getStatusConfig(row.status);
                        const isToday = row.is_today;
                        return (
                          <tr
                            key={row.date}
                            style={{
                              background: cfg.bg,
                              borderBottom: '1px solid rgba(0,0,0,.045)',
                              outline: isToday ? '2px solid #3b82f6' : 'none',
                              outlineOffset: isToday ? '-2px' : undefined,
                            }}
                            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.93)'}
                            onMouseLeave={e => e.currentTarget.style.filter = ''}
                          >
                            <td style={{ ...tdSt, fontWeight: isToday ? 700 : 600, color: cfg.color }}>
                              {row.display_date}
                              {isToday && (
                                <span style={{ marginLeft: 6, fontSize: 10, background: '#3b82f6', color: '#fff', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}>
                                  Today
                                </span>
                              )}
                            </td>
                            <td style={{ ...tdSt, color: cfg.color }}>{row.weekday}</td>
                            <td style={{ ...tdSt, color: cfg.color, fontFamily: 'monospace' }}>{row.shift_time}</td>
                            <td style={{ ...tdSt, color: cfg.color, fontFamily: 'monospace' }}>{row.in_time}</td>
                            <td style={{ ...tdSt, color: cfg.color, fontFamily: 'monospace' }}>{row.out_time}</td>
                            <td style={{ ...tdSt, color: cfg.color, fontFamily: 'monospace' }}>{row.working_hour}</td>
                            <td style={{ ...tdSt, fontWeight: row.late_by !== '-' ? 700 : 400, color: row.late_by !== '-' ? '#b91c1c' : cfg.color }}>
                              {row.late_by}
                            </td>
                            <td style={{ ...tdSt, fontWeight: row.early_by !== '-' ? 700 : 400, color: row.early_by !== '-' ? '#c2410c' : cfg.color }}>
                              {row.early_by}
                            </td>
                            <td style={{ ...tdSt, textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', padding: '3px 12px', borderRadius: 99,
                                fontWeight: 700, fontSize: 12,
                                background: 'rgba(0,0,0,.09)', color: cfg.color, letterSpacing: .4,
                              }}>
                                {cfg.short}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Empty state */}
            {!calLoading && !calData && !calError && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 20px', color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: 12 }}>
                <CalendarDays size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p style={{ fontWeight: 600, fontSize: 15 }}>Loading your calendar…</p>
              </div>
            )}
          </TabsContent>

          {/* ══════════ CORRECTIONS TAB ══════════ */}
          <TabsContent value="corrections" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Requested Time</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reviewed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {corrLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8">
                          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                        </TableCell></TableRow>
                      ) : corrections.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No corrections submitted yet</TableCell></TableRow>
                      ) : corrections.map((c, i) => (
                        <TableRow key={c.id || i}>
                          <TableCell className="font-medium">{c.date}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {c.correction_type === 'both' ? 'Punch Correction' : (c.correction_type === 'missed_punch' ? 'Missed Punch' : c.correction_type)}
                            </Badge>
                          </TableCell>
                          <TableCell>{c.requested_time}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">{c.reason}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === 'approved' ? 'default' : c.status === 'rejected' ? 'destructive' : 'secondary'}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.reviewed_by || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/* ─── Inline styles ───────────────────────────────────────────────── */
const selectSt = {
  padding: '6px 10px', borderRadius: 7, fontSize: 13,
  border: '1.5px solid #d1d5db',
  background: 'var(--background, #fff)',
  color: 'var(--foreground)',
  outline: 'none', cursor: 'pointer',
};

const thSt = {
  padding: '11px 14px', textAlign: 'left', fontWeight: 700,
  fontSize: 12.5, whiteSpace: 'nowrap',
  background: '#ea580c',
  color: '#fff',
  borderBottom: '2px solid #c2410c',
  borderRight: '1px solid rgba(255,255,255,.15)',
};

const tdSt = {
  padding: '9px 14px', whiteSpace: 'nowrap', fontSize: 13.5,
};
