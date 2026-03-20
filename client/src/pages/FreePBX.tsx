import { useState, useCallback, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  Wifi, WifiOff, RefreshCw, Server, Loader2,
  CheckCircle2, Plus, Trash2, Copy, Check, Terminal, Download,
  Activity, Zap, Gauge, AlertTriangle, RotateCcw, ShieldAlert,
  BarChart3, TrendingUp, Phone, PhoneOff, PhoneMissed,
  Rocket, ChevronDown, ChevronUp, ClipboardCopy, ExternalLink
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from "recharts";

const SPEED_PRESETS = [
  { label: "1", value: 1 },
  { label: "3", value: 3 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
];

const PACING_OPTIONS = [
  { label: "1 call/sec", value: 1000 },
  { label: "1 call/2sec", value: 2000 },
  { label: "1 call/3sec", value: 3000 },
];

// ─── One-Click Installer Component ──────────────────────────────────────────
function InstallerWizard({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const { data: installer, isLoading } = trpc.freepbx.getInstallerCommand.useQuery(
    { agentId, origin: window.location.origin },
    { enabled: !!agentId }
  );

  const copyCommand = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCmd(true);
      toast.success("Install command copied to clipboard!");
      setTimeout(() => setCopiedCmd(false), 3000);
    }).catch(() => {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopiedCmd(true);
        toast.success("Install command copied to clipboard!");
        setTimeout(() => setCopiedCmd(false), 3000);
      } catch {
        toast.error("Failed to copy — please select and copy manually");
      }
      document.body.removeChild(textarea);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Generating install command...</p>
      </div>
    );
  }

  if (!installer) return null;

  return (
    <div className="space-y-4">
      {/* Step 1: SSH */}
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
        <div className="flex-1">
          <p className="text-sm font-medium">SSH into your FreePBX server as root</p>
          <code className="block mt-1.5 p-2.5 bg-muted rounded text-xs font-mono">ssh root@your-freepbx-server</code>
        </div>
      </div>

      {/* Step 2: One-liner */}
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
        <div className="flex-1">
          <p className="text-sm font-medium">Paste this single command and press Enter</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This will automatically download, install, and start the PBX agent with your credentials pre-configured.
          </p>
          <div className="mt-2 relative group">
            <div className="p-3 pr-24 bg-gray-900 dark:bg-black rounded-lg text-green-400 text-xs font-mono break-all select-all border border-gray-700">
              {installer.oneLiner}
            </div>
            <Button
              size="sm"
              className={`absolute top-2 right-2 h-8 transition-all ${
                copiedCmd
                  ? "bg-green-600 hover:bg-green-600 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white border-gray-600"
              }`}
              variant="outline"
              onClick={() => copyCommand(installer.oneLiner)}
            >
              {copiedCmd ? (
                <><Check className="h-3.5 w-3.5 mr-1" />Copied!</>
              ) : (
                <><ClipboardCopy className="h-3.5 w-3.5 mr-1" />Copy</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Step 3: Verify */}
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
        <div className="flex-1">
          <p className="text-sm font-medium">Wait for the agent to appear online</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The installer will show a success message. The agent should appear as "Online" on this page within 10 seconds.
          </p>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onDone} className="ml-10">
        <Check className="h-3.5 w-3.5 mr-1.5" />Done — I've run the command
      </Button>
    </div>
  );
}

