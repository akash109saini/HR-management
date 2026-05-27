import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Fingerprint, MonitorSmartphone, Clock, LogIn, LogOut, Search, Wifi, WifiOff, ScanFace } from 'lucide-react';

const VERIFY_ICONS = {
  face: <ScanFace size={14} className="inline mr-1 text-violet-500" />,
  fingerprint: <Fingerprint size={14} className="inline mr-1 text-blue-500" />,
  card: <MonitorSmartphone size={14} className="inline mr-1 text-emerald-500" />,
};

function getVerifyIcon(mode) {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m.includes('face')) return VERIFY_ICONS.face;
  if (m.includes('finger') || m === '1') return VERIFY_ICONS.fingerprint;
  if (m.includes('card') || m === '3') return VERIFY_ICONS.card;
  return <Fingerprint size={14} className="inline mr-1 text-muted-foreground" />;
}

// Device sends punch time in LOCAL time (IST). It is stored as "YYYY-MM-DD HH:MM:SS".
// We extract the time part directly — no timezone conversion needed.
function parseDeviceTimestamp(ts) {
  if (!ts) return null;
  // Normalize: "2026-05-27 22:25:00" or "2026-05-27T22:25:00"
  const normalized = ts.replace('T', ' ').split('+')[0].split('Z')[0].trim();
  const [datePart, timePart] = normalized.split(' ');
  return { datePart, timePart };
}

function formatTime(ts) {
  if (!ts) return '—';
  const parsed = parseDeviceTimestamp(ts);
  if (!parsed?.timePart) return '—';
  // Convert HH:MM:SS to 12-hour format
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
    // Parse date only (no time, no timezone shift)
    const [y, m, d] = parsed.datePart.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d); // local midnight — no UTC shift
    return dateObj.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' });
  } catch { return parsed.datePart; }
}

// received_at is stored as ISO UTC string ("2026-05-27T17:05:06+00:00" or ".123Z")
// new Date() correctly converts UTC → local (IST)
function formatReceived(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
}

export default function MyPunchLog() {
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const fetchPunches = () => {
    api.get('/attendance/punches')
      .then(r => setPunches(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPunches();
    // Auto-refresh every 30 seconds so new device punches appear immediately
    const interval = setInterval(fetchPunches, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = punches.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.device_sn?.toLowerCase().includes(q) ||
      p.device_name?.toLowerCase().includes(q) ||
      p.timestamp?.toLowerCase().includes(q) ||
      p.verify_mode?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q);
    const matchDate = !dateFilter || (p.timestamp && p.timestamp.startsWith(dateFilter));
    return matchSearch && matchDate;
  });

  // Summary stats — use ALL punches (not filtered) for cards
  const totalIn = punches.filter(p => p.status === 'check_in').length;
  const totalOut = punches.filter(p => p.status === 'check_out').length;
  const matched = punches.filter(p => p.matched).length;
  const devices = [...new Set(punches.map(p => p.device_sn).filter(Boolean))];


  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="my-punch-log-page">

        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit'] flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-md">
              <Fingerprint size={20} className="text-white" />
            </span>
            My Punch Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-[52px]">
            All biometric punch records from your registered devices
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Punches', value: punches.length,
              icon: <Clock size={18} />,
              gradient: 'from-blue-500 to-indigo-600',
            },
            {
              label: 'Clock Ins', value: totalIn,
              icon: <LogIn size={18} />,
              gradient: 'from-emerald-500 to-teal-600',
            },
            {
              label: 'Clock Outs', value: totalOut,
              icon: <LogOut size={18} />,
              gradient: 'from-amber-500 to-orange-600',
            },
            {
              label: 'Matched', value: matched,
              icon: <Fingerprint size={18} />,
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
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Device badges */}
        {devices.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Active Devices:</span>
            {devices.map(sn => (
              <Badge key={sn} variant="outline" className="font-mono text-xs gap-1">
                <Wifi size={10} className="text-emerald-500" />
                {sn}
              </Badge>
            ))}
          </div>
        )}

        {/* Table */}
        <Card className="border border-border">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Punch History</CardTitle>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {filtered.length} of {punches.length}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="h-8 text-sm border border-input rounded-md px-3 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="relative w-full sm:w-52">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search punches..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-8 text-sm"
                  />
                </div>
                {dateFilter && (
                  <button
                    onClick={() => setDateFilter('')}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md"
                  >Clear date</button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Verify Mode</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Matched</TableHead>
                    <TableHead>Received At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Loading punch records…</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <WifiOff size={36} className="opacity-30" />
                          <p className="text-sm font-medium">No punch records found</p>
                          <p className="text-xs">Your biometric punches will appear here once the device syncs.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((p, i) => (
                    <TableRow key={p.punch_id || i} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-muted-foreground text-xs font-mono">{i + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{formatDate(p.timestamp)}</TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">{formatTime(p.timestamp)}</TableCell>
                      <TableCell>
                        {p.status === 'check_in' ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 gap-1 hover:bg-emerald-100">
                            <LogIn size={11} /> Clock In
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 gap-1 hover:bg-amber-100">
                            <LogOut size={11} /> Clock Out
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {getVerifyIcon(p.verify_mode)}
                        {p.verify_mode && p.verify_mode !== 'unknown' ? p.verify_mode : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-primary">{p.device_sn || '—'}</span>
                          {p.device_name && (
                            <span className="text-xs text-muted-foreground truncate max-w-[140px]">{p.device_name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.matched ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                            Unmatched
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {formatReceived(p.received_at)}
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
