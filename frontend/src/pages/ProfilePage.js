import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { User, Mail, Phone, Building, Briefcase, DollarSign, Save, IdCard } from 'lucide-react';

export default function ProfilePage() {
  const { user, checkAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchProfile = async () => {
    try {
      const { data } = await api.get('/profile');
      setProfile(data);
      setForm({ name: data.name || '', mobile: data.mobile || '' });
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put('/profile', form);
      setProfile(data);
      setEditing(false);
      setSuccess('Profile updated successfully');
      await checkAuth();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div></DashboardLayout>;

  const infoItems = [
    { icon: IdCard, label: 'Employee ID', value: profile?.employee_id },
    { icon: Mail, label: 'Email', value: profile?.email },
    { icon: Phone, label: 'Mobile', value: profile?.mobile },
    { icon: Building, label: 'Department', value: profile?.department },
    { icon: Briefcase, label: 'Position', value: profile?.designation || profile?.position },
    { icon: DollarSign, label: 'Salary', value: profile?.salary ? `$${Number(profile.salary).toLocaleString()}` : '-' },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6" data-testid="profile-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">My Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">View and edit your personal information</p>
          </div>
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)} data-testid="edit-profile-btn">
              Edit Profile
            </Button>
          )}
        </div>

        {success && <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-sm border border-emerald-200 dark:border-emerald-800" data-testid="profile-success">{success}</div>}
        {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">{error}</div>}

        {/* Profile Card */}
        <Card className="border border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
              <div className="w-16 h-16 rounded-md bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary font-['Outfit']">
                  {(profile?.name || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                {editing ? (
                  <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="text-lg font-semibold" data-testid="profile-name-input" />
                ) : (
                  <h2 className="text-xl font-semibold font-['Outfit']">{profile?.name}</h2>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{profile?.role_name || profile?.role?.replace('_', ' ')}</Badge>
                  <Badge variant={profile?.status === 'active' ? 'default' : 'secondary'}>{profile?.status}</Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {infoItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-muted/30">
                  <item.icon size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.15em] font-semibold text-muted-foreground">{item.label}</p>
                    {editing && item.label === 'Mobile' ? (
                      <Input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className="mt-1 h-8 text-sm" data-testid="profile-mobile-input" />
                    ) : (
                      <p className="text-sm font-medium mt-0.5 truncate">{item.value || '-'}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Leave Balance */}
            {profile?.leave_balance && Object.keys(profile.leave_balance).length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Leave Balance</h3>
                <div className="flex gap-4">
                  {Object.entries(profile.leave_balance).map(([type, val]) => (
                    <div key={type} className="text-center p-3 rounded-md bg-muted/30 min-w-[80px]">
                      <p className="text-xl font-bold font-['Outfit']">{val}</p>
                      <p className="text-[10px] uppercase text-muted-foreground mt-1">{type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editing && (
              <div className="flex gap-2 mt-6 pt-6 border-t border-border">
                <Button onClick={handleSave} data-testid="save-profile-btn"><Save size={16} className="mr-2" />Save Changes</Button>
                <Button variant="outline" onClick={() => { setEditing(false); setForm({ name: profile?.name || '', mobile: profile?.mobile || '' }); }}>Cancel</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