// ─── Agent Metrics Dashboard ────────────────────────────────────────────────
function AgentMetricsDashboard() {
  const { data: metrics = [], isLoading } = trpc.freepbx.agentMetrics.useQuery(undefined, { refetchInterval: 15000 });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(7);

  const { data: timeSeries = [] } = trpc.freepbx.agentTimeSeries.useQuery(
    { agentId: selectedAgent || "", days: timeRange },
    { enabled: !!selectedAgent, refetchInterval: 30000 }
  );

  const { data: dailyStats = [] } = trpc.freepbx.agentDailyStats.useQuery(
    { agentId: selectedAgent || "", days: timeRange },
    { enabled: !!selectedAgent, refetchInterval: 30000 }
  );

  if (isLoading) return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading agent metrics...</CardContent></Card>;
  if (metrics.length === 0) return null;

  const totalCalls = metrics.reduce((s: number, m: any) => s + m.totalCalls, 0);
  const totalAnswered = metrics.reduce((s: number, m: any) => s + m.answered, 0);
  const overallRate = totalCalls > 0 ? Math.round((totalAnswered / totalCalls) * 100) : 0;

  // Auto-select first agent if none selected
  if (!selectedAgent && metrics.length > 0) {
    setTimeout(() => setSelectedAgent(metrics[0].agentId), 0);
  }

  const selectedMetric = metrics.find((m: any) => m.agentId === selectedAgent);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />Agent Performance Metrics
        </CardTitle>
        <CardDescription>
          Call volume, success rates, and trends per agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalCalls}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Total Calls</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{totalAnswered}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Answered</p>
          </div>
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 text-center">
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{overallRate}%</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Answer Rate</p>
          </div>
        </div>

        {/* Per-Agent Breakdown */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Per-Agent Breakdown</p>
          <div className="grid gap-2">
            {metrics.map((m: any) => {
              const isSelected = m.agentId === selectedAgent;
              return (
                <div
                  key={m.agentId}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedAgent(m.agentId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${m.isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                      <span className="text-sm font-medium">{m.agentName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" />{m.totalCalls}
                      </span>
                      <span className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="h-3 w-3" />{m.answerRate}%
                      </span>
                      <div className="flex gap-2 text-[10px]">
                        <span className="text-green-600">{m.answered} ans</span>
                        <span className="text-yellow-600">{m.busy} busy</span>
                        <span className="text-orange-600">{m.noAnswer} na</span>
                        <span className="text-red-600">{m.failed} fail</span>
                      </div>
                    </div>
                  </div>
                  {m.totalCalls > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden flex">
                      <div className="bg-green-500 h-full" style={{ width: `${(m.answered / m.totalCalls) * 100}%` }} />
                      <div className="bg-yellow-500 h-full" style={{ width: `${(m.busy / m.totalCalls) * 100}%` }} />
                      <div className="bg-orange-500 h-full" style={{ width: `${(m.noAnswer / m.totalCalls) * 100}%` }} />
                      <div className="bg-red-500 h-full" style={{ width: `${(m.failed / m.totalCalls) * 100}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Time Range Selector + Charts */}
        {selectedAgent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Trends: {selectedMetric?.agentName}</p>
              <div className="flex gap-1">
                {[{ label: "7d", value: 7 }, { label: "14d", value: 14 }, { label: "30d", value: 30 }].map((r) => (
                  <Button
                    key={r.value}
                    variant={timeRange === r.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setTimeRange(r.value)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>

            {dailyStats.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Daily Call Volume</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={(v: string) => new Date(v).toLocaleDateString()} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="answered" name="Answered" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="busy" name="Busy" fill="#eab308" stackId="a" />
                    <Bar dataKey="noAnswer" name="No Answer" fill="#f97316" stackId="a" />
                    <Bar dataKey="failed" name="Failed" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">No call data for this time range</div>
            )}

            {dailyStats.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Answer Rate Trend</p>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={(v: string) => new Date(v).toLocaleDateString()} formatter={(value: number) => [`${value}%`, "Answer Rate"]} />
                    <defs>
                      <linearGradient id="answerRateGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="answerRate" stroke="#8b5cf6" fill="url(#answerRateGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Throttle History Table ─────────────────────────────────────────────────
function ThrottleHistoryTable() {
  const { data: history = [], isLoading } = trpc.freepbx.throttleHistory.useQuery(undefined, { refetchInterval: 15000 });

  if (isLoading) return <div className="text-center py-4 text-sm text-muted-foreground">Loading history...</div>;
  if (history.length === 0) return <div className="text-center py-6 text-sm text-muted-foreground">No throttle events recorded yet</div>;

  const eventColors: Record<string, string> = {
    throttle_triggered: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    ramp_up: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    full_recovery: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    manual_reset: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  };

  const eventLabels: Record<string, string> = {
    throttle_triggered: "Throttled",
    ramp_up: "Ramp Up",
    full_recovery: "Recovered",
    manual_reset: "Manual Reset",
  };

  return (
    <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
      <table className="w-full text-sm min-w-[500px]">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b text-left">
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Time</th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Agent</th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Event</th>
            <th className="py-2 pr-3 text-xs font-medium text-muted-foreground">Speed Change</th>
            <th className="py-2 text-xs font-medium text-muted-foreground">Details</th>
          </tr>
        </thead>
        <tbody>
          {history.map((e: any) => (
            <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td className="py-2 pr-3 text-xs">{e.agentName || e.agentId}</td>
              <td className="py-2 pr-3">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${eventColors[e.eventType] || "bg-gray-100 text-gray-800"}`}>
                  {eventLabels[e.eventType] || e.eventType}
                </span>
              </td>
              <td className="py-2 pr-3 text-xs">
                {e.previousMaxCalls != null && e.newMaxCalls != null ? (
                  <span>{e.previousMaxCalls} → {e.newMaxCalls}</span>
                ) : "—"}
              </td>
              <td className="py-2 text-xs text-muted-foreground truncate max-w-[200px]" title={e.reason || ""}>
                {e.reason || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main FreePBX Page ──────────────────────────────────────────────────────
export default function FreePBX() {
  const amiStatus = trpc.freepbx.status.useQuery(undefined, { refetchInterval: 10000 });
  const testConnection = trpc.freepbx.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
      amiStatus.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // PBX Agent management
  const agents = trpc.freepbx.listAgents.useQuery();
  const queueStats = trpc.freepbx.queueStats.useQuery(undefined, { refetchInterval: 5000 });
  const registerAgent = trpc.freepbx.registerAgent.useMutation({
    onSuccess: (data: any) => {
      toast.success("Agent registered! Follow the install steps below.");
      setNewAgentId(data.agentId);
      setShowInstaller(true);
      setAgentName("");
      setMaxCalls(10);
      agents.refetch();
      amiStatus.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteAgent = trpc.freepbx.deleteAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent removed");
      agents.refetch();
      amiStatus.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [agentName, setAgentName] = useState("");
  const [maxCalls, setMaxCalls] = useState(5);
  const [cpsLimit, setCpsLimit] = useState(1);
  const [cpsPacingMs, setCpsPacingMs] = useState(1000);
  const [newAgentId, setNewAgentId] = useState("");
  const [showInstaller, setShowInstaller] = useState(false);
  const [showInstallerForAgent, setShowInstallerForAgent] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const updateMaxCalls = trpc.freepbx.updateAgentMaxCalls.useMutation({
    onSuccess: () => {
      toast.success("Agent speed updated");
      agents.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCps = trpc.freepbx.updateAgentCps.useMutation({
    onSuccess: () => {
      toast.success("CPS limit updated");
      agents.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCpsPacing = trpc.freepbx.updateAgentCpsPacing.useMutation({
    onSuccess: () => {
      toast.success("Call pacing updated");
      agents.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetThrottle = trpc.freepbx.resetThrottle.useMutation({
    onSuccess: () => {
      toast.success("Throttle reset — agent restored to full speed");
      agents.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleRegister = () => {
    if (!agentName.trim()) {
      toast.error("Please enter an agent name");
      return;
    }
    registerAgent.mutate({
      name: agentName.trim(),
      maxCalls: maxCalls,
      cpsLimit: cpsLimit,
      cpsPacingMs: cpsPacingMs,
    });
  };

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 2000);
    }).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopiedStates(prev => ({ ...prev, [key]: true }));
        toast.success("Copied to clipboard");
        setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 2000);
      } catch {
        toast.error("Failed to copy");
      }
      document.body.removeChild(textarea);
    });
  }, []);

  const hasAgents = agents.data && agents.data.length > 0;
  const hasOnlineAgents = agents.data?.some((a: any) => a.lastHeartbeat && Date.now() - new Date(a.lastHeartbeat).getTime() < 30000);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FreePBX Integration</h1>
          <p className="text-muted-foreground mt-1">Manage PBX agents and monitor call queue</p>
        </div>

        {/* Status + Queue Stats Row */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {amiStatus.data?.connected ? (
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                    <Wifi className="h-5 w-5 text-green-600" />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                    <WifiOff className="h-5 w-5 text-red-600" />
                  </div>
                )}
                <div>
                  <p className="font-medium">{amiStatus.data?.connected ? "Connected" : "No Agents Online"}</p>
                  <p className="text-xs text-muted-foreground">
                    {amiStatus.data?.onlineAgents ?? 0} of {amiStatus.data?.agents ?? 0} agent(s) online
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                disabled={amiStatus.isFetching}
                onClick={() => { amiStatus.refetch(); agents.refetch(); queueStats.refetch(); toast.info("Refreshing connection status..."); }}
              >
                <RefreshCw className={`h-3 w-3 mr-2 ${amiStatus.isFetching ? "animate-spin" : ""}`} />Refresh
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />Call Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{queueStats.data?.pending ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{queueStats.data?.claimed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-green-600">{queueStats.data?.completed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-red-600">{queueStats.data?.failed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">PBX agent polls for calls (outbound HTTPS)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Local AMI on FreePBX (no firewall issues)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Audio downloaded & converted on PBX</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">One-command install on any FreePBX</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Setup Card - shown when no agents exist */}
        {!hasAgents && (
          <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
            <CardContent className="py-8 text-center">
              <Rocket className="h-12 w-12 mx-auto mb-4 text-primary opacity-70" />
              <h3 className="text-lg font-semibold mb-2">Get Started in 2 Minutes</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                Register a PBX agent below, then paste a single command on your FreePBX server.
                No manual file copying, no config editing — everything is automatic.
              </p>
              <div className="max-w-md mx-auto space-y-3">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 text-left space-y-1">
                    <Label htmlFor="quickAgentName" className="text-xs">Agent Name</Label>
                    <Input
                      id="quickAgentName"
                      placeholder="e.g., pbx-server-1"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                    />
                  </div>
                  <Button onClick={handleRegister} disabled={registerAgent.isPending} size="lg">
                    {registerAgent.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Rocket className="h-4 w-4 mr-1.5" />Create & Install</>
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Max Concurrent Calls</span>
                      <span className="font-bold text-primary">{maxCalls}</span>
                    </Label>
                    <Slider min={1} max={10} step={1} value={[maxCalls]} onValueChange={([v]) => setMaxCalls(v)} />
                    <div className="flex gap-1">
                      {SPEED_PRESETS.map((p) => (
                        <Button
                          key={p.label}
                          variant={maxCalls === p.value ? "default" : "outline"}
                          size="sm"
                          className="flex-1 text-xs h-7"
                          onClick={() => setMaxCalls(p.value)}
                        >
                          {p.value}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Calls Per Second</span>
                      <span className="font-bold text-primary">{cpsLimit} CPS</span>
                    </Label>
                    <Slider min={1} max={10} step={1} value={[cpsLimit]} onValueChange={([v]) => setCpsLimit(v)} />
                    <div className="flex justify-between">
                      <span className="text-[10px] text-muted-foreground">1 (safe)</span>
                      <span className="text-[10px] text-muted-foreground">10 (max)</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Call Pacing</span>
                      <span className="font-bold text-primary">{cpsPacingMs === 1000 ? "1/sec" : cpsPacingMs === 2000 ? "1/2sec" : "1/3sec"}</span>
                    </Label>
                    <div className="flex gap-1 mt-1">
                      {PACING_OPTIONS.map((p) => (
                        <Button
                          key={p.value}
                          variant={cpsPacingMs === p.value ? "default" : "outline"}
                          size="sm"
                          className="flex-1 text-xs h-7"
                          onClick={() => setCpsPacingMs(p.value)}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Minimum delay between each call</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Installer wizard shown after registration */}
        {showInstaller && newAgentId && (
          <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-green-800 dark:text-green-200">
                <Rocket className="h-4 w-4" />Install PBX Agent
              </CardTitle>
              <CardDescription className="text-green-700 dark:text-green-300">
                Your agent is registered. Follow these steps to install it on your FreePBX server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InstallerWizard
                agentId={newAgentId}
                onDone={() => {
                  setShowInstaller(false);
                  setNewAgentId("");
                  agents.refetch();
                  amiStatus.refetch();
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* PBX Agents Management */}
        {hasAgents && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Terminal className="h-4 w-4" />PBX Agents
                  </CardTitle>
                  <CardDescription>
                    Manage registered agents and their speed settings
                  </CardDescription>
                </div>
                {/* Add new agent button */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Agent name"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                    className="w-40 h-8 text-xs"
                  />
                  <Button size="sm" onClick={handleRegister} disabled={registerAgent.isPending}>
                    {registerAgent.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <><Plus className="h-3.5 w-3.5 mr-1" />Add Agent</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {agents.data?.map((agent: any) => {
                const isOnline = agent.lastHeartbeat &&
                  Date.now() - new Date(agent.lastHeartbeat).getTime() < 30000;
                const isThrottled = agent.effectiveMaxCalls != null && agent.effectiveMaxCalls < (agent.maxCalls ?? 5);
                const effectiveSpeed = agent.effectiveMaxCalls ?? agent.maxCalls ?? 5;
                const showingInstaller = showInstallerForAgent === agent.agentId;

                return (
                  <div key={agent.id} className="space-y-0">
                    <div className={`p-4 rounded-lg border ${isThrottled ? "border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20" : "bg-muted/50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium flex items-center gap-2">
                              {agent.name}
                              {isThrottled && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-400 text-orange-600 dark:text-orange-400">
                                  <ShieldAlert className="h-3 w-3 mr-0.5" />Throttled
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ID: {agent.agentId}
                              {agent.lastHeartbeat && (
                                <> · Last seen: {new Date(agent.lastHeartbeat).toLocaleString()}</>
                              )}
                              {agent.activeCalls > 0 && (
                                <> · <span className="text-blue-600">{agent.activeCalls} active call(s)</span></>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={isOnline ? "default" : "outline"}>
                            {isOnline ? "Online" : "Offline"}
                          </Badge>
                          {!isOnline && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setShowInstallerForAgent(showingInstaller ? null : agent.agentId)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              {showingInstaller ? "Hide" : "Re-install"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => {
                              if (confirm(`Remove agent "${agent.name}"?`)) {
                                deleteAgent.mutate({ agentId: agent.agentId });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Speed control section */}
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Gauge className="h-3 w-3" />
                                Max Speed
                              </span>
                              <span className="text-sm font-bold text-primary">
                                {isThrottled ? (
                                  <span className="text-orange-600 dark:text-orange-400">
                                    {effectiveSpeed} <span className="text-xs font-normal text-muted-foreground">/ {agent.maxCalls ?? 5}</span>
                                  </span>
                                ) : (
                                  agent.maxCalls ?? 5
                                )}
                              </span>
                            </div>
                            <Slider
                              min={1}
                              max={10}
                              step={1}
                              value={[agent.maxCalls ?? 5]}
                              onValueChange={([v]) => {
                                updateMaxCalls.mutate({ agentId: agent.agentId, maxCalls: v });
                              }}
                            />
                          </div>
                          <div className="flex gap-1">
                            {SPEED_PRESETS.map((p) => (
                              <Button
                                key={p.label}
                                variant={(agent.maxCalls ?? 5) === p.value ? "default" : "outline"}
                                size="sm"
                                className="text-[10px] h-6 px-2"
                                onClick={() => updateMaxCalls.mutate({ agentId: agent.agentId, maxCalls: p.value })}
                              >
                                {p.value}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* CPS Rate Limit control */}
                        <div className="flex items-center gap-4 mt-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Zap className="h-3 w-3" />
                                Calls Per Second (CPS)
                              </span>
                              <span className="text-sm font-bold text-primary">
                                {(agent as any).cpsLimit ?? 1} CPS
                              </span>
                            </div>
                            <Slider
                              min={1}
                              max={10}
                              step={1}
                              value={[(agent as any).cpsLimit ?? 1]}
                              onValueChange={([v]) => {
                                updateCps.mutate({ agentId: agent.agentId, cpsLimit: v });
                              }}
                            />
                            <div className="flex justify-between mt-1">
                              <span className="text-[10px] text-muted-foreground">1 (safe)</span>
                              <span className="text-[10px] text-muted-foreground">10 (max)</span>
                            </div>
                          </div>
                        </div>

                        {/* Call Pacing control */}
                        <div className="flex items-center gap-4 mt-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Gauge className="h-3 w-3" />
                                Call Pacing (delay between calls)
                              </span>
                              <span className="text-sm font-bold text-primary">
                                {((agent as any).cpsPacingMs ?? 1000) === 1000 ? "1/sec" : ((agent as any).cpsPacingMs ?? 1000) === 2000 ? "1/2sec" : "1/3sec"}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              {PACING_OPTIONS.map((p) => (
                                <Button
                                  key={p.value}
                                  variant={((agent as any).cpsPacingMs ?? 1000) === p.value ? "default" : "outline"}
                                  size="sm"
                                  className="flex-1 text-[10px] h-6"
                                  onClick={() => updateCpsPacing.mutate({ agentId: agent.agentId, cpsPacingMs: p.value })}
                                >
                                  {p.label}
                                </Button>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">Minimum delay between each call initiation</p>
                          </div>
                        </div>

                        {/* Throttle indicator */}
                        {isThrottled && (
                          <div className="mt-2 p-2.5 rounded bg-orange-100/80 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-orange-800 dark:text-orange-200">
                                    Auto-Throttled: Speed reduced to {effectiveSpeed} concurrent calls
                                  </p>
                                  {agent.throttleReason && (
                                    <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">{agent.throttleReason}</p>
                                  )}
                                  {agent.throttleStartedAt && (
                                    <p className="text-[10px] text-orange-600/70 dark:text-orange-400/70 mt-0.5">
                                      Since: {new Date(Number(agent.throttleStartedAt)).toLocaleString()}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-orange-600/70 dark:text-orange-400/70">
                                    Carrier errors: {agent.throttleCarrierErrors ?? 0} total
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 h-7 text-xs border-orange-300 dark:border-orange-700 hover:bg-orange-200 dark:hover:bg-orange-900"
                                onClick={() => resetThrottle.mutate({ agentId: agent.agentId })}
                                disabled={resetThrottle.isPending}
                              >
                                {resetThrottle.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><RotateCcw className="h-3 w-3 mr-1" />Reset Throttle</>
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline installer for this agent */}
                    {showingInstaller && (
                      <div className="ml-4 mt-2 p-4 rounded-lg border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-3">
                          Re-install or update agent "{agent.name}" on your FreePBX server:
                        </p>
                        <InstallerWizard
                          agentId={agent.agentId}
                          onDone={() => {
                            setShowInstallerForAgent(null);
                            agents.refetch();
                            amiStatus.refetch();
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Throttle History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />Throttle History
            </CardTitle>
            <CardDescription>
              Log of auto-throttle events across all agents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThrottleHistoryTable />
          </CardContent>
        </Card>

        {/* Agent Performance Metrics */}
        <AgentMetricsDashboard />

        {/* How It Works (collapsed by default) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />How It Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-sm">
              <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300 text-xs">
                <li>The PBX agent runs on your FreePBX server as a systemd service</li>
                <li>It polls this web app every 3 seconds for pending calls (outbound HTTPS only)</li>
                <li>When calls are found, it downloads audio from S3 and converts it locally</li>
                <li>Calls are originated via local AMI (localhost:5038) — no firewall issues</li>
                <li>Call results (answered/busy/failed + duration) are reported back via HTTPS</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
