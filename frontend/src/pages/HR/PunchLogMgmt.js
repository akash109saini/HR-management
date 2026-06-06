import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Fingerprint, LogIn, LogOut, Clock, Search, Wifi, WifiOff,
  Smartphone, RefreshCw, FileDown, UserCheck, UserX, ScanFace, MonitorSmartphone, CalendarDays
} from 'lucide-react';

const VERIFY_ICONS = {
  face: <ScanFace size={14} className="inline mr-1.5 text-violet-500" />,
  fingerprint: <Fingerprint size={14} className="inline mr-1.5 text-blue-500" />,
  card: <MonitorSmartphone size={14} className="inline mr-1.5 text-emerald-500" />,
};

function getVerifyIcon(mode) {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m.includes('face')) return VERIFY_ICONS.face;
  if (m.includes('finger') || m === '1') return VERIFY_ICONS.fingerprint;
  if (m.includes('card') || m === '3') return VERIFY_ICONS.card;
  return <Fingerprint size={14} className="inline mr-1.5 text-muted-foreground" />;
}

// Device sends punch time in LOCAL time (IST). It is stored as "YYYY-MM-DD HH:MM:SS".
// We extract the date and time parts directly.
function parseDeviceTimestamp(ts) {
  if (!ts) return null;
  const normalized = ts.replace('T', ' ').split('+')[0].split('Z')[0].trim();
  const [datePart, timePart] = normalized.split(' ');
  return { datePart, timePart };
}

function formatTime(ts) {
  if (!ts) return '—';
  const parsed = parseDeviceTimestamp(ts);
  if (!parsed?.timePart) return '—';
  const [hStr, mStr, sStr] = parsed.timePart.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr}:${sStr || '00'} ${ampm}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  const parsed = parseDeviceTimestamp(ts);
  if (!parsed?.datePart) return '—';
  try {
    const [y, m, d] = parsed.datePart.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' });
  } catch { return parsed.datePart; }
}

function formatReceived(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
}

