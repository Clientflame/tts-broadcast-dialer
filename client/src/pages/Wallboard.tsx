import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Users,
  Activity,
  BarChart3,
  Clock,
  Mic,
  Maximize2,
  Minimize2,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Headphones,
  Coffee,
  PhoneForwarded,
  Gauge,
  Brain,
} from "lucide-react";
import { AgentAssistPanel } from "@/components/AgentAssistPanel";

// ─── Gauge Component ────────────────────────────────────────────────────────

function RadialGauge({
  value,
  max,
  label,
  unit = "%",
  color = "emerald",
  threshold,
  thresholdLabel,
  size = 140,
}: {
  value: number;
  max: number;
  label: string;
  unit?: string;
  color?: string;
  threshold?: number;
  thresholdLabel?: string;
  size?: number;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference * 0.75; // 270 degree arc
  const isOverThreshold = threshold !== undefined && value > threshold;

  const colorMap: Record<string, string> = {
    emerald: isOverThreshold ? "#ef4444" : "#10b981",
    blue: "#3b82f6",
    amber: "#f59e0b",
    red: value > 3 ? "#ef4444" : "#10b981",
    purple: "#8b5cf6",
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.85} viewBox={`0 0 ${size} ${size * 0.85}`}>
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          className="text-muted/20"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorMap[color] || colorMap.emerald}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          className="transition-all duration-700 ease-out"
        />
        {/* Threshold marker */}
        {threshold !== undefined && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray={`3 ${circumference - 3}`}
            strokeDashoffset={circumference - (threshold / max) * circumference * 0.75}
            transform={`rotate(135 ${size / 2} ${size / 2})`}
            opacity="0.6"
          />
        )}
        {/* Value text */}
        <text
          x={size / 2}
          y={size / 2 - 5}
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold"
          fontSize="24"
        >
          {typeof value === "number" ? value.toFixed(value < 10 ? 1 : 0) : value}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          className="fill-muted-foreground text-xs"
          fontSize="11"
        >
          {unit}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
      {thresholdLabel && isOverThreshold && (
        <span className="text-[10px] text-red-500 font-medium">{thresholdLabel}</span>
      )}
    </div>
  );
}

