import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { KeyRound, ShieldCheck, ShieldOff, Eye, EyeOff, Lock, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

export default function SecuritySettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Set form (first time)
  const [setForm, setSetForm] = useState({ new_password: '', confirm_password: '' });
  const [showSet, setShowSet] = useState({ new: false, confirm: false });
  const [setLoading_, setSetLoading] = useState(false);
  const [setError, setSetError] = useState('');
  const [setSuccess, setSetSuccess] = useState('');

  // Change form
  const [changeForm, setChangeForm] = useState({ current_master_password: '', new_password: '', confirm_password: '' });
  const [showChange, setShowChange] = useState({ current: false, new: false, confirm: false });
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');

  // Disable
  const [disableLoading, setDisableLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data } = await api.get('/settings/master-password');
      setStatus(data);
    } catch (err) {
      setStatus({ is_set: false });
    }
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setSetError(''); setSetSuccess('');
    if (setForm.new_password.length < 8) { setSetError('Password must be at least 8 characters'); return; }
    if (setForm.new_password !== setForm.confirm_password) { setSetError('Passwords do not match'); return; }
    setSetLoading(true);
    try {
      await api.post('/settings/master-password', setForm);
      setSetSuccess('Master password set successfully!');
      setSetForm({ new_password: '', confirm_password: '' });
      fetchStatus();
    } catch (err) {
      setSetError(formatApiError(err.response?.data?.detail));
    }
    setSetLoading(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangeError(''); setChangeSuccess('');
    if (changeForm.new_password.length < 8) { setChangeError('New password must be at least 8 characters'); return; }
    if (changeForm.new_password !== changeForm.confirm_password) { setChangeError('New passwords do not match'); return; }
    setChangeLoading(true);
    try {
      await api.put('/settings/master-password', changeForm);
      setChangeSuccess('Master password changed successfully!');
      setChangeForm({ current_master_password: '', new_password: '', confirm_password: '' });
      fetchStatus();
    } catch (err) {
      setChangeError(formatApiError(err.response?.data?.detail));
    }
    setChangeLoading(false);
  };

  const handleDisable = async () => {
    if (!window.confirm('Are you sure you want to disable the master password? Super Admin will no longer be able to access tenant accounts with it.')) return;
    setDisableLoading(true);
    try {
      await api.delete('/settings/master-password');
      fetchStatus();
    } catch {}
    setDisableLoading(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Security Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage master password and system-level security controls</p>
        </div>

        {/* Master Password Status Banner */}
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${status?.is_set ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
          {status?.is_set
            ? <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0" />
            : <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${status?.is_set ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              Master Password is {status?.is_set ? 'Active' : 'Not Set'}
            </p>
            {status?.is_set && status?.last_updated && (
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                Last updated: {new Date(status.last_updated).toLocaleString()}
              </p>
            )}
            {!status?.is_set && (
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Set a master password to log in to any tenant account
              </p>
            )}
          </div>
          <Badge variant={status?.is_set ? 'default' : 'secondary'} className="flex-shrink-0">
            {status?.is_set ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        {/* Info Card */}
        <Card className="border border-border bg-primary/5">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <KeyRound size={18} className="text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">What is the Master Password?</p>
                <p>The master password allows the <strong>Super Admin</strong> to log in to <em>any tenant's account</em> (HR Manager or Employee) without knowing their actual password.</p>
                <p>This is useful for support, troubleshooting, or auditing. It <strong>cannot</strong> be used to access other Super Admin accounts.</p>
                <p>When logged in via master password, the session bypasses the first-login password change requirement.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SET password (first time) */}
        {!status?.is_set && (
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg font-['Outfit'] flex items-center gap-2">
                <Lock size={18} className="text-primary" /> Set Master Password
              </CardTitle>
              <CardDescription>Create a master password to enable super-admin access to all tenant accounts.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetPassword} className="space-y-4">
                {setError && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">{setError}</div>
                )}
                {setSuccess && (
                  <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-sm border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={16} />{setSuccess}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>New Master Password <span className="text-muted-foreground text-xs">(min 8 chars)</span></Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showSet.new ? 'text' : 'password'}
                      placeholder="Enter master password"
                      value={setForm.new_password}
                      onChange={e => setSetForm({ ...setForm, new_password: e.target.value })}
                      className="pl-10 pr-10"
                      required
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowSet(s => ({ ...s, new: !s.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showSet.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Confirm Master Password</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showSet.confirm ? 'text' : 'password'}
                      placeholder="Re-enter master password"
                      value={setForm.confirm_password}
                      onChange={e => setSetForm({ ...setForm, confirm_password: e.target.value })}
                      className="pl-10 pr-10"
                      required
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowSet(s => ({ ...s, confirm: !s.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showSet.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={setLoading_} className="w-full">
                  {setLoading_ ? 'Setting...' : 'Set Master Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* CHANGE password */}
        {status?.is_set && (
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg font-['Outfit'] flex items-center gap-2">
                <RefreshCw size={18} className="text-primary" /> Change Master Password
              </CardTitle>
              <CardDescription>Update the existing master password. You must enter the current one to proceed.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                {changeError && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">{changeError}</div>
                )}
                {changeSuccess && (
                  <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-sm border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={16} />{changeSuccess}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Current Master Password</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showChange.current ? 'text' : 'password'}
                      placeholder="Enter current master password"
                      value={changeForm.current_master_password}
                      onChange={e => setChangeForm({ ...changeForm, current_master_password: e.target.value })}
                      className="pl-10 pr-10"
                      required
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowChange(s => ({ ...s, current: !s.current }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showChange.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>New Master Password <span className="text-muted-foreground text-xs">(min 8 chars)</span></Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showChange.new ? 'text' : 'password'}
                      placeholder="Enter new master password"
                      value={changeForm.new_password}
                      onChange={e => setChangeForm({ ...changeForm, new_password: e.target.value })}
                      className="pl-10 pr-10"
                      required
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowChange(s => ({ ...s, new: !s.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showChange.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Confirm New Master Password</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showChange.confirm ? 'text' : 'password'}
                      placeholder="Re-enter new master password"
                      value={changeForm.confirm_password}
                      onChange={e => setChangeForm({ ...changeForm, confirm_password: e.target.value })}
                      className="pl-10 pr-10"
                      required
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowChange(s => ({ ...s, confirm: !s.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showChange.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={changeLoading} className="w-full">
                  {changeLoading ? 'Updating...' : 'Change Master Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* DISABLE master password */}
        {status?.is_set && (
          <Card className="border border-destructive/40">
            <CardHeader>
              <CardTitle className="text-lg font-['Outfit'] flex items-center gap-2 text-destructive">
                <ShieldOff size={18} /> Disable Master Password
              </CardTitle>
              <CardDescription>Remove the master password. Super Admin will no longer be able to access tenant accounts with it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleDisable} disabled={disableLoading} className="w-full sm:w-auto">
                {disableLoading ? 'Disabling...' : 'Disable Master Password'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
