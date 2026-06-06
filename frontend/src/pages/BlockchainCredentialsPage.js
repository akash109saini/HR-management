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
  Shield, CheckCircle2, XCircle, Loader2, Link2, Anchor, Ban, Plus,
  ExternalLink, Copy, Award, FileBadge, RefreshCw, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const CRED_TYPES = [
  { value: 'degree', label: 'Degree' },
  { value: 'certification', label: 'Certification' },
  { value: 'employment_letter', label: 'Employment Letter' },
  { value: 'award', label: 'Award / Recognition' },
];

function Truncate({ text, len = 12 }) {
  if (!text) return <span className="text-muted-foreground">—</span>;
  const t = String(text);
  return <span title={t}>{t.length > len ? `${t.slice(0, len)}…${t.slice(-6)}` : t}</span>;
}

function CopyBtn({ value, label = 'Copy' }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      data-testid="copy-btn"
    >
      <Copy className="w-3 h-3" /> Copy
    </button>
  );
}

export default function BlockchainCredentialsPage() {
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];
  const isHR = user?.role === 'super_admin' || user?.role === 'hr_manager' || userPermissions.some(p => !p.startsWith('self_') && p !== 'announcements');

  const [tab, setTab] = useState('list'); // list | issue | verify
  const [status, setStatus] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);

  // Issue form
  const [form, setForm] = useState({
    employee_id: '', credential_type: 'degree', title: '', issuer_name: '',
    issue_date: '', credential_id: '', description: '',
  });
  const [issuing, setIssuing] = useState(false);

  // Verify form
  const [verifyPayload, setVerifyPayload] = useState('');
  const [verifySignature, setVerifySignature] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const loadStatus = async () => {
    try {
      const { data } = await api.get('/blockchain/status');
      setStatus(data);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/blockchain/credentials');
      setCredentials(data || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadCredentials();
  }, []);

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.title || !form.issuer_name || !form.issue_date) {
      toast.error('Please fill all required fields');
      return;
    }
    setIssuing(true);
    try {
      const { data } = await api.post('/blockchain/credentials/issue', form);
      toast.success('Credential issued & signed on Ethereum');
      setForm({ employee_id: '', credential_type: 'degree', title: '', issuer_name: '', issue_date: '', credential_id: '', description: '' });
      await loadCredentials();
      setTab('list');
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setIssuing(false);
    }
  };

  const handleAnchor = async (uid) => {
    if (!window.confirm('Anchor this credential on Sepolia blockchain? (Requires test ETH)')) return;
    try {
      const { data } = await api.post(`/blockchain/credentials/${uid}/anchor`);
      toast.success(`Anchored! Tx: ${data.tx_hash?.slice(0, 12)}...`);
      await loadCredentials();
      await loadStatus();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleRevoke = async (uid) => {
    if (!window.confirm('Revoke this credential? It will become invalid.')) return;
    try {
      await api.post(`/blockchain/credentials/${uid}/revoke`);
      toast.success('Credential revoked');
      await loadCredentials();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setVerifyResult(null);
    try {
      let payload;
      try {
        payload = JSON.parse(verifyPayload);
      } catch {
        toast.error('Invalid JSON in payload');
        setVerifying(false);
        return;
      }
      const { data } = await api.post('/blockchain/credentials/verify', {
        payload,
        signature: verifySignature.trim(),
      });
      setVerifyResult(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setVerifying(false);
    }
  };

  const loadInVerifier = (cred) => {
    setVerifyPayload(JSON.stringify(cred.payload, null, 2));
    setVerifySignature(cred.signature);
    setVerifyResult(null);
    setTab('verify');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="blockchain-credentials-page">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Blockchain Credentials</h1>
              <Badge variant="outline" className="ml-2 border-amber-500/30 text-amber-600">
                Ethereum Sepolia
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Tamper-proof employee credentials signed with EIP-191 on Ethereum.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadStatus(); loadCredentials(); }} data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Network Status Strip */}
        {status && (
          <Card className="border-dashed">
            <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <div className="flex items-center gap-1 font-medium">
                  <span className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {status.connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Wallet</p>
                <a href={status.explorer_address} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs hover:text-primary inline-flex items-center gap-1" data-testid="wallet-link">
                  <Truncate text={status.wallet_address} /> <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Balance</p>
                <div className="font-medium flex items-center gap-2">
                  <span>{status.balance_eth?.toFixed(6)} ETH</span>
                  {status.balance_eth < status.min_anchor_eth && (
                    <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600">Low</Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Anchoring</p>
                <p className="font-medium">
                  {status.balance_eth >= status.min_anchor_eth ? 'Available' : 'Needs faucet'}
                </p>
              </div>
            </CardContent>
            {status.balance_eth < status.min_anchor_eth && (
              <div className="px-4 pb-4 -mt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertCircle className="w-3 h-3" /> Off-chain signing works. To enable on-chain anchoring, fund the wallet at:
                </span>
                {' '}
                {status.faucets?.map((f, i) => (
                  <a key={i} href={f} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary mr-2">
                    Faucet {i + 1}
                  </a>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {[
            { id: 'list', label: 'All Credentials', icon: FileBadge },
            ...(isHR ? [{ id: 'issue', label: 'Issue New', icon: Plus }] : []),
            { id: 'verify', label: 'Verify', icon: CheckCircle2 },
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

        {/* LIST TAB */}
        {tab === 'list' && (
          <Card>
            <CardHeader>
              <CardTitle>Issued Credentials</CardTitle>
              <CardDescription>
                {isHR ? 'All credentials in your tenant' : 'Your verified credentials'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : credentials.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No credentials yet</p>
                  {isHR && (
                    <Button variant="link" onClick={() => setTab('issue')} className="mt-2" data-testid="empty-issue-btn">
                      Issue your first credential →
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {credentials.map(c => (
                    <div
                      key={c.credential_uid}
                      className="p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
                      data-testid={`credential-row-${c.credential_uid}`}
                    >
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{c.title}</span>
                            <Badge variant="secondary" className="text-xs capitalize">{c.credential_type?.replace('_', ' ')}</Badge>
                            {c.revoked && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
                            {c.onchain_anchored && (
                              <Badge className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30">
                                <Anchor className="w-3 h-3 mr-1" /> On-chain
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {c.payload?.issuer_name} • Issued to <strong>{c.payload?.employee_name || c.employee_id}</strong> on {c.payload?.issue_date}
                          </p>
                          <div className="mt-2 text-xs font-mono text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>Hash: <Truncate text={c.hash} /></span>
                            <CopyBtn value={c.hash} label="Hash" />
                            {c.onchain_tx_hash && (
                              <a href={`https://sepolia.etherscan.io/tx/${c.onchain_tx_hash}`} target="_blank" rel="noopener noreferrer"
                                className="text-primary inline-flex items-center gap-1 hover:underline">
                                <Link2 className="w-3 h-3" /> Etherscan
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => loadInVerifier(c)} data-testid="verify-btn">
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Verify
                          </Button>
                          {isHR && !c.onchain_anchored && !c.revoked && (
                            <Button size="sm" variant="outline" onClick={() => handleAnchor(c.credential_uid)}
                              disabled={(status?.balance_eth || 0) < (status?.min_anchor_eth || 0.001)}
                              data-testid="anchor-btn">
                              <Anchor className="w-4 h-4 mr-1" /> Anchor
                            </Button>
                          )}
                          {isHR && !c.revoked && (
                            <Button size="sm" variant="ghost" onClick={() => handleRevoke(c.credential_uid)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                              data-testid="revoke-btn">
                              <Ban className="w-4 h-4 mr-1" /> Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ISSUE TAB */}
        {tab === 'issue' && isHR && (
          <Card>
            <CardHeader>
              <CardTitle>Issue New Credential</CardTitle>
              <CardDescription>Credential payload will be hashed (SHA-256) and signed with the company Ethereum wallet using EIP-191.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleIssue} className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="issue-form">
                <div>
                  <Label htmlFor="employee_id">Employee ID *</Label>
                  <Input id="employee_id" value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    placeholder="EMP-ACME-002" required data-testid="employee_id-input" />
                </div>
                <div>
                  <Label htmlFor="credential_type">Credential Type *</Label>
                  <select id="credential_type"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={form.credential_type}
                    onChange={(e) => setForm({ ...form, credential_type: e.target.value })}
                    data-testid="credential_type-select">
                    {CRED_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="B.Tech in Computer Science" required data-testid="title-input" />
                </div>
                <div>
                  <Label htmlFor="issuer_name">Issuing Institution *</Label>
                  <Input id="issuer_name" value={form.issuer_name}
                    onChange={(e) => setForm({ ...form, issuer_name: e.target.value })}
                    placeholder="IIT Delhi / AWS / etc." required data-testid="issuer-input" />
                </div>
                <div>
                  <Label htmlFor="issue_date">Issue Date *</Label>
                  <Input id="issue_date" type="date" value={form.issue_date}
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    required data-testid="issue-date-input" />
                </div>
                <div>
                  <Label htmlFor="credential_id">External Credential ID</Label>
                  <Input id="credential_id" value={form.credential_id}
                    onChange={(e) => setForm({ ...form, credential_id: e.target.value })}
                    placeholder="Optional reference number" data-testid="cred-id-input" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2} placeholder="Optional details" data-testid="description-input" />
                </div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setTab('list')} data-testid="cancel-issue">Cancel</Button>
                  <Button type="submit" disabled={issuing} data-testid="submit-issue">
                    {issuing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                    {issuing ? 'Signing…' : 'Issue & Sign'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* VERIFY TAB */}
        {tab === 'verify' && (
          <Card>
            <CardHeader>
              <CardTitle>Verify a Credential</CardTitle>
              <CardDescription>
                Paste the credential payload (JSON) and signature. Anyone can verify — no login required for the verify endpoint.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4" data-testid="verify-form">
                <div>
                  <Label htmlFor="payload">Credential Payload (JSON)</Label>
                  <Textarea id="payload" value={verifyPayload}
                    onChange={(e) => setVerifyPayload(e.target.value)}
                    rows={8} className="font-mono text-xs"
                    placeholder='{"credential_uid":"...","employee_id":"...",...}'
                    data-testid="verify-payload" />
                </div>
                <div>
                  <Label htmlFor="signature">Signature (hex)</Label>
                  <Textarea id="signature" value={verifySignature}
                    onChange={(e) => setVerifySignature(e.target.value)}
                    rows={2} className="font-mono text-xs"
                    placeholder="0x... or just the hex"
                    data-testid="verify-signature" />
                </div>
                <Button type="submit" disabled={verifying} data-testid="submit-verify">
                  {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Verify Signature
                </Button>
              </form>

              {verifyResult && (
                <div className={`mt-6 p-4 rounded-lg border-2 ${
                  verifyResult.valid
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`} data-testid="verify-result">
                  <div className="flex items-center gap-2 mb-3">
                    {verifyResult.valid ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Valid Credential</h3>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-6 h-6 text-red-600" />
                        <h3 className="text-lg font-bold text-red-700 dark:text-red-400">
                          {verifyResult.revoked ? 'Revoked Credential' : 'Invalid Credential'}
                        </h3>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Recovered signer</p>
                      <p className="font-mono break-all">{verifyResult.recovered_address}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expected issuer</p>
                      <p className="font-mono break-all">{verifyResult.expected_issuer}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-muted-foreground">Recomputed hash</p>
                      <p className="font-mono break-all text-xs">{verifyResult.recomputed_hash}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Signature valid</p>
                      <p>{verifyResult.signature_valid ? '✅ Yes' : '❌ No'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">On-chain anchor</p>
                      {verifyResult.etherscan_tx_url ? (
                        <a href={verifyResult.etherscan_tx_url} target="_blank" rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1 hover:underline">
                          View on Etherscan <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : '— Not anchored'}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