// ─── Agent Status Card ──────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: any }) {
  const [supervisorMode, setSupervisorMode] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [showAssist, setShowAssist] = useState(false);

  const monitorMutation = trpc.supervisor.monitor.useMutation({
    onSuccess: (data) => { setSupervisorMode("monitor"); setActionId(data.actionId ?? null); toast.success(data.message); },
    onError: (e) => toast.error(e.message),
  });
  const whisperMutation = trpc.supervisor.whisper.useMutation({
    onSuccess: (data) => { setSupervisorMode("whisper"); setActionId(data.actionId ?? null); toast.success(data.message); },
    onError: (e) => toast.error(e.message),
  });
  const bargeMutation = trpc.supervisor.barge.useMutation({
    onSuccess: (data) => { setSupervisorMode("barge"); setActionId(data.actionId ?? null); toast.success(data.message); },
    onError: (e) => toast.error(e.message),
  });
  const stopMutation = trpc.supervisor.stop.useMutation({
    onSuccess: () => { setSupervisorMode(null); setActionId(null); toast.success("Supervision ended"); },
    onError: (e) => toast.error(e.message),
  });

  const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
    available: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
    on_call: { icon: PhoneCall, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30" },
    ringing: { icon: PhoneForwarded, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30 animate-pulse" },
    wrap_up: { icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30" },
    on_break: { icon: Coffee, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30" },
    offline: { icon: PhoneOff, color: "text-muted-foreground", bg: "bg-muted/30 border-muted/30" },
    reserved: { icon: Headphones, color: "text-cyan-500", bg: "bg-cyan-500/10 border-cyan-500/30" },
  };

  const config = statusConfig[agent.status] || statusConfig.offline;
  const Icon = config.icon;
  const duration = agent.statusChangedAt
    ? Math.round((Date.now() - agent.statusChangedAt) / 1000)
    : 0;

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };

  const isOnCall = agent.status === "on_call";
  const isSupervising = supervisorMode !== null;

  return (
    <div className={`rounded-lg border p-3 ${config.bg} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className="font-medium text-sm truncate">{agent.name}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Ext {agent.sipExtension}</span>
        {agent.status !== "offline" && (
          <span>{formatDuration(duration)}</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 text-xs">
        <span className="text-muted-foreground">{agent.totalCallsHandled} calls</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {agent.status.replace("_", " ")}
        </Badge>
      </div>
      {/* Supervisor Controls — visible when agent is on a call */}
      {isOnCall && (
        <div className="mt-2 pt-2 border-t border-border/50">
          {isSupervising ? (
            <div className="flex items-center gap-1">
              <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-500 animate-pulse">
                {supervisorMode === "monitor" ? "\uD83D\uDD0A Listening" : supervisorMode === "whisper" ? "\uD83D\uDDE3\uFE0F Whispering" : "\uD83D\uDCDE Barged"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-destructive hover:text-destructive"
                onClick={() => actionId && stopMutation.mutate({ actionId })}
                disabled={stopMutation.isPending}
              >
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] flex-1"
                onClick={() => monitorMutation.mutate({ agentId: agent.id })}
                disabled={monitorMutation.isPending}
                title="Silent Monitor — listen to both sides"
              >
                <Headphones className="h-3 w-3 mr-0.5" />Listen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] flex-1"
                onClick={() => whisperMutation.mutate({ agentId: agent.id })}
                disabled={whisperMutation.isPending}
                title="Whisper — speak privately to agent"
              >
                <Mic className="h-3 w-3 mr-0.5" />Whisper
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] flex-1"
                onClick={() => bargeMutation.mutate({ agentId: agent.id })}
                disabled={bargeMutation.isPending}
                title="Barge — join as 3-way conference"
              >
                <PhoneCall className="h-3 w-3 mr-0.5" />Barge
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] flex-1 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                onClick={() => setShowAssist(true)}
                title="AI Agent Assist — real-time coaching"
              >
                <Brain className="h-3 w-3 mr-0.5" />Assist
              </Button>
            </div>
          )}
        </div>
      )}
      {/* Agent Assist Panel */}
      {showAssist && (
        <div className="fixed right-4 top-20 z-50">
          <AgentAssistPanel
            agentId={agent.id}
            agentName={agent.name}
            callLogId={agent.currentCallId}
            campaignId={agent.currentCampaignId}
            contactName={undefined}
            onClose={() => setShowAssist(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = "text-foreground",
}: {
  icon: any;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
      <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {subValue && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{subValue}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Wallboard ─────────────────────────────────────────────────────────

export default function Wallboard() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshInterval] = useState(5000); // 5 second refresh

  const { data: liveStats, refetch } = trpc.wallboard.liveStats.useQuery(undefined, {
    refetchInterval: refreshInterval,
  });

  const { data: historical } = trpc.wallboard.historicalStats.useQuery(
    { hours: 24 },
    { refetchInterval: 60000 } // refresh every minute
  );

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  if (!liveStats) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <Activity className="h-12 w-12 mx-auto mb-4 animate-pulse text-muted-foreground" />
          <p className="text-muted-foreground">Loading wallboard...</p>
        </div>
      </div>
    );
  }

  const { campaigns: activeCampaigns, queue, agents, agentSummary, callRate, hourlyStats, recordings } = liveStats;

  return (
    <div className={`min-h-screen bg-background text-foreground ${isFullscreen ? "p-4" : "p-6"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Gauge className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Call Center Wallboard</h1>
          <Badge variant="outline" className="text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5 animate-pulse" />
            LIVE
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Updated {new Date(liveStats.timestamp).toLocaleTimeString()}
          </span>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Top Row: Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        <StatCard
          icon={Phone}
          label="Calls/Min"
          value={callRate.callsPerMinute}
          subValue={`${callRate.callsPerSecond} CPS`}
          color="text-blue-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Answer Rate"
          value={`${hourlyStats.answerRate}%`}
          subValue={`${hourlyStats.answered}/${hourlyStats.total} last hr`}
          color="text-emerald-500"
        />
        <StatCard
          icon={Users}
          label="Agents Online"
          value={agentSummary.total - agentSummary.offline}
          subValue={`${agentSummary.onCall} on call`}
          color="text-purple-500"
        />
        <StatCard
          icon={Activity}
          label="Active Campaigns"
          value={activeCampaigns.length}
          color="text-amber-500"
        />
        <StatCard
          icon={PhoneCall}
          label="Queue Pending"
          value={queue.pending}
          subValue={`${queue.claimed} in progress`}
          color="text-orange-500"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={queue.completed}
          subValue={`${queue.failed} failed`}
          color="text-emerald-500"
        />
        <StatCard
          icon={Clock}
          label="Avg Duration"
          value={`${hourlyStats.avgDuration}s`}
          color="text-cyan-500"
        />
        <StatCard
          icon={Mic}
          label="Recordings"
          value={recordings.todayTotal}
          subValue={`${recordings.currentlyRecording} active`}
          color="text-red-500"
        />
      </div>

      {/* Middle Row: Gauges + Agent Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Gauges */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Performance Gauges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              <RadialGauge
                value={hourlyStats.answerRate}
                max={100}
                label="Answer Rate"
                color="emerald"
              />
              <RadialGauge
                value={
                  hourlyStats.total > 0
                    ? +((hourlyStats.total - hourlyStats.answered - hourlyStats.noAnswer) / hourlyStats.total * 100).toFixed(1)
                    : 0
                }
                max={10}
                label="Abandon Rate"
                color="red"
                threshold={3}
                thresholdLabel="TCPA 3% Limit"
              />
              <RadialGauge
                value={
                  agentSummary.total > 0
                    ? Math.round((agentSummary.onCall / Math.max(agentSummary.total - agentSummary.offline, 1)) * 100)
                    : 0
                }
                max={100}
                label="Agent Utilization"
                color="purple"
              />
            </div>
            {/* Agent status bar */}
            <div className="mt-4">
              <div className="flex items-center gap-1 h-4 rounded-full overflow-hidden">
                {agentSummary.available > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${(agentSummary.available / Math.max(agentSummary.total, 1)) * 100}%` }}
                    title={`${agentSummary.available} available`}
                  />
                )}
                {agentSummary.onCall > 0 && (
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${(agentSummary.onCall / Math.max(agentSummary.total, 1)) * 100}%` }}
                    title={`${agentSummary.onCall} on call`}
                  />
                )}
                {agentSummary.wrapUp > 0 && (
                  <div
                    className="h-full bg-purple-500 transition-all"
                    style={{ width: `${(agentSummary.wrapUp / Math.max(agentSummary.total, 1)) * 100}%` }}
                    title={`${agentSummary.wrapUp} wrapping up`}
                  />
                )}
                {agentSummary.onBreak > 0 && (
                  <div
                    className="h-full bg-orange-500 transition-all"
                    style={{ width: `${(agentSummary.onBreak / Math.max(agentSummary.total, 1)) * 100}%` }}
                    title={`${agentSummary.onBreak} on break`}
                  />
                )}
                {agentSummary.offline > 0 && (
                  <div
                    className="h-full bg-muted transition-all"
                    style={{ width: `${(agentSummary.offline / Math.max(agentSummary.total, 1)) * 100}%` }}
                    title={`${agentSummary.offline} offline`}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{agentSummary.available} Available</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{agentSummary.onCall} On Call</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" />{agentSummary.wrapUp} Wrap Up</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />{agentSummary.onBreak} Break</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted" />{agentSummary.offline} Offline</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent Grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              Live Agent Status ({agents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No agents registered yet</p>
                <p className="text-xs mt-1">Add agents in the Live Agents page</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto">
                {agents
                  .sort((a: any, b: any) => {
                    const order: Record<string, number> = { on_call: 0, ringing: 1, wrap_up: 2, available: 3, on_break: 4, reserved: 5, offline: 6 };
                    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
                  })
                  .map((agent: any) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Campaign Progress + Call Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Campaigns */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeCampaigns.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No active campaigns</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeCampaigns.map((campaign: any) => {
                  const progress = campaign.totalContacts > 0
                    ? Math.round(((campaign.completedCalls + campaign.failedCalls) / campaign.totalContacts) * 100)
                    : 0;
                  const answerRate = (campaign.completedCalls + campaign.failedCalls) > 0
                    ? Math.round((campaign.answeredCalls / (campaign.completedCalls + campaign.failedCalls)) * 100)
                    : 0;

                  return (
                    <div key={campaign.id} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm truncate">{campaign.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {campaign.pacingMode}
                          </Badge>
                          {campaign.recordingEnabled === 1 && (
                            <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
                              <Mic className="h-2.5 w-2.5 mr-0.5" /> REC
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Progress value={progress} className="h-2 mb-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{progress}% complete ({campaign.completedCalls}/{campaign.totalContacts})</span>
                        <span>{answerRate}% answer rate</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call Distribution (Last Hour) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Call Distribution (Last Hour)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Visual bar chart */}
              {[
                { label: "Answered", value: hourlyStats.answered, color: "bg-emerald-500", icon: CheckCircle2 },
                { label: "No Answer", value: hourlyStats.noAnswer, color: "bg-amber-500", icon: PhoneOff },
                { label: "Busy", value: hourlyStats.busy, color: "bg-orange-500", icon: Phone },
                { label: "Failed", value: hourlyStats.failed, color: "bg-red-500", icon: AlertTriangle },
                { label: "Voicemail", value: hourlyStats.voicemail, color: "bg-purple-500", icon: Mic },
              ].map((item) => {
                const Icon = item.icon;
                const pct = hourlyStats.total > 0 ? (item.value / hourlyStats.total) * 100 : 0;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs">{item.label}</span>
                        <span className="text-xs font-medium tabular-nums">
                          {item.value} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.color} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Hourly trend mini chart */}
              {historical && historical.hourly.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">24h Call Volume Trend</p>
                  <div className="flex items-end gap-0.5 h-16">
                    {historical.hourly.slice(-24).map((h: any, i: number) => {
                      const maxVal = Math.max(...historical.hourly.slice(-24).map((x: any) => x.total), 1);
                      const height = (h.total / maxVal) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t transition-all duration-300"
                          style={{
                            height: `${Math.max(height, 2)}%`,
                            backgroundColor: h.answerRate > 50 ? "#10b981" : h.answerRate > 25 ? "#f59e0b" : "#ef4444",
                            opacity: 0.7 + (i / 24) * 0.3,
                          }}
                          title={`${h.hour}: ${h.total} calls, ${h.answerRate}% answer rate`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>24h ago</span>
                    <span>Now</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
