import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  MessageSquare,
  Shield,
  Target,
  Handshake,
  Flame,
  Heart,
  TrendingUp,
  BarChart3,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  BookOpen,
  Download,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

const CATEGORIES = [
  { value: "objection_handling", label: "Objection Handling", icon: Flame, color: "text-orange-400" },
  { value: "compliance", label: "Compliance", icon: Shield, color: "text-red-400" },
  { value: "closing", label: "Closing", icon: Target, color: "text-green-400" },
  { value: "rapport_building", label: "Rapport Building", icon: Heart, color: "text-pink-400" },
  { value: "payment_negotiation", label: "Payment Negotiation", icon: Handshake, color: "text-blue-400" },
  { value: "de_escalation", label: "De-escalation", icon: MessageSquare, color: "text-amber-400" },
  { value: "general", label: "General", icon: BookOpen, color: "text-zinc-400" },
] as const;

const SUGGESTION_TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  talk_track: { label: "Talk Track", color: "text-blue-400", icon: MessageSquare },
  objection_handle: { label: "Objection Handle", color: "text-orange-400", icon: Flame },
  compliance_alert: { label: "Compliance Alert", color: "text-red-400", icon: Shield },
  next_action: { label: "Next Action", color: "text-green-400", icon: Target },
  sentiment_alert: { label: "Sentiment Alert", color: "text-pink-400", icon: Heart },
  closing_cue: { label: "Closing Cue", color: "text-emerald-400", icon: Handshake },
  de_escalation: { label: "De-escalation", color: "text-amber-400", icon: MessageSquare },
  info_card: { label: "Info Card", color: "text-zinc-400", icon: BookOpen },
};

const SENTIMENT_COLORS: Record<string, string> = {
  very_negative: "bg-red-500",
  negative: "bg-orange-500",
  neutral: "bg-zinc-500",
  positive: "bg-blue-500",
  very_positive: "bg-green-500",
};

const SENTIMENT_LABELS: Record<string, string> = {
  very_negative: "Very Negative",
  negative: "Negative",
  neutral: "Neutral",
  positive: "Positive",
  very_positive: "Very Positive",
};

interface TemplateSuggestion {
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
}

interface TemplateForm {
  name: string;
  description: string;
  category: string;
  triggers: string;
  suggestions: TemplateSuggestion[];
}

const DEFAULT_FORM: TemplateForm = {
  name: "",
  description: "",
  category: "general",
  triggers: "",
  suggestions: [{ title: "", body: "", priority: "medium" }],
};

