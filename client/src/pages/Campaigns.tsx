import { useState, useMemo, useRef, useEffect } from "react";
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
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Play, Pause, StopCircle, Trash2, Megaphone, Copy, Pencil,
  Clock, Users, Volume2, Phone, BarChart3, Loader2, MapPin, Shield, Wand2, RotateCcw, XCircle, Zap, RefreshCw, Tag,
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

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

const GOOGLE_VOICES = [
  { id: "en-US-Wavenet-A", label: "Wavenet A (Male)", gender: "Male", type: "Wavenet" },
  { id: "en-US-Wavenet-B", label: "Wavenet B (Male)", gender: "Male", type: "Wavenet" },
  { id: "en-US-Wavenet-C", label: "Wavenet C (Female)", gender: "Female", type: "Wavenet" },
  { id: "en-US-Wavenet-D", label: "Wavenet D (Male)", gender: "Male", type: "Wavenet" },
  { id: "en-US-Wavenet-E", label: "Wavenet E (Female)", gender: "Female", type: "Wavenet" },
  { id: "en-US-Wavenet-F", label: "Wavenet F (Female)", gender: "Female", type: "Wavenet" },
  { id: "en-US-Wavenet-G", label: "Wavenet G (Female)", gender: "Female", type: "Wavenet" },
  { id: "en-US-Wavenet-H", label: "Wavenet H (Female)", gender: "Female", type: "Wavenet" },
  { id: "en-US-Wavenet-I", label: "Wavenet I (Male)", gender: "Male", type: "Wavenet" },
  { id: "en-US-Wavenet-J", label: "Wavenet J (Male)", gender: "Male", type: "Wavenet" },
  { id: "en-US-Neural2-A", label: "Neural2 A (Male)", gender: "Male", type: "Neural2" },
  { id: "en-US-Neural2-C", label: "Neural2 C (Female)", gender: "Female", type: "Neural2" },
  { id: "en-US-Neural2-D", label: "Neural2 D (Male)", gender: "Male", type: "Neural2" },
  { id: "en-US-Neural2-E", label: "Neural2 E (Female)", gender: "Female", type: "Neural2" },
  { id: "en-US-Neural2-F", label: "Neural2 F (Female)", gender: "Female", type: "Neural2" },
  { id: "en-US-Neural2-G", label: "Neural2 G (Female)", gender: "Female", type: "Neural2" },
  { id: "en-US-Neural2-H", label: "Neural2 H (Female)", gender: "Female", type: "Neural2" },
  { id: "en-US-Neural2-I", label: "Neural2 I (Male)", gender: "Male", type: "Neural2" },
  { id: "en-US-Neural2-J", label: "Neural2 J (Male)", gender: "Male", type: "Neural2" },
  { id: "en-US-Studio-M", label: "Studio M (Male)", gender: "Male", type: "Studio" },
  { id: "en-US-Studio-O", label: "Studio O (Female)", gender: "Female", type: "Studio" },
  { id: "en-US-Studio-Q", label: "Studio Q (Male)", gender: "Male", type: "Studio" },
];

const MERGE_FIELDS = [
  { key: "first_name", label: "First Name", example: "John" },
  { key: "last_name", label: "Last Name", example: "Smith" },
  { key: "full_name", label: "Full Name", example: "John Smith" },
  { key: "caller_id", label: "Caller ID", example: "(407) 555-1177" },
  { key: "callback_number", label: "Callback #", example: "four zero seven, five five five, one two three four" },
  { key: "company", label: "Company", example: "Acme Corp" },
  { key: "state", label: "State", example: "FL" },
  { key: "database_name", label: "Database", example: "Spring 2026" },
  { key: "phone", label: "Phone", example: "4075551177" },
];

type FormState = {
  name: string; description: string; contactListId: number; audioFileId: number;
  voice: string; ttsProvider: "openai" | "google"; callerIdNumber: string; callerIdName: string;
  maxConcurrentCalls: number; cpsLimit: number; retryAttempts: number; retryDelay: number;
  timezone: string; timeWindowStart: string; timeWindowEnd: string;
  ivrEnabled: boolean; ivrOptions: { digit: string; action: string; label: string }[];
  abTestGroup: string; abTestVariant: string;
  targetStates: string[]; useGeoCallerIds: boolean;
  usePersonalizedTTS: boolean; messageText: string; ttsSpeed: string;
  useDidRotation: boolean;
  didLabel: string;
  scriptId: number; callbackNumber: string; useDidCallbackNumber: boolean;
  pacingMode: "fixed" | "adaptive" | "predictive";
  pacingTargetDropRate: number; pacingMinConcurrent: number; pacingMaxConcurrent: number;
  // Predictive dialer
  predictiveAgentCount: number; predictiveMaxAbandonRate: number;
  // Voicemail drop / AMD
  amdEnabled: boolean; voicemailAudioId: number; voicemailMessage: string;
  // IVR Payment
  ivrPaymentEnabled: boolean; ivrPaymentDigit: string; ivrPaymentAmount: number;
  // Timezone enforcement
  tzEnforcementEnabled: boolean; tcpaStartHour: number; tcpaEndHour: number;
  // Routing mode & Voice AI
  routingMode: "broadcast" | "live_agent" | "hybrid" | "voice_ai";
  voiceAiPromptId: number;
};

const DEFAULT_FORM: FormState = {
  name: "", description: "", contactListId: 0, audioFileId: 0,
  voice: "alloy", ttsProvider: "openai", callerIdNumber: "", callerIdName: "",
  maxConcurrentCalls: 5, cpsLimit: 1, retryAttempts: 0, retryDelay: 300,
  timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
  ivrEnabled: false, ivrOptions: [], abTestGroup: "", abTestVariant: "",
  targetStates: [], useGeoCallerIds: false,
  usePersonalizedTTS: false, messageText: "", ttsSpeed: "1.0",
  useDidRotation: false, didLabel: "", scriptId: 0, callbackNumber: "", useDidCallbackNumber: false,
  pacingMode: "fixed", pacingTargetDropRate: 3, pacingMinConcurrent: 1, pacingMaxConcurrent: 10,
  predictiveAgentCount: 1, predictiveMaxAbandonRate: 3,
  amdEnabled: false, voicemailAudioId: 0, voicemailMessage: "",
  ivrPaymentEnabled: false, ivrPaymentDigit: "1", ivrPaymentAmount: 0,
  tzEnforcementEnabled: true, tcpaStartHour: 8, tcpaEndHour: 21,
  routingMode: "broadcast", voiceAiPromptId: 0,
};

