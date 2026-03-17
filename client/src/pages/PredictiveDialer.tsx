import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Gauge, Activity, Phone, PhoneOff, Users, TrendingUp, TrendingDown, AlertTriangle, Clock, Headset, BarChart3, RefreshCw, Zap } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";

// ─── Gauge Component ───
function StatGauge({ value, max, label, color, suffix = "", size = 120 }: {
  value: number; max: number; label: string; color: string; suffix?: string; size?: number;
}) {
  const pct = Math.min(value / max, 1);
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius; // half circle
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        {/* Background arc */}
        <path
          d={`M 8 ${size / 2 + 8} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2 + 8}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M 8 ${size / 2 + 8} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2 + 8}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        {/* Value text */}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="fill-foreground text-lg font-bold" fontSize="20">
          {typeof value === "number" ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}{suffix}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

// ─── Status Dot ───
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "bg-green-500",
    on_call: "bg-blue-500",
    ringing: "bg-yellow-500",
    wrap_up: "bg-purple-500",
    on_break: "bg-orange-500",
    offline: "bg-gray-400",
    reserved: "bg-cyan-500",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || "bg-gray-400"}`} />;
}

// ─── Agent Row ───
function AgentRow({ agent }: { agent: { id: number; name: string; sipExtension: string; status: string; currentCallId: number | null; statusChangedAt: number; callConnectedAt: number | null } }) {
  const [elapsed, setElapsed] = useState(0);
  const startTime = agent.status === "on_call" && agent.callConnectedAt ? agent.callConnectedAt : agent.statusChangedAt;

  useEffect(() => {
    if (agent.status === "on_call" || agent.status === "ringing" || agent.status === "wrap_up") {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    setElapsed(0);
  }, [agent.status, startTime]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <StatusDot status={agent.status} />
        <div>
          <span className="font-medium text-sm">{agent.name}</span>
          <span className="text-xs text-muted-foreground ml-2">Ext. {agent.sipExtension}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {(agent.status === "on_call" || agent.status === "ringing" || agent.status === "wrap_up") && (
          <span className="text-xs font-mono text-muted-foreground">{formatTime(elapsed)}</span>
        )}
        <Badge variant={agent.status === "available" ? "default" : agent.status === "on_call" ? "secondary" : "outline"} className="text-xs capitalize">
          {agent.status.replace("_", " ")}
        </Badge>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function PredictiveDialer() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  // Fetch data with auto-refresh
  const { data: stats, isLoading: statsLoading } = trpc.liveAgents.predictiveStats.useQuery(
    selectedCampaign !== "all" ? { campaignId: Number(selectedCampaign) } : {},
    { refetchInterval: 3000 }
  );

  const { data: campaigns } = trpc.campaigns.list.useQuery();
  const activeCampaigns = useMemo(() => campaigns?.filter((c: any) => c.status === "running") || [], [campaigns]);

  // Derived stats
  const agentSummary = stats?.agentSummary || { total: 0, available: 0, onCall: 0, ringing: 0, wrapUp: 0, onBreak: 0, offline: 0, reserved: 0 };
  const utilization = stats?.utilization || 0;
  const agents = stats?.agents || [];
  const dialerStatsRaw = stats?.dialerStats;
  const dialerCampaigns = (dialerStatsRaw && 'campaigns' in dialerStatsRaw ? dialerStatsRaw.campaigns : []) as Array<any>;

  // Aggregate dialer stats across campaigns
  const aggregatedDialer = useMemo(() => {
    if (!dialerCampaigns.length) return null;
    const filtered = selectedCampaign !== "all"
      ? dialerCampaigns.filter((d: any) => d.id === Number(selectedCampaign))
      : dialerCampaigns;
    if (!filtered.length) return null;

    return {
      totalActive: filtered.reduce((sum: number, d: any) => sum + (d.activeCalls || 0), 0),
      totalPending: filtered.reduce((sum: number, d: any) => sum + (d.pending || 0), 0),
      totalCompleted: filtered.reduce((sum: number, d: any) => sum + (d.totalEligible || 0), 0),
      avgAnswerRate: filtered.reduce((sum: number, d: any) => sum + (d.pacing?.windowAnswerRate || 0), 0) / filtered.length,
      avgDropRate: filtered.reduce((sum: number, d: any) => sum + (d.pacing?.windowDropRate || 0), 0) / filtered.length,
      avgOverdial: filtered.reduce((sum: number, d: any) => sum + (d.pacing?.overdialRatio || 1), 0) / filtered.length,
      currentConcurrent: filtered.reduce((sum: number, d: any) => sum + (d.pacing?.currentConcurrent || 0), 0),
      circuitBreakerActive: filtered.some((d: any) => d.pacing?.circuitBreakerActive),
      pacingMode: filtered[0]?.pacing?.mode || "fixed",
      totalAbandonRate: filtered.reduce((sum: number, d: any) => sum + (d.pacing?.totalAbandonRate || 0), 0) / filtered.length,
    };
  }, [dialerCampaigns, selectedCampaign]);

  // Color helpers
  const getUtilColor = (v: number) => v > 85 ? "#ef4444" : v > 60 ? "#22c55e" : v > 30 ? "#eab308" : "#6b7280";
  const getAnswerColor = (v: number) => v > 50 ? "#22c55e" : v > 30 ? "#eab308" : "#ef4444";
  const getAbandonColor = (v: number) => v > 3 ? "#ef4444" : v > 2 ? "#eab308" : "#22c55e";

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gauge className="h-6 w-6 text-primary" />
              Predictive Dialer Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Real-time monitoring of call pacing, agent utilization, and dialer performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {activeCampaigns.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="gap-1.5 py-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </Badge>
          </div>
        </div>

        {/* Top Gauges Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4 pb-2 flex justify-center">
              <StatGauge value={utilization} max={100} label="Agent Utilization" color={getUtilColor(utilization)} suffix="%" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-2 flex justify-center">
              <StatGauge value={aggregatedDialer?.avgAnswerRate || 0} max={100} label="Answer Rate" color={getAnswerColor(aggregatedDialer?.avgAnswerRate || 0)} suffix="%" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-2 flex justify-center">
              <StatGauge value={aggregatedDialer?.totalAbandonRate || 0} max={10} label="Abandon Rate" color={getAbandonColor(aggregatedDialer?.totalAbandonRate || 0)} suffix="%" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-2 flex justify-center">
              <StatGauge value={aggregatedDialer?.avgOverdial || 1} max={5} label="Overdial Ratio" color="#3b82f6" suffix="x" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-2 flex justify-center">
              <StatGauge value={aggregatedDialer?.currentConcurrent || 0} max={aggregatedDialer?.currentConcurrent ? aggregatedDialer.currentConcurrent * 2 : 20} label="Concurrent Calls" color="#8b5cf6" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-2 flex justify-center">
              <StatGauge value={agentSummary.onCall} max={Math.max(agentSummary.total, 1)} label="Agents on Call" color="#0ea5e9" />
            </CardContent>
          </Card>
        </div>

        {/* Circuit Breaker Warning */}
        {aggregatedDialer?.circuitBreakerActive && (
          <Card className="border-red-500/50 bg-red-500/5">
            <CardContent className="py-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <span className="font-semibold text-red-600">Circuit Breaker Active</span>
                <span className="text-sm text-muted-foreground ml-2">
                  Consecutive call drops detected. Dialer has been throttled to minimum concurrent calls to prevent excessive abandonment.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agents">Agent Status</TabsTrigger>
            <TabsTrigger value="campaigns">Campaign Stats</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Agent Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Headset className="h-4 w-4" />
                    Agent Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Agents</span>
                    <span className="font-medium">{agentSummary.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><StatusDot status="available" /> Available</span>
                    <span className="font-medium text-green-600">{agentSummary.available}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><StatusDot status="on_call" /> On Call</span>
                    <span className="font-medium text-blue-600">{agentSummary.onCall}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><StatusDot status="ringing" /> Ringing</span>
                    <span className="font-medium text-yellow-600">{agentSummary.ringing}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><StatusDot status="wrap_up" /> Wrap Up</span>
                    <span className="font-medium text-purple-600">{agentSummary.wrapUp}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><StatusDot status="on_break" /> On Break</span>
                    <span className="font-medium text-orange-600">{agentSummary.onBreak}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><StatusDot status="offline" /> Offline</span>
                    <span className="font-medium text-gray-500">{agentSummary.offline}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Dialer Performance */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Dialer Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pacing Mode</span>
                    <Badge variant="outline" className="capitalize text-xs">{aggregatedDialer?.pacingMode || "—"}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Calls</span>
                    <span className="font-medium">{aggregatedDialer?.totalActive || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pending Queue</span>
                    <span className="font-medium">{aggregatedDialer?.totalPending || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium">{aggregatedDialer?.totalCompleted || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Concurrent Limit</span>
                    <span className="font-medium">{aggregatedDialer?.currentConcurrent || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Overdial Ratio</span>
                    <span className="font-medium">{(aggregatedDialer?.avgOverdial || 1).toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Circuit Breaker</span>
                    <Badge variant={aggregatedDialer?.circuitBreakerActive ? "destructive" : "outline"} className="text-xs">
                      {aggregatedDialer?.circuitBreakerActive ? "ACTIVE" : "Normal"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Key Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Answer Rate</span>
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {(aggregatedDialer?.avgAnswerRate || 0).toFixed(1)}%
                        {(aggregatedDialer?.avgAnswerRate || 0) > 50 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(aggregatedDialer?.avgAnswerRate || 0, 100)}%` }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Drop Rate</span>
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {(aggregatedDialer?.avgDropRate || 0).toFixed(1)}%
                        {(aggregatedDialer?.avgDropRate || 0) > 3 ? <AlertTriangle className="h-3 w-3 text-red-500" /> : <Zap className="h-3 w-3 text-green-500" />}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${(aggregatedDialer?.avgDropRate || 0) > 3 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${Math.min((aggregatedDialer?.avgDropRate || 0) * 10, 100)}%` }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Abandon Rate (TCPA)</span>
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {(aggregatedDialer?.totalAbandonRate || 0).toFixed(1)}%
                        <span className="text-xs text-muted-foreground">/ 3%</span>
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${(aggregatedDialer?.totalAbandonRate || 0) > 3 ? "bg-red-500" : (aggregatedDialer?.totalAbandonRate || 0) > 2 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min((aggregatedDialer?.totalAbandonRate || 0) / 3 * 100, 100)}%` }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Agent Utilization</span>
                      <span className="text-sm font-medium">{utilization}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${utilization}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Per-Campaign Stats */}
            {dialerCampaigns.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Active Campaign Pacing</CardTitle>
                  <CardDescription>Real-time pacing stats for running campaigns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 font-medium">Campaign</th>
                          <th className="text-center py-2 font-medium">Mode</th>
                          <th className="text-center py-2 font-medium">Concurrent</th>
                          <th className="text-center py-2 font-medium">Active</th>
                          <th className="text-center py-2 font-medium">Pending</th>
                          <th className="text-center py-2 font-medium">Answer %</th>
                          <th className="text-center py-2 font-medium">Drop %</th>
                          <th className="text-center py-2 font-medium">Overdial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dialerCampaigns.map((d: any) => (
                          <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 font-medium">{d.name}</td>
                            <td className="py-2 text-center">
                              <Badge variant="outline" className="text-xs capitalize">{d.pacing?.mode || "—"}</Badge>
                            </td>
                            <td className="py-2 text-center font-mono">{d.pacing?.currentConcurrent || 0}</td>
                            <td className="py-2 text-center">{d.activeCalls || 0}</td>
                            <td className="py-2 text-center">{d.pending || 0}</td>
                            <td className="py-2 text-center">
                              <span className={(d.pacing?.windowAnswerRate || 0) > 50 ? "text-green-600" : "text-red-600"}>
                                {(d.pacing?.windowAnswerRate || 0).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-2 text-center">
                              <span className={(d.pacing?.windowDropRate || 0) > 3 ? "text-red-600" : "text-green-600"}>
                                {(d.pacing?.windowDropRate || 0).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-2 text-center font-mono">{(d.pacing?.overdialRatio || 1).toFixed(2)}x</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Headset className="h-4 w-4" />
                  Live Agent Status
                </CardTitle>
                <CardDescription>Real-time agent status from FreePBX SIP monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                {agents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Headset className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No live agents configured</p>
                    <p className="text-sm mt-1">Add agents in the Live Agents page to see real-time status here.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {agents.map(agent => (
                      <AgentRow key={agent.id} agent={agent} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            {dialerCampaigns.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Phone className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No active campaigns</p>
                  <p className="text-sm mt-1">Start a campaign to see real-time dialer statistics.</p>
                </CardContent>
              </Card>
            ) : (
              dialerCampaigns.map((d: any) => (
                  <Card key={d.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{d.name}</CardTitle>
                      <Badge variant="default" className="text-xs">Running</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <StatGauge value={d.pacing?.windowAnswerRate || 0} max={100} label="Answer Rate" color={getAnswerColor(d.pacing?.windowAnswerRate || 0)} suffix="%" size={100} />
                      </div>
                      <div className="text-center">
                        <StatGauge value={d.pacing?.totalAbandonRate || 0} max={10} label="Abandon Rate" color={getAbandonColor(d.pacing?.totalAbandonRate || 0)} suffix="%" size={100} />
                      </div>
                      <div className="text-center">
                        <StatGauge value={d.pacing?.overdialRatio || 1} max={5} label="Overdial" color="#3b82f6" suffix="x" size={100} />
                      </div>
                      <div className="text-center">
                        <StatGauge value={d.pacing?.currentConcurrent || 0} max={d.pacing?.currentConcurrent ? d.pacing.currentConcurrent * 2 : 10} label="Concurrent" color="#8b5cf6" size={100} />
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                      <div className="p-2 rounded bg-muted/50 text-center">
                        <div className="text-muted-foreground text-xs">Active</div>
                        <div className="font-bold text-lg">{d.activeCalls || 0}</div>
                      </div>
                      <div className="p-2 rounded bg-muted/50 text-center">
                        <div className="text-muted-foreground text-xs">Pending</div>
                        <div className="font-bold text-lg">{d.pending || 0}</div>
                      </div>
                      <div className="p-2 rounded bg-muted/50 text-center">
                        <div className="text-muted-foreground text-xs">Total Eligible</div>
                        <div className="font-bold text-lg">{d.totalEligible || 0}</div>
                      </div>
                    </div>
                    {/* Recent Adjustments */}
                    {d.pacing?.recentAdjustments?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">Recent Pacing Adjustments</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {d.pacing.recentAdjustments.slice(-5).reverse().map((adj: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs py-1">
                              <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="font-mono">{adj.from} → {adj.to}</span>
                              <span className="text-muted-foreground truncate">{adj.reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
