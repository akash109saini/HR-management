import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fetch = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetch(); const interval = setInterval(fetch, 30000); return () => clearInterval(interval); }, []);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await api.post('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const typeIcon = (type) => {
    const colors = { leave_approved: 'text-emerald-500', leave_rejected: 'text-destructive', resignation: 'text-amber-500',
      resignation_approved: 'text-emerald-500', termination: 'text-destructive', correction_approved: 'text-emerald-500',
      correction_rejected: 'text-destructive' };
    return colors[type] || 'text-primary';
  };

  const timeAgo = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (!open) fetch(); }}
        className="relative p-2 rounded-md hover:bg-accent transition-colors"
        data-testid="notification-bell-btn"
      >
        <Bell size={18} className="text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center" data-testid="notification-count">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-md shadow-lg z-50 animate-fade-in" data-testid="notification-dropdown">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-sm font-['Outfit']">Notifications</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7" data-testid="mark-all-read-btn">
                <CheckCheck size={12} className="mr-1" />Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-80">
            {notifications.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No notifications</p>
            ) : (
              <div className="divide-y divide-border">
                {notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 hover:bg-muted/50 transition-colors cursor-pointer ${!n.read ? 'bg-primary/5' : ''}`}
                    onClick={() => !n.read && markRead(n.id)}
                    data-testid={`notification-item-${n.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {!n.read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                          <p className="text-sm font-medium truncate">{n.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
