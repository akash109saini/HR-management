import React, { useEffect, useState } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Database, Loader2, Trash2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function DemoSeederPage() {
  const [status, setStatus] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/demo/status');
      setStatus(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const seed = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post('/demo/seed');
      toast.success(data.message);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSeeding(false); }
  };

  const clearDemo = async () => {
    if (!window.confirm('Remove all demo data?')) return;
    setClearing(true);
    try {
      const { data } = await api.delete('/demo/seed');
      toast.success(data.message);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setClearing(false); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="demo-seeder-page">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Demo Data Seeder</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Populate sample feedback, blockchain credentials, WhatsApp logs, and announcements to showcase the platform.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current Demo Data</CardTitle>
            <CardDescription>Counts of records marked as <code>demo: true</code></CardDescription>
          </CardHeader>
          <CardContent>
            {status ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['Feedbacks', status.feedbacks_demo],
                  ['Credentials', status.credentials_demo],
                  ['WhatsApp', status.whatsapp_demo],
                  ['Announcements', status.announcements_demo],
                ].map(([k, v]) => (
                  <div key={k} className="p-4 rounded-lg border border-border">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{k}</p>
                    <p className="text-3xl font-bold" data-testid={`demo-${k.toLowerCase()}-count`}>{v}</p>
                  </div>
                ))}
              </div>
            ) : <Loader2 className="w-5 h-5 animate-spin" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={seed} disabled={seeding} data-testid="seed-btn">
              {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              Seed Demo Data
            </Button>
            <Button variant="outline" onClick={load} data-testid="status-refresh">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Button variant="destructive" onClick={clearDemo} disabled={clearing} data-testid="clear-btn">
              {clearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Remove Demo Data
            </Button>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground space-y-1">
            <p><strong>What gets seeded?</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>12 realistic employee feedbacks across all sentiment categories</li>
              <li>15 blockchain credentials (5 employees × 3 credential types — signed with company wallet)</li>
              <li>WhatsApp conversation history for 3 employees</li>
              <li>3 company announcements</li>
            </ul>
            <p className="mt-2">All demo records are tagged <code>demo: true</code> and can be removed with one click.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
