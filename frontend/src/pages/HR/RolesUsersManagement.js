import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Plus, Edit, Trash2, Shield, Users, RotateCcw, Search } from 'lucide-react';

const ALL_PERMISSIONS = [
  'employees', 'departments', 'attendance', 'leaves', 'payroll', 'recruitment',
  'performance', 'announcements', 'terminations', 'resignations', 'shifts',
  'designations', 'salary_slabs', 'holidays', 'onboarding',
  'self_attendance', 'self_leaves', 'self_payslips', 'self_profile'
];

export default function RolesUsersManagement() {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [userForm, setUserForm] = useState({ role: '', status: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const getRoleName = (roleValue) => {
    const systemMapping = {
      super_admin: 'Super Admin',
      hr_manager: 'HR Manager',
      employee: 'Employee'
    };
    if (systemMapping[roleValue]) return systemMapping[roleValue];
    const role = roles.find(r => r.id === roleValue);
    return role ? role.name : roleValue;
  };

  const loadData = async () => {
    try {
      const [rRes, uRes] = await Promise.all([api.get('/roles'), api.get('/users')]);
      setRoles(rRes.data);
      setUsers(uRes.data);
    } catch {} setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const handleCreateRole = async () => {
    setError('');
    try {
      await api.post('/roles', roleForm);
      setShowCreateRole(false);
      setRoleForm({ name: '', description: '', permissions: [] });
      loadData();
    } catch (e) { setError(formatApiError(e.response?.data?.detail)); }
  };

  const handleDeleteRole = async (id) => { if (window.confirm('Delete this role?')) { await api.delete(`/roles/${id}`); loadData(); } };

  const handleUpdateUser = async () => {
    setError(''); setSuccess('');
    try {
      await api.put(`/users/${editUser.employee_id}`, userForm);
      setSuccess('User updated successfully!');
      setEditUser(null);
      loadData();
    } catch (e) { setError(formatApiError(e.response?.data?.detail)); }
  };

  const handleResetPassword = async (empId) => {
    if (!window.confirm('Reset this user\'s password to their mobile number?')) return;
    try {
      const { data } = await api.post(`/users/${empId}/reset-password`);
      setSuccess(`Password reset! New password: ${data.new_password}`);
    } catch (e) { setError(formatApiError(e.response?.data?.detail)); }
  };

  const togglePermission = (perm) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm) ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm]
    }));
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()) || u.employee_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="roles-users-page">
        <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Roles & Users</h1><p className="text-sm text-muted-foreground mt-1">Manage roles, permissions, and user accounts</p></div>

        {success && <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-sm">{success}</div>}
        {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>}

        <Tabs defaultValue="users">
          <TabsList><TabsTrigger value="users">Users</TabsTrigger><TabsTrigger value="roles">Roles</TabsTrigger></TabsList>

          <TabsContent value="users" className="mt-4 space-y-4">
            <div className="relative max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Card className="border border-border"><CardContent className="p-0"><div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Department</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" /></TableCell></TableRow>
                : filteredUsers.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users</TableCell></TableRow>
                : filteredUsers.map((u, i) => (
                  <TableRow key={u.employee_id || i} data-testid={`user-row-${i}`}>
                    <TableCell className="font-mono text-xs">{u.employee_id}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{getRoleName(u.role)}</Badge></TableCell>
                    <TableCell className="text-sm">{u.department || '-'}</TableCell>
                    <TableCell><Badge variant={u.status === 'active' ? 'default' : 'secondary'}>{u.status}</Badge></TableCell>
                    <TableCell><div className="flex gap-1">
                      <Dialog open={editUser?.employee_id === u.employee_id} onOpenChange={o => { if (!o) setEditUser(null); }}>
                        <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setUserForm({ role: u.role, status: u.status }); }} data-testid={`edit-user-${i}-btn`}><Edit size={14} /></Button>
                        {editUser?.employee_id === u.employee_id && <DialogContent>
                          <DialogHeader><DialogTitle>Edit User: {u.name}</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2"><Label>Role</Label>
                               <Select value={userForm.role} onValueChange={v => setUserForm({...userForm, role: v})}>
                                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                                <SelectContent>
                                  {roles.map(r => {
                                    const val = r.id.startsWith('system_') ? r.id.replace('system_', '') : r.id;
                                    return (
                                      <SelectItem key={r.id} value={val}>
                                        {r.name}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2"><Label>Status</Label>
                              <Select value={userForm.status} onValueChange={v => setUserForm({...userForm, status: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button onClick={handleUpdateUser} className="w-full mt-4">Save Changes</Button>
                        </DialogContent>}
                      </Dialog>
                      <Button variant="ghost" size="sm" onClick={() => handleResetPassword(u.employee_id)} title="Reset Password" data-testid={`reset-pwd-${i}-btn`}><RotateCcw size={14} /></Button>
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></CardContent></Card>
          </TabsContent>

          <TabsContent value="roles" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={showCreateRole} onOpenChange={o => { setShowCreateRole(o); if (!o) setError(''); }}>
                <DialogTrigger asChild><Button data-testid="create-role-btn"><Plus size={16} className="mr-2" />Create Role</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Create Custom Role</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                    <div className="space-y-2"><Label>Role Name</Label><Input value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} placeholder="Team Lead" data-testid="role-name-input" /></div>
                    <div className="space-y-2"><Label>Description</Label><Input value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})} placeholder="Description" /></div>
                    <div className="space-y-2">
                      <Label>Permissions</Label>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                        {ALL_PERMISSIONS.map(p => (
                          <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={roleForm.permissions.includes(p)} onCheckedChange={() => togglePermission(p)} />
                            {p.replace(/_/g, ' ')}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleCreateRole} className="w-full mt-4" data-testid="submit-role-btn">Create</Button>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((r, i) => (
                <Card key={r.id} className="border border-border" data-testid={`role-card-${i}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2"><Shield size={18} className="text-primary" /><h3 className="font-semibold">{r.name}</h3></div>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.type === 'system' ? 'default' : 'outline'}>{r.type}</Badge>
                        {r.editable && <Button variant="ghost" size="sm" onClick={() => handleDeleteRole(r.id)} className="text-destructive"><Trash2 size={14} /></Button>}
                      </div>
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground mb-2">{r.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      {(r.permissions || []).map(p => <Badge key={p} variant="secondary" className="text-[10px]">{p.replace(/_/g, ' ')}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
