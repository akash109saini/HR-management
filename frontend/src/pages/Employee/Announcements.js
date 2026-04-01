import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Megaphone } from 'lucide-react';

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/announcements').then(r => { setAnnouncements(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="announcements-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-1">Company news and updates</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : announcements.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <Megaphone size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No announcements yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4 stagger-children">
            {announcements.map((a, i) => (
              <Card key={a.id} className="border border-border animate-fade-in hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200" data-testid={`announcement-card-${i}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                        <Megaphone size={18} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{a.title}</h3>
                        <p className="text-xs text-muted-foreground">By {a.created_by} | {new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={a.priority === 'high' ? 'destructive' : a.priority === 'medium' ? 'secondary' : 'outline'}>
                      {a.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
