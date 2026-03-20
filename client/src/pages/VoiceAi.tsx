import React, { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Plus, Pencil, Trash2, Copy, Play, Pause, MessageSquare,
  BarChart3, Clock, Phone, PhoneOff, Zap, Settings, Loader2,
  ChevronDown, ChevronUp, Mic, Volume2, Brain, Shield, ArrowRight,
  Rocket, RefreshCw, CheckCircle2, XCircle, Terminal, Upload, Server,
  Activity, ArrowUpCircle, ArrowDownCircle, AlertTriangle, History,
} from "lucide-react";

const OPENAI_VOICES = [
  { id: "coral", label: "Coral", desc: "Warm, natural (recommended)" },
  { id: "marin", label: "Marin", desc: "Smooth, professional (recommended)" },
  { id: "cedar", label: "Cedar", desc: "Rich, authoritative" },
  { id: "alloy", label: "Alloy", desc: "Neutral, balanced" },
  { id: "ash", label: "Ash", desc: "Clear, conversational" },
  { id: "ballad", label: "Ballad", desc: "Expressive, dynamic" },
  { id: "echo", label: "Echo", desc: "Warm, friendly" },
  { id: "sage", label: "Sage", desc: "Calm, thoughtful" },
  { id: "shimmer", label: "Shimmer", desc: "Bright, energetic" },
  { id: "verse", label: "Verse", desc: "Articulate, precise" },
];

const DEFAULT_SYSTEM_PROMPT = `You are a professional AI phone agent for {{company_name}}. You are calling {{contact_name}} regarding their account.

Your goals:
1. Greet the contact politely and identify yourself
2. Deliver the campaign message clearly and naturally
3. Answer any questions the contact may have
4. If requested, transfer to a live agent
5. Always remain professional, empathetic, and compliant

Rules:
- Never reveal you are an AI unless directly asked
- Do not discuss topics outside the scope of the call
- If the contact asks to be removed from the call list, acknowledge and end the call
- Keep responses concise — this is a phone call, not a chat`;

const FUNCTION_TEMPLATES = [
  { name: "transfer_to_agent", description: "Transfer the call to a live human agent", parameters: '{"reason": "string"}' },
  { name: "schedule_callback", description: "Schedule a callback at a specific time", parameters: '{"datetime": "string", "phone": "string"}' },
  { name: "opt_out", description: "Add the contact to the Do Not Call list", parameters: '{"reason": "string"}' },
  { name: "collect_payment", description: "Initiate payment collection", parameters: '{"amount": "number", "method": "string"}' },
  { name: "verify_identity", description: "Verify the contact's identity", parameters: '{"last4ssn": "string", "dob": "string"}' },
  { name: "send_sms", description: "Send an SMS to the contact", parameters: '{"message": "string"}' },
];

type PromptForm = {
  name: string;
  systemPrompt: string;
  voice: string;
  temperature: number;
  maxTokens: number;
  interruptionThreshold: number;
  silenceTimeout: number;
  maxDuration: number;
  enableFunctions: boolean;
  functions: string;
  complianceMode: string;
  greeting: string;
  fallbackMessage: string;
  endCallPhrases: string;
  isActive: boolean;
};

const DEFAULT_PROMPT: PromptForm = {
  name: "",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  voice: "nova",
  temperature: 0.7,
  maxTokens: 150,
  interruptionThreshold: 0.5,
  silenceTimeout: 5,
  maxDuration: 300,
  enableFunctions: true,
  functions: JSON.stringify(FUNCTION_TEMPLATES.slice(0, 3), null, 2),
  complianceMode: "standard",
  greeting: "Hello, this is {{agent_name}} calling from {{company_name}}. Am I speaking with {{contact_name}}?",
  fallbackMessage: "I'm sorry, I didn't quite catch that. Could you please repeat?",
  endCallPhrases: "goodbye, hang up, stop calling, remove me, do not call",
  isActive: true,
};

