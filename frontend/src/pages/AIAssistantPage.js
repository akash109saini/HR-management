import React, { useState, useRef, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Bot, Send, User, Sparkles, TrendingDown, FileText, Brain, ChevronRight, Loader2, Paperclip, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const QUICK_QUESTIONS = [
  'How many leaves do I have left?',
  'What is the leave policy?',
  'How do I apply for leave?',
  'When is the next pay day?',
  'What are the office hours?',
];

export default function AIAssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `✨ Hello ${user?.name || 'there'}! I'm your AI HR Assistant powered by Google Gemini. Ask me anything about your leaves, payslips, attendance, policies, or career development!`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(`chat_${user?.id}_${Date.now()}`);
  const [activeTab, setActiveTab] = useState('chat');

  // Sentiment analysis
  const [sentimentText, setSentimentText] = useState('');
  const [sentimentResult, setSentimentResult] = useState(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  // Attrition risk
  const [attritionResult, setAttritionResult] = useState(null);
  const [attritionLoading, setAttritionLoading] = useState(false);

  // Career path
  const [careerResult, setCareerResult] = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);

  // Multimodal file attachment state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} is too large (max 10MB)`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1];
        setSelectedFiles(prev => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            data: base64Data,
            rawFile: file
          }
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (text) => {
    if (!text.trim() && selectedFiles.length === 0 || loading) return;

    const userMsg = {
      role: 'user',
      content: text + (selectedFiles.length > 0 ? `\n\n[Attached ${selectedFiles.length} file(s): ${selectedFiles.map(f => f.name).join(', ')}]` : '')
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const filesPayload = selectedFiles.map(f => ({
      name: f.name,
      type: f.type,
      data: f.data
    }));

    setSelectedFiles([]);

    try {
      const { data } = await api.post('/ai/chat', {
        message: text,
        session_id: sessionId,
        files: filesPayload
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${formatApiError(err.response?.data?.detail) || 'Error connecting to AI'}` }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || selectedFiles.length > 0) {
        sendMessage(input);
      }
    }
  };

  const analyzeSentiment = async () => {
    if (!sentimentText.trim()) return;
    setSentimentLoading(true);
    try {
      const { data } = await api.post('/ai/sentiment', { text: sentimentText, context: 'HR feedback' });
      setSentimentResult(data);
    } catch (err) {
      setSentimentResult({ error: formatApiError(err.response?.data?.detail) });
    }
    setSentimentLoading(false);
  };

  const getAttritionRisk = async () => {
    if (!user?.employee_id) return;
    setAttritionLoading(true);
    try {
      const { data } = await api.get(`/ai/attrition-risk/${user.employee_id}`);
      setAttritionResult(data);
    } catch (err) {
      setAttritionResult({ error: formatApiError(err.response?.data?.detail) });
    }
    setAttritionLoading(false);
  };

  const getCareerPath = async () => {
    if (!user?.employee_id) return;
    setCareerLoading(true);
    try {
      const { data } = await api.get(`/ai/career-path/${user.employee_id}`);
      setCareerResult(data);
    } catch (err) {
      setCareerResult({ error: formatApiError(err.response?.data?.detail) });
    }
    setCareerLoading(false);
  };

  const riskColor = (score) => {
    if (score < 25) return 'text-emerald-600';
    if (score < 50) return 'text-yellow-600';
    if (score < 75) return 'text-orange-600';
    return 'text-red-600';
  };

  const sentimentBadge = (sentiment) => {
    const map = { positive: 'bg-emerald-100 text-emerald-700', negative: 'bg-red-100 text-red-700', neutral: 'bg-gray-100 text-gray-700', mixed: 'bg-yellow-100 text-yellow-700' };
    return map[sentiment] || 'bg-gray-100 text-gray-700';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-['Outfit']">AI HR Assistant</h1>
            <p className="text-sm text-muted-foreground">Powered by Google Gemini — Ask anything about HR, analyze sentiment, predict risks</p>
          </div>
          <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200">Live</Badge>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {[
            { id: 'chat', label: 'HR Chat', icon: Bot },
            { id: 'sentiment', label: 'Sentiment Analysis', icon: Brain },
            { id: 'attrition', label: 'Attrition Risk', icon: TrendingDown },
            { id: 'career', label: 'Career Path', icon: Sparkles },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <tab.icon size={16} />{tab.label}
            </button>
          ))}
        </div>

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <Card className="border border-border h-[520px] flex flex-col">
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot size={16} className="text-primary" />
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                        {msg.content}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                          <User size={16} />
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot size={16} className="text-primary" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </CardContent>
                <div className="p-4 border-t border-border flex flex-col gap-3">
                  {/* File Previews */}
                  {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-muted/40 border border-border rounded-lg">
                      {selectedFiles.map((file, idx) => {
                        const isImage = file.type.startsWith('image/');
                        return (
                          <div key={idx} className="relative group flex items-center gap-2 bg-card border border-border p-1.5 rounded-md pr-8 max-w-[180px]">
                            {isImage ? (
                              <img
                                src={URL.createObjectURL(file.rawFile)}
                                alt={file.name}
                                className="w-8 h-8 object-cover rounded"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                                <FileText size={16} />
                              </div>
                            )}
                            <span className="text-xs font-medium truncate max-w-[100px]">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 items-end">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      multiple
                      accept="image/*,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className="flex-shrink-0 h-10 w-10 border-border hover:bg-muted"
                    >
                      <Paperclip size={16} className="text-muted-foreground" />
                    </Button>

                    <Textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message... (Shift + Enter for new line)"
                      disabled={loading}
                      rows={1}
                      className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2 px-3 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary rounded-lg text-sm"
                    />

                    <Button type="submit" disabled={loading || (!input.trim() && selectedFiles.length === 0)} size="icon" className="h-10 w-10 flex-shrink-0">
                      <Send size={16} />
                    </Button>
                  </form>
                </div>
              </Card>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Quick Questions</p>
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="w-full text-left text-sm p-3 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex items-center justify-between gap-2 group">
                  <span>{q}</span>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SENTIMENT TAB */}
        {activeTab === 'sentiment' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border border-border">
              <CardHeader><CardTitle className="text-base font-['Outfit'] flex items-center gap-2"><Brain size={18} className="text-primary" />Analyze Employee Feedback</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  value={sentimentText}
                  onChange={e => setSentimentText(e.target.value)}
                  placeholder="Paste employee feedback, survey response, or any text to analyze sentiment..."
                  className="w-full min-h-[180px] text-sm p-3 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button onClick={analyzeSentiment} disabled={sentimentLoading || !sentimentText.trim()} className="w-full">
                  {sentimentLoading ? <><Loader2 size={16} className="animate-spin mr-2" />Analyzing...</> : 'Analyze Sentiment'}
                </Button>
              </CardContent>
            </Card>
            {sentimentResult && !sentimentResult.error && (
              <Card className="border border-border">
                <CardHeader><CardTitle className="text-base font-['Outfit']">Analysis Result</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Sentiment:</span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${sentimentBadge(sentimentResult.sentiment)}`}>
                      {sentimentResult.sentiment?.toUpperCase()}
                    </span>
                    <span className="text-sm text-muted-foreground ml-auto">Score: {sentimentResult.score?.toFixed(2)}</span>
                  </div>
                  {sentimentResult.emotions?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Detected emotions:</p>
                      <div className="flex flex-wrap gap-1">
                        {sentimentResult.emotions.map((e, i) => <Badge key={i} variant="outline" className="text-xs">{e}</Badge>)}
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-foreground bg-muted p-3 rounded-md">{sentimentResult.summary}</p>
                  {sentimentResult.action_needed && (
                    <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-sm text-amber-700">
                      ⚠️ <strong>Action Needed:</strong> {sentimentResult.recommended_action}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ATTRITION RISK TAB */}
        {activeTab === 'attrition' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border border-border">
              <CardHeader><CardTitle className="text-base font-['Outfit'] flex items-center gap-2"><TrendingDown size={18} className="text-primary" />Predict Your Attrition Risk</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">AI analyzes your attendance patterns, leave history, and engagement data to assess attrition risk.</p>
                <Button onClick={getAttritionRisk} disabled={attritionLoading} className="w-full">
                  {attritionLoading ? <><Loader2 size={16} className="animate-spin mr-2" />Analyzing...</> : 'Run Attrition Analysis'}
                </Button>
              </CardContent>
            </Card>
            {attritionResult && !attritionResult.error && (
              <Card className="border border-border">
                <CardHeader><CardTitle className="text-base font-['Outfit']">Risk Assessment</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className={`text-5xl font-bold ${riskColor(attritionResult.risk_score)}`}>{attritionResult.risk_score}</p>
                      <p className="text-xs text-muted-foreground mt-1">Risk Score / 100</p>
                    </div>
                    <div>
                      <Badge className={`text-sm ${attritionResult.risk_level === 'low' ? 'bg-emerald-100 text-emerald-700' : attritionResult.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {attritionResult.risk_level?.toUpperCase()} RISK
                      </Badge>
                      <p className="text-sm mt-2 text-muted-foreground">{attritionResult.summary}</p>
                    </div>
                  </div>
                  {attritionResult.key_factors?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Key Factors:</p>
                      <ul className="space-y-1">{attritionResult.key_factors.map((f, i) => <li key={i} className="text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />{f}</li>)}</ul>
                    </div>
                  )}
                  {attritionResult.recommendations?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations:</p>
                      <ul className="space-y-1">{attritionResult.recommendations.map((r, i) => <li key={i} className="text-sm flex items-center gap-2"><ChevronRight size={14} className="text-primary flex-shrink-0" />{r}</li>)}</ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* CAREER PATH TAB */}
        {activeTab === 'career' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button onClick={getCareerPath} disabled={careerLoading}>
                {careerLoading ? <><Loader2 size={16} className="animate-spin mr-2" />Generating...</> : <><Sparkles size={16} className="mr-2" />Generate My Career Path</>}
              </Button>
            </div>
            {careerResult && !careerResult.error && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border border-border">
                  <CardHeader><CardTitle className="text-sm font-['Outfit']">🚀 Next Role Suggestions</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {careerResult.suggested_next_roles?.map((role, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted">
                        <ChevronRight size={16} className="text-primary" />
                        <span className="text-sm font-medium">{role}</span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-2">Timeline: {careerResult.timeline}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border">
                  <CardHeader><CardTitle className="text-sm font-['Outfit']">📚 Recommended Courses</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {careerResult.recommended_courses?.slice(0, 4).map((course, i) => (
                      <div key={i} className="p-2 rounded-md border border-border">
                        <p className="text-sm font-medium">{course.name}</p>
                        <p className="text-xs text-muted-foreground">{course.platform} · {course.duration}</p>
                        <Badge variant="outline" className="text-xs mt-1">{course.priority}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="border border-border md:col-span-2">
                  <CardHeader><CardTitle className="text-sm font-['Outfit']">💡 Career Advice</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed">{careerResult.career_summary}</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
