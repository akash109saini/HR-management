import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Trash2, PlusCircle, Settings2 } from 'lucide-react';

export default function LeaveSettings() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState({ name: '', days_allotted: 12, is_paid: true });

  const fetchTypes = async () => {
    try {
      const { data } = await api.get('/leave-types');
      setTypes(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchTypes(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leave-types', newType);
      setNewType({ name: '', days_allotted: 12, is_paid: true });
      fetchTypes();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this leave type? This will not affect existing leave records but will prevent new applications of this type.')) return;
    try {
      await api.delete(`/leave-types/${id}`);
      fetchTypes();
    } catch { /* ignore */ }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="leave-settings-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Leave Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage company-wide leave types and policies</p>
          </div>
          <Settings2 className="w-8 h-8 text-primary/20" />
        </div>

        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-lg">Add New Leave Type</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2 flex-1 min-w-[200px]">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type Name</label>
                <Input 
                  placeholder="e.g. Maternity Leave" 
                  value={newType.name} 
                  onChange={e => setNewType({...newType, name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2 w-32">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Days/Year</label>
                <Input 
                  type="number" 
                  value={newType.days_allotted} 
                  onChange={e => setNewType({...newType, days_allotted: parseInt(e.target.value)})}
                  required
                />
              </div>
              <Button type="submit">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Type
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Days Allotted</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">Loading settings...</TableCell></TableRow>
                ) : types.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No leave types defined. System will use defaults.</TableCell></TableRow>
                ) : types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.days_allotted} Days</TableCell>
                    <TableCell>{t.is_paid ? 'Paid' : 'Unpaid'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