export default function AgentAssist() {
  const [tab, setTab] = useState("templates");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(DEFAULT_FORM);

  const { data: templates, refetch: refetchTemplates } = trpc.agentAssist.listTemplates.useQuery();
  const { data: stats } = trpc.agentAssist.stats.useQuery();
  const { data: report } = trpc.agentAssist.coachingReport.useQuery(undefined, { enabled: tab === "report" });

  const createMutation = trpc.agentAssist.createTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); setShowDialog(false); toast.success("Template created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.agentAssist.updateTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); setShowDialog(false); toast.success("Template updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = trpc.agentAssist.deleteTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); toast.success("Template deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const seedMutation = trpc.agentAssist.seedStarterTemplates.useMutation({
    onSuccess: (data) => {
      refetchTemplates();
      if (data.seeded > 0) {
        toast.success(`${data.seeded} starter templates created!`);
      } else {
        toast.info(data.message);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setShowDialog(true);
  };

  const openEdit = (template: any) => {
    setEditingId(template.id);
    setForm({
      name: template.name,
      description: template.description || "",
      category: template.category,
      triggers: (template.triggers as string[] || []).join(", "),
      suggestions: (template.suggestions as TemplateSuggestion[] || []).length > 0
        ? (template.suggestions as TemplateSuggestion[])
        : [{ title: "", body: "", priority: "medium" }],
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    const data = {
      name: form.name,
      description: form.description || undefined,
      category: form.category as any,
      triggers: form.triggers.split(",").map(t => t.trim()).filter(Boolean),
      suggestions: form.suggestions.filter(s => s.title && s.body),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const addSuggestionSlot = () => {
    setForm(prev => ({
      ...prev,
      suggestions: [...prev.suggestions, { title: "", body: "", priority: "medium" }],
    }));
  };

  const removeSuggestionSlot = (index: number) => {
    setForm(prev => ({
      ...prev,
      suggestions: prev.suggestions.filter((_, i) => i !== index),
    }));
  };

  const updateSuggestionSlot = (index: number, field: keyof TemplateSuggestion, value: string) => {
    setForm(prev => ({
      ...prev,
      suggestions: prev.suggestions.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  };

  const categoryConfig = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[6];

  // Report helpers
  const agentPerformance = (report?.agentPerformance || []) as any[];
  const templateEffectiveness = (report?.templateEffectiveness || []) as any[];
  const suggestionTypes = (report?.suggestionTypes || []) as any[];
  const trainingGaps = (report?.trainingGaps || []) as any[];
  const dailyTrend = (report?.dailyTrend || []) as any[];
  const sentimentDist = (report?.sentimentDist || []) as any[];

  const totalSentiment = sentimentDist.reduce((sum: number, s: any) => sum + Number(s.count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-7 w-7 text-violet-400" />
            Agent Assist
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time AI coaching for agents during live calls
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span>Total Sessions</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalSessions ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Zap className="h-4 w-4 text-green-400" />
              <span>Active Now</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{stats?.activeSessions ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span>Suggestions</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalSuggestions ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <span>Accepted</span>
            </div>
            <p className="text-2xl font-bold">{stats?.acceptedSuggestions ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span>Accept Rate</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats?.avgAcceptRate ?? 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Coaching Templates</TabsTrigger>
          <TabsTrigger value="report">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Coaching Report
          </TabsTrigger>
          <TabsTrigger value="guide">How It Works</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Create coaching templates with trigger keywords. When these keywords appear in a call, the matching suggestions are automatically surfaced to the agent.
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {(!templates || templates.length === 0) && (
                <Button
                  variant="outline"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {seedMutation.isPending ? "Seeding..." : "Load Starter Templates"}
                </Button>
              )}
              <Button onClick={openCreate} className="bg-violet-600 hover:bg-violet-500">
                <Plus className="h-4 w-4 mr-2" /> New Template
              </Button>
            </div>
          </div>

          {(!templates || templates.length === 0) ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">No coaching templates yet</p>
                <p className="text-muted-foreground/60 text-xs mt-1 mb-4">Get started quickly with our pre-built templates or create your own</p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                    className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {seedMutation.isPending ? "Loading 14 Templates..." : "Load 14 Starter Templates"}
                  </Button>
                  <span className="text-xs text-muted-foreground">or</span>
                  <Button onClick={openCreate} variant="outline">
                    <Plus className="h-4 w-4 mr-2" /> Create From Scratch
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template: any) => {
                const cat = categoryConfig(template.category);
                const CatIcon = cat.icon;
                return (
                  <Card key={template.id} className="group hover:border-violet-500/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <CatIcon className={`h-4 w-4 ${cat.color}`} />
                          <CardTitle className="text-sm">{template.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(template)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteMutation.mutate({ id: template.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {template.description && (
                        <CardDescription className="text-xs line-clamp-2">{template.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1 mb-2">
                        <Badge variant="outline" className={`text-[10px] ${cat.color}`}>
                          {cat.label}
                        </Badge>
                        {template.isActive ? (
                          <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-zinc-500">Inactive</Badge>
                        )}
                      </div>
                      {(template.triggers as string[] || []).length > 0 && (
                        <div className="mb-2">
                          <span className="text-[10px] text-muted-foreground">Triggers: </span>
                          {(template.triggers as string[]).slice(0, 3).map((t: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px] mr-1 mb-1">{t}</Badge>
                          ))}
                          {(template.triggers as string[]).length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{(template.triggers as string[]).length - 3} more</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{(template.suggestions as any[] || []).length} suggestions</span>
                        <span>Used {template.usageCount}x</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Coaching Report Tab */}
        <TabsContent value="report" className="space-y-6">
          {/* Agent Performance Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-400" />
                Agent Coaching Performance
              </CardTitle>
              <CardDescription>Suggestion acceptance rates by agent — identifies who follows coaching vs. who dismisses</CardDescription>
            </CardHeader>
            <CardContent>
              {agentPerformance.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No coaching sessions recorded yet. Start an assist session from the Wallboard to begin tracking.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-center">Extension</TableHead>
                      <TableHead className="text-center">Sessions</TableHead>
                      <TableHead className="text-center">Suggestions</TableHead>
                      <TableHead className="text-center">Accepted</TableHead>
                      <TableHead className="text-center">Dismissed</TableHead>
                      <TableHead>Accept Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentPerformance.map((agent: any, i: number) => {
                      const rate = Number(agent.acceptRate) || 0;
                      const rateColor = rate >= 70 ? "text-green-400" : rate >= 40 ? "text-amber-400" : "text-red-400";
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{agent.agentName || `Agent #${agent.agentId}`}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{agent.sipExtension || "—"}</TableCell>
                          <TableCell className="text-center">{Number(agent.totalSessions)}</TableCell>
                          <TableCell className="text-center">{Number(agent.totalSuggestions)}</TableCell>
                          <TableCell className="text-center text-green-400">{Number(agent.acceptedSuggestions)}</TableCell>
                          <TableCell className="text-center text-red-400">{Number(agent.dismissedSuggestions)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={rate} className="h-2 flex-1" />
                              <span className={`text-sm font-semibold ${rateColor} w-12 text-right`}>{rate}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Two-column: Suggestion Types + Template Effectiveness */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Suggestion Type Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-400" />
                  Suggestion Type Breakdown
                </CardTitle>
                <CardDescription>Which types of suggestions are most effective</CardDescription>
              </CardHeader>
              <CardContent>
                {suggestionTypes.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No data yet</div>
                ) : (
                  <div className="space-y-3">
                    {suggestionTypes.map((st: any, i: number) => {
                      const config = SUGGESTION_TYPE_LABELS[st.type] || { label: st.type, color: "text-zinc-400", icon: BookOpen };
                      const TypeIcon = config.icon;
                      const total = Number(st.total) || 0;
                      const accepted = Number(st.accepted) || 0;
                      const rate = Number(st.acceptRate) || 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <TypeIcon className={`h-4 w-4 shrink-0 ${config.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium truncate">{config.label}</span>
                              <span className="text-xs text-muted-foreground">{accepted}/{total}</span>
                            </div>
                            <Progress value={rate} className="h-1.5" />
                          </div>
                          <span className={`text-sm font-semibold w-12 text-right ${rate >= 60 ? "text-green-400" : rate >= 30 ? "text-amber-400" : "text-red-400"}`}>
                            {rate}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Template Effectiveness */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-emerald-400" />
                  Template Effectiveness
                </CardTitle>
                <CardDescription>Which coaching templates get used and accepted most</CardDescription>
              </CardHeader>
              <CardContent>
                {templateEffectiveness.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No template usage data yet</div>
                ) : (
                  <div className="space-y-3">
                    {templateEffectiveness.map((te: any, i: number) => {
                      const cat = categoryConfig(te.category);
                      const CatIcon = cat.icon;
                      const rate = Number(te.acceptRate) || 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <CatIcon className={`h-4 w-4 shrink-0 ${cat.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium truncate">{te.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {Number(te.usageCount)} triggers / {Number(te.suggestionCount)} suggestions
                              </span>
                            </div>
                            <Progress value={rate} className="h-1.5" />
                          </div>
                          <span className={`text-sm font-semibold w-12 text-right ${rate >= 60 ? "text-green-400" : rate >= 30 ? "text-amber-400" : "text-red-400"}`}>
                            {rate}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Two-column: Training Gaps + Sentiment Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Training Gaps */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Training Gaps
                </CardTitle>
                <CardDescription>Agents with low acceptance rates by suggestion type — areas needing coaching focus</CardDescription>
              </CardHeader>
              <CardContent>
                {trainingGaps.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="h-8 w-8 text-green-400/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No training gaps detected</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">All agents have acceptable coaching acceptance rates</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {trainingGaps.map((gap: any, i: number) => {
                      const config = SUGGESTION_TYPE_LABELS[gap.suggestionType] || { label: gap.suggestionType, color: "text-zinc-400", icon: BookOpen };
                      const rate = Number(gap.acceptRate) || 0;
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-amber-500/10 flex items-center justify-center">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{gap.agentName || `Agent #${gap.agentId}`}</p>
                              <p className="text-[10px] text-muted-foreground">{config.label} — {Number(gap.accepted)}/{Number(gap.total)} accepted</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-red-400 border-red-500/30">{rate}%</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sentiment Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="h-5 w-5 text-pink-400" />
                  Call Sentiment Distribution
                </CardTitle>
                <CardDescription>Caller mood across all coaching sessions</CardDescription>
              </CardHeader>
              <CardContent>
                {sentimentDist.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No sentiment data yet</div>
                ) : (
                  <div className="space-y-3">
                    {sentimentDist.map((s: any, i: number) => {
                      const count = Number(s.count) || 0;
                      const pct = totalSentiment > 0 ? Math.round((count / totalSentiment) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full shrink-0 ${SENTIMENT_COLORS[s.label] || "bg-zinc-500"}`} />
                          <span className="text-sm w-28 shrink-0">{SENTIMENT_LABELS[s.label] || s.label}</span>
                          <div className="flex-1">
                            <div className="h-5 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${SENTIMENT_COLORS[s.label] || "bg-zinc-500"} transition-all`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-medium w-16 text-right">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-violet-400" />
                30-Day Coaching Engagement Trend
              </CardTitle>
              <CardDescription>Daily coaching sessions, suggestions generated, and acceptance rates</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyTrend.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No trend data available yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center">Sessions</TableHead>
                        <TableHead className="text-center">Suggestions</TableHead>
                        <TableHead className="text-center">Accepted</TableHead>
                        <TableHead>Accept Rate</TableHead>
                        <TableHead className="text-center">Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyTrend.map((day: any, i: number) => {
                        const rate = Number(day.acceptRate) || 0;
                        const prevRate = i > 0 ? Number(dailyTrend[i - 1].acceptRate) || 0 : rate;
                        const diff = rate - prevRate;
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{day.day}</TableCell>
                            <TableCell className="text-center">{Number(day.sessions)}</TableCell>
                            <TableCell className="text-center">{Number(day.suggestions)}</TableCell>
                            <TableCell className="text-center text-green-400">{Number(day.accepted)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <Progress value={rate} className="h-1.5 flex-1" />
                                <span className="text-xs font-medium w-10 text-right">{rate}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {diff > 0 ? (
                                <ArrowUpRight className="h-4 w-4 text-green-400 inline" />
                              ) : diff < 0 ? (
                                <ArrowDownRight className="h-4 w-4 text-red-400 inline" />
                              ) : (
                                <Minus className="h-4 w-4 text-zinc-500 inline" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* How It Works Tab */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-400" />
                How Agent Assist Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm">1</div>
                    <h3 className="font-semibold text-sm">Agent Goes On Call</h3>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">
                    When an agent takes a call, click the <strong>Assist</strong> button on their Wallboard card. This opens the AI coaching panel and starts a session.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">2</div>
                    <h3 className="font-semibold text-sm">AI Analyzes Context</h3>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">
                    Set the call stage (greeting, objection, closing, etc.) and paste transcript excerpts. The AI analyzes sentiment, matches coaching templates, and generates real-time suggestions.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm">3</div>
                    <h3 className="font-semibold text-sm">Agent Uses Suggestions</h3>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">
                    Suggestions appear as cards with priority levels. Agents (or supervisors) can accept or dismiss each one. Acceptance rates are tracked for coaching improvement.
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-3">Suggestion Types</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: MessageSquare, label: "Talk Track", desc: "What to say next", color: "text-blue-400" },
                    { icon: Flame, label: "Objection Handle", desc: "Counter specific pushback", color: "text-orange-400" },
                    { icon: Shield, label: "Compliance Alert", desc: "Regulatory reminders", color: "text-red-400" },
                    { icon: Target, label: "Next Action", desc: "Recommended next step", color: "text-green-400" },
                    { icon: Heart, label: "Sentiment Alert", desc: "Caller mood warning", color: "text-pink-400" },
                    { icon: Handshake, label: "Closing Cue", desc: "Opportunity to close", color: "text-emerald-400" },
                    { icon: MessageSquare, label: "De-escalation", desc: "Calm the situation", color: "text-amber-400" },
                    { icon: BookOpen, label: "Info Card", desc: "Background context", color: "text-zinc-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                      <item.icon className={`h-4 w-4 mt-0.5 ${item.color}`} />
                      <div>
                        <p className="text-xs font-medium">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-2">Starter Templates</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Click <strong>"Load Starter Templates"</strong> on the Templates tab to instantly create 14 pre-built coaching templates covering objection handling (Already Paid, Not My Debt, Can't Afford It, Stop Calling, Need to Think), compliance (Mini-Miranda, FDCPA, Recording Notice), closing (Payment Plans, Settlements), rapport building, de-escalation, and negotiation tactics.
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-2">Coaching Report</h3>
                <p className="text-xs text-muted-foreground">
                  The <strong>Coaching Report</strong> tab provides supervisor analytics: agent performance rankings by acceptance rate, template effectiveness scores, suggestion type breakdowns, training gap identification (agents with &lt;40% acceptance in specific categories), sentiment distribution, and a 30-day engagement trend.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Template Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Coaching Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Payment Objection Handler"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of when this template should be used..."
                className="h-16"
              />
            </div>

            <div className="space-y-2">
              <Label>Trigger Keywords <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
              <Input
                value={form.triggers}
                onChange={e => setForm(prev => ({ ...prev, triggers: e.target.value }))}
                placeholder="e.g., can't afford, too expensive, not interested, cancel"
              />
              <p className="text-[10px] text-muted-foreground">When any of these phrases appear in the call transcript, this template's suggestions will be surfaced automatically.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Suggestion Cards</Label>
                <Button variant="outline" size="sm" onClick={addSuggestionSlot}>
                  <Plus className="h-3 w-3 mr-1" /> Add Card
                </Button>
              </div>
              {form.suggestions.map((suggestion, index) => (
                <Card key={index} className="bg-muted/30">
                  <CardContent className="pt-3 pb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={suggestion.title}
                        onChange={e => updateSuggestionSlot(index, "title", e.target.value)}
                        placeholder="Suggestion title (3-6 words)"
                        className="flex-1 h-8 text-sm"
                      />
                      <Select
                        value={suggestion.priority}
                        onValueChange={v => updateSuggestionSlot(index, "priority", v)}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.suggestions.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSuggestionSlot(index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={suggestion.body}
                      onChange={e => updateSuggestionSlot(index, "body", e.target.value)}
                      placeholder="What the agent should say or do..."
                      className="h-16 text-sm"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name || createMutation.isPending || updateMutation.isPending}
              className="bg-violet-600 hover:bg-violet-500"
            >
              {editingId ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