export default function VoiceAi() {
  const [activeTab, setActiveTab] = useState("prompts");
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [form, setForm] = useState<PromptForm>(DEFAULT_PROMPT);
  const [expandedConvo, setExpandedConvo] = useState<number | null>(null);

  // tRPC queries
  const prompts = trpc.voiceAi.listPrompts.useQuery();
  const conversations = trpc.voiceAi.listConversations.useQuery({ limit: 50 });
  const analytics = trpc.voiceAi.getStats.useQuery();
  const utils = trpc.useUtils();

  const createPrompt = trpc.voiceAi.createPrompt.useMutation({
    onSuccess: () => { utils.voiceAi.listPrompts.invalidate(); setPromptDialogOpen(false); toast.success("Prompt created"); },
    onError: (e) => toast.error(e.message),
  });
  const updatePrompt = trpc.voiceAi.updatePrompt.useMutation({
    onSuccess: () => { utils.voiceAi.listPrompts.invalidate(); setPromptDialogOpen(false); toast.success("Prompt updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deletePrompt = trpc.voiceAi.deletePrompt.useMutation({
    onSuccess: () => { utils.voiceAi.listPrompts.invalidate(); toast.success("Prompt deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const openCreateDialog = () => {
    setEditingPromptId(null);
    setForm(DEFAULT_PROMPT);
    setPromptDialogOpen(true);
  };

  const openEditDialog = (p: any) => {
    setEditingPromptId(p.id);
    setForm({
      name: p.name,
      systemPrompt: p.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      voice: p.voice || "nova",
      temperature: p.temperature ?? 0.7,
      maxTokens: p.maxTokens ?? 150,
      interruptionThreshold: p.interruptionThreshold ?? 0.5,
      silenceTimeout: p.silenceTimeout ?? 5,
      maxDuration: p.maxDuration ?? 300,
      enableFunctions: !!p.enableFunctions,
      functions: p.functions || "[]",
      complianceMode: p.complianceMode || "standard",
      greeting: p.greeting || "",
      fallbackMessage: p.fallbackMessage || "",
      endCallPhrases: p.endCallPhrases || "",
      isActive: p.isActive !== false,
    });
    setPromptDialogOpen(true);
  };

  const submitPrompt = () => {
    const data = {
      name: form.name,
      systemPrompt: form.systemPrompt,
      voice: form.voice,
      temperature: String(form.temperature),
      openingMessage: form.greeting || undefined,
      silenceTimeout: form.silenceTimeout,
      maxConversationDuration: form.maxDuration,
      requireAiDisclosure: form.complianceMode !== "standard" ? 1 : 0,
      enabledTools: form.enableFunctions ? ["transfer_to_agent", "schedule_callback"] : undefined,
      isDefault: form.isActive ? 0 : 0,
    };
    if (editingPromptId) {
      updatePrompt.mutate({ id: editingPromptId, ...data });
    } else {
      createPrompt.mutate(data);
    }
  };

  const formatDuration = (secs: number) => {
    if (!secs) return "0s";
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const rawStats = analytics.data || {
    total: 0, completed: 0, escalated: 0, errors: 0, avgDuration: 0, avgTurns: 0,
    promiseToPay: 0, paymentMade: 0, callbackScheduled: 0, disputed: 0,
  };
  const analyticsData = {
    totalConversations: rawStats.total || 0,
    avgDuration: rawStats.avgDuration || 0,
    successRate: rawStats.total ? ((rawStats.completed || 0) / rawStats.total) * 100 : 0,
    transferRate: rawStats.total ? ((rawStats.escalated || 0) / rawStats.total) * 100 : 0,
    avgSentiment: 0,
    totalCost: 0,
    avgTurns: rawStats.avgTurns || 0,
    promiseToPay: rawStats.promiseToPay || 0,
    paymentMade: rawStats.paymentMade || 0,
    callbackScheduled: rawStats.callbackScheduled || 0,
    disputed: rawStats.disputed || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Voice AI
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage AI conversation prompts, view transcripts, and track performance
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>Total Calls</span>
              </div>
              <p className="text-2xl font-bold mt-1">{analyticsData.totalConversations}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Avg Duration</span>
              </div>
              <p className="text-2xl font-bold mt-1">{formatDuration(Math.round(analyticsData.avgDuration))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>Success Rate</span>
              </div>
              <p className="text-2xl font-bold mt-1">{analyticsData.successRate.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
                <span>Transfer Rate</span>
              </div>
              <p className="text-2xl font-bold mt-1">{analyticsData.transferRate.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto gap-1 p-1">
            <TabsTrigger value="prompts" className="gap-1.5 text-xs sm:text-sm"><Brain className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />Prompts</TabsTrigger>
            <TabsTrigger value="conversations" className="gap-1.5 text-xs sm:text-sm"><MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />Conversations</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm"><BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />Analytics</TabsTrigger>
            <TabsTrigger value="deploy" className="gap-1.5 text-xs sm:text-sm"><Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />Deploy</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm"><Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />Bridge Log</TabsTrigger>
          </TabsList>

          {/* ─── Prompts Tab ─── */}
          <TabsContent value="prompts" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">
                Configure AI agent behavior, voice, and function calling for each campaign type.
              </p>
              <Button onClick={openCreateDialog} className="gap-1.5">
                <Plus className="h-4 w-4" />New Prompt
              </Button>
            </div>

            {prompts.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !prompts.data?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg">No Voice AI Prompts</h3>
                  <p className="text-muted-foreground mt-1 mb-4">Create your first prompt to configure how the AI agent behaves during calls.</p>
                  <Button onClick={openCreateDialog} className="gap-1.5"><Plus className="h-4 w-4" />Create Prompt</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {prompts.data.map((p: any) => (
                  <Card key={p.id} className={!p.isActive ? "opacity-60" : ""}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{p.name}</h3>
                            <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                              {p.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline" className="text-xs gap-1">
                              <Volume2 className="h-3 w-3" />{p.voice || "nova"}
                            </Badge>
                            {p.complianceMode && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Shield className="h-3 w-3" />{p.complianceMode}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.systemPrompt?.slice(0, 200)}...</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Temp: {p.temperature ?? 0.7}</span>
                            <span>Max tokens: {p.maxTokens ?? 150}</span>
                            <span>Max duration: {formatDuration(p.maxDuration ?? 300)}</span>
                            {p.enableFunctions ? <span className="text-primary">Functions enabled</span> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-4">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            openCreateDialog();
                            setTimeout(() => {
                              setForm(prev => ({
                                ...prev,
                                name: `${p.name} (copy)`,
                                systemPrompt: p.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                                voice: p.voice || "nova",
                                temperature: p.temperature ?? 0.7,
                                maxTokens: p.maxTokens ?? 150,
                                functions: p.functions || "[]",
                              }));
                            }, 0);
                          }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                            if (confirm("Delete this prompt?")) deletePrompt.mutate({ id: p.id });
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Conversations Tab ─── */}
          <TabsContent value="conversations" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Review AI conversation transcripts, sentiment analysis, and call outcomes.
            </p>

            {conversations.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !conversations.data?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg">No Conversations Yet</h3>
                  <p className="text-muted-foreground mt-1">Voice AI conversations will appear here once campaigns start running.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {conversations.data.map((c: any) => (
                  <Card key={c.id} className="cursor-pointer" onClick={() => setExpandedConvo(expandedConvo === c.id ? null : c.id)}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            c.outcome === "success" ? "bg-emerald-500/10 text-emerald-500" :
                            c.outcome === "transferred" ? "bg-blue-500/10 text-blue-500" :
                            c.outcome === "voicemail" ? "bg-amber-500/10 text-amber-500" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {c.outcome === "success" ? <Zap className="h-4 w-4" /> :
                             c.outcome === "transferred" ? <ArrowRight className="h-4 w-4" /> :
                             <Phone className="h-4 w-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{c.contactName || c.contactPhone}</span>
                              <Badge variant="outline" className="text-[10px]">{c.outcome || "unknown"}</Badge>
                              {c.sentimentScore != null && (
                                <Badge variant={c.sentimentScore > 0.3 ? "default" : c.sentimentScore < -0.3 ? "destructive" : "secondary"} className="text-[10px]">
                                  {c.sentimentScore > 0.3 ? "Positive" : c.sentimentScore < -0.3 ? "Negative" : "Neutral"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>{new Date(c.startedAt).toLocaleString()}</span>
                              <span>{formatDuration(c.durationSecs || 0)}</span>
                              <span>{c.turnCount || 0} turns</span>
                            </div>
                          </div>
                        </div>
                        {expandedConvo === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>

                      {/* Expanded Transcript */}
                      {expandedConvo === c.id && c.transcript && (
                        <div className="mt-4 pt-3 border-t space-y-2">
                          <h4 className="text-sm font-medium mb-2">Transcript</h4>
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {(typeof c.transcript === "string" ? JSON.parse(c.transcript) : c.transcript).map((turn: any, i: number) => (
                              <div key={i} className={`flex gap-2 ${turn.role === "assistant" ? "" : "flex-row-reverse"}`}>
                                <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                                  turn.role === "assistant"
                                    ? "bg-primary/10 text-foreground"
                                    : "bg-muted text-foreground"
                                }`}>
                                  <div className="text-[10px] text-muted-foreground mb-0.5">
                                    {turn.role === "assistant" ? "AI Agent" : "Contact"}
                                  </div>
                                  {turn.content}
                                </div>
                              </div>
                            ))}
                          </div>
                          {c.functionCalls && (
                            <div className="mt-3 pt-2 border-t">
                              <h4 className="text-sm font-medium mb-1">Function Calls</h4>
                              <div className="space-y-1">
                                {(typeof c.functionCalls === "string" ? JSON.parse(c.functionCalls) : c.functionCalls).map((fc: any, i: number) => (
                                  <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1 font-mono">
                                    {fc.name}({JSON.stringify(fc.arguments)}) → {fc.result || "ok"}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {c.summary && (
                            <div className="mt-2 pt-2 border-t">
                              <h4 className="text-sm font-medium mb-1">AI Summary</h4>
                              <p className="text-sm text-muted-foreground">{c.summary}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Analytics Tab ─── */}
          <TabsContent value="analytics" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Conversation Outcomes</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Successful", value: analyticsData.successRate, color: "bg-emerald-500" },
                      { label: "Transferred", value: analyticsData.transferRate, color: "bg-blue-500" },
                      { label: "No Answer", value: Math.max(0, 100 - analyticsData.successRate - analyticsData.transferRate), color: "bg-muted" },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{item.label}</span>
                          <span className="font-medium">{item.value.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Performance Metrics</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg Sentiment Score</span>
                      <span className="font-medium">{analyticsData.avgSentiment.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg Call Duration</span>
                      <span className="font-medium">{formatDuration(Math.round(analyticsData.avgDuration))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Conversations</span>
                      <span className="font-medium">{analyticsData.totalConversations}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Est. Cost Savings</span>
                      <span className="font-medium text-emerald-500">
                        ${((analyticsData.totalConversations * 1.5) - analyticsData.totalCost).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Deploy & Manage Tab ─── */}
          <DeployTab />

          {/* ─── Bridge History Tab ─── */}
          <BridgeHistoryTab />
        </Tabs>

        {/* ─── Prompt Create/Edit Dialog ─── */}
        <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPromptId ? "Edit Voice AI Prompt" : "Create Voice AI Prompt"}</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="behavior" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
                <TabsTrigger value="behavior" className="text-xs sm:text-sm">Behavior</TabsTrigger>
                <TabsTrigger value="voice" className="text-xs sm:text-sm">Voice</TabsTrigger>
                <TabsTrigger value="functions" className="text-xs sm:text-sm">Functions</TabsTrigger>
                <TabsTrigger value="compliance" className="text-xs sm:text-sm">Compliance</TabsTrigger>
              </TabsList>

              <TabsContent value="behavior" className="space-y-4 mt-4">
                <div>
                  <Label>Prompt Name *</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Debt Collection Agent" />
                </div>
                <div>
                  <Label>System Prompt *</Label>
                  <Textarea
                    value={form.systemPrompt}
                    onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
                    className="min-h-[200px] font-mono text-sm"
                    placeholder="Define the AI agent's personality, goals, and rules..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Available variables: {"{{contact_name}}, {{company_name}}, {{campaign_name}}, {{agent_name}}, {{callback_number}}"}
                  </p>
                </div>
                <div>
                  <Label>Opening Greeting</Label>
                  <Textarea
                    value={form.greeting}
                    onChange={e => setForm(p => ({ ...p, greeting: e.target.value }))}
                    className="min-h-[60px]"
                    placeholder="Hello, this is {{agent_name}} calling from {{company_name}}..."
                  />
                </div>
                <div>
                  <Label>Fallback Message</Label>
                  <Input value={form.fallbackMessage} onChange={e => setForm(p => ({ ...p, fallbackMessage: e.target.value }))} placeholder="I'm sorry, could you repeat that?" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Temperature: {form.temperature}</Label>
                    <Slider value={[form.temperature]} onValueChange={([v]) => setForm(p => ({ ...p, temperature: v }))} min={0} max={1} step={0.1} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">Lower = more focused, Higher = more creative</p>
                  </div>
                  <div>
                    <Label>Max Tokens per Response: {form.maxTokens}</Label>
                    <Slider value={[form.maxTokens]} onValueChange={([v]) => setForm(p => ({ ...p, maxTokens: v }))} min={50} max={500} step={10} className="mt-2" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="voice" className="space-y-4 mt-4">
                <div>
                  <Label>Voice</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    {OPENAI_VOICES.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          form.voice === v.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setForm(p => ({ ...p, voice: v.id }))}
                      >
                        <div className="font-medium text-sm">{v.label}</div>
                        <div className="text-xs text-muted-foreground">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Interruption Threshold: {form.interruptionThreshold}</Label>
                  <Slider value={[form.interruptionThreshold]} onValueChange={([v]) => setForm(p => ({ ...p, interruptionThreshold: v }))} min={0} max={1} step={0.1} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">How sensitive the AI is to being interrupted (0 = never, 1 = very sensitive)</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Silence Timeout (seconds): {form.silenceTimeout}</Label>
                    <Slider value={[form.silenceTimeout]} onValueChange={([v]) => setForm(p => ({ ...p, silenceTimeout: v }))} min={2} max={15} step={1} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">Seconds of silence before AI prompts again</p>
                  </div>
                  <div>
                    <Label>Max Call Duration (seconds): {form.maxDuration}</Label>
                    <Slider value={[form.maxDuration]} onValueChange={([v]) => setForm(p => ({ ...p, maxDuration: v }))} min={60} max={900} step={30} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">{formatDuration(form.maxDuration)} max per call</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="functions" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Function Calling</Label>
                    <p className="text-xs text-muted-foreground">Allow the AI to trigger actions during the call</p>
                  </div>
                  <Switch checked={form.enableFunctions} onCheckedChange={v => setForm(p => ({ ...p, enableFunctions: v }))} />
                </div>
                {form.enableFunctions && (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {FUNCTION_TEMPLATES.map(ft => (
                        <Button
                          key={ft.name}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            try {
                              const current = JSON.parse(form.functions || "[]");
                              if (!current.find((f: any) => f.name === ft.name)) {
                                current.push(ft);
                                setForm(p => ({ ...p, functions: JSON.stringify(current, null, 2) }));
                              }
                            } catch { /* ignore */ }
                          }}
                        >
                          + {ft.name}
                        </Button>
                      ))}
                    </div>
                    <div>
                      <Label>Function Definitions (JSON)</Label>
                      <Textarea
                        value={form.functions}
                        onChange={e => setForm(p => ({ ...p, functions: e.target.value }))}
                        className="min-h-[200px] font-mono text-xs"
                        placeholder="[{ name, description, parameters }]"
                      />
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="compliance" className="space-y-4 mt-4">
                <div>
                  <Label>Compliance Mode</Label>
                  <Select value={form.complianceMode} onValueChange={v => setForm(p => ({ ...p, complianceMode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="fdcpa">FDCPA (Debt Collection)</SelectItem>
                      <SelectItem value="hipaa">HIPAA (Healthcare)</SelectItem>
                      <SelectItem value="tcpa">TCPA (Telemarketing)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Adds compliance-specific guardrails to the AI's behavior</p>
                </div>
                <div>
                  <Label>End Call Phrases</Label>
                  <Input
                    value={form.endCallPhrases}
                    onChange={e => setForm(p => ({ ...p, endCallPhrases: e.target.value }))}
                    placeholder="goodbye, stop calling, remove me, do not call"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Comma-separated phrases that trigger call termination</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Active</Label>
                    <p className="text-xs text-muted-foreground">Only active prompts can be assigned to campaigns</p>
                  </div>
                  <Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={submitPrompt}
                disabled={!form.name || !form.systemPrompt || createPrompt.isPending || updatePrompt.isPending}
              >
                {(createPrompt.isPending || updatePrompt.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editingPromptId ? "Update Prompt" : "Create Prompt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// ─── Deploy & Manage Tab Component ──────────────────────────────────────────

function DeployTab() {
  const [copied, setCopied] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testPromptId, setTestPromptId] = useState<string>("");
  const [testCallerId, setTestCallerId] = useState<number | undefined>(undefined);

  const deployStatus = trpc.voiceAi.getDeployStatus.useQuery();
  const installCmd = trpc.voiceAi.getInstallCommand.useQuery({ origin: window.location.origin });
  const testCallMut = trpc.voiceAi.testCall.useMutation();
  const prompts = trpc.voiceAi.listPrompts.useQuery();
  const callerIdsQuery = trpc.callerIds.list.useQuery();
  const activeCallerIds = (callerIdsQuery.data || []).filter((c: any) => Number(c.isActive) === 1 && !Number(c.autoDisabled));

  const handleCopy = () => {
    if (installCmd.data?.command) {
      navigator.clipboard.writeText(installCmd.data.command);
      setCopied(true);
      toast.success("Install command copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const [callPollingId, setCallPollingId] = useState<number | null>(null);
  const [callStatusMsg, setCallStatusMsg] = useState<string>("");

  // Poll for call status after queuing
  const callStatusQuery = trpc.voiceAi.getCallStatus.useQuery(
    { queueId: callPollingId! },
    {
      enabled: !!callPollingId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2000;
        if (data.status === "completed" || data.status === "failed" || data.status === "not_found") return false;
        return 2000; // Poll every 2s while pending/claimed/dialing
      },
    }
  );

  // React to call status changes
  React.useEffect(() => {
    if (!callStatusQuery.data || !callPollingId) return;
    const { status, result, failureReason, duration } = callStatusQuery.data;
    if (status === "completed" || (result === "answered")) {
      const dur = duration ? ` (${duration}s)` : "";
      toast.success(`Call completed successfully${dur}`);
      setCallStatusMsg(`Call answered${dur}`);
      setCallPollingId(null);
    } else if (status === "failed") {
      const reason = failureReason || "Unknown failure";
      toast.error(`Call failed: ${reason}`);
      setCallStatusMsg(`Failed: ${reason}`);
      setCallPollingId(null);
    } else if (status === "claimed") {
      setCallStatusMsg("Call claimed by PBX agent, dialing...");
    } else if (status === "dialing") {
      setCallStatusMsg("Ringing...");
    }
  }, [callStatusQuery.data, callPollingId]);

  const handleTestCall = async () => {
    if (!testPhone || !testPromptId) {
      toast.error("Enter a phone number and select a prompt");
      return;
    }
    setCallStatusMsg("");
    setCallPollingId(null);
    try {
      const result = await testCallMut.mutateAsync({
        phoneNumber: testPhone,
        promptId: Number(testPromptId),
        callerIdId: testCallerId,
      });
      if (result.success) {
        toast.success(result.message);
        if (result.queueId) {
          setCallPollingId(result.queueId);
          setCallStatusMsg("Queued, waiting for PBX agent to pick up...");
        }
      }
    } catch (e: any) {
      toast.error(e.message);
      setCallStatusMsg(`Error: ${e.message}`);
    }
  };

  const statusIcon = (ok: boolean) => ok
    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
    : <XCircle className="h-4 w-4 text-red-400" />;

  return (
    <TabsContent value="deploy" className="mt-4 space-y-4">
      {/* Prerequisites Card */}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-5 w-5 text-primary" />
            Deployment Prerequisites
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-card">
              {statusIcon(!!deployStatus.data?.freepbxConfigured)}
              <div>
                <p className="text-sm font-medium">FreePBX Host</p>
                <p className="text-xs text-muted-foreground">
                  {deployStatus.data?.freepbxConfigured
                    ? `Configured: ${deployStatus.data.host}`
                    : "Not configured"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-card">
              {statusIcon(!!deployStatus.data?.openaiConfigured)}
              <div>
                <p className="text-sm font-medium">OpenAI API Key</p>
                <p className="text-xs text-muted-foreground">
                  {deployStatus.data?.openaiConfigured
                    ? "API key configured"
                    : "Not configured"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-card">
              {statusIcon(!!deployStatus.data?.pbxAgentRegistered)}
              <div>
                <p className="text-sm font-medium">PBX Agent</p>
                <p className="text-xs text-muted-foreground">
                  {deployStatus.data?.pbxAgentRegistered
                    ? "Agent registered"
                    : "No agent — register one first"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Install Command Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-5 w-5 text-primary" />
            Install Voice AI Bridge
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Run this command on your FreePBX server as root. It installs everything automatically — just like the PBX Agent installer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {installCmd.data?.command ? (
            <div className="space-y-3">
              <div className="relative">
                <div className="bg-zinc-950 text-green-400 rounded-lg p-4 pr-24 font-mono text-sm overflow-x-auto">
                  <span className="text-zinc-500 select-none">$ </span>
                  {installCmd.data.command}
                </div>
                <Button
                  size="sm"
                  variant={copied ? "default" : "secondary"}
                  className="absolute top-3 right-3 gap-1.5"
                  onClick={handleCopy}
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>

              <div className="p-3 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-medium mb-2">Quick Start</h4>
                <ol className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-mono text-primary font-bold">1.</span>
                    SSH into your FreePBX server as root
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-primary font-bold">2.</span>
                    Paste the command above and press Enter
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-primary font-bold">3.</span>
                    Wait for "Installation Complete!" message (~30 seconds)
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-primary font-bold">4.</span>
                    Use the Test Call section below to verify it works
                  </li>
                </ol>
              </div>

              <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 text-xs text-muted-foreground">
                <p><strong className="text-blue-400">To update later:</strong> Just re-run the same command. It overwrites old files and restarts the service automatically.</p>
              </div>
            </div>
          ) : installCmd.data?.error ? (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
              <p className="font-medium text-amber-600">Cannot generate install command</p>
              <p className="text-muted-foreground mt-1">{installCmd.data.error}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading install command...
            </div>
          )}
        </CardContent>
      </Card>

      {/* After Install: Useful Commands */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-5 w-5 text-primary" />
            After Installation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs">
              <p className="text-zinc-500 mb-1"># Check status</p>
              <p className="text-green-400">systemctl status voice-ai-bridge</p>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs">
              <p className="text-zinc-500 mb-1"># View live logs</p>
              <p className="text-green-400">journalctl -u voice-ai-bridge -f</p>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs">
              <p className="text-zinc-500 mb-1"># Restart service</p>
              <p className="text-green-400">systemctl restart voice-ai-bridge</p>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs">
              <p className="text-zinc-500 mb-1"># Stop service</p>
              <p className="text-green-400">systemctl stop voice-ai-bridge</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Call Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5 text-primary" />
            Test Call
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send a test call to verify the Voice AI Bridge is working end-to-end. The AI will call the number and use the selected prompt.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs mb-1 block">Phone Number</Label>
              <Input
                placeholder="e.g. 4071234567"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Voice AI Prompt</Label>
              {prompts.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading prompts...
                </div>
              ) : (prompts.data || []).length === 0 ? (
                <p className="text-xs text-amber-500 py-2">No prompts found. Create one in the Prompts tab first.</p>
              ) : (
                <Select value={testPromptId} onValueChange={setTestPromptId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select prompt" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(prompts.data || []).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">Caller ID</Label>
              {callerIdsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading caller IDs...
                </div>
              ) : (
                <Select value={testCallerId?.toString() || "auto"} onValueChange={v => setTestCallerId(v === "auto" ? undefined : parseInt(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Auto (random)" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="auto">Auto (random rotation)</SelectItem>
                    {activeCallerIds.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.phoneNumber}{c.label ? ` - ${c.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!callerIdsQuery.isLoading && activeCallerIds.length === 0 && (
                <p className="text-xs text-amber-500 mt-1">No active caller IDs found. Add one in Caller IDs page first.</p>
              )}
            </div>
            <div>
              <Button
                onClick={handleTestCall}
                disabled={testCallMut.isPending || !!callPollingId || !testPhone || !testPromptId}
                className="gap-2 w-full"
              >
                {(testCallMut.isPending || !!callPollingId) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                {callPollingId ? "Call in progress..." : "Send Test Call"}
              </Button>
              {/* Call status feedback */}
              {callStatusMsg && (
                <div className={`mt-2 p-2 rounded text-xs font-medium ${
                  callStatusMsg.startsWith("Failed") || callStatusMsg.startsWith("Error")
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : callStatusMsg.startsWith("Call answered") || callStatusMsg.startsWith("Call completed")
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}>
                  {callStatusMsg}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What Gets Installed Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-5 w-5 text-primary" />
            What Gets Installed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div>
                <div>
                  <p className="text-sm font-medium">Python Bridge Service</p>
                  <p className="text-xs text-muted-foreground">Installed to /opt/voice-ai-bridge/ with systemd auto-start</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div>
                <div>
                  <p className="text-sm font-medium">Asterisk ARI Configuration</p>
                  <p className="text-xs text-muted-foreground">ARI user created in ari.conf, HTTP enabled</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div>
                <div>
                  <p className="text-sm font-medium">Voice AI Dialplan</p>
                  <p className="text-xs text-muted-foreground">extensions_voice_ai.conf with Stasis routing</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</div>
                <div>
                  <p className="text-sm font-medium">Environment Configuration</p>
                  <p className="text-xs text-muted-foreground">OpenAI key, ARI credentials, dashboard API URL</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">5</div>
                <div>
                  <p className="text-sm font-medium">Python Dependencies</p>
                  <p className="text-xs text-muted-foreground">aiohttp, websockets installed via pip3</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">6</div>
                <div>
                  <p className="text-sm font-medium">Asterisk Reload</p>
                  <p className="text-xs text-muted-foreground">Core reload to pick up new dialplan and ARI config</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <h4 className="font-semibold text-amber-600 flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              Compliance Notes
            </h4>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>Some jurisdictions require disclosure that the caller is an AI</li>
              <li>Always include opt-out instructions in your prompts</li>
              <li>Record and store conversations per your retention policy</li>
              <li>Test thoroughly before running production campaigns</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// ─── Bridge History Tab Component ───────────────────────────────────────────

function BridgeHistoryTab() {
  const eventsQuery = trpc.voiceAi.getBridgeEvents.useQuery({ limit: 100 });
  const statsQuery = trpc.voiceAi.getBridgeEventStats.useQuery();

  const eventTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    online: { label: "Online", color: "text-green-500 bg-green-500/10 border-green-500/20", icon: <ArrowUpCircle className="h-4 w-4 text-green-500" /> },
    offline: { label: "Offline", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: <ArrowDownCircle className="h-4 w-4 text-red-500" /> },
    installed: { label: "Installed", color: "text-blue-500 bg-blue-500/10 border-blue-500/20", icon: <CheckCircle2 className="h-4 w-4 text-blue-500" /> },
    install_failed: { label: "Install Failed", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
    updated: { label: "Updated", color: "text-purple-500 bg-purple-500/10 border-purple-500/20", icon: <RefreshCw className="h-4 w-4 text-purple-500" /> },
  };

  const formatDate = (dateStr: string | Date) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const stats = statsQuery.data;
  const events = eventsQuery.data || [];

  return (
    <TabsContent value="history" className="mt-4 space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-green-500/20">
          <CardContent className="p-4 text-center">
            <ArrowUpCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-500">{stats?.onlineEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Online Events</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20">
          <CardContent className="p-4 text-center">
            <ArrowDownCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-500">{stats?.offlineEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Offline Events</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20">
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-500">{stats?.installEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Install/Update Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.totalEvents ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
      </div>

      {/* Last Known Timestamps */}
      {(stats?.lastOnline || stats?.lastOffline) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-6 text-sm">
              {stats?.lastOnline && (
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Last online:</span>
                  <span className="font-medium">{formatDate(stats.lastOnline)}</span>
                </div>
              )}
              {stats?.lastOffline && (
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4 text-red-500" />
                  <span className="text-muted-foreground">Last offline:</span>
                  <span className="font-medium">{formatDate(stats.lastOffline)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5 text-primary" />
              Bridge Event Log
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { eventsQuery.refetch(); statsQuery.refetch(); }}>
              <RefreshCw className={`h-3.5 w-3.5 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No bridge events recorded yet.</p>
              <p className="text-xs mt-1">Events will appear here when the bridge goes online, offline, or is installed/updated.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((event: any, idx: number) => {
                const config = eventTypeConfig[event.eventType] || eventTypeConfig.online;
                const isLast = idx === events.length - 1;
                return (
                  <div key={event.id} className="flex gap-3">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`flex-shrink-0 h-8 w-8 rounded-full border flex items-center justify-center ${config.color}`}>
                        {config.icon}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-border min-h-[16px]" />}
                    </div>
                    {/* Content */}
                    <div className={`flex-1 pb-4 ${isLast ? "" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{event.agentName || event.agentId}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{formatDate(event.createdAt)}</span>
                      </div>
                      {event.details && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.details}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
