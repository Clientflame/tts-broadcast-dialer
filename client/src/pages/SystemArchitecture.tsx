import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Megaphone, Users, Volume2, PhoneCall, Bot, Brain, Mic, Activity,
  Server, Database, Cloud, Wifi, ArrowRight, ArrowDown, Zap, Shield,
  Clock, BarChart3, Bell, RefreshCw, Gauge, Monitor, FileText,
  Phone, Settings, ChevronRight, Radio, Layers, GitBranch,
  CircleDot, Cpu, HardDrive, Globe, Lock, Headset, Workflow,
  Printer, ExternalLink, Download
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Flow Diagram: How a Call Gets Made ─────────────────────────────────────

function CallFlowDiagram() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const steps = [
    {
      id: 1,
      icon: Megaphone,
      title: "Campaign Created",
      desc: "Admin creates campaign with contact list, audio/script, caller IDs, and pacing settings",
      color: "from-amber-500 to-orange-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      detail: "Contacts are shuffled, deduped against 48hr window, and loaded into a hopper. Script segments are pre-generated via TTS if using call scripts."
    },
    {
      id: 2,
      icon: Volume2,
      title: "TTS Audio Generated",
      desc: "OpenAI or Google TTS converts script segments to MP3, then concatenates into single file",
      color: "from-blue-500 to-cyan-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      detail: "Each script segment is individually generated, uploaded to S3, then all segments are concatenated server-side into a single combined MP3 for reliable playback."
    },
    {
      id: 3,
      icon: Layers,
      title: "Call Queue Populated",
      desc: "Hopper creates call_queue entries in batches of 150 with caller ID rotation",
      color: "from-violet-500 to-purple-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      border: "border-violet-200 dark:border-violet-800",
      detail: "Contacts are converted to call_queue rows with round-robin caller ID assignment. DNC list is checked, timezone compliance is enforced, and priority is set."
    },
    {
      id: 4,
      icon: Server,
      title: "PBX Agent Polls",
      desc: "Agent on FreePBX server polls /api/pbx/poll every 2-3 seconds for pending calls",
      color: "from-emerald-500 to-green-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      detail: "Weighted load balancing distributes calls proportional to each agent's available capacity. Calls are claimed atomically to prevent double-dialing."
    },
    {
      id: 5,
      icon: Phone,
      title: "Asterisk Originates Call",
      desc: "PBX agent uses AMI to originate call through SIP trunk with assigned caller ID",
      color: "from-rose-500 to-red-600",
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-200 dark:border-rose-800",
      detail: "Call is placed via PJSIP trunk. On answer, the combined audio file is played. On no-answer/busy/congestion, result is reported back immediately."
    },
    {
      id: 6,
      icon: BarChart3,
      title: "Result Reported",
      desc: "Agent reports call result (answered, no-answer, busy, failed) back to the server",
      color: "from-sky-500 to-blue-600",
      bg: "bg-sky-50 dark:bg-sky-950/30",
      border: "border-sky-200 dark:border-sky-800",
      detail: "Call duration, disposition, and carrier errors are logged. Auto-throttle monitors error rates. Campaign completion is checked after each result."
    },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step, idx) => (
        <div key={step.id}>
          <div
            className={`relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer ${
              activeStep === step.id
                ? `${step.bg} ${step.border} shadow-lg scale-[1.01]`
                : "border-border/50 hover:border-border hover:shadow-sm"
            }`}
            onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
          >
            {/* Step number + icon */}
            <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-md`}>
              <step.icon className="h-6 w-6 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] font-mono px-1.5">
                  STEP {step.id}
                </Badge>
                <h4 className="font-semibold text-sm">{step.title}</h4>
              </div>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
              {activeStep === step.id && (
                <div className="mt-3 p-3 rounded-lg bg-background/80 border border-border/50 text-xs text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                  {step.detail}
                </div>
              )}
            </div>

            {/* Expand indicator */}
            <ChevronRight className={`h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-1 transition-transform duration-200 ${activeStep === step.id ? "rotate-90" : ""}`} />
          </div>

          {/* Connector arrow */}
          {idx < steps.length - 1 && (
            <div className="flex justify-center py-1">
              <div className="flex flex-col items-center">
                <div className="w-0.5 h-3 bg-gradient-to-b from-border to-transparent" />
                <ArrowDown className="h-3 w-3 text-muted-foreground/40" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── System Components Grid ─────────────────────────────────────────────────

function SystemComponentsGrid() {
  const components = [
    {
      category: "Core Engine",
      color: "from-orange-500 to-red-500",
      items: [
        { icon: Megaphone, name: "Dialer Engine", desc: "Campaign orchestration, hopper management, call queuing, pacing control, and automatic completion" },
        { icon: Gauge, name: "Pacing Controller", desc: "Adaptive CPS (calls per second) with configurable concurrent limits and inter-call delays" },
        { icon: Shield, name: "Auto-Throttle", desc: "Monitors carrier error rates and automatically reduces call volume to protect trunk health" },
        { icon: RefreshCw, name: "Caller ID Rotation", desc: "Round-robin DID rotation with per-campaign assignment and health-aware selection" },
      ]
    },
    {
      category: "Audio & TTS",
      color: "from-blue-500 to-cyan-500",
      items: [
        { icon: Volume2, name: "TTS Engine", desc: "Dual-provider TTS (OpenAI + Google) with voice selection, speed control, and S3 upload" },
        { icon: FileText, name: "Script Audio Builder", desc: "Multi-segment script-to-audio pipeline with server-side MP3 concatenation" },
        { icon: Mic, name: "Call Recordings", desc: "Automatic call recording with S3 storage, playback, and download capabilities" },
        { icon: Workflow, name: "Audio Concatenation", desc: "Downloads individual segment MP3s, concatenates into single file, uploads combined to S3" },
      ]
    },
    {
      category: "PBX Integration",
      color: "from-emerald-500 to-green-500",
      items: [
        { icon: Server, name: "PBX Agent", desc: "Python service on FreePBX that polls for calls, originates via AMI, and reports results" },
        { icon: Wifi, name: "PBX API", desc: "REST API for agent communication: poll, heartbeat, result reporting, health checks" },
        { icon: Radio, name: "AMI Connection", desc: "Asterisk Manager Interface for real-time call monitoring and channel management" },
        { icon: Activity, name: "Bridge Health Monitor", desc: "SSH-based proactive health checks every 5 minutes with status notifications" },
      ]
    },
    {
      category: "Intelligence",
      color: "from-violet-500 to-purple-500",
      items: [
        { icon: Bot, name: "Voice AI Bridge", desc: "OpenAI Realtime API integration for live AI-powered phone conversations" },
        { icon: Brain, name: "Agent Assist", desc: "Real-time AI coaching for live agents with whisper suggestions and call analysis" },
        { icon: Headset, name: "Supervisor Tools", desc: "Monitor, whisper, and barge into live calls with real-time audio bridging" },
        { icon: Zap, name: "AI Script Writer", desc: "LLM-powered call script generation with industry templates and personalization" },
      ]
    },
    {
      category: "Data & Analytics",
      color: "from-sky-500 to-blue-500",
      items: [
        { icon: Database, name: "TiDB Database", desc: "MySQL-compatible cloud database with Drizzle ORM for all campaign, contact, and call data" },
        { icon: Cloud, name: "S3 Storage", desc: "Audio files, recordings, and assets stored in S3 with CDN-backed public URLs" },
        { icon: BarChart3, name: "Analytics Engine", desc: "Real-time dashboards, campaign performance, DID analytics, and area code distribution" },
        { icon: Globe, name: "Timezone Compliance", desc: "Area code to timezone mapping for TCPA-compliant calling windows (8am-9pm local)" },
      ]
    },
    {
      category: "Operations",
      color: "from-rose-500 to-pink-500",
      items: [
        { icon: Clock, name: "Campaign Scheduler", desc: "Schedule campaigns to auto-launch at specific dates/times with timezone support" },
        { icon: Activity, name: "DID Health Checks", desc: "Automated caller ID validation via echo test (*43) with auto-disable on failure" },
        { icon: Bell, name: "Notification System", desc: "Real-time alerts for campaign completion, DID issues, agent status, and throttle events" },
        { icon: Lock, name: "Auth & RBAC", desc: "OAuth + local auth with admin/user roles, user groups, and permission-based access" },
      ]
    },
  ];

  return (
    <div className="space-y-8">
      {components.map((section) => (
        <div key={section.category}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-1 w-8 rounded-full bg-gradient-to-r ${section.color}`} />
            <h3 className="font-semibold text-base">{section.category}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {section.items.map((item) => (
              <div
                key={item.name}
                className="flex items-start gap-3 p-3.5 rounded-lg border border-border/60 hover:border-border hover:shadow-sm transition-all group"
              >
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${section.color} flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity`}>
                  <item.icon className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-medium text-sm">{item.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Architecture Layers Diagram ────────────────────────────────────────────

function ArchitectureLayers() {
  const layers = [
    {
      name: "Frontend (React + Tailwind)",
      color: "from-sky-400 to-blue-500",
      textColor: "text-white",
      items: ["Dashboard", "Campaign Manager", "Audio/TTS Studio", "Voice AI Console", "Wallboard", "Analytics", "Settings"],
    },
    {
      name: "API Layer (tRPC + Express)",
      color: "from-violet-400 to-purple-500",
      textColor: "text-white",
      items: ["tRPC Procedures", "PBX REST API", "OAuth Endpoints", "Voice AI WebSocket", "File Upload API"],
    },
    {
      name: "Service Layer (Business Logic)",
      color: "from-emerald-400 to-green-500",
      textColor: "text-white",
      items: ["Dialer Engine", "TTS Pipeline", "Pacing Controller", "Auto-Throttle", "Health Scheduler", "Notification Dispatcher"],
    },
    {
      name: "Infrastructure",
      color: "from-amber-400 to-orange-500",
      textColor: "text-white",
      items: ["TiDB (MySQL)", "S3 Storage", "FreePBX / Asterisk", "OpenAI API", "Google TTS API", "SSH Tunnel"],
    },
  ];

  return (
    <div className="space-y-2">
      {layers.map((layer, idx) => (
        <div key={layer.name}>
          <div className={`bg-gradient-to-r ${layer.color} rounded-xl p-4 shadow-md`}>
            <h4 className={`font-semibold text-sm ${layer.textColor} mb-2.5`}>{layer.name}</h4>
            <div className="flex flex-wrap gap-1.5">
              {layer.items.map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="bg-white/20 text-white border-white/30 text-[11px] font-medium backdrop-blur-sm hover:bg-white/30 transition-colors"
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>
          {idx < layers.length - 1 && (
            <div className="flex justify-center py-0.5">
              <div className="flex gap-6">
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Data Flow: Campaign Lifecycle ──────────────────────────────────────────

function CampaignLifecycle() {
  const phases = [
    { label: "Draft", color: "bg-gray-400", desc: "Campaign configured but not started" },
    { label: "Generating Audio", color: "bg-blue-500", desc: "TTS converting script segments to audio" },
    { label: "Active", color: "bg-green-500", desc: "Dialer engine processing call queue" },
    { label: "Paused", color: "bg-amber-500", desc: "Manually paused or outside calling hours" },
    { label: "Completed", color: "bg-emerald-600", desc: "All contacts dialed or campaign stopped" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {phases.map((phase, idx) => (
        <div key={phase.label} className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-card">
            <div className={`w-2.5 h-2.5 rounded-full ${phase.color}`} />
            <div>
              <span className="text-xs font-semibold">{phase.label}</span>
              <p className="text-[10px] text-muted-foreground">{phase.desc}</p>
            </div>
          </div>
          {idx < phases.length - 1 && (
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Key Metrics Display ────────────────────────────────────────────────────

function KeyMetrics() {
  const metrics = [
    { label: "Hopper Batch Size", value: "150", desc: "Contacts converted to call_queue per batch" },
    { label: "Dedup Window", value: "48 hrs", desc: "Prevents calling same number within window" },
    { label: "Agent Poll Interval", value: "2-3s", desc: "How often PBX agent checks for new calls" },
    { label: "Health Check Interval", value: "5 min", desc: "Bridge health SSH ping frequency" },
    { label: "Heartbeat Threshold", value: "60s", desc: "Agent considered offline after this" },
    { label: "Max Health Queue", value: "50", desc: "Flood guard for health check calls" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {metrics.map((m) => (
        <div key={m.label} className="p-3 rounded-lg border border-border/60 bg-card text-center">
          <div className="text-lg font-bold font-mono text-primary">{m.value}</div>
          <div className="text-xs font-medium mt-0.5">{m.label}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ─── PBX Agent Communication Diagram ────────────────────────────────────────

function PbxAgentDiagram() {
  return (
    <div className="space-y-4">
      {/* Two boxes with arrows between them */}
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        {/* Web Server */}
        <div className="flex-1 border-2 border-violet-200 dark:border-violet-800 rounded-xl p-4 bg-violet-50/50 dark:bg-violet-950/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Globe className="h-4 w-4 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-sm">Web Server (Cloud)</h4>
              <p className="text-[10px] text-muted-foreground">Node.js + Express + tRPC</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              "Campaign management & UI",
              "Call queue (MySQL/TiDB)",
              "TTS generation & S3 upload",
              "Analytics & reporting",
              "User auth & RBAC",
              "Notification dispatch",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDot className="h-2.5 w-2.5 text-violet-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Arrows */}
        <div className="flex flex-col items-center justify-center gap-2 py-2 md:py-0">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-mono">POST /poll</span>
            <ArrowRight className="h-3 w-3 text-emerald-500 hidden md:block" />
            <ArrowDown className="h-3 w-3 text-emerald-500 md:hidden" />
          </div>
          <div className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 text-blue-500 rotate-180 hidden md:block" />
            <ArrowDown className="h-3 w-3 text-blue-500 rotate-180 md:hidden" />
            <span className="text-[9px] text-muted-foreground font-mono">POST /result</span>
          </div>
          <div className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 text-amber-500 rotate-180 hidden md:block" />
            <ArrowDown className="h-3 w-3 text-amber-500 rotate-180 md:hidden" />
            <span className="text-[9px] text-muted-foreground font-mono">POST /heartbeat</span>
          </div>
        </div>

        {/* FreePBX Server */}
        <div className="flex-1 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <Server className="h-4 w-4 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-sm">FreePBX Server (On-Prem)</h4>
              <p className="text-[10px] text-muted-foreground">Asterisk + PBX Agent (Python)</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              "PBX Agent (systemd service)",
              "Voice AI Bridge (WebSocket)",
              "Asterisk AMI originate calls",
              "SIP trunk to carrier (Vitel)",
              "Call recording & playback",
              "Echo test health checks (*43)",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDot className="h-2.5 w-2.5 text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* External Services */}
      <div className="border-2 border-sky-200 dark:border-sky-800 rounded-xl p-4 bg-sky-50/50 dark:bg-sky-950/20">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <Cloud className="h-4 w-4 text-white" />
          </div>
          <h4 className="font-semibold text-sm">External Services</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "OpenAI TTS", desc: "Text-to-speech generation" },
            { name: "Google TTS", desc: "Alternative TTS provider" },
            { name: "OpenAI Realtime", desc: "Voice AI conversations" },
            { name: "S3 Storage", desc: "Audio & recording files" },
            { name: "TiDB Cloud", desc: "MySQL-compatible database" },
            { name: "Vitel SIP Trunk", desc: "Outbound call carrier" },
          ].map((svc) => (
            <div key={svc.name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-white/60 dark:bg-sky-950/40">
              <Zap className="h-3 w-3 text-sky-500" />
              <div>
                <span className="text-xs font-medium">{svc.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">{svc.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Database Schema Overview ───────────────────────────────────────────────

function DatabaseOverview() {
  const tables = [
    { name: "users", desc: "User accounts with roles (admin/user)", rows: "Auth, RBAC" },
    { name: "campaigns", desc: "Broadcast campaigns with settings", rows: "Core" },
    { name: "contact_lists", desc: "Contact list metadata", rows: "Core" },
    { name: "contacts", desc: "Individual phone contacts", rows: "Core" },
    { name: "call_queue", desc: "Pending/active/completed calls", rows: "Core" },
    { name: "call_logs", desc: "Historical call records", rows: "Analytics" },
    { name: "audio_files", desc: "Uploaded & generated audio", rows: "Media" },
    { name: "call_scripts", desc: "Multi-segment call scripts", rows: "Media" },
    { name: "caller_ids", desc: "DIDs with health tracking", rows: "Telephony" },
    { name: "pbx_agents", desc: "Registered PBX agent instances", rows: "Telephony" },
    { name: "dnc_list", desc: "Do-Not-Call numbers", rows: "Compliance" },
    { name: "voice_ai_prompts", desc: "AI agent prompt configs", rows: "AI" },
    { name: "voice_ai_conversations", desc: "AI call transcripts", rows: "AI" },
    { name: "audit_logs", desc: "System-wide audit trail", rows: "Operations" },
    { name: "app_settings", desc: "Global configuration KV store", rows: "Config" },
    { name: "health_check_schedule", desc: "DID health check timing", rows: "Operations" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {tables.map((t) => (
        <div key={t.name} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 hover:border-border transition-colors">
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono font-semibold">{t.name}</span>
            <span className="text-[10px] text-muted-foreground ml-2">{t.desc}</span>
          </div>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 flex-shrink-0">{t.rows}</Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Tech Stack ─────────────────────────────────────────────────────────────

function TechStack() {
  const categories = [
    {
      title: "Frontend",
      color: "from-sky-500 to-blue-500",
      techs: [
        { name: "React", version: "19.2", desc: "UI component library with hooks & concurrent features", url: "https://react.dev" },
        { name: "TypeScript", version: "5.9", desc: "Strongly-typed JavaScript superset", url: "https://www.typescriptlang.org" },
        { name: "Tailwind CSS", version: "4.1", desc: "Utility-first CSS framework", url: "https://tailwindcss.com" },
        { name: "Vite", version: "7.1", desc: "Next-gen frontend build tool with HMR", url: "https://vite.dev" },
        { name: "shadcn/ui", version: "—", desc: "Radix-based accessible component library", url: "https://ui.shadcn.com" },
        { name: "Recharts", version: "2.15", desc: "Composable charting library for React", url: "https://recharts.org" },
        { name: "Wouter", version: "3.3", desc: "Lightweight React router (1.5KB)", url: "https://github.com/molefrog/wouter" },
        { name: "Framer Motion", version: "12.23", desc: "Production-ready animation library", url: "https://www.framer.com/motion" },
      ]
    },
    {
      title: "Backend",
      color: "from-emerald-500 to-green-500",
      techs: [
        { name: "Node.js", version: "22.13", desc: "JavaScript runtime with V8 engine", url: "https://nodejs.org" },
        { name: "Express", version: "4.21", desc: "Minimal web framework for Node.js", url: "https://expressjs.com" },
        { name: "tRPC", version: "11.6", desc: "End-to-end typesafe API layer", url: "https://trpc.io" },
        { name: "Drizzle ORM", version: "0.44", desc: "TypeScript ORM with SQL-like query builder", url: "https://orm.drizzle.team" },
        { name: "Zod", version: "4.1", desc: "TypeScript-first schema validation", url: "https://zod.dev" },
        { name: "SSH2", version: "1.17", desc: "SSH client for FreePBX remote management", url: "https://github.com/mscdex/ssh2" },
        { name: "Jose", version: "6.1", desc: "JWT/JWS/JWE implementation for auth", url: "https://github.com/panva/jose" },
        { name: "Nodemailer", version: "8.0", desc: "Email sending for notifications & verification", url: "https://nodemailer.com" },
      ]
    },
    {
      title: "Infrastructure",
      color: "from-amber-500 to-orange-500",
      techs: [
        { name: "TiDB Cloud", version: "MySQL 8.0", desc: "Distributed MySQL-compatible cloud database", url: "https://tidbcloud.com" },
        { name: "AWS S3", version: "SDK 3.x", desc: "Object storage for audio files & recordings", url: "https://aws.amazon.com/s3" },
        { name: "FreePBX", version: "17", desc: "Open-source PBX management UI for Asterisk", url: "https://www.freepbx.org" },
        { name: "Asterisk", version: "22.7", desc: "Open-source telephony engine (SIP/PJSIP)", url: "https://www.asterisk.org" },
        { name: "Debian", version: "12", desc: "PBX server OS (Bookworm)", url: "https://www.debian.org" },
      ]
    },
    {
      title: "AI & APIs",
      color: "from-violet-500 to-purple-500",
      techs: [
        { name: "OpenAI TTS", version: "tts-1-hd", desc: "High-quality text-to-speech (6 voices)", url: "https://platform.openai.com/docs/guides/text-to-speech" },
        { name: "Google TTS", version: "v1", desc: "Cloud Text-to-Speech with WaveNet voices", url: "https://cloud.google.com/text-to-speech" },
        { name: "OpenAI Realtime", version: "gpt-4o", desc: "Real-time voice AI conversations", url: "https://platform.openai.com/docs/guides/realtime" },
        { name: "OpenAI Chat", version: "gpt-4o", desc: "LLM for script generation & agent assist", url: "https://platform.openai.com/docs/guides/chat" },
      ]
    },
    {
      title: "Dev Tools",
      color: "from-rose-500 to-pink-500",
      techs: [
        { name: "pnpm", version: "10.4", desc: "Fast, disk-efficient package manager", url: "https://pnpm.io" },
        { name: "Vitest", version: "2.1", desc: "Vite-native unit test framework", url: "https://vitest.dev" },
        { name: "Drizzle Kit", version: "0.31", desc: "Database migration & schema push tool", url: "https://orm.drizzle.team/kit-docs/overview" },
        { name: "TSX", version: "4.19", desc: "TypeScript execute — run TS files directly", url: "https://github.com/privatenumber/tsx" },
        { name: "Prettier", version: "3.6", desc: "Opinionated code formatter", url: "https://prettier.io" },
        { name: "ESBuild", version: "0.25", desc: "Ultra-fast JS/TS bundler for production", url: "https://esbuild.github.io" },
      ]
    },
  ];

  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <div key={cat.title}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-1 w-8 rounded-full bg-gradient-to-r ${cat.color}`} />
            <h3 className="font-semibold text-sm">{cat.title}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cat.techs.map((tech) => (
              <a
                key={tech.name}
                href={tech.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{tech.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{tech.version}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tech.desc}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SystemArchitecture() {
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <DashboardLayout>
      <div ref={printRef} className="container max-w-6xl py-6 space-y-8 print:max-w-none print:p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">System Architecture</h1>
            <p className="text-muted-foreground mt-1">
              Visual overview of how the AI TTS Broadcast Dialer works — from campaign creation to call completion.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="flex-shrink-0 gap-2 print:hidden"
          >
            <Printer className="h-4 w-4" />
            Print / Export PDF
          </Button>
        </div>

        {/* Architecture Layers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              System Layers
            </CardTitle>
            <CardDescription>
              Four-tier architecture: Frontend, API, Services, and Infrastructure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ArchitectureLayers />
          </CardContent>
        </Card>

        {/* How a Call Gets Made */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              How a Call Gets Made
            </CardTitle>
            <CardDescription>
              Step-by-step flow from campaign creation to call result — click each step for technical details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CallFlowDiagram />
          </CardContent>
        </Card>

        {/* Campaign Lifecycle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Campaign Lifecycle
            </CardTitle>
            <CardDescription>
              State transitions a campaign goes through from creation to completion
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignLifecycle />
          </CardContent>
        </Card>

        {/* PBX Agent Communication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              Server ↔ PBX Agent Communication
            </CardTitle>
            <CardDescription>
              How the cloud web server communicates with the on-premise FreePBX server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PbxAgentDiagram />
          </CardContent>
        </Card>

        {/* Core System Components */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              Core System Components
            </CardTitle>
            <CardDescription>
              All major services and modules organized by function
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SystemComponentsGrid />
          </CardContent>
        </Card>

        {/* Key System Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Key System Parameters
            </CardTitle>
            <CardDescription>
              Important configuration values and thresholds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KeyMetrics />
          </CardContent>
        </Card>

        {/* Tech Stack */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Tech Stack
            </CardTitle>
            <CardDescription>
              Exact versions and documentation links for every technology in the system — click any item to view docs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TechStack />
          </CardContent>
        </Card>

        {/* Database Schema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Database Schema
            </CardTitle>
            <CardDescription>
              Core tables in the TiDB database (MySQL-compatible)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DatabaseOverview />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
