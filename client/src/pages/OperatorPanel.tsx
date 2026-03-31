import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import VtigerCrmButton from "@/components/VtigerCrmButton";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Server,
  Activity,
  Clock,
  Brain,
  AlertTriangle,
  Gauge,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  LayoutGrid,
  List,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AgentCall {
  id: number;
  phoneNumber: string;
  channel: string;
  status: string;
  callerIdStr: string | null;
  audioName: string | null;
  campaignId: number | null;
  claimedAt: number | null;
  result: string | null;
}

interface AgentData {
  id: number;
  agentId: string;
  name: string;
  status: string;
  activeCalls: number;
  maxCalls: number;
  cpsLimit: number;
  cpsPacingMs: number;
  ipAddress: string | null;
  lastHeartbeat: number | null;
  voiceAiBridge: boolean;
  ariConnected: boolean;
  agentVersion: string | null;
  throttled: boolean;
  throttleReason: string | null;
  calls: AgentCall[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(startMs: number | null): string {
  if (!startMs) return "—";
  const seconds = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getAgentStatusColor(agent: AgentData): string {
  if (agent.status === "offline") return "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700";
  if (agent.throttled) return "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700";
  if (agent.activeCalls > 0) return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700";
  return "bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700";
}

function getStatusDot(agent: AgentData): string {
  if (agent.status === "offline") return "bg-gray-400";
  if (agent.throttled) return "bg-amber-500 animate-pulse";
  if (agent.activeCalls > 0) return "bg-emerald-500 animate-pulse";
  return "bg-blue-500";
}

function getCallStatusBadge(status: string): { variant: "default" | "secondary" | "destructive" | "outline"; label: string } {
  switch (status) {
    case "in_progress": return { variant: "default", label: "In Call" };
    case "dialing": return { variant: "secondary", label: "Dialing" };
    case "claimed": return { variant: "outline", label: "Claimed" };
    case "pending": return { variant: "outline", label: "Pending" };
    default: return { variant: "outline", label: status };
  }
}

// ─── Agent Card Component ──────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentData }) {
  const [expanded, setExpanded] = useState(agent.activeCalls > 0);
  const utilizationPct = agent.maxCalls > 0 ? Math.round((agent.activeCalls / agent.maxCalls) * 100) : 0;

  useEffect(() => {
    if (agent.activeCalls > 0) setExpanded(true);
  }, [agent.activeCalls]);

  return (
    <Card className={`transition-all duration-300 border-2 ${getAgentStatusColor(agent)} hover:shadow-md`}>
      <CardContent className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDot(agent)}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm truncate">{agent.name}</span>
              {agent.voiceAiBridge && (
                <Tooltip>
                  <TooltipTrigger>
                    <Brain className="h-3.5 w-3.5 text-purple-500" />
                  </TooltipTrigger>
                  <TooltipContent>Voice AI Bridge Active</TooltipContent>
                </Tooltip>
              )}
              {agent.throttled && (
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent>{agent.throttleReason || "Throttled"}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{agent.ipAddress || "No IP"}</span>
              {agent.agentVersion && <span>v{agent.agentVersion}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold tabular-nums">
              {agent.activeCalls}<span className="text-xs text-muted-foreground font-normal">/{agent.maxCalls}</span>
            </div>
          </div>
        </div>

        {/* Utilization bar */}
        <div className="mb-2">
          <Progress
            value={utilizationPct}
            className="h-1.5"
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            {agent.cpsLimit} CPS
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {agent.lastHeartbeat ? formatDuration(agent.lastHeartbeat) + " ago" : "Never"}
          </span>
          {agent.status === "online" ? (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
              Online
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-600">
              Offline
            </Badge>
          )}
        </div>

        {/* Active calls */}
        {agent.calls.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <PhoneCall className="h-3 w-3" />
              {agent.calls.length} active call{agent.calls.length !== 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="mt-1.5 space-y-1">
                {agent.calls.map((call) => {
                  const badge = getCallStatusBadge(call.status);
                  return (
                    <div
                      key={call.id}
                      className="flex items-center gap-2 text-xs bg-background/60 rounded px-2 py-1.5 border"
                    >
                      <Phone className="h-3 w-3 text-emerald-500 shrink-0" />
                      <span className="font-mono truncate">{call.phoneNumber}</span>
                      <Badge variant={badge.variant} className="text-[10px] h-4 px-1 shrink-0">
                        {badge.label}
                      </Badge>
                      {call.claimedAt && (
                        <span className="text-muted-foreground shrink-0">{formatDuration(call.claimedAt)}</span>
                      )}
                      <VtigerCrmButton phoneNumber={call.phoneNumber} compact />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Call Row (for list view) ───────────────────────────────────────

function ActiveCallRow({ call }: { call: any }) {
  const badge = getCallStatusBadge(call.status);
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b last:border-0 hover:bg-muted/50 transition-colors">
      <Phone className={`h-4 w-4 shrink-0 ${call.status === "in_progress" ? "text-emerald-500" : call.status === "dialing" ? "text-blue-500" : "text-muted-foreground"}`} />
      <span className="font-mono text-sm w-32 shrink-0">{call.phoneNumber}</span>
      <Badge variant={badge.variant} className="text-xs shrink-0">{badge.label}</Badge>
      <span className="text-xs text-muted-foreground truncate">{call.claimedBy || "Unassigned"}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {call.claimedAt ? formatDuration(call.claimedAt) : "—"}
      </span>
      {call.audioName && (
        <span className="text-xs text-muted-foreground truncate hidden lg:block">{call.audioName}</span>
      )}
      <div className="ml-auto shrink-0">
        <VtigerCrmButton phoneNumber={call.phoneNumber} compact />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function OperatorPanel() {
  const [search, setSearch] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [agentSectionCollapsed, setAgentSectionCollapsed] = useState(false);
  const [callSectionCollapsed, setCallSectionCollapsed] = useState(false);

  // Auto-refresh every 3 seconds
  const liveStatus = trpc.operatorPanel.liveStatus.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const data = liveStatus.data;

  // Filter agents by search
  const filteredAgents = useMemo(() => {
    if (!data?.agents) return [];
    if (!search.trim()) return data.agents;
    const q = search.toLowerCase();
    return data.agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.agentId.toLowerCase().includes(q) ||
        a.ipAddress?.toLowerCase().includes(q) ||
        a.calls.some((c) => c.phoneNumber.includes(q))
    );
  }, [data?.agents, search]);

  // Sort: online first, then by active calls desc
  const sortedAgents = useMemo(() => {
    return [...filteredAgents].sort((a, b) => {
      if (a.status !== b.status) return a.status === "online" ? -1 : 1;
      return b.activeCalls - a.activeCalls;
    });
  }, [filteredAgents]);

  const filteredCalls = useMemo(() => {
    if (!data?.activeCalls) return [];
    if (!search.trim()) return data.activeCalls;
    const q = search.toLowerCase();
    return data.activeCalls.filter(
      (c) =>
        c.phoneNumber.includes(q) ||
        c.claimedBy?.toLowerCase().includes(q) ||
        c.audioName?.toLowerCase().includes(q)
    );
  }, [data?.activeCalls, search]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const metrics = data?.metrics;

  const content = (
    <div className="space-y-4">
      {/* ─── Top Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Operator Panel</h1>
        </div>

        {/* Metrics pills */}
        {metrics && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1 font-mono">
              <Server className="h-3 w-3" />
              {metrics.onlineAgents}/{metrics.totalAgents} Agents
            </Badge>
            <Badge
              variant={metrics.totalActiveCalls > 0 ? "default" : "outline"}
              className="gap-1 font-mono"
            >
              <PhoneCall className="h-3 w-3" />
              {metrics.totalActiveCalls} Active
            </Badge>
            <Badge variant="outline" className="gap-1 font-mono">
              <Clock className="h-3 w-3" />
              {metrics.callsLastMinute}/min
            </Badge>
            <Badge variant="outline" className="gap-1 font-mono">
              {metrics.callsLastHour}/hr
            </Badge>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search agents, numbers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          >
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => liveStatus.refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${liveStatus.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ─── Agents Section ──────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setAgentSectionCollapsed(!agentSectionCollapsed)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
        >
          {agentSectionCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Server className="h-4 w-4" />
          PBX Agents ({sortedAgents.length})
        </button>

        {!agentSectionCollapsed && (
          <>
            {sortedAgents.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No PBX agents registered</p>
                  <p className="text-xs mt-1">Install the PBX agent on your FreePBX server to get started</p>
                </CardContent>
              </Card>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {sortedAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent as AgentData} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {sortedAgents.map((agent) => {
                      const a = agent as AgentData;
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDot(a)}`} />
                          <span className="font-semibold text-sm w-40 truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground w-28">{a.ipAddress || "—"}</span>
                          <div className="flex items-center gap-1 w-20">
                            <PhoneCall className="h-3 w-3" />
                            <span className="text-sm font-mono">{a.activeCalls}/{a.maxCalls}</span>
                          </div>
                          <Progress value={a.maxCalls > 0 ? (a.activeCalls / a.maxCalls) * 100 : 0} className="h-1.5 w-24" />
                          <span className="text-xs text-muted-foreground w-16">{a.cpsLimit} CPS</span>
                          {a.voiceAiBridge && <Brain className="h-3.5 w-3.5 text-purple-500" />}
                          {a.throttled && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          <Badge variant={a.status === "online" ? "default" : "secondary"} className="text-xs ml-auto">
                            {a.status === "online" ? "Online" : "Offline"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ─── Active Calls Section ────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setCallSectionCollapsed(!callSectionCollapsed)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
        >
          {callSectionCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Phone className="h-4 w-4" />
          Active Call Queue ({filteredCalls.length})
        </button>

        {!callSectionCollapsed && (
          <>
            {filteredCalls.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-muted-foreground">
                  <PhoneOff className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active calls in queue</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                    <span className="w-4" />
                    <span className="w-32">Phone Number</span>
                    <span className="w-20">Status</span>
                    <span className="flex-1">Agent</span>
                    <span className="w-16">Duration</span>
                    <span className="hidden lg:block flex-1">Script</span>
                    <span className="w-8">CRM</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {filteredCalls.map((call) => (
                      <ActiveCallRow key={call.id} call={call} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Wifi className="h-3 w-3" />
        Auto-refreshing every 3 seconds
        {liveStatus.dataUpdatedAt && (
          <span>· Last update: {new Date(liveStatus.dataUpdatedAt).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );

  return <DashboardLayout>{content}</DashboardLayout>;
}