export default function PunchLogMgmt() {
  const [punches, setPunches] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const fetchPunches = useCallback(async () => {
    try {
      // Fetch device list for device filter dropdown
      const devRes = await api.get('/biometric/devices');
      setDevices(devRes.data || []);

      // Build API query parameters
      let queryStr = `?limit=2000`;
      if (deviceFilter && deviceFilter !== 'all') {
        queryStr += `&device_sn=${deviceFilter}`;
      }
      if (directionFilter && directionFilter !== 'all') {
        queryStr += `&status=${directionFilter}`;
      }
      if (sourceFilter && sourceFilter !== 'all') {
        queryStr += `&source=${sourceFilter}`;
      }
      if (dateFilter) {
        queryStr += `&date=${dateFilter}`;
      }
      if (search.trim()) {
        queryStr += `&search=${encodeURIComponent(search.trim())}`;
      }

      const punchRes = await api.get(`/biometric/punches${queryStr}`);
      setPunches(punchRes.data || []);
    } catch (err) {
      console.error('Failed to load punches', err);
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, deviceFilter, directionFilter, sourceFilter]);

  useEffect(() => {
    fetchPunches();
    // Auto-refresh every 15 seconds to display live punches automatically
    const interval = setInterval(fetchPunches, 15000);
    return () => clearInterval(interval);
  }, [fetchPunches]);

  const handleClearFilters = () => {
    setSearch('');
    setDateFilter('');
    setDeviceFilter('all');
    setDirectionFilter('all');
    setSourceFilter('all');
  };

  // Stats calculation
  const totalPunches = punches.length;
  const totalIn = punches.filter(p => p.status === 'check_in').length;
  const totalOut = punches.filter(p => p.status === 'check_out').length;
  const matchedPunches = punches.filter(p => p.matched).length;
  const matchedPercent = totalPunches > 0 ? Math.round((matchedPunches / totalPunches) * 100) : 0;

  // Export to CSV
  const handleExport = () => {
    const headers = ['Time', 'Employee Name', 'Employee Code', 'Biometric ID', 'Direction', 'Verify Mode', 'Device SN', 'Device Name', 'Source', 'Matched Status'];
    const csvRows = [
      headers.join(','),
      ...punches.map(p => [
        p.timestamp,
        p.employee_name || '—',
        p.employee_id || '—',
        p.user_pin || '—',
        p.status || '—',
        p.verify_mode || '—',
        p.device_sn || '—',
        p.device_name || '—',
        p.source || '—',
        p.matched ? 'Matched' : 'Unmatched'
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Biometric_Punches_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="punch-log-mgmt-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit'] flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                <Fingerprint size={20} className="text-white" />
              </span>
              Employee Punch Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-1 ml-[52px]">
              Monitor and search real-time biometric raw punches across all connected devices and simulator logs.
            </p>
          </div>
          <div className="flex gap-2 self-start sm:self-center">
            <Button variant="outline" size="sm" onClick={fetchPunches} className="gap-1.5 h-9" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button variant="default" size="sm" onClick={handleExport} className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={punches.length === 0}>
              <FileDown size={14} />
              Export Excel
            </Button>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Punches',
              value: totalPunches,
              subtext: 'Filtered records',
              icon: <Clock size={18} />,
              gradient: 'from-blue-500 to-indigo-600',
            },
            {
              label: 'Check Ins',
              value: totalIn,
              subtext: 'Incoming swipes',
              icon: <LogIn size={18} />,
              gradient: 'from-emerald-500 to-teal-600',
            },
            {
              label: 'Check Outs',
              value: totalOut,
              subtext: 'Outgoing swipes',
              icon: <LogOut size={18} />,
              gradient: 'from-amber-500 to-orange-600',
            },
            {
              label: 'Match Rate',
              value: `${matchedPercent}%`,
              subtext: `${matchedPunches} of ${totalPunches} matched`,
              icon: <UserCheck size={18} />,
              gradient: 'from-violet-500 to-purple-600',
            },
          ].map(c => (
            <Card key={c.label} className="border border-border overflow-hidden">
              <div className={`h-1 w-full bg-gradient-to-r ${c.gradient}`} />
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center text-white shadow`}>
                  {c.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold font-['Outfit']">{c.value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">{c.subtext}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Panel */}
        <Card className="border border-border">
          <CardHeader className="pb-3 border-b border-border bg-muted/20">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays size={16} className="text-indigo-500" />
              Filter & Search Panels
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Employee Search */}
              <div className="space-y-1.5 col-span-1 sm:col-span-2 md:col-span-1 lg:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search Employee</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Name, ID or Biometric ID..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Date Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date Selector</label>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Device SN Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Device</label>
                <Select value={deviceFilter} onValueChange={setDeviceFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Devices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Devices</SelectItem>
                    {devices.map(d => (
                      <SelectItem key={d.device_id} value={d.serial_number}>
                        {d.name || d.serial_number} ({d.serial_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status/Direction Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direction</label>
                <Select value={directionFilter} onValueChange={setDirectionFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Swipes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Directions</SelectItem>
                    <SelectItem value="check_in">🟢 Check In</SelectItem>
                    <SelectItem value="check_out">🔴 Check Out</SelectItem>
                    <SelectItem value="break_out">🟠 Break Out</SelectItem>
                    <SelectItem value="break_in">🔵 Break In</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Source Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</label>
                <div className="flex gap-2">
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="device_push">Device Webhook</SelectItem>
                      <SelectItem value="realtime_push">NestJS ADMS Push</SelectItem>
                      <SelectItem value="simulator">Simulator</SelectItem>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                    </SelectContent>
                  </Select>

                  {(search || dateFilter || deviceFilter !== 'all' || directionFilter !== 'all' || sourceFilter !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs h-9 text-muted-foreground hover:text-foreground">
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="border border-border">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Punches Records Log</CardTitle>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Showing {punches.length} record(s)
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Employee Details</TableHead>
                    <TableHead>Biometric ID</TableHead>
                    <TableHead>Punch Time</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Verify Mode</TableHead>
                    <TableHead>Device Info</TableHead>
                    <TableHead>Sync Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Received At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Loading punch logs...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : punches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-20">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <WifiOff size={40} className="opacity-30" />
                          <p className="text-sm font-medium">No biometric punch logs found</p>
                          <p className="text-xs max-w-sm">No logs match the selected search criteria or date filter. Try widening your filters.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : punches.map((p, i) => {
                    const punchMs = p.timestamp ? new Date(p.timestamp.replace(' ', 'T') + 'Z').getTime() : 0;
                    const receivedMs = p.received_at ? new Date(p.received_at).getTime() : 0;
                    const showReceived = receivedMs >= punchMs;

                    return (
                      <TableRow key={p.punch_id || i} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-muted-foreground text-xs font-mono">{i + 1}</TableCell>
                        <TableCell>
                          {p.employee_name ? (
                            <div>
                              <p className="font-semibold text-sm text-foreground">{p.employee_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{p.employee_id || '—'}</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span className="text-xs text-amber-600 font-semibold italic">Unmapped PIN</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.user_pin || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{formatDate(p.timestamp)}</span>
                            <span className="font-mono text-xs tabular-nums text-primary font-semibold">{formatTime(p.timestamp)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {p.status === 'check_in' ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 gap-1 hover:bg-emerald-100/80">
                              <LogIn size={11} /> Clock In
                            </Badge>
                          ) : p.status === 'check_out' ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 gap-1 hover:bg-amber-100/80">
                              <LogOut size={11} /> Clock Out
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="capitalize">
                              {p.status?.replace('_', ' ') || 'Swipe'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm capitalize whitespace-nowrap">
                          {getVerifyIcon(p.verify_mode)}
                          {p.verify_mode && p.verify_mode !== 'unknown' ? p.verify_mode : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col max-w-[150px]">
                            <span className="text-xs font-semibold truncate">{p.device_name || '—'}</span>
                            <span className="font-mono text-[10px] text-muted-foreground truncate">{p.device_sn || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {p.matched ? (
                            <Badge className="text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/15 gap-1 shadow-sm">
                              <UserCheck size={12} /> Matched
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 gap-1">
                              <UserX size={12} /> Unmatched
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="capitalize text-xs text-muted-foreground">
                          {p.source === 'device_push' ? 'ADMS Webhook' : p.source?.replace('_', ' ') || 'device'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {showReceived ? formatReceived(p.received_at) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
