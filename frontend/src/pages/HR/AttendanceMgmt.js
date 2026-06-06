import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { CheckCircle, XCircle, Clock, Search, Smartphone, Monitor, Wifi, WifiOff, Plus, RefreshCw, Trash2, MapPin, Activity, FlaskConical, UserCheck, LogIn, LogOut, Zap, CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import AttendanceCalendar from '../../components/AttendanceCalendar';

export default function AttendanceMgmt() {
  const [attendance, setAttendance] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [devices, setDevices] = useState([]);
  const [rawLogs, setRawLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [employees, setEmployees] = useState([]);
  const [userRole, setUserRole] = useState('');

  // Device form
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ serial_number: '', name: '', location: '' });
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Simulator state
  const [simEmployees, setSimEmployees] = useState([]);
  const [simForm, setSimForm] = useState({ device_sn: '', user_pin: '', punch_status: '0' });
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simHistory, setSimHistory] = useState([]);

  const fetchData = async () => {
    try {
      const [attRes, corrRes] = await Promise.all([
        api.get('/attendance'),
        api.get('/attendance/punch-corrections')
      ]);
      setAttendance(attRes.data);
      setCorrections(corrRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchDevices = async () => {
    try {
      const res = await api.get('/biometric/devices');
      setDevices(res.data);
    } catch { /* ignore */ }
  };

  const fetchRawLogs = async () => {
    try {
      const res = await api.get('/biometric/raw-logs');
      setRawLogs(res.data);
    } catch { /* ignore */ }
  };

  const fetchSimEmployees = async () => {
    try {
      const res = await api.get('/biometric/employees-with-pin');
      setSimEmployees(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchData();
    fetchDevices();
    fetchRawLogs();
    fetchSimEmployees();
    // Fetch employees list for calendar employee filter
    api.get('/employees').then(res => setEmployees(res.data || [])).catch(() => {});
    // Get current user role
    api.get('/auth/me').then(res => setUserRole(res.data?.role || '')).catch(() => {});
  }, []);

  const handleCorrectionAction = async (id, status) => {
    try {
      await api.put(`/attendance/punch-corrections/${id}`, { status, reviewer_note: '' });
      fetchData();
    } catch { /* ignore */ }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    setDeviceSaving(true);
    try {
      await api.post('/biometric/devices', deviceForm);
      setDeviceForm({ serial_number: '', name: '', location: '' });
      setShowDeviceForm(false);
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add device');
    }
    setDeviceSaving(false);
  };

  const handleDeleteDevice = async (id) => {
    if (!window.confirm('Remove this device?')) return;
    try {
      await api.delete(`/biometric/devices/${id}`);
      fetchDevices();
    } catch { /* ignore */ }
  };

  const handleToggleDevice = async (device) => {
    try {
      await api.put(`/biometric/devices/${device.id}`, {
        status: device.status === 'active' ? 'inactive' : 'active'
      });
      fetchDevices();
    } catch { /* ignore */ }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/biometric/sync');
      alert(`Sync complete: ${res.data.synced} synced, ${res.data.errors} errors, ${res.data.remaining} remaining`);
      fetchData();
      fetchRawLogs();
    } catch { alert('Sync failed'); }
    setSyncing(false);
  };

  const handleSimulatePunch = async () => {
    if (!simForm.device_sn || !simForm.user_pin) {
      alert('Please select a device and an employee');
      return;
    }
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await api.post('/biometric/simulate-punch', {
        device_sn: simForm.device_sn,
        user_pin: simForm.user_pin,
        punch_status: parseInt(simForm.punch_status),
      });
      setSimResult(res.data);
      setSimHistory(prev => [{ ...res.data, _time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
      // Refresh data
      fetchData();
      fetchRawLogs();
    } catch (err) {
      setSimResult({ message: '❌ ' + (err.response?.data?.detail || 'Simulation failed'), error: true });
    }
    setSimulating(false);
  };

  const filteredAttendance = attendance.filter(a => {
    const matchesSearch = a.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.user_id?.toLowerCase().includes(search.toLowerCase());
    const matchesSource = sourceFilter === 'all' || a.source === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const statusBadge = (s) => {
    const map = { pending: 'secondary', approved: 'default', rejected: 'destructive' };
    return map[s] || 'secondary';
  };

  const sourceBadge = (source) => {
    if (source === 'biometric') {
      return (
        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
          <Smartphone size={12} /> Biometric
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200 bg-blue-50">
        <Monitor size={12} /> Manual
      </Badge>
    );
  };

  const onlineDevices = devices.filter(d => d.is_online).length;
  const unsyncedLogs = rawLogs.filter(l => !l.synced).length;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-attendance-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Attendance Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor attendance, biometric devices, and review punch corrections</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Activity size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Devices Online</p>
                  <p className="text-lg font-bold">{onlineDevices}/{devices.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Smartphone size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Biometric Punches</p>
                  <p className="text-lg font-bold">{attendance.filter(a => a.source === 'biometric').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending Corrections</p>
                  <p className="text-lg font-bold">{corrections.filter(c => c.status === 'pending').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <RefreshCw size={20} className="text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unsynced Logs</p>
                  <p className="text-lg font-bold">{unsyncedLogs}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="calendar">
          <TabsList data-testid="attendance-tabs" className="flex-wrap h-auto gap-1">
            <TabsTrigger value="calendar" data-testid="tab-calendar" className="gap-1">
              <CalendarDays size={14} /> Attendance Calendar
            </TabsTrigger>
            <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance Log</TabsTrigger>
            <TabsTrigger value="corrections" data-testid="tab-corrections">
              Punch Corrections
              {corrections.filter(c => c.status === 'pending').length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                  {corrections.filter(c => c.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="devices" data-testid="tab-devices">
              Biometric Devices
              {devices.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-emerald-600 text-white rounded-full">
                  {devices.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="simulator" data-testid="tab-simulator" className="gap-1">
              <FlaskConical size={14} /> Simulator
            </TabsTrigger>
            <TabsTrigger value="rawlogs" data-testid="tab-rawlogs">
              Raw Logs
              {unsyncedLogs > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
                  {unsyncedLogs}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ========== ATTENDANCE CALENDAR TAB ========== */}
          <TabsContent value="calendar" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-5">
                <AttendanceCalendar
                  userRole={userRole}
                  employees={employees}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== ATTENDANCE LOG TAB ========== */}
          <TabsContent value="attendance" className="mt-4">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={sourceFilter === 'all' ? 'default' : 'outline'} onClick={() => setSourceFilter('all')}>All</Button>
                <Button size="sm" variant={sourceFilter === 'biometric' ? 'default' : 'outline'} onClick={() => setSourceFilter('biometric')} className="gap-1">
                  <Smartphone size={14} /> Biometric
                </Button>
                <Button size="sm" variant={sourceFilter === 'manual' ? 'default' : 'outline'} onClick={() => setSourceFilter('manual')} className="gap-1">
                  <Monitor size={14} /> Manual
                </Button>
              </div>
            </div>
            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Week Day</TableHead>
                        <TableHead>Shift Time</TableHead>
                        <TableHead>In Time</TableHead>
                        <TableHead>Out Time</TableHead>
                        <TableHead>Working Hour</TableHead>
                        <TableHead>Late BY</TableHead>
                        <TableHead>Early BY</TableHead>
                        <TableHead>Buffer Utilization</TableHead>
                        <TableHead>Remaining Buffer</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={12} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                      ) : filteredAttendance.length === 0 ? (
                        <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No records</TableCell></TableRow>
                      ) : filteredAttendance.slice(0, 50).map((a, i) => (
                        <TableRow key={a.id || i}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{a.user_name}</p>
                              <p className="text-xs text-muted-foreground">{a.employee_id_display || a.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{a.date}</TableCell>
                          <TableCell className="text-sm">{a.weekday || '-'}</TableCell>
                          <TableCell className="text-sm">{a.shift_time || '-'}</TableCell>
                          <TableCell className="text-sm">{a.in_time || '-'}</TableCell>
                          <TableCell className="text-sm">{a.out_time || '-'}</TableCell>
                          <TableCell className="text-sm">{a.working_hour || '-'}</TableCell>
                          <TableCell className="text-sm">{a.late_by || '-'}</TableCell>
                          <TableCell className="text-sm">{a.early_by || '-'}</TableCell>
                          <TableCell className="text-sm">{a.buffer_utilization || '-'}</TableCell>
                          <TableCell className="text-sm">{a.remaining_buffer || '-'}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={a.status === 'present' ? 'default' : a.status === 'half day' ? 'outline' : 'destructive'}
                              className={
                                a.status === 'present' 
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' 
                                  : a.status === 'half day' 
                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' 
                                    : 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                              }
                            >
                              {a.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== PUNCH CORRECTIONS TAB ========== */}
          <TabsContent value="corrections" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Requested Time</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {corrections.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No corrections</TableCell></TableRow>
                      ) : corrections.map((c, i) => (
                        <TableRow key={c.id || i} data-testid={`correction-row-${i}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{c.user_name}</p>
                              <p className="text-xs text-muted-foreground">{c.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.date}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {c.correction_type === 'both' ? 'Punch Correction' : (c.correction_type === 'missed_punch' ? 'Missed Punch' : c.correction_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{c.requested_time}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{c.reason}</TableCell>
                          <TableCell><Badge variant={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                          <TableCell>
                            {c.status === 'pending' ? (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleCorrectionAction(c.id, 'approved')} className="text-emerald-600" data-testid={`approve-correction-${i}-btn`}>
                                  <CheckCircle size={14} />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleCorrectionAction(c.id, 'rejected')} className="text-destructive" data-testid={`reject-correction-${i}-btn`}>
                                  <XCircle size={14} />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{c.reviewed_by}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== BIOMETRIC DEVICES TAB ========== */}
          <TabsContent value="devices" className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Manage ESSL biometric devices connected to your organization
              </p>
              <Button size="sm" onClick={() => setShowDeviceForm(!showDeviceForm)} className="gap-1" data-testid="add-device-btn">
                <Plus size={14} /> Add Device
              </Button>
            </div>

            {showDeviceForm && (
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Register New Device</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddDevice} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Serial Number *</label>
                      <Input
                        placeholder="e.g., EGMM243760123"
                        value={deviceForm.serial_number}
                        onChange={e => setDeviceForm({ ...deviceForm, serial_number: e.target.value })}
                        required
                        data-testid="device-sn-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Device Name *</label>
                      <Input
                        placeholder="e.g., Main Gate AiFace Mars"
                        value={deviceForm.name}
                        onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })}
                        required
                        data-testid="device-name-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
                      <Input
                        placeholder="e.g., Ground Floor Entrance"
                        value={deviceForm.location}
                        onChange={e => setDeviceForm({ ...deviceForm, location: e.target.value })}
                        data-testid="device-location-input"
                      />
                    </div>
                    <div className="sm:col-span-3 flex gap-2">
                      <Button type="submit" size="sm" disabled={deviceSaving} data-testid="save-device-btn">
                        {deviceSaving ? 'Saving...' : 'Register Device'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowDeviceForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.length === 0 ? (
                <Card className="col-span-full border border-dashed border-border">
                  <CardContent className="p-8 text-center">
                    <Smartphone size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
                    <p className="text-muted-foreground text-sm">No biometric devices registered yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Click "Add Device" to register your ESSL Aiface Mars</p>
                  </CardContent>
                </Card>
              ) : devices.map((device) => (
                <Card key={device.id} className={`border ${device.is_online ? 'border-emerald-200' : 'border-border'} transition-all hover:shadow-md`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {device.is_online ? (
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <Wifi size={16} className="text-emerald-600" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                            <WifiOff size={16} className="text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-sm">{device.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{device.serial_number}</p>
                        </div>
                      </div>
                      <Badge variant={device.status === 'active' ? 'default' : 'secondary'}>
                        {device.status}
                      </Badge>
                    </div>

                    {device.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                        <MapPin size={12} /> {device.location}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground mb-3">
                      Last heartbeat: {device.last_heartbeat
                        ? new Date(device.last_heartbeat).toLocaleString()
                        : 'Never connected'}
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleToggleDevice(device)}>
                        {device.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 text-destructive" onClick={() => handleDeleteDevice(device.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Device Setup Guide */}
            <Card className="border border-border bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">📋 Device Setup Guide</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p><strong>1.</strong> On your ESSL Aiface Mars device, go to <strong>COMM. → Cloud Server Setting</strong></p>
                <p><strong>2.</strong> Set <strong>Server Address</strong> to <code>hr.dmrhospitals.com</code></p>
                <p><strong>3.</strong> Set <strong>Server Port</strong> to <code>80</code> (or <code>443</code> for secure connection)</p>
                <p><strong>4.</strong> Set <strong>Server Path</strong> to <code>/api/iclock</code></p>
                <p><strong>5.</strong> Enable <strong>Cloud Server</strong> and save</p>
                <p><strong>6.</strong> Enroll employees on the device using the same <strong>Biometric PIN</strong> as assigned in the HR app</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== DEVICE SIMULATOR TAB ========== */}
          <TabsContent value="simulator" className="mt-4 space-y-4">
            <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <FlaskConical size={20} className="text-primary" />
                  Biometric Device Simulator
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Test biometric attendance without physical hardware. This simulates the exact same data flow as a real ESSL Aiface Mars device.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {devices.length === 0 ? (
                  <div className="p-6 text-center bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-700 font-medium">⚠️ No devices registered</p>
                    <p className="text-xs text-amber-600 mt-1">Go to the "Biometric Devices" tab and register a device first (use any serial number like "SIM-001")</p>
                  </div>
                ) : simEmployees.length === 0 ? (
                  <div className="p-6 text-center bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-700 font-medium">⚠️ No employees have a Biometric PIN assigned</p>
                    <p className="text-xs text-amber-600 mt-1">Go to Employee Management → Edit an employee → Set a Biometric PIN (e.g., "1001")</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Select Device</label>
                        <Select value={simForm.device_sn} onValueChange={v => setSimForm({...simForm, device_sn: v})}>
                          <SelectTrigger><SelectValue placeholder="Choose device" /></SelectTrigger>
                          <SelectContent>
                            {devices.filter(d => d.status === 'active').map(d => (
                              <SelectItem key={d.id} value={d.serial_number}>
                                {d.name} ({d.serial_number})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Select Employee</label>
                        <Select value={simForm.user_pin} onValueChange={v => setSimForm({...simForm, user_pin: v})}>
                          <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                          <SelectContent>
                            {simEmployees.map(emp => (
                              <SelectItem key={emp.id} value={emp.biometric_pin}>
                                {emp.name} (PIN: {emp.biometric_pin})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Punch Type</label>
                        <Select value={simForm.punch_status} onValueChange={v => setSimForm({...simForm, punch_status: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">🟢 Check-In</SelectItem>
                            <SelectItem value="1">🔴 Check-Out</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleSimulatePunch}
                        disabled={simulating || !simForm.device_sn || !simForm.user_pin}
                        className="gap-2"
                        data-testid="simulate-punch-btn"
                      >
                        {simulating ? (
                          <><RefreshCw size={16} className="animate-spin" /> Simulating...</>
                        ) : (
                          <><Zap size={16} /> Simulate Punch</>
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {/* Result Display */}
                {simResult && (
                  <div className={`p-4 rounded-lg border animate-in fade-in slide-in-from-bottom-2 ${
                    simResult.error
                      ? 'bg-destructive/10 border-destructive/30'
                      : simResult.raw_log?.synced
                        ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20'
                        : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20'
                  }`}>
                    <p className="font-medium text-sm">{simResult.message}</p>
                    {simResult.employee && (
                      <div className="mt-2 flex items-center gap-2">
                        <UserCheck size={16} className="text-emerald-600" />
                        <span className="text-sm">
                          <strong>{simResult.employee.name}</strong> ({simResult.employee.employee_id})
                          — {simResult.punch_type} at {new Date(simResult.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Simulation History */}
            {simHistory.length > 0 && (
              <Card className="border border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Simulation Log</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {simHistory.map((h, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{h._time}</TableCell>
                            <TableCell className="text-sm font-medium">{h.employee?.name || 'Unknown'}</TableCell>
                            <TableCell>
                              <Badge variant={h.punch_type === 'Check-In' ? 'default' : 'secondary'} className="gap-1 text-xs">
                                {h.punch_type === 'Check-In' ? <LogIn size={12} /> : <LogOut size={12} />}
                                {h.punch_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {h.raw_log?.synced
                                ? <CheckCircle size={16} className="text-emerald-500" />
                                : <XCircle size={16} className="text-amber-500" />
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* How It Works */}
            <Card className="border border-border bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">🔧 How the Simulator Works</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>The simulator creates the <strong>exact same data</strong> that a real ESSL device would produce:</p>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-xs">1</Badge>
                  <span>Creates a raw ATTLOG entry in <code>biometric_raw_logs</code> (tagged as [SIMULATED])</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-xs">2</Badge>
                  <span>Matches employee via <code>biometric_pin</code> → syncs to <code>attendances</code> table</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-xs">3</Badge>
                  <span>Records appear in Attendance Log with 📱 Biometric badge — identical to real device data</span>
                </div>
                <p className="mt-2 text-emerald-600 font-medium">When you buy the physical ESSL device, just configure it to push to your server — no code changes needed!</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== RAW LOGS TAB ========== */}
          <TabsContent value="rawlogs" className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Raw punch data received from biometric devices
              </p>
              <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1" data-testid="sync-logs-btn">
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync Unprocessed'}
              </Button>
            </div>

            <Card className="border border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>PIN</TableHead>
                        <TableHead>Punch Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Verify</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawLogs.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No raw logs yet. Waiting for device to push data...</TableCell></TableRow>
                      ) : rawLogs.slice(0, 100).map((log, i) => (
                        <TableRow key={log.id || i} className={!log.synced ? 'bg-amber-50/50' : ''}>
                          <TableCell>
                            <p className="font-medium text-sm">{log.employee_name || <span className="text-amber-600 text-xs">Unknown PIN</span>}</p>
                          </TableCell>
                          <TableCell><code className="text-xs">{log.user_pin}</code></TableCell>
                          <TableCell className="text-sm">{new Date(log.punched_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={log.punch_status === 0 ? 'default' : 'secondary'} className="text-xs">
                              {log.punch_status_label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.verify_mode_label}</TableCell>
                          <TableCell><code className="text-xs">{log.device_sn}</code></TableCell>
                          <TableCell>
                            {log.synced ? (
                              <CheckCircle size={16} className="text-emerald-500" />
                            ) : (
                              <div>
                                <XCircle size={16} className="text-amber-500" />
                                {log.sync_error && <p className="text-xs text-destructive mt-1 max-w-[150px] truncate">{log.sync_error}</p>}
                              </div>
                            )}
                          </TableCell>
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