function VoiceSelector({ value, provider, onVoiceChange, onProviderChange }: {
  value: string; provider: "openai" | "google";
  onVoiceChange: (v: string) => void; onProviderChange: (p: "openai" | "google") => void;
}) {
  return (
    <div className="space-y-2">
      <Label>TTS Provider</Label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`p-2 rounded-lg border text-center text-sm transition-colors ${
          provider === "openai" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
        }`} onClick={() => { onProviderChange("openai"); onVoiceChange("alloy"); }}>
          <div className="font-medium">OpenAI</div>
          <div className="text-xs text-muted-foreground">6 voices</div>
        </button>
        <button type="button" className={`p-2 rounded-lg border text-center text-sm transition-colors ${
          provider === "google" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
        }`} onClick={() => { onProviderChange("google"); onVoiceChange("en-US-Wavenet-C"); }}>
          <div className="font-medium">Google Cloud</div>
          <div className="text-xs text-muted-foreground">22 voices</div>
        </button>
      </div>
      <Label>Voice</Label>
      {provider === "openai" ? (
        <Select value={value} onValueChange={onVoiceChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPENAI_VOICES.map(v => (
              <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select value={value} onValueChange={onVoiceChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Studio", "Wavenet", "Neural2"].map(type => (
              <div key={type}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{type}</div>
                {GOOGLE_VOICES.filter(v => v.type === type).map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function CampaignFormTabs({ form, setForm, messageRef, contactLists, readyAudioFiles, templates, scripts, didLabels, labelCounts }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  messageRef: React.RefObject<HTMLTextAreaElement | null>;
  contactLists: any;
  readyAudioFiles: any[];
  templates: any;
  scripts: any;
  didLabels: string[];
  labelCounts: { label: string | null; count: number }[];
}) {
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
    const t = templates?.find((t: any) => t.id === templateId);
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

  return (
    <>
      {/* Template loader */}
      {templates && templates.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 mb-2">
          <Wand2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Load from template:</span>
          <Select onValueChange={v => loadTemplate(parseInt(v))}>
            <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Select template" /></SelectTrigger>
            <SelectContent>
              {templates.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
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
                {contactLists?.map((l: any) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.contactCount} contacts)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Routing Mode */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Routing Mode</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: "broadcast", label: "Broadcast", desc: "Play TTS/audio" },
                { value: "live_agent", label: "Live Agent", desc: "Transfer to agent" },
                { value: "hybrid", label: "Hybrid", desc: "TTS then agent" },
                { value: "voice_ai", label: "Voice AI", desc: "AI conversation" },
              ].map(mode => (
                <button key={mode.value} type="button" className={`p-2 rounded-lg border text-center text-sm transition-colors ${
                  form.routingMode === mode.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                }`} onClick={() => setForm(p => ({ ...p, routingMode: mode.value as any }))}>
                  <div className="font-medium">{mode.label}</div>
                  <div className="text-xs text-muted-foreground">{mode.desc}</div>
                </button>
              ))}
            </div>
            {form.routingMode === "voice_ai" && (
              <div className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-sm text-muted-foreground mb-2">Select a Voice AI prompt to control the AI agent's behavior during calls.</p>
                <Label>Voice AI Prompt</Label>
                <Select value={form.voiceAiPromptId ? String(form.voiceAiPromptId) : ""} onValueChange={v => setForm(p => ({ ...p, voiceAiPromptId: parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select a Voice AI prompt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None (use default)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Create and manage prompts in the Voice AI section.</p>
              </div>
            )}
          </div>

          {/* Audio Mode Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Audio Source</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button type="button" onClick={() => setForm(p => ({ ...p, usePersonalizedTTS: false, scriptId: 0 }))}
                className={`p-3 rounded-lg border text-left transition-colors ${!form.usePersonalizedTTS && !form.scriptId ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}>
                <div className="text-sm font-medium">Static Audio</div>
                <div className="text-xs text-muted-foreground mt-0.5">Pre-recorded file</div>
              </button>
              <button type="button" onClick={() => setForm(p => ({ ...p, usePersonalizedTTS: true, scriptId: 0 }))}
                className={`p-3 rounded-lg border text-left transition-colors ${form.usePersonalizedTTS && !form.scriptId ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}>
                <div className="text-sm font-medium">Personalized TTS</div>
                <div className="text-xs text-muted-foreground mt-0.5">Single TTS with merge fields</div>
              </button>
              <button type="button" onClick={() => setForm(p => ({ ...p, usePersonalizedTTS: false, scriptId: -1 }))}
                className={`p-3 rounded-lg border text-left transition-colors ${form.scriptId ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}>
                <div className="text-sm font-medium">Call Script</div>
                <div className="text-xs text-muted-foreground mt-0.5">Multi-segment TTS + audio</div>
              </button>
            </div>
          </div>

          {/* Call Script Selection */}
          {form.scriptId !== 0 && !form.usePersonalizedTTS && (
            <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div>
                <Label>Select Call Script *</Label>
                <Select value={form.scriptId > 0 ? String(form.scriptId) : ""} onValueChange={v => setForm(p => ({ ...p, scriptId: parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Choose a call script" /></SelectTrigger>
                  <SelectContent>
                    {(scripts || []).filter((s: any) => s.status === 'active').map((s: any) => {
                      const segs = s.segments || [];
                      const ttsCount = segs.filter((seg: any) => seg.type === 'tts').length;
                      const recCount = segs.filter((seg: any) => seg.type === 'recorded').length;
                      return <SelectItem key={s.id} value={String(s.id)}>{s.name} ({ttsCount} TTS, {recCount} recorded)</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Scripts contain ordered TTS and recorded segments. TTS segments support merge fields for personalization.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Callback Number</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Use DID Rotation #</Label>
                    <Switch checked={form.useDidCallbackNumber} onCheckedChange={v => setForm(p => ({ ...p, useDidCallbackNumber: v }))} />
                  </div>
                </div>
                {form.useDidCallbackNumber ? (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <span>Callback number will match the rotating DID used for each call</span>
                    </p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">Each contact hears the same number that appeared on their caller ID</p>
                  </div>
                ) : (
                  <>
                    <Input value={form.callbackNumber} onChange={e => setForm(p => ({ ...p, callbackNumber: e.target.value }))}
                      placeholder="e.g. 4075551234" className="font-mono" />
                    <p className="text-xs text-muted-foreground mt-0.5">Used for {'{'}{'{'} callback_number {'}'}{'}'}  merge field (spoken as digits in TTS)</p>
                  </>
                )}
              </div>
            </div>
          )}

          {!form.scriptId && form.usePersonalizedTTS ? (
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
                  placeholder={`Hello {{first_name}} {{last_name}}, this serves as a final notice...`}
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
                <VoiceSelector
                  value={form.voice}
                  provider={form.ttsProvider}
                  onVoiceChange={v => setForm(p => ({ ...p, voice: v }))}
                  onProviderChange={p => setForm(prev => ({ ...prev, ttsProvider: p }))}
                />
                <div>
                  <Label>Speed: {form.ttsSpeed}x</Label>
                  <Input type="range" min="0.25" max="4.0" step="0.25" value={form.ttsSpeed}
                    onChange={e => setForm(p => ({ ...p, ttsSpeed: e.target.value }))} className="mt-2" />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>0.25x</span><span>1.0x</span><span>4.0x</span></div>
                </div>
              </div>

              {/* Callback Number for Personalized TTS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Callback Number</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Use DID Rotation #</Label>
                    <Switch checked={form.useDidCallbackNumber} onCheckedChange={v => setForm(p => ({ ...p, useDidCallbackNumber: v }))} />
                  </div>
                </div>
                {form.useDidCallbackNumber ? (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <span>Callback number will match the rotating DID used for each call</span>
                    </p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">Both <code className="font-mono text-xs bg-blue-100 dark:bg-blue-900/50 px-1 rounded">{'{{callback_number}}'}</code> and <code className="font-mono text-xs bg-blue-100 dark:bg-blue-900/50 px-1 rounded">{'{{caller_id}}'}</code> will resolve to the rotating DID</p>
                  </div>
                ) : (
                  <>
                    <Input
                      value={form.callbackNumber}
                      onChange={e => setForm(p => ({ ...p, callbackNumber: e.target.value }))}
                      placeholder="e.g. 4075551234"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Used for <code className="font-mono">{'{{callback_number}}'}</code> merge field (spoken as digits in TTS)</p>
                  </>
                )}
              </div>
            </div>
          ) : !form.scriptId ? (
            <>
              {/* Static Audio File */}
              <div>
                <Label>Audio File (pre-recorded)</Label>
                <Select value={form.audioFileId ? String(form.audioFileId) : ""} onValueChange={v => setForm(p => ({ ...p, audioFileId: parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select an audio file" /></SelectTrigger>
                  <SelectContent>
                    {readyAudioFiles.map((f: any) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name} ({f.voice})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <VoiceSelector
                value={form.voice}
                provider={form.ttsProvider}
                onVoiceChange={v => setForm(p => ({ ...p, voice: v }))}
                onProviderChange={p => setForm(prev => ({ ...prev, ttsProvider: p }))}
              />
            </>
          ) : null}

          {/* DID Rotation */}
          <div className="p-3 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>DID Rotation</Label>
                <p className="text-xs text-muted-foreground">Automatically rotate through your active caller IDs</p>
              </div>
              <Switch checked={form.useDidRotation} onCheckedChange={v => setForm(p => ({ ...p, useDidRotation: v }))} />
            </div>
            {form.useDidRotation && (
              <div className="pt-2 border-t">
                <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                  <Tag className="h-3.5 w-3.5" /> DID Pool Label (optional)
                </Label>
                <Select value={form.didLabel || "__all__"} onValueChange={v => setForm(p => ({ ...p, didLabel: v === "__all__" ? "" : v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All active DIDs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">
                      All Active DIDs
                      <span className="ml-2 text-xs text-muted-foreground">({labelCounts.reduce((sum, lc) => sum + lc.count, 0)} DIDs)</span>
                    </SelectItem>
                    {(didLabels || []).map(label => {
                      const lc = labelCounts.find(c => c.label === label);
                      return (
                        <SelectItem key={label} value={label}>
                          {label}
                          <span className="ml-2 text-xs text-muted-foreground">({lc?.count || 0} DIDs)</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.didLabel
                    ? `Only DIDs labeled "${form.didLabel}" will be used (${labelCounts.find(c => c.label === form.didLabel)?.count || 0} DIDs)`
                    : `All active DIDs will be used for rotation (${labelCounts.reduce((sum, lc) => sum + lc.count, 0)} DIDs)`}
                </p>
              </div>
            )}
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
            <Label className="flex items-center justify-between">
              <span>Max Concurrent Calls</span>
              <span className="font-bold text-primary">{form.maxConcurrentCalls}</span>
            </Label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[form.maxConcurrentCalls]}
              onValueChange={([v]) => setForm(p => ({ ...p, maxConcurrentCalls: v }))}
              className="mt-2"
            />
            <div className="flex gap-1.5 mt-2">
              {[{l:"1",v:1},{l:"3",v:3},{l:"5",v:5},{l:"10",v:10}].map(p => (
                <Button key={p.l} type="button" variant={form.maxConcurrentCalls === p.v ? "default" : "outline"} size="sm" className="flex-1 text-xs h-6" onClick={() => setForm(f => ({ ...f, maxConcurrentCalls: p.v }))}>
                  {p.v}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Maximum simultaneous calls for this campaign (1-10). Cannot exceed agent's max.</p>
          </div>

          <div>
            <Label className="flex items-center justify-between">
              <span>Calls Per Second (CPS)</span>
              <span className="font-bold text-primary">{form.cpsLimit} CPS</span>
            </Label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[form.cpsLimit]}
              onValueChange={([v]) => setForm(p => ({ ...p, cpsLimit: v }))}
              className="mt-2"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">1 (safe)</span>
              <span className="text-[10px] text-muted-foreground">10 (max)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Controls how fast new calls are initiated. Lower values reduce carrier errors.</p>
          </div>

          {/* Call Pacing Mode */}
          <div className="p-4 rounded-lg border space-y-4">
            <div>
              <Label className="text-base font-semibold">Call Pacing Mode</Label>
              <p className="text-xs text-muted-foreground">Controls how concurrent call volume is managed during the campaign</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["fixed", "adaptive", "predictive"] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    form.pacingMode === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setForm(p => ({ ...p, pacingMode: mode }))}
                >
                  <div className="font-medium capitalize text-sm">{mode}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {mode === "fixed" && "Static call limit"}
                    {mode === "adaptive" && "Adjusts to answer rate"}
                    {mode === "predictive" && "AI-optimized pacing"}
                  </div>
                </button>
              ))}
            </div>
            {form.pacingMode !== "fixed" && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label>Target Drop Rate: {form.pacingTargetDropRate}%</Label>
                  <Input type="range" min={1} max={10} step={1} value={form.pacingTargetDropRate}
                    onChange={e => setForm(p => ({ ...p, pacingTargetDropRate: parseInt(e.target.value) }))} className="mt-1" />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>1% (conservative)</span><span>10% (aggressive)</span></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Min Concurrent</Label>
                    <Input type="number" min={1} max={50} value={form.pacingMinConcurrent}
                      onChange={e => setForm(p => ({ ...p, pacingMinConcurrent: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label>Max Concurrent</Label>
                    <Input type="number" min={1} max={100} value={form.pacingMaxConcurrent}
                      onChange={e => setForm(p => ({ ...p, pacingMaxConcurrent: parseInt(e.target.value) || 10 }))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {form.pacingMode === "adaptive" 
                    ? "Adaptive mode adjusts concurrent calls based on real-time answer and drop rates within a 60-second rolling window."
                    : "Predictive mode uses Erlang-C inspired algorithm with overdial ratio calculation, circuit breaker protection, and TCPA abandon rate compliance."}
                </p>
                {form.pacingMode === "predictive" && (
                  <div className="space-y-3 pt-3 border-t border-dashed">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">Predictive Dialer Settings</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Agent/Line Count</Label>
                        <Input type="number" min={1} max={50} value={form.predictiveAgentCount}
                          onChange={e => setForm(p => ({ ...p, predictiveAgentCount: parseInt(e.target.value) || 1 }))} />
                        <p className="text-xs text-muted-foreground mt-1">Number of available lines/agents</p>
                      </div>
                      <div>
                        <Label>Max Abandon Rate: {form.predictiveMaxAbandonRate}%</Label>
                        <Input type="range" min={1} max={5} step={0.5} value={form.predictiveMaxAbandonRate}
                          onChange={e => setForm(p => ({ ...p, predictiveMaxAbandonRate: parseFloat(e.target.value) }))} className="mt-1" />
                        <div className="flex justify-between text-xs text-muted-foreground"><span>1% (safe)</span><span>TCPA limit: 3%</span><span>5%</span></div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">The predictive engine calculates an overdial ratio based on answer rate and dynamically adjusts concurrent calls. A circuit breaker activates if 3+ consecutive calls are abandoned, reducing to minimum for 30 seconds.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* AMD / Voicemail Drop */}
          <div className="p-4 rounded-lg border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Answering Machine Detection (AMD)</Label>
                <p className="text-xs text-muted-foreground mt-1">Detect voicemail and automatically leave a pre-recorded message</p>
              </div>
              <Switch checked={form.amdEnabled} onCheckedChange={v => setForm(p => ({ ...p, amdEnabled: v }))} />
            </div>
            {form.amdEnabled && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label>Voicemail Message (TTS)</Label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Hi, this is a message from... Please call us back at..."
                    value={form.voicemailMessage}
                    onChange={e => setForm(p => ({ ...p, voicemailMessage: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">This message will be converted to speech and played when a voicemail is detected. Leave empty to use the main campaign audio.</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-amber-600">How AMD Works</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    <li>When a call is answered, Asterisk's AMD module analyzes the audio</li>
                    <li>If a <strong>human</strong> is detected, the full campaign message plays normally</li>
                    <li>If a <strong>machine/voicemail</strong> is detected, the voicemail message is played after the beep</li>
                    <li>AMD results are tracked in call logs for analytics</li>
                  </ul>
                </div>
              </div>
            )}
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

          {/* IVR Payment Integration */}
          <div className="p-4 rounded-lg border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">IVR Payment Collection</Label>
                <p className="text-xs text-muted-foreground mt-1">Allow callers to initiate payments during the call via DTMF</p>
              </div>
              <Switch checked={form.ivrPaymentEnabled} onCheckedChange={v => setForm(p => ({ ...p, ivrPaymentEnabled: v }))} />
            </div>
            {form.ivrPaymentEnabled && (
              <div className="space-y-3 pt-2 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Payment Trigger Digit</Label>
                    <Select value={form.ivrPaymentDigit} onValueChange={v => setForm(p => ({ ...p, ivrPaymentDigit: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["1","2","3","4","5","6","7","8","9","0"].map(d => (
                          <SelectItem key={d} value={d}>Press {d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Default Amount ($)</Label>
                    <Input type="number" min={0} step={0.01} value={form.ivrPaymentAmount / 100}
                      onChange={e => setForm(p => ({ ...p, ivrPaymentAmount: Math.round(parseFloat(e.target.value || "0") * 100) }))} />
                    <p className="text-xs text-muted-foreground mt-1">0 = use contact's balance</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-green-600">Payment Flow</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Caller presses the trigger digit during the IVR message</li>
                    <li>System creates a payment record and sends a secure payment link via SMS</li>
                    <li>Payment completion is tracked and reported in campaign analytics</li>
                    <li>Requires Stripe integration for actual card processing</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
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
          {/* Timezone Enforcement */}
          <div className="p-4 rounded-lg border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-blue-600" />TCPA Timezone Enforcement</Label>
                <p className="text-xs text-muted-foreground mt-1">Automatically enforce per-contact call windows based on area code timezone lookup</p>
              </div>
              <Switch checked={form.tzEnforcementEnabled} onCheckedChange={v => setForm(p => ({ ...p, tzEnforcementEnabled: v }))} />
            </div>
            {form.tzEnforcementEnabled && (
              <div className="space-y-3 pt-2 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Earliest Call Hour (local time)</Label>
                    <Select value={String(form.tcpaStartHour)} onValueChange={v => setForm(p => ({ ...p, tcpaStartHour: parseInt(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 12}, (_, i) => i + 6).map(h => (
                          <SelectItem key={h} value={String(h)}>{h === 12 ? "12:00 PM" : h > 12 ? `${h-12}:00 PM` : `${h}:00 AM`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Latest Call Hour (local time)</Label>
                    <Select value={String(form.tcpaEndHour)} onValueChange={v => setForm(p => ({ ...p, tcpaEndHour: parseInt(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 10}, (_, i) => i + 17).map(h => (
                          <SelectItem key={h} value={String(h)}>{h === 12 ? "12:00 PM" : h > 12 ? `${h-12}:00 PM` : `${h}:00 AM`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm">
                  <div className="flex items-center gap-2 mb-1"><Shield className="h-4 w-4 text-blue-600" /><span className="font-medium text-blue-600">How It Works</span></div>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Each contact's timezone is determined from their phone number area code</li>
                    <li>Before dialing, the system checks if the current time in the contact's timezone falls within the allowed window</li>
                    <li>Contacts outside the window are <strong>deferred</strong> (not skipped) and will be called when their local time is within the window</li>
                    <li>Default: {form.tcpaStartHour > 12 ? `${form.tcpaStartHour-12} PM` : `${form.tcpaStartHour} AM`} - {form.tcpaEndHour > 12 ? `${form.tcpaEndHour-12} PM` : `${form.tcpaEndHour} AM`} in the contact's local timezone</li>
                    <li>TCPA requires calls between 8 AM and 9 PM local time</li>
                  </ul>
                </div>
              </div>
            )}
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
    </>
  );
}

function RetryFailedButton({ campaignId, isPending, onRetry }: { campaignId: number; isPending: boolean; onRetry: () => void }) {
  const { data: retriable } = trpc.campaigns.getRetriableCount.useQuery({ id: campaignId });
  const count = retriable?.count ?? 0;
  if (count === 0) return null;
  return (
    <Button variant="outline" size="sm" className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30" onClick={() => {
      if (confirm(`Retry ${count} failed/no-answer contact(s)?\n\nThis will:\n\u2022 Clear call logs for failed, no-answer, and busy contacts\n\u2022 Re-queue them for dialing\n\u2022 Keep answered contacts untouched\n\u2022 Set campaign to Paused (click Resume to start)\n\nPreviously answered contacts will NOT be re-dialed.`)) {
        onRetry();
      }
    }} disabled={isPending}>
      <RotateCcw className="h-4 w-4 mr-1" />{isPending ? "Retrying..." : `Retry Failed (${count})`}
    </Button>
  );
}

export default function Campaigns() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneId, setCloneId] = useState<number | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [editForm, setEditForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<number[]>([]);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const editMessageRef = useRef<HTMLTextAreaElement>(null);

  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const campaigns = trpc.campaigns.list.useQuery();
  const contactLists = trpc.contactLists.list.useQuery();
  const audioFiles = trpc.audio.list.useQuery();
  const templates = trpc.templates.list.useQuery();
  const callScripts = trpc.callScripts.list.useQuery();
  const campaignDetail = trpc.campaigns.get.useQuery({ id: detailId! }, { enabled: !!detailId });
  const campaignStats = trpc.campaigns.stats.useQuery({ id: detailId! }, { enabled: !!detailId, refetchInterval: detailId ? 5000 : false });
  const { data: didLabels } = trpc.callerIds.getLabels.useQuery();
  const { data: labelCounts = [] } = trpc.callerIds.labelCounts.useQuery();

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setCreateOpen(false); setForm({ ...DEFAULT_FORM }); toast.success("Campaign created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateCampaign = trpc.campaigns.update.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); setEditOpen(false); toast.success("Campaign updated"); },
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
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign stopped"); },
    onError: (e) => toast.error(e.message),
  });

  const cancelCampaign = trpc.campaigns.cancel.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign cancelled"); },
    onError: (e) => toast.error(e.message),
  });

  const reactivateCampaign = trpc.campaigns.reactivate.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign reactivated — set to draft"); },
    onError: (e) => toast.error(e.message),
  });

  const replayCampaign = trpc.campaigns.replay.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); utils.campaigns.stats.invalidate(); utils.dashboard.stats.invalidate(); toast.success("Campaign reset for replay — set to draft. Click Start to begin dialing."); },
    onError: (e) => toast.error(e.message),
  });

  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setDetailId(null); toast.success("Campaign deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const resetCallHistory = trpc.campaigns.resetCallHistory.useMutation({
    onSuccess: (data) => { utils.campaigns.list.invalidate(); utils.campaigns.stats.invalidate(); utils.dashboard.stats.invalidate(); toast.success(`Call history reset — ${data.deletedLogs} call logs cleared. Campaign set back to draft.`); },
    onError: (e) => toast.error(e.message),
  });

  const retryFailed = trpc.campaigns.retryFailed.useMutation({
    onSuccess: (data) => { utils.campaigns.list.invalidate(); utils.campaigns.stats.invalidate(); utils.campaigns.getRetriableCount.invalidate(); utils.dashboard.stats.invalidate(); toast.success(`${data.retriedCount} failed contact(s) queued for retry — campaign set to paused. Click Resume to start dialing.`); },
    onError: (e) => toast.error(e.message),
  });

  const forceResume = trpc.campaigns.forceResume.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); utils.dashboard.stats.invalidate(); toast.success("Campaign force-resumed — dialer loop restarted"); },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteCampaigns = trpc.campaigns.bulkDelete.useMutation({
    onSuccess: (r) => {
      utils.campaigns.list.invalidate();
      setSelectedCampaignIds([]);
      let msg = `Deleted ${r.deleted} campaign(s)`;
      if (r.skipped > 0) msg += ` (${r.skipped} running campaigns skipped)`;
      toast.success(msg);
    },
    onError: (e) => toast.error(e.message),
  });

  // Campaign scheduling
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleCampaignId, setScheduleCampaignId] = useState<number | null>(null);
  const campaignSchedule = trpc.campaigns.getSchedule.useQuery({ campaignId: detailId! }, { enabled: !!detailId });

  const scheduleCampaign = trpc.campaigns.schedule.useMutation({
    onSuccess: () => { utils.campaigns.getSchedule.invalidate(); toast.success("Campaign scheduled for auto-launch"); setScheduleOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const cancelSchedule = trpc.campaigns.cancelSchedule.useMutation({
    onSuccess: () => { utils.campaigns.getSchedule.invalidate(); toast.success("Schedule cancelled"); },
    onError: (e) => toast.error(e.message),
  });

  // Campaign templates
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateDesc, setSaveTemplateDesc] = useState("");
  const [saveTemplateCampaignId, setSaveTemplateCampaignId] = useState<number | null>(null);
  const campaignTemplatesList = trpc.campaignTemplates.list.useQuery();
  const saveFromCampaign = trpc.campaignTemplates.saveFromCampaign.useMutation({
    onSuccess: () => { utils.campaignTemplates.list.invalidate(); setTemplateDialogOpen(false); setSaveTemplateName(""); setSaveTemplateDesc(""); toast.success("Campaign saved as template"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteTemplate = trpc.campaignTemplates.delete.useMutation({
    onSuccess: () => { utils.campaignTemplates.list.invalidate(); toast.success("Template deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const readyAudioFiles = useMemo(() => audioFiles.data?.filter(f => f.status === "ready") || [], [audioFiles.data]);

  const completionRate = useMemo(() => {
    if (!campaignStats.data || campaignStats.data.total === 0) return 0;
    return Math.round((campaignStats.data.completed / campaignStats.data.total) * 100);
  }, [campaignStats.data]);

  const openEditDialog = (c: any) => {
    const isGoogleVoice = c.voice?.startsWith("en-US-");
    setEditForm({
      name: c.name || "",
      description: c.description || "",
      contactListId: c.contactListId || 0,
      audioFileId: c.audioFileId || 0,
      voice: c.voice || "alloy",
      ttsProvider: isGoogleVoice ? "google" : "openai",
      callerIdNumber: c.callerIdNumber || "",
      callerIdName: c.callerIdName || "",
      maxConcurrentCalls: c.maxConcurrentCalls || 5,
      cpsLimit: (c as any).cpsLimit || 1,
      retryAttempts: c.retryAttempts || 0,
      retryDelay: c.retryDelay || 300,
      timezone: c.timezone || "America/New_York",
      timeWindowStart: c.timeWindowStart || "09:00",
      timeWindowEnd: c.timeWindowEnd || "21:00",
      ivrEnabled: !!c.ivrEnabled,
      ivrOptions: c.ivrOptions ? (typeof c.ivrOptions === "string" ? JSON.parse(c.ivrOptions) : c.ivrOptions) : [],
      abTestGroup: c.abTestGroup || "",
      abTestVariant: c.abTestVariant || "",
      targetStates: c.targetStates ? (typeof c.targetStates === "string" ? c.targetStates.split(",").filter(Boolean) : c.targetStates) : [],
      useGeoCallerIds: !!c.useGeoCallerIds,
      usePersonalizedTTS: !!c.usePersonalizedTTS,
      messageText: c.messageText || "",
      ttsSpeed: c.ttsSpeed || "1.0",
      useDidRotation: !!c.useDidRotation,
      didLabel: (c as any).didLabel || "",
      pacingMode: (c as any).pacingMode || "fixed",
      pacingTargetDropRate: (c as any).pacingTargetDropRate || 3,
      pacingMinConcurrent: (c as any).pacingMinConcurrent || 1,
      pacingMaxConcurrent: (c as any).pacingMaxConcurrent || 10,
      scriptId: (c as any).scriptId || 0,
      callbackNumber: (c as any).callbackNumber || "",
      useDidCallbackNumber: !!(c as any).useDidCallbackNumber,
      predictiveAgentCount: (c as any).predictiveAgentCount || 1,
      predictiveMaxAbandonRate: (c as any).predictiveMaxAbandonRate || 3,
      amdEnabled: !!(c as any).amdEnabled,
      voicemailAudioId: (c as any).voicemailAudioId || 0,
      voicemailMessage: (c as any).voicemailMessage || "",
      ivrPaymentEnabled: !!(c as any).ivrPaymentEnabled,
      ivrPaymentDigit: (c as any).ivrPaymentDigit || "1",
      ivrPaymentAmount: (c as any).ivrPaymentAmount || 0,
      tzEnforcementEnabled: (c as any).tzEnforcementEnabled !== false,
      tcpaStartHour: (c as any).tcpaStartHour ?? 8,
      tcpaEndHour: (c as any).tcpaEndHour ?? 21,
      routingMode: (c as any).routingMode || "broadcast",
      voiceAiPromptId: (c as any).voiceAiPromptId || 0,
    });
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (!detailId) return;
    updateCampaign.mutate({
      id: detailId,
      name: editForm.name,
      description: editForm.description || undefined,
      contactListId: editForm.contactListId,
      audioFileId: editForm.audioFileId || undefined,
      voice: editForm.voice as any,
      ttsProvider: editForm.ttsProvider,
      callerIdNumber: editForm.callerIdNumber || undefined,
      callerIdName: editForm.callerIdName || undefined,
      maxConcurrentCalls: editForm.maxConcurrentCalls,
      retryAttempts: editForm.retryAttempts,
      retryDelay: editForm.retryDelay,
      timezone: editForm.timezone,
      timeWindowStart: editForm.timeWindowStart,
      timeWindowEnd: editForm.timeWindowEnd,
      ivrEnabled: editForm.ivrEnabled ? 1 : 0,
      ivrOptions: editForm.ivrEnabled ? editForm.ivrOptions : undefined,
      abTestGroup: editForm.abTestGroup || undefined,
      abTestVariant: editForm.abTestVariant || undefined,
      targetStates: editForm.targetStates.length > 0 ? editForm.targetStates : undefined,
      useGeoCallerIds: editForm.useGeoCallerIds ? 1 : 0,
      usePersonalizedTTS: editForm.usePersonalizedTTS ? 1 : 0,
      messageText: editForm.usePersonalizedTTS ? editForm.messageText : undefined,
      ttsSpeed: editForm.ttsSpeed !== "1.0" ? editForm.ttsSpeed : undefined,
      useDidRotation: editForm.useDidRotation ? 1 : 0,
      didLabel: editForm.useDidRotation && editForm.didLabel ? editForm.didLabel : null,
      pacingMode: editForm.pacingMode,
      pacingTargetDropRate: editForm.pacingMode !== "fixed" ? editForm.pacingTargetDropRate : undefined,
      pacingMinConcurrent: editForm.pacingMode !== "fixed" ? editForm.pacingMinConcurrent : undefined,
      pacingMaxConcurrent: editForm.pacingMode !== "fixed" ? editForm.pacingMaxConcurrent : undefined,
      scriptId: editForm.scriptId || undefined,
      callbackNumber: editForm.callbackNumber || undefined,
      useDidCallbackNumber: editForm.useDidCallbackNumber ? 1 : 0,
      // Predictive dialer
      predictiveAgentCount: editForm.pacingMode === "predictive" ? editForm.predictiveAgentCount : undefined,
      predictiveMaxAbandonRate: editForm.pacingMode === "predictive" ? editForm.predictiveMaxAbandonRate : undefined,
      // AMD / Voicemail drop
      amdEnabled: editForm.amdEnabled ? 1 : 0,
      voicemailMessage: editForm.amdEnabled ? editForm.voicemailMessage || undefined : undefined,
      voicemailAudioId: editForm.amdEnabled && editForm.voicemailAudioId ? editForm.voicemailAudioId : undefined,
      // IVR Payment
      ivrPaymentEnabled: editForm.ivrPaymentEnabled ? 1 : 0,
      ivrPaymentDigit: editForm.ivrPaymentEnabled ? editForm.ivrPaymentDigit : undefined,
      ivrPaymentAmount: editForm.ivrPaymentEnabled ? editForm.ivrPaymentAmount : undefined,
      // Timezone enforcement
      tzEnforcementEnabled: editForm.tzEnforcementEnabled ? 1 : 0,
      tcpaStartHour: editForm.tzEnforcementEnabled ? editForm.tcpaStartHour : undefined,
      tcpaEndHour: editForm.tzEnforcementEnabled ? editForm.tcpaEndHour : undefined,
      // Routing mode & Voice AI
      routingMode: editForm.routingMode,
      voiceAiPromptId: editForm.routingMode === "voice_ai" ? editForm.voiceAiPromptId || undefined : undefined,
    });
  };
  const submitCreate = () => {
    createCampaign.mutate({
      name: form.name,
      description: form.description || undefined,
      contactListId: form.contactListId,
      audioFileId: form.audioFileId || undefined,
      voice: form.voice as any,
      ttsProvider: form.ttsProvider,
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
      didLabel: form.useDidRotation && form.didLabel ? form.didLabel : null,
      pacingMode: form.pacingMode,
      pacingTargetDropRate: form.pacingMode !== "fixed" ? form.pacingTargetDropRate : undefined,
      pacingMinConcurrent: form.pacingMode !== "fixed" ? form.pacingMinConcurrent : undefined,
      pacingMaxConcurrent: form.pacingMode !== "fixed" ? form.pacingMaxConcurrent : undefined,
      scriptId: form.scriptId || undefined,
      callbackNumber: form.callbackNumber || undefined,
      useDidCallbackNumber: form.useDidCallbackNumber ? 1 : 0,
      // Predictive dialer
      predictiveAgentCount: form.pacingMode === "predictive" ? form.predictiveAgentCount : undefined,
      predictiveMaxAbandonRate: form.pacingMode === "predictive" ? form.predictiveMaxAbandonRate : undefined,
      // AMD / Voicemail drop
      amdEnabled: form.amdEnabled ? 1 : 0,
      voicemailMessage: form.amdEnabled ? form.voicemailMessage || undefined : undefined,
      voicemailAudioId: form.amdEnabled && form.voicemailAudioId ? form.voicemailAudioId : undefined,
      // IVR Payment
      ivrPaymentEnabled: form.ivrPaymentEnabled ? 1 : 0,
      ivrPaymentDigit: form.ivrPaymentEnabled ? form.ivrPaymentDigit : undefined,
      ivrPaymentAmount: form.ivrPaymentEnabled ? form.ivrPaymentAmount : undefined,
      // Timezone enforcement
      tzEnforcementEnabled: form.tzEnforcementEnabled ? 1 : 0,
      tcpaStartHour: form.tzEnforcementEnabled ? form.tcpaStartHour : undefined,
      tcpaEndHour: form.tzEnforcementEnabled ? form.tcpaEndHour : undefined,
      // Routing mode & Voice AI
      routingMode: form.routingMode,
      voiceAiPromptId: form.routingMode === "voice_ai" ? form.voiceAiPromptId || undefined : undefined,
    });
  };

  // Campaign Detail View
  if (detailId && campaignDetail.data) {
    const c = campaignDetail.data;
    const stats = campaignStats.data;
    const canEdit = c.status === "draft" || c.status === "paused" || c.status === "completed" || c.status === "cancelled";
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <Button variant="ghost" size="sm" onClick={() => setDetailId(null)} className="mb-2">&larr; Back to Campaigns</Button>
              <h1 className="text-2xl font-bold tracking-tight truncate">{c.name}</h1>
              <p className="text-muted-foreground mt-1 line-clamp-2">{c.description || "No description"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_COLORS[c.status] || "outline"} className="text-sm px-3 py-1">{c.status}</Badge>
              {/* Edit button */}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => openEditDialog(c)}>
                  <Pencil className="h-4 w-4 mr-1" />Edit
                </Button>
              )}
              {/* Clone button */}
              <Button variant="outline" size="sm" onClick={() => { setCloneId(c.id); setCloneName(`${c.name} (Copy)`); setCloneOpen(true); }}>
                <Copy className="h-4 w-4 mr-1" />Clone
              </Button>
              {/* Reset Call History button - only for non-running campaigns */}
              {c.status !== "running" && (
                <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30" onClick={() => {
                  if (confirm("Reset all call history for this campaign? This will:\n\n• Delete all call logs and queue items\n• Reset campaign status to Draft\n• Allow all contacts to be re-dialed (bypasses 48-hour dedup)\n\nThis action cannot be undone.")) {
                    resetCallHistory.mutate({ id: c.id });
                  }
                }} disabled={resetCallHistory.isPending}>
                  <RotateCcw className="h-4 w-4 mr-1" />{resetCallHistory.isPending ? "Resetting..." : "Reset History"}
                </Button>
              )}
              {/* Retry Failed Only button */}
              {c.status !== "running" && c.status !== "draft" && (
                <RetryFailedButton campaignId={c.id} isPending={retryFailed.isPending} onRetry={() => {
                  retryFailed.mutate({ id: c.id });
                }} />
              )}
              {c.status === "draft" && (
                <Button onClick={() => startCampaign.mutate({ id: c.id })} disabled={startCampaign.isPending}>
                  <Play className="h-4 w-4 mr-2" />{startCampaign.isPending ? "Starting..." : "Start"}
                </Button>
              )}
              {c.status === "running" && (
                <>
                  <Button variant="destructive" onClick={() => pauseCampaign.mutate({ id: c.id })} disabled={pauseCampaign.isPending}>
                    <StopCircle className="h-4 w-4 mr-2" />Stop
                  </Button>
                </>
              )}
              {c.status === "paused" && (
                <>
                  <Button onClick={() => startCampaign.mutate({ id: c.id })} disabled={startCampaign.isPending}>
                    <Play className="h-4 w-4 mr-2" />Resume
                  </Button>
                  <Button variant="outline" className="text-destructive border-destructive/30" onClick={() => { if (confirm("Cancel this campaign? This will permanently stop it. You can reactivate it later.")) cancelCampaign.mutate({ id: c.id }); }} disabled={cancelCampaign.isPending}>
                    <XCircle className="h-4 w-4 mr-2" />Cancel
                  </Button>
                </>
              )}
              {c.status === "cancelled" && (
                <Button variant="outline" onClick={() => reactivateCampaign.mutate({ id: c.id })} disabled={reactivateCampaign.isPending}>
                  <RotateCcw className="h-4 w-4 mr-2" />{reactivateCampaign.isPending ? "Reactivating..." : "Reactivate"}
                </Button>
              )}
              {(c.status === "completed" || c.status === "cancelled") && (
                <Button
                  variant="outline"
                  className="text-primary border-primary/30 hover:bg-primary/10"
                  onClick={() => {
                    if (confirm("Replay this campaign?\n\nThis will reset all call stats and set the campaign back to draft. You can then click Start to re-dial all contacts.\n\nPrevious call logs will be preserved for reporting.")) {
                      replayCampaign.mutate({ id: c.id });
                    }
                  }}
                  disabled={replayCampaign.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />{replayCampaign.isPending ? "Resetting..." : "Replay Campaign"}
                </Button>
              )}
              {(c.status === "running" || c.status === "paused") && (
                <Button variant="outline" size="sm" className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30" onClick={() => {
                  if (confirm("Force resume this campaign?\n\nThis will restart the dialer loop for this campaign. Use this if the campaign appears stuck (showing 'running' or 'paused' but not actually dialing).\n\nIf the campaign is already actively dialing, this will show an error.")) {
                    forceResume.mutate({ id: c.id });
                  }
                }} disabled={forceResume.isPending}>
                  <Zap className="h-4 w-4 mr-1" />{forceResume.isPending ? "Resuming..." : "Force Resume"}
                </Button>
              )}
              {c.status === "draft" && (
                <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30" onClick={() => {
                  setScheduleCampaignId(c.id);
                  const now = new Date();
                  now.setHours(now.getHours() + 1, 0, 0, 0);
                  setScheduleDate(now.toISOString().split('T')[0]);
                  setScheduleTime(now.toTimeString().slice(0, 5));
                  setScheduleOpen(true);
                }}>
                  <Clock className="h-4 w-4 mr-1" />Schedule
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-teal-600 border-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30" onClick={() => {
                setSaveTemplateCampaignId(c.id);
                setSaveTemplateName(`${c.name} Template`);
                setTemplateDialogOpen(true);
              }}>
                <Copy className="h-4 w-4 mr-1" />Save Template
              </Button>
              {campaignSchedule.data && (
                <div className="flex items-center gap-2 text-sm text-indigo-600">
                  <Clock className="h-3 w-3" />
                  <span>Scheduled: {new Date(campaignSchedule.data.scheduledAt).toLocaleString()}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-destructive" onClick={() => cancelSchedule.mutate({ campaignId: c.id })}>
                    <XCircle className="h-3 w-3" />
                  </Button>
                </div>
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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Voice</span><span className="capitalize">{c.voice || "alloy"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">TTS Provider</span><span className="capitalize">{c.voice?.startsWith("en-US-") ? "Google Cloud" : "OpenAI"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Concurrent Calls</span><span>{c.maxConcurrentCalls}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pacing Mode</span><span className="capitalize">{(c as any).pacingMode || "fixed"}</span></div>
                {(c as any).pacingMode && (c as any).pacingMode !== "fixed" && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Target Drop Rate</span><span>{(c as any).pacingTargetDropRate || 3}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Pacing Range</span><span>{(c as any).pacingMinConcurrent || 1} - {(c as any).pacingMaxConcurrent || 10}</span></div>
                  </>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Retry Attempts</span><span>{c.retryAttempts}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Retry Delay</span><span>{c.retryDelay}s</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Caller ID</span><span>{c.callerIdNumber || "DID Rotation"}{(c as any).didLabel ? ` (${(c as any).didLabel})` : ""}</span></div>
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
                <div className="flex justify-between"><span className="text-muted-foreground">Personalized TTS</span>
                  <Badge variant={c.usePersonalizedTTS ? "default" : "outline"}>{c.usePersonalizedTTS ? "Active" : "Off"}</Badge>
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

        {/* Edit Campaign Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Campaign</DialogTitle></DialogHeader>
            <CampaignFormTabs
              form={editForm}
              setForm={setEditForm}
              messageRef={editMessageRef}
              contactLists={contactLists.data}
              readyAudioFiles={readyAudioFiles}
              templates={templates.data}
              scripts={callScripts.data}
              didLabels={didLabels || []}
              labelCounts={labelCounts}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                onClick={submitEdit}
                disabled={!editForm.name || !editForm.contactListId || (editForm.usePersonalizedTTS && !editForm.messageText) || updateCampaign.isPending}
              >
                {updateCampaign.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // Campaign List View
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground mt-1 text-sm">Create and manage broadcast calling campaigns</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            {selectedCampaignIds.length > 0 && (
              <Button variant="destructive" className="mr-2" onClick={() => {
                if (confirm(`Delete ${selectedCampaignIds.length} campaign(s)? Running campaigns will be skipped.`)) bulkDeleteCampaigns.mutate({ ids: selectedCampaignIds });
              }} disabled={bulkDeleteCampaigns.isPending}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedCampaignIds.length}
              </Button>
            )}
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
              <CampaignFormTabs
                form={form}
                setForm={setForm}
                messageRef={messageRef}
                contactLists={contactLists.data}
                readyAudioFiles={readyAudioFiles}
                templates={templates.data}
                scripts={callScripts.data}
                didLabels={didLabels || []}
                labelCounts={labelCounts}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); setForm({ ...DEFAULT_FORM }); }}>Cancel</Button>
                <Button
                  onClick={submitCreate}
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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.data.map(campaign => (
              <Card key={campaign.id} className="cursor-pointer hover:border-primary/50 transition-colors relative" onClick={() => setDetailId(campaign.id)}>
                <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedCampaignIds.includes(campaign.id)}
                    onCheckedChange={() => setSelectedCampaignIds(prev => prev.includes(campaign.id) ? prev.filter(i => i !== campaign.id) : [...prev, campaign.id])}
                  />
                </div>
                <CardHeader className="pb-3 pl-10">
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
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(campaign.createdAt).toLocaleDateString()}</span>
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
      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Campaign Launch</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Set a date and time for this campaign to automatically start dialing.</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} /></div>
              <div><Label>Time</Label><Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (scheduleCampaignId && scheduleDate && scheduleTime) {
                const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
                scheduleCampaign.mutate({ campaignId: scheduleCampaignId, scheduledAt });
              }
            }} disabled={!scheduleDate || !scheduleTime || scheduleCampaign.isPending}>
              {scheduleCampaign.isPending ? "Scheduling..." : "Schedule Launch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save Campaign as Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Template Name</Label><Input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)} /></div>
            <div><Label>Description (optional)</Label><Input value={saveTemplateDesc} onChange={e => setSaveTemplateDesc(e.target.value)} placeholder="Describe this template..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (saveTemplateCampaignId && saveTemplateName) {
                saveFromCampaign.mutate({ campaignId: saveTemplateCampaignId, name: saveTemplateName, description: saveTemplateDesc });
              }
            }} disabled={!saveTemplateName || saveFromCampaign.isPending}>
              {saveFromCampaign.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Templates List */}
      {campaignTemplatesList.data && campaignTemplatesList.data.length > 0 && !detailId && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button variant="outline" size="sm" className="shadow-lg" onClick={() => toast.info(`${campaignTemplatesList.data.length} template(s) available — use them when creating new campaigns`)}>
            {campaignTemplatesList.data.length} Template(s) Saved
          </Button>
        </div>
      )}
    </DashboardLayout>
  );
}
