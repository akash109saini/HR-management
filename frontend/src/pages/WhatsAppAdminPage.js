import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  MessageSquare, Send, Megaphone, Inbox, CheckCircle2, XCircle,
  Loader2, RefreshCw, Phone, Search, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';

export default function WhatsAppAdminPage() {
  const [tab, setTab] = useState('send'); // send | broadcast | history
  const [status, setStatus] = useState(null);

  // Send form
  const [sendTo, setSendTo] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [sending, setSending] = useState(false);

  // Broadcast form
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  // History
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadStatus = async () => {
    try {
      const { data } = await api.get('/whatsapp/status');
      setStatus(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp/messages?limit=200');
      setMessages(data || []);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadStatus(); loadHistory(); }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!sendTo.trim() || !sendMsg.trim()) { toast.error('Phone & message required'); return; }
    setSending(true);
    try {
      const { data } = await api.post('/whatsapp/send', { to: sendTo.trim(), message: sendMsg.trim() });
      if (data.status === 'sent') {
        toast.success('Message sent via WhatsApp');
      } else {
        const err = typeof data.error === 'string' ? data.error : data.error?.error?.message || 'Send failed';
        toast.error(`Send failed: ${err}`);
      }
      setSendMsg('');
      await loadHistory();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSending(false); }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) { toast.error('Message required'); return; }
    if (!window.confirm('Broadcast this to ALL employees in your tenant?')) return;
    setBroadcasting(true);
    try {
      const { data } = await api.post('/whatsapp/broadcast', { message: broadcastMsg.trim() });
      toast.success(data.message || 'Broadcast complete');
      setBroadcastMsg('');
      await loadHistory();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBroadcasting(false); }
  };

  const filtered = messages.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.text || '').toLowerCase().includes(s)
      || (m.from || '').includes(search)
      || (m.to || '').includes(search)
      || (m.employee_id || '').toLowerCase().includes(s);
  });

  const fmtTime = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="whatsapp-admin-page">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-6 h-6 text-green-600" />
              <h1 className="text-2xl font-bold tracking-tight">WhatsApp Center</h1>
              {status?.configured && (
                <Badge className="ml-1 bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30 hover:bg-green-500/20">
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Send messages, broadcast announcements, and review conversation history.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadStatus(); loadHistory(); }} data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {status && (
          <Card className="border-dashed">
            <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <div className="flex items-center gap-1 font-medium">
                  <span className={`w-2 h-2 rounded-full ${status.configured ? 'bg-green-500' : 'bg-red-500'}`} />
                  {status.configured ? 'Configured' : 'Not configured'}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Phone ID</p>
                <p className="font-mono text-xs">{status.phone_number_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Webhook</p>
                <p className="font-mono text-xs truncate" title={status.webhook_url}>{status.webhook_url?.replace(/^https?:\/\//, '')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Verify Token</p>
                <p className="font-mono text-xs truncate" title={status.verify_token}>{status.verify_token}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {[
            { id: 'send', label: 'Send Message', icon: Send },
            { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
            { id: 'history', label: 'History', icon: Inbox },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* SEND TAB */}
        {tab === 'send' && (
          <Card>
            <CardHeader>
              <CardTitle>Send Direct Message</CardTitle>
              <CardDescription>
                Send a WhatsApp message to a single recipient. Recipient must be on Meta's allow-list (dev mode).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSend} className="space-y-4 max-w-xl" data-testid="send-form">
                <div>
                  <Label htmlFor="to"><Phone className="inline w-4 h-4 mr-1" /> Recipient WhatsApp Number</Label>
                  <Input id="to" value={sendTo} onChange={(e) => setSendTo(e.target.value)}
                    placeholder="e.g. 919123456780 (with country code, no +)" data-testid="send-to-input" />
                </div>
                <div>
                  <Label htmlFor="msg">Message</Label>
                  <Textarea id="msg" value={sendMsg} onChange={(e) => setSendMsg(e.target.value)}
                    rows={5} placeholder="Hi team, ..." data-testid="send-msg-input" />
                  <p className="text-xs text-muted-foreground mt-1">{sendMsg.length}/1024 chars</p>
                </div>
                <Button type="submit" disabled={sending} data-testid="submit-send">
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* BROADCAST TAB */}
        {tab === 'broadcast' && (
          <Card>
            <CardHeader>
              <CardTitle>Broadcast Announcement</CardTitle>
              <CardDescription>
                Send a WhatsApp message to <strong>every employee</strong> in your tenant who has a registered mobile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBroadcast} className="space-y-4 max-w-xl" data-testid="broadcast-form">
                <div>
                  <Label htmlFor="bmsg">Broadcast Message</Label>
                  <Textarea id="bmsg" value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)}
                    rows={6} placeholder="📢 Important update for the whole team..." data-testid="broadcast-msg-input" />
                  <p className="text-xs text-muted-foreground mt-1">{broadcastMsg.length}/1024 chars</p>
                </div>
                <Button type="submit" disabled={broadcasting} variant="destructive" data-testid="submit-broadcast">
                  {broadcasting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
                  Broadcast to Everyone
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <Card>
            <CardHeader>
              <CardTitle>Conversation History</CardTitle>
              <CardDescription>
                Last {messages.length} messages across all employees in your tenant.
              </CardDescription>
              <div className="relative mt-3 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search by text, phone or employee ID..."
                  value={search} onChange={(e) => setSearch(e.target.value)} data-testid="history-search" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No messages match your search</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                  {filtered.map((m, i) => {
                    const inbound = m.direction === 'inbound';
                    return (
                      <div key={m.message_id || i}
                        className={`p-3 rounded-lg border ${inbound ? 'bg-muted/30 border-border' : 'bg-primary/5 border-primary/20 ml-8'}`}
                        data-testid="message-row">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            {inbound ? (
                              <Badge variant="outline" className="text-xs">
                                <ArrowDownLeft className="w-3 h-3 mr-1" /> Inbound
                              </Badge>
                            ) : (
                              <Badge className="text-xs bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20">
                                <ArrowUpRight className="w-3 h-3 mr-1" /> Outbound
                              </Badge>
                            )}
                            <span className="text-xs font-mono text-muted-foreground">
                              {inbound ? m.from : m.to}
                            </span>
                            {m.employee_id && (
                              <Badge variant="secondary" className="text-xs">{m.employee_id}</Badge>
                            )}
                            {m.send_status === 'send_failed' && (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="w-3 h-3 mr-1" /> Failed
                              </Badge>
                            )}
                            {m.send_status === 'sent' && (
                              <Badge className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Sent
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{fmtTime(m.created_at)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
