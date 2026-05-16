import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Fingerprint, Plus, RefreshCw, Loader2, Settings, ArrowDownToLine,
  Activity, Cpu, CheckCircle2, AlertCircle, Trash2, Wand2, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

export default function BiometricDevicesPage() {
  const [tab, setTab] = useState('devices'); // devices | punches | simulate | guide
  const [devices, setDevices] = useState([]);
  const [punches, setPunches] = useState([]);
  const [stats, setStats] = useState(null);
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);

  // Add device form
  const [showAdd, setShowAdd] = useState(false);
  const [newSn, setNewSn] = useState('');
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [adding, setAdding] = useState(false);

  // Simulate form
  const [simPin, setSimPin] = useState('EMP-ACME-002');
  const [simSn, setSimSn] = useState('');
  const [simStatus, setSimStatus] = useState(0);
  const [simVerify, setSimVerify] = useState(1);
  const [simulating, setSimulating] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [d, p, s, g] = await Promise.all([
        api.get('/biometric/devices'),
        api.get('/biometric/punches?limit=100'),
        api.get('/biometric/status'),
        api.get('/biometric/setup-guide').catch(() => ({ data: null })),
      ]);
      setDevices(d.data || []);
      setPunches(p.data || []);
      setStats(s.data);
      setGuide(g.data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 10000); // auto-refresh every 10s
    return () => clearInterval(t);
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newSn.trim() || !newName.trim()) { toast.error('SN & Name required'); return; }
    setAdding(true);
    try {
      await api.post('/biometric/devices', { serial_number: newSn.trim(), name: newName.trim(), location: newLocation.trim() });
      toast.success('Device registered');
      setNewSn(''); setNewName(''); setNewLocation(''); setShowAdd(false);
      await loadAll();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setAdding(false); }
  };

  const handleClaim = async (device) => {
    const name = window.prompt('Device name (e.g. "Reception MB160")', device.name || '');
    if (!name) return;
    const location = window.prompt('Location', device.location || 'Main office') || '';
    try {
      await api.post('/biometric/devices', { serial_number: device.serial_number, name, location });
      toast.success('Device claimed and activated');
      await loadAll();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const handleDelete = async (device) => {
    if (!window.confirm(`Remove device ${device.serial_number}?`)) return;
    try {
      await api.delete(`/biometric/devices/${device.device_id}`);
      toast.success('Device removed');
      await loadAll();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    setSimulating(true);
    try {
      const { data } = await api.post('/biometric/simulate', {
        user_pin: simPin.trim(),
        status: simStatus,
        verify_mode: simVerify,
        device_sn: simSn.trim() || null,
      });
      if (data.punch?.matched) {
        toast.success(`✅ Punch matched ${data.punch.employee_name || data.punch.employee_id}`);
      } else {
        toast.warning(`Punch saved but PIN "${simPin}" didn't match any employee`);
      }
      await loadAll();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSimulating(false); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="biometric-page">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Fingerprint className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold tracking-tight">Biometric Devices</h1>
              <Badge variant="outline" className="ml-2">eSSL / ZKTeco ADMS</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect MB160 and other ADMS-capable devices. Live punches flow into attendance automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadAll} data-testid="refresh-btn">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="add-device-toggle">
              <Plus className="w-4 h-4 mr-2" /> Add Device
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Devices</p>
                  <p className="text-3xl font-bold" data-testid="stat-devices">{stats.devices_total}</p>
                </div>
                <Cpu className="w-8 h-8 opacity-20" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Online Now</p>
                  <p className="text-3xl font-bold text-emerald-600" data-testid="stat-online">{stats.devices_online}</p>
                </div>
                <Activity className="w-8 h-8 opacity-20 text-emerald-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Punches Today</p>
                  <p className="text-3xl font-bold" data-testid="stat-punches">{stats.punches_today}</p>
                </div>
                <ArrowDownToLine className="w-8 h-8 opacity-20" />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Add device form */}
        {showAdd && (
          <Card>
            <CardHeader>
              <CardTitle>Register Device</CardTitle>
              <CardDescription>Manually add a device by serial number, or claim one that appears as 'pending'.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end" data-testid="add-device-form">
                <div>
                  <Label>Serial Number *</Label>
                  <Input value={newSn} onChange={(e) => setNewSn(e.target.value)} placeholder="ABC1234567" data-testid="sn-input" />
                </div>
                <div>
                  <Label>Name *</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Reception MB160" data-testid="name-input" />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="HQ — Reception" data-testid="loc-input" />
                </div>
                <div className="md:col-span-3 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={adding} data-testid="submit-add-device">
                    {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Register
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border flex-wrap">
          {[
            { id: 'devices', label: `Devices (${devices.length})`, icon: Cpu },
            { id: 'punches', label: `Live Punches (${punches.length})`, icon: Activity },
            { id: 'simulate', label: 'Simulator', icon: Wand2 },
            { id: 'guide', label: 'Setup Guide', icon: BookOpen },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`tab-${t.id}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* DEVICES TAB */}
        {tab === 'devices' && (
          <Card>
            <CardContent className="pt-6">
              {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                : devices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Cpu className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No devices yet. Configure your eSSL MB160 to push to this server (see Setup Guide).</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {devices.map(d => (
                      <div key={d.device_id} className={`p-4 rounded-lg border ${d.status === 'pending' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}
                        data-testid={`device-row-${d.serial_number}`}>
                        <div className="flex items-start justify-between flex-wrap gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{d.name}</span>
                              <Badge variant="secondary" className="text-xs font-mono">{d.serial_number}</Badge>
                              {d.status === 'pending' && <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-700">Pending claim</Badge>}
                              {d.status === 'active' && <Badge className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">Active</Badge>}
                              {d.is_simulator && <Badge variant="outline" className="text-xs">Simulator</Badge>}
                              {d.online && (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{d.location || '—'}</p>
                            <p className="text-xs font-mono text-muted-foreground mt-1">
                              Last ping: {d.last_ping ? new Date(d.last_ping).toLocaleString() : 'never'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {d.status === 'pending' && (
                              <Button size="sm" onClick={() => handleClaim(d)} data-testid="claim-btn">
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Claim
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(d)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {/* PUNCHES TAB */}
        {tab === 'punches' && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Punch Events</CardTitle>
              <CardDescription>Auto-refreshes every 10 seconds. Matched punches sync to Attendance.</CardDescription>
            </CardHeader>
            <CardContent>
              {punches.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No punches yet. Use the Simulator tab to inject a test punch.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-2">Time</th>
                        <th className="py-2 pr-2">Employee</th>
                        <th className="py-2 pr-2">Device</th>
                        <th className="py-2 pr-2">Action</th>
                        <th className="py-2 pr-2">Method</th>
                        <th className="py-2 pr-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {punches.map((p, i) => (
                        <tr key={p.punch_id || i} className="border-b border-border/50" data-testid="punch-row">
                          <td className="py-2 pr-2 font-mono text-xs">{p.timestamp}</td>
                          <td className="py-2 pr-2">
                            {p.employee_name ? (
                              <span className="font-medium">{p.employee_name}</span>
                            ) : (
                              <span className="text-muted-foreground">PIN {p.user_pin}</span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">{p.device_name || p.device_sn}</td>
                          <td className="py-2 pr-2">
                            <Badge variant="outline" className="text-xs capitalize">{p.status?.replace('_', ' ')}</Badge>
                          </td>
                          <td className="py-2 pr-2 text-xs capitalize">{p.verify_mode}</td>
                          <td className="py-2 pr-2">
                            {p.matched ? (
                              <Badge className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
                                Matched
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-700">Unmatched</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* SIMULATE TAB */}
        {tab === 'simulate' && (
          <Card>
            <CardHeader>
              <CardTitle>Punch Simulator</CardTitle>
              <CardDescription>
                Test the pipeline without a physical device. Use an existing employee_id or biometric PIN.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSimulate} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl" data-testid="sim-form">
                <div>
                  <Label>User PIN / Employee ID *</Label>
                  <Input value={simPin} onChange={(e) => setSimPin(e.target.value)}
                    placeholder="EMP-ACME-002" data-testid="sim-pin" />
                </div>
                <div>
                  <Label>Device SN (optional)</Label>
                  <Input value={simSn} onChange={(e) => setSimSn(e.target.value)}
                    placeholder="Leave blank to use SIMULATOR-001" data-testid="sim-sn" />
                </div>
                <div>
                  <Label>Action</Label>
                  <select value={simStatus} onChange={(e) => setSimStatus(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" data-testid="sim-status">
                    <option value={0}>Check In</option>
                    <option value={1}>Check Out</option>
                    <option value={2}>Break Out</option>
                    <option value={3}>Break In</option>
                  </select>
                </div>
                <div>
                  <Label>Verify Mode</Label>
                  <select value={simVerify} onChange={(e) => setSimVerify(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" data-testid="sim-verify">
                    <option value={1}>Fingerprint</option>
                    <option value={15}>Face</option>
                    <option value={2}>Card</option>
                    <option value={0}>Password</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={simulating} data-testid="submit-sim">
                    {simulating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    Inject Punch
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* GUIDE TAB */}
        {tab === 'guide' && guide && (
          <Card>
            <CardHeader>
              <CardTitle>eSSL MB160 Setup Guide</CardTitle>
              <CardDescription>{guide.model}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2"><Settings className="w-4 h-4" /> Device Configuration</h3>
                <p className="text-xs text-muted-foreground mb-3">{guide.menu_path}</p>
                <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs space-y-1">
                  {Object.entries(guide.config).map(([k, v]) => (
                    <div key={k} className="flex">
                      <span className="text-muted-foreground w-56 shrink-0">{k}:</span>
                      <span className="font-medium break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Webhook Endpoints (auto-detected from your server)</h3>
                <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs space-y-1">
                  {Object.entries(guide.webhook_endpoints).map(([k, v]) => (
                    <div key={k} className="flex">
                      <span className="text-muted-foreground w-32 shrink-0 capitalize">{k.replace(/_/g, ' ')}:</span>
                      <span className="font-medium break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Next Steps</h3>
                <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                  {guide.next_steps.map((step, i) => <li key={i}>{step.replace(/^\d+\.\s*/, '')}</li>)}
                </ol>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
