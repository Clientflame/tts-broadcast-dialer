import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus, Play, Pause, StopCircle, Trash2, Megaphone, Copy,
  Clock, Users, Volume2, Phone, BarChart3, Loader2, MapPin, Shield, Wand2,
} from "lucide-react";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", scheduled: "secondary", running: "default",
  paused: "secondary", completed: "default", cancelled: "destructive",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const IVR_ACTIONS = [
  { value: "transfer", label: "Transfer to Extension" },
  { value: "optout", label: "Opt-Out (Add to DNC)" },
  { value: "repeat", label: "Repeat Message" },
  { value: "callback", label: "Request Callback" },
  { value: "confirm", label: "Confirm / Accept" },
];

export default function Campaigns() {
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneId, setCloneId] = useState<number | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", contactListId: 0, audioFileId: 0,
    voice: "alloy", callerIdNumber: "", callerIdName: "",
    maxConcurrentCalls: 3, retryAttempts: 0, retryDelay: 300,
    timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
    ivrEnabled: false, ivrOptions: [] as { digit: string; action: string; label: string }[],
    abTestGroup: "", abTestVariant: "",
    targetStates: [] as string[], useGeoCallerIds: false,
    usePersonalizedTTS: false, messageText: "", ttsSpeed: "1.0",
    useDidRotation: false,
  });
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const campaigns = trpc.campaigns.list.useQuery();
  const contactLists = trpc.contactLists.list.useQuery();
  const audioFiles = trpc.audio.list.useQuery();
  const templates = trpc.templates.list.useQuery();
  const campaignDetail = trpc.campaigns.get.useQuery({ id: detailId! }, { enabled: !!detailId });
  const campaignStats = trpc.campaigns.stats.useQuery({ id: detailId! }, { enabled: !!detailId, refetchInterval: detailId ? 5000 : false });

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setCreateOpen(false); resetForm(); toast.success("Campaign created"); },
    onError: (e) => toast.error(e.message),
  });

  const cloneCampaign = trpc.campaigns.clone.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setCloneOpen(false); setCloneName(""); toast.success("Campaign cloned"); },
    onError: (e) => toast.error(e.message),
  });

  const startCampaign = trpc.campaigns.start.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign started"); },
    onError: (e) => toast.error(e.message),
  });

  const pauseCampaign = trpc.campaigns.pause.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign paused"); },
    onError: (e) => toast.error(e.message),
  });

  const cancelCampaign = trpc.campaigns.cancel.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign cancelled"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setDetailId(null); toast.success("Campaign deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({
    name: "", description: "", contactListId: 0, audioFileId: 0,
    voice: "alloy", callerIdNumber: "", callerIdName: "",
    maxConcurrentCalls: 3, retryAttempts: 0, retryDelay: 300,
    timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
    ivrEnabled: false, ivrOptions: [], abTestGroup: "", abTestVariant: "",
    targetStates: [], useGeoCallerIds: false,
    usePersonalizedTTS: false, messageText: "", ttsSpeed: "1.0",
    useDidRotation: false,
  });

  const MERGE_FIELDS = [
    { key: "first_name", label: "First Name", example: "John" },
    { key: "last_name", label: "Last Name", example: "Smith" },
    { key: "full_name", label: "Full Name", example: "John Smith" },
    { key: "caller_id", label: "Caller ID", example: "(407) 555-1177" },
    { key: "company", label: "Company", example: "Acme Corp" },
    { key: "state", label: "State", example: "FL" },
    { key: "database_name", label: "Database", example: "Spring 2026" },
    { key: "phone", label: "Phone", example: "4075551177" },
  ];

  const insertMergeField = (fieldKey: string) => {
    const textarea = messageRef.current;
    if (!textarea) {
      setForm(p => ({ ...p, messageText: p.messageText + `{{${fieldKey}}}` }));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.messageText;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const newText = `${before}{{${fieldKey}}}${after}`;
    setForm(p => ({ ...p, messageText: newText }));
    setTimeout(() => {
      const newPos = start + `{{${fieldKey}}}`.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  };

  const getMessagePreview = () => {
    let preview = form.messageText;
    MERGE_FIELDS.forEach(f => {
      preview = preview.replace(new RegExp(`\\{\\{${f.key}\\}\\}`, "g"), f.example);
    });
    return preview;
  };

  const loadTemplate = (templateId: number) => {
    const t = templates.data?.find(t => t.id === templateId);
    if (!t) return;
    setForm(p => ({
      ...p,
      voice: t.voice || p.voice,
      maxConcurrentCalls: t.maxConcurrentCalls ?? p.maxConcurrentCalls,
      retryAttempts: t.retryAttempts ?? p.retryAttempts,
      retryDelay: t.retryDelay ?? p.retryDelay,
      timezone: t.timezone || p.timezone,
      timeWindowStart: t.timeWindowStart || p.timeWindowStart,
      timeWindowEnd: t.timeWindowEnd || p.timeWindowEnd,
    }));
    toast.success(`Template "${t.name}" loaded`);
  };

  const addIvrOption = () => {
    if (form.ivrOptions.length >= 9) return;
    const nextDigit = String(form.ivrOptions.length + 1);
    setForm(p => ({ ...p, ivrOptions: [...p.ivrOptions, { digit: nextDigit, action: "confirm", label: "" }] }));
  };

  const removeIvrOption = (idx: number) => {
    setForm(p => ({ ...p, ivrOptions: p.ivrOptions.filter((_, i) => i !== idx) }));
  };

  const toggleState = (state: string) => {
    setForm(p => ({
      ...p,
      targetStates: p.targetStates.includes(state)
        ? p.targetStates.filter(s => s !== state)
        : [...p.targetStates, state],
    }));
  };

  const readyAudioFiles = useMemo(() => audioFiles.data?.filter(f => f.status === "ready") || [], [audioFiles.data]);

  const completionRate = useMemo(() => {
    if (!campaignStats.data || campaignStats.data.total === 0) return 0;
    return Math.round((campaignStats.data.completed / campaignStats.data.total) * 100);
  }, [campaignStats.data]);

  // Campaign Detail View
  if (detailId && campaignDetail.data) {
    const c = campaignDetail.data;
    const stats = campaignStats.data;
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Button variant="ghost" size="sm" onClick={() => setDetailId(null)} className="mb-2">&larr; Back to Campaigns</Button>
              <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
              <p className="text-muted-foreground mt-1">{c.description || "No description"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_COLORS[c.status] || "outline"} className="text-sm px-3 py-1">{c.status}</Badge>
              {/* Clone button */}
              <Button variant="outline" size="sm" onClick={() => { setCloneId(c.id); setCloneName(`${c.name} (Copy)`); setCloneOpen(true); }}>
                <Copy className="h-4 w-4 mr-1" />Clone
              </Button>
              {c.status === "draft" && (
                <Button onClick={() => startCampaign.mutate({ id: c.id })} disabled={startCampaign.isPending}>
                  <Play className="h-4 w-4 mr-2" />{startCampaign.isPending ? "Starting..." : "Start"}
                </Button>
              )}
              {c.status === "running" && (
                <>
                  <Button variant="outline" onClick={() => pauseCampaign.mutate({ id: c.id })} disabled={pauseCampaign.isPending}>
                    <Pause className="h-4 w-4 mr-2" />Pause
                  </Button>
                  <Button variant="destructive" onClick={() => cancelCampaign.mutate({ id: c.id })} disabled={cancelCampaign.isPending}>
                    <StopCircle className="h-4 w-4 mr-2" />Stop
                  </Button>
                </>
              )}
              {c.status === "paused" && (
                <Button onClick={() => startCampaign.mutate({ id: c.id })} disabled={startCampaign.isPending}>
                  <Play className="h-4 w-4 mr-2" />Resume
                </Button>
              )}
              {(c.status === "draft" || c.status === "completed" || c.status === "cancelled") && (
                <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this campaign?")) deleteCampaign.mutate({ id: c.id }); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress */}
          {stats && (
            <Card>
              <CardHeader><CardTitle className="text-base">Campaign Progress</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span>{stats.completed} / {stats.total} calls completed</span>
                  <span className="font-bold">{completionRate}%</span>
                </div>
                <Progress value={completionRate} className="h-3" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <div className="text-2xl font-bold text-green-600">{stats.answered}</div>
                    <div className="text-xs text-muted-foreground">Answered</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                    <div className="text-2xl font-bold text-yellow-600">{stats.busy}</div>
                    <div className="text-xs text-muted-foreground">Busy</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                    <div className="text-2xl font-bold text-orange-600">{stats.noAnswer}</div>
                    <div className="text-xs text-muted-foreground">No Answer</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </div>
                {stats.active > 0 && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />{stats.active} active call{stats.active > 1 ? "s" : ""} in progress
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Campaign Settings */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Voice</span><span className="capitalize">{c.voice || "alloy"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Concurrent Calls</span><span>{c.maxConcurrentCalls}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Retry Attempts</span><span>{c.retryAttempts}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Retry Delay</span><span>{c.retryDelay}s</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Caller ID</span><span>{c.callerIdNumber || "DID Rotation"}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Timezone</span><span>{c.timezone}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Time Window</span><span>{c.timeWindowStart} - {c.timeWindowEnd}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span>{c.startedAt ? new Date(c.startedAt).toLocaleString() : "Not started"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{c.completedAt ? new Date(c.completedAt).toLocaleString() : "—"}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Features</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">IVR</span>
                  <Badge variant={c.ivrEnabled ? "default" : "outline"}>{c.ivrEnabled ? "Enabled" : "Disabled"}</Badge>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Geo Targeting</span>
                  <Badge variant={c.useGeoCallerIds ? "default" : "outline"}>{c.useGeoCallerIds ? "Active" : "Off"}</Badge>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">A/B Test</span>
                  <span>{c.abTestGroup || "None"}{c.abTestVariant ? ` (${c.abTestVariant})` : ""}</span>
                </div>
                {c.targetStates && typeof c.targetStates === "string" && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Target States</span>
                    <span className="text-right max-w-[150px] truncate">{c.targetStates || "All"}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation(`/call-logs?campaign=${c.id}`)}>
              <BarChart3 className="h-4 w-4 mr-2" />View Call Logs
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Campaign List View
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground mt-1">Create and manage broadcast calling campaigns</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>

              {/* Template loader */}
              {templates.data && templates.data.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 mb-2">
                  <Wand2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Load from template:</span>
                  <Select onValueChange={v => loadTemplate(parseInt(v))}>
                    <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>
                      {templates.data.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="dialing">Dialing</TabsTrigger>
                  <TabsTrigger value="ivr">IVR</TabsTrigger>
                  <TabsTrigger value="targeting">Targeting</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div><Label>Campaign Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. March Promo Blast" /></div>
                  <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Campaign description..." /></div>
                  <div>
                    <Label>Contact List *</Label>
                    <Select value={form.contactListId ? String(form.contactListId) : ""} onValueChange={v => setForm(p => ({ ...p, contactListId: parseInt(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Select a contact list" /></SelectTrigger>
                      <SelectContent>
                        {contactLists.data?.map(l => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.contactCount} contacts)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Personalized TTS Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <div>
                      <Label className="text-base font-semibold">Personalized TTS Messages</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Generate unique audio per contact with merge fields (name, caller ID, etc.)</p>
                    </div>
                    <Switch checked={form.usePersonalizedTTS} onCheckedChange={v => setForm(p => ({ ...p, usePersonalizedTTS: v }))} />
                  </div>

                  {form.usePersonalizedTTS ? (
                    <div className="space-y-3">
                      {/* Message Template */}
                      <div>
                        <Label className="text-sm font-medium">Message Script Template *</Label>
                        <p className="text-xs text-muted-foreground mb-2">Click merge fields below to insert dynamic placeholders into your script.</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {MERGE_FIELDS.map(f => (
                            <Button key={f.key} type="button" variant="outline" size="sm" className="h-7 text-xs px-2 font-mono" onClick={() => insertMergeField(f.key)}>
                              {`{{${f.key}}}`}
                            </Button>
                          ))}
                        </div>
                        <Textarea
                          ref={messageRef}
                          value={form.messageText}
                          onChange={e => setForm(p => ({ ...p, messageText: e.target.value }))}
                          placeholder={`Hello {{first_name}} {{last_name}}, this serves as a final notice to remind you that your overdue balance remains outstanding. Should you require any assistance or wish to discuss setting up a repayment plan, please do not hesitate to contact us at {{caller_id}}. Thank you for your attention to this matter.`}
                          className="min-h-[120px] font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">{form.messageText.length} characters</p>
                      </div>

                      {/* Live Preview */}
                      {form.messageText && (
                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Live Preview (sample contact)</Label>
                          <p className="text-sm mt-1.5 leading-relaxed">{getMessagePreview()}</p>
                        </div>
                      )}

                      {/* Voice & Speed */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Voice</Label>
                          <Select value={form.voice} onValueChange={v => setForm(p => ({ ...p, voice: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["alloy","echo","fable","onyx","nova","shimmer"].map(v => (
                                <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Speed: {form.ttsSpeed}x</Label>
                          <Input type="range" min="0.25" max="4.0" step="0.25" value={form.ttsSpeed}
                            onChange={e => setForm(p => ({ ...p, ttsSpeed: e.target.value }))} className="mt-2" />
                          <div className="flex justify-between text-xs text-muted-foreground"><span>0.25x</span><span>1.0x</span><span>4.0x</span></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Static Audio File */}
                      <div>
                        <Label>Audio File (pre-recorded)</Label>
                        <Select value={form.audioFileId ? String(form.audioFileId) : ""} onValueChange={v => setForm(p => ({ ...p, audioFileId: parseInt(v) }))}>
                          <SelectTrigger><SelectValue placeholder="Select an audio file" /></SelectTrigger>
                          <SelectContent>
                            {readyAudioFiles.map(f => (
                              <SelectItem key={f.id} value={String(f.id)}>{f.name} ({f.voice})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Voice</Label>
                        <Select value={form.voice} onValueChange={v => setForm(p => ({ ...p, voice: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["alloy","echo","fable","onyx","nova","shimmer"].map(v => (
                              <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* DID Rotation */}
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label>DID Rotation</Label>
                      <p className="text-xs text-muted-foreground">Automatically rotate through your active caller IDs</p>
                    </div>
                    <Switch checked={form.useDidRotation} onCheckedChange={v => setForm(p => ({ ...p, useDidRotation: v }))} />
                  </div>

                  {/* A/B Testing */}
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>A/B Test Group</Label><Input value={form.abTestGroup} onChange={e => setForm(p => ({ ...p, abTestGroup: e.target.value }))} placeholder="e.g. spring-2026" /></div>
                    <div><Label>Variant</Label>
                      <Select value={form.abTestVariant || "none"} onValueChange={v => setForm(p => ({ ...p, abTestVariant: v === "none" ? "" : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No A/B Test</SelectItem>
                          <SelectItem value="A">Variant A</SelectItem>
                          <SelectItem value="B">Variant B</SelectItem>
                          <SelectItem value="C">Variant C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="dialing" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Caller ID Number</Label><Input value={form.callerIdNumber} onChange={e => setForm(p => ({ ...p, callerIdNumber: e.target.value }))} placeholder="Leave blank for DID rotation" /></div>
                    <div><Label>Caller ID Name</Label><Input value={form.callerIdName} onChange={e => setForm(p => ({ ...p, callerIdName: e.target.value }))} placeholder="e.g. My Company" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Leave Caller ID blank to use automatic DID rotation from your Caller ID pool.</p>
                  <div>
                    <Label>Max Concurrent Calls</Label>
                    <Input type="number" min={1} max={50} value={form.maxConcurrentCalls} onChange={e => setForm(p => ({ ...p, maxConcurrentCalls: parseInt(e.target.value) || 1 }))} />
                    <p className="text-xs text-muted-foreground mt-1">Number of simultaneous outbound calls (1-50)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Retry Attempts</Label><Input type="number" min={0} max={5} value={form.retryAttempts} onChange={e => setForm(p => ({ ...p, retryAttempts: parseInt(e.target.value) || 0 }))} /></div>
                    <div><Label>Retry Delay (seconds)</Label><Input type="number" min={60} max={3600} value={form.retryDelay} onChange={e => setForm(p => ({ ...p, retryDelay: parseInt(e.target.value) || 300 }))} /></div>
                  </div>
                </TabsContent>

                <TabsContent value="ivr" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Interactive Voice Response (IVR)</Label>
                      <p className="text-xs text-muted-foreground mt-1">Allow callers to press keys to take actions during the broadcast</p>
                    </div>
                    <Switch checked={form.ivrEnabled} onCheckedChange={v => setForm(p => ({ ...p, ivrEnabled: v }))} />
                  </div>
                  {form.ivrEnabled && (
                    <div className="space-y-3">
                      {form.ivrOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border">
                          <Badge variant="outline" className="w-8 h-8 flex items-center justify-center text-lg font-mono">{opt.digit}</Badge>
                          <Select value={opt.action} onValueChange={v => {
                            const updated = [...form.ivrOptions];
                            updated[idx] = { ...updated[idx], action: v };
                            setForm(p => ({ ...p, ivrOptions: updated }));
                          }}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {IVR_ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input placeholder="Label (e.g. Press 1 to confirm)" value={opt.label}
                            onChange={e => {
                              const updated = [...form.ivrOptions];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              setForm(p => ({ ...p, ivrOptions: updated }));
                            }} className="flex-1" />
                          <Button variant="ghost" size="sm" onClick={() => removeIvrOption(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addIvrOption} disabled={form.ivrOptions.length >= 9}>
                        <Plus className="h-4 w-4 mr-1" />Add IVR Option
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="targeting" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Geographic Caller ID Matching</Label>
                      <p className="text-xs text-muted-foreground mt-1">Automatically match caller IDs to contact area codes/states</p>
                    </div>
                    <Switch checked={form.useGeoCallerIds} onCheckedChange={v => setForm(p => ({ ...p, useGeoCallerIds: v }))} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2"><MapPin className="h-4 w-4" />Target States</Label>
                    <p className="text-xs text-muted-foreground mb-2">Only dial contacts in selected states. Leave empty to dial all.</p>
                    <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto p-2 border rounded-lg">
                      {US_STATES.map(state => (
                        <Badge key={state} variant={form.targetStates.includes(state) ? "default" : "outline"}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => toggleState(state)}>{state}</Badge>
                      ))}
                    </div>
                    {form.targetStates.length > 0 && (
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{form.targetStates.length} state{form.targetStates.length > 1 ? "s" : ""} selected</span>
                        <Button variant="ghost" size="sm" onClick={() => setForm(p => ({ ...p, targetStates: [] }))}>Clear All</Button>
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm">
                    <div className="flex items-center gap-2 mb-1"><Shield className="h-4 w-4 text-blue-600" /><span className="font-medium text-blue-600">TCPA Compliance</span></div>
                    <p className="text-muted-foreground text-xs">Calls are automatically checked against TCPA time windows (8 AM - 9 PM local time) based on each contact's area code timezone. Contacts outside the allowed window are deferred until the next valid time.</p>
                  </div>
                </TabsContent>

                <TabsContent value="schedule" className="space-y-4 mt-4">
                  <div>
                    <Label>Timezone</Label>
                    <Select value={form.timezone} onValueChange={v => setForm(p => ({ ...p, timezone: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","Pacific/Honolulu","America/Anchorage","UTC"].map(tz => (
                          <SelectItem key={tz} value={tz}>{tz.replace("America/", "").replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Window Start</Label><Input type="time" value={form.timeWindowStart} onChange={e => setForm(p => ({ ...p, timeWindowStart: e.target.value }))} /></div>
                    <div><Label>Window End</Label><Input type="time" value={form.timeWindowEnd} onChange={e => setForm(p => ({ ...p, timeWindowEnd: e.target.value }))} /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Calls will only be placed within this time window. TCPA compliance auto-checks each contact's local time.</p>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button
                  onClick={() => createCampaign.mutate({
                    name: form.name,
                    description: form.description || undefined,
                    contactListId: form.contactListId,
                    audioFileId: form.audioFileId || undefined,
                    voice: form.voice as any,
                    callerIdNumber: form.callerIdNumber || undefined,
                    callerIdName: form.callerIdName || undefined,
                    maxConcurrentCalls: form.maxConcurrentCalls,
                    retryAttempts: form.retryAttempts,
                    retryDelay: form.retryDelay,
                    timezone: form.timezone,
                    timeWindowStart: form.timeWindowStart,
                    timeWindowEnd: form.timeWindowEnd,
                    ivrEnabled: form.ivrEnabled ? 1 : 0,
                    ivrOptions: form.ivrEnabled ? form.ivrOptions : undefined,
                    abTestGroup: form.abTestGroup || undefined,
                    abTestVariant: form.abTestVariant || undefined,
                    targetStates: form.targetStates.length > 0 ? form.targetStates : undefined,
                    useGeoCallerIds: form.useGeoCallerIds ? 1 : 0,
                    usePersonalizedTTS: form.usePersonalizedTTS ? 1 : 0,
                    messageText: form.usePersonalizedTTS ? form.messageText : undefined,
                    ttsSpeed: form.ttsSpeed !== "1.0" ? form.ttsSpeed : undefined,
                    useDidRotation: form.useDidRotation ? 1 : 0,
                  })}
                  disabled={!form.name || !form.contactListId || (form.usePersonalizedTTS && !form.messageText) || createCampaign.isPending}
                >
                  {createCampaign.isPending ? "Creating..." : "Create Campaign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!campaigns.data?.length ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first broadcast campaign to get started.</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.data.map(campaign => (
              <Card key={campaign.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailId(campaign.id)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate">{campaign.name}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Badge variant={STATUS_COLORS[campaign.status] || "outline"}>{campaign.status}</Badge>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => {
                        e.stopPropagation();
                        setCloneId(campaign.id); setCloneName(`${campaign.name} (Copy)`); setCloneOpen(true);
                      }}><Copy className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">{campaign.description || "No description"}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{campaign.totalContacts}</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{campaign.completedCalls}/{campaign.totalContacts}</span>
                    <span className="flex items-center gap-1"><Volume2 className="h-3 w-3 capitalize" />{campaign.voice}</span>
                  </div>
                  {campaign.status === "running" && campaign.totalContacts > 0 && (
                    <Progress value={(campaign.completedCalls / campaign.totalContacts) * 100} className="h-1.5 mt-2" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Clone Dialog */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clone Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>New Campaign Name</Label><Input value={cloneName} onChange={e => setCloneName(e.target.value)} /></div>
            <p className="text-sm text-muted-foreground">All settings from the original campaign will be copied. The new campaign will start in "draft" status.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (cloneId) cloneCampaign.mutate({ id: cloneId, name: cloneName }); }} disabled={!cloneName || cloneCampaign.isPending}>
              {cloneCampaign.isPending ? "Cloning..." : "Clone Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
