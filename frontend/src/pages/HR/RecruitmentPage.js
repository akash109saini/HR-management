import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../../lib/api';
import DashboardLayout from '../../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Plus, Briefcase, Users } from 'lucide-react';

export default function RecruitmentPage() {
  const [jobs, setJobs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobForm, setJobForm] = useState({ title: '', department: '', description: '', requirements: '', location: '', salary_range: '' });
  const [appForm, setAppForm] = useState({ job_id: '', name: '', email: '', phone: '', resume_text: '' });
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [jRes, aRes] = await Promise.all([
        api.get('/recruitment/jobs'),
        api.get('/recruitment/applicants')
      ]);
      setJobs(jRes.data);
      setApplicants(aRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateJob = async () => {
    setError('');
    try {
      await api.post('/recruitment/jobs', jobForm);
      setShowCreateJob(false);
      setJobForm({ title: '', department: '', description: '', requirements: '', location: '', salary_range: '' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const handleAddApplicant = async () => {
    setError('');
    try {
      await api.post('/recruitment/applicants', appForm);
      setShowAddApplicant(false);
      setAppForm({ job_id: '', name: '', email: '', phone: '', resume_text: '' });
      fetchData();
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
  };

  const updateApplicantStatus = async (id, status) => {
    try {
      await api.put(`/recruitment/applicants/${id}`, { status });
      fetchData();
    } catch { /* ignore */ }
  };

  const updateJobStatus = async (id, status) => {
    try {
      await api.put(`/recruitment/jobs/${id}`, { status });
      fetchData();
    } catch { /* ignore */ }
  };

  const statusColors = { applied: 'secondary', screening: 'outline', interview: 'default', offered: 'default', hired: 'default', rejected: 'destructive' };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="hr-recruitment-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-['Outfit']">Recruitment</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage job postings and applicants</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={showCreateJob} onOpenChange={setShowCreateJob}>
              <DialogTrigger asChild>
                <Button data-testid="create-job-btn"><Plus size={16} className="mr-2" />New Job</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Job Posting</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Title</Label><Input value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} data-testid="job-title-input" /></div>
                    <div className="space-y-2"><Label>Department</Label><Input value={jobForm.department} onChange={e => setJobForm({...jobForm, department: e.target.value})} data-testid="job-dept-input" /></div>
                  </div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})} rows={3} data-testid="job-desc-input" /></div>
                  <div className="space-y-2"><Label>Requirements</Label><Textarea value={jobForm.requirements} onChange={e => setJobForm({...jobForm, requirements: e.target.value})} rows={2} data-testid="job-req-input" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Location</Label><Input value={jobForm.location} onChange={e => setJobForm({...jobForm, location: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Salary Range</Label><Input value={jobForm.salary_range} onChange={e => setJobForm({...jobForm, salary_range: e.target.value})} /></div>
                  </div>
                  <Button onClick={handleCreateJob} className="w-full" data-testid="submit-job-btn">Create Job Posting</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showAddApplicant} onOpenChange={setShowAddApplicant}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="add-applicant-btn"><Users size={16} className="mr-2" />Add Applicant</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Applicant</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  {error && <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                  <div className="space-y-2">
                    <Label>Job Posting</Label>
                    <Select value={appForm.job_id} onValueChange={v => setAppForm({...appForm, job_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Select job" /></SelectTrigger>
                      <SelectContent>
                        {jobs.filter(j => j.status === 'open').map(j => (
                          <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Name</Label><Input value={appForm.name} onChange={e => setAppForm({...appForm, name: e.target.value})} data-testid="applicant-name-input" /></div>
                    <div className="space-y-2"><Label>Email</Label><Input value={appForm.email} onChange={e => setAppForm({...appForm, email: e.target.value})} data-testid="applicant-email-input" /></div>
                  </div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={appForm.phone} onChange={e => setAppForm({...appForm, phone: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Resume Summary</Label><Textarea value={appForm.resume_text} onChange={e => setAppForm({...appForm, resume_text: e.target.value})} rows={3} /></div>
                  <Button onClick={handleAddApplicant} className="w-full" data-testid="submit-applicant-btn">Add Applicant</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Job Postings */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {jobs.map((j, i) => (
            <Card key={j.id} className="border border-border hover:-translate-y-1 hover:shadow-md transition-all duration-200 animate-fade-in" data-testid={`job-card-${i}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">{j.title}</h3>
                    <p className="text-xs text-muted-foreground">{j.department} | {j.location}</p>
                  </div>
                  <Badge variant={j.status === 'open' ? 'default' : 'secondary'}>{j.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{j.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{j.salary_range}</span>
                  <span>{j.applicant_count || 0} applicants</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {j.status === 'open' && (
                    <Button size="sm" variant="outline" onClick={() => updateJobStatus(j.id, 'closed')} data-testid={`close-job-${i}-btn`}>Close</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelectedJob(selectedJob === j.id ? null : j.id)}>
                    {selectedJob === j.id ? 'Hide' : 'View'} Applicants
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Applicants Table for Selected Job */}
        {selectedJob && (
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-lg font-['Outfit']">Applicants</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applicants.filter(a => a.job_id === selectedJob).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No applicants</TableCell></TableRow>
                    ) : applicants.filter(a => a.job_id === selectedJob).map((a, i) => (
                      <TableRow key={a.id} data-testid={`applicant-row-${i}`}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-muted-foreground">{a.email}</TableCell>
                        <TableCell>{a.phone}</TableCell>
                        <TableCell><Badge variant={statusColors[a.status] || 'secondary'}>{a.status}</Badge></TableCell>
                        <TableCell>
                          <Select value={a.status} onValueChange={v => updateApplicantStatus(a.id, v)}>
                            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['applied', 'screening', 'interview', 'offered', 'hired', 'rejected'].map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
