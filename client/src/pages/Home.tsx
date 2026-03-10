import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  Megaphone, Users, Phone, PhoneCall, CheckCircle2,
  ListChecks, Wifi, WifiOff, RefreshCw, Activity,
  Zap, Timer, Radio, ArrowDown, Pause, XCircle,
  PhoneOff, PhoneIncoming, PhoneOutgoing, Clock,
} from "lucide-react";

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return phone;
}

function timeAgo(ts: number | null) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDuration(secs: number | null): string {
  if (!secs || secs <= 0) return "";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatMinutes(totalSecs: number): string {
  if (totalSecs <= 0) return "0m";
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

function getStatusConfig(status: string, result: string | null) {
  if (status === "completed" && result === "answered") {
    return { icon: PhoneIncoming, label: "Answered", color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/30" };
  }
  if (status === "completed" && result === "busy") {
    return { icon: PhoneOff, label: "Busy", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30" };
  }
  if (status === "completed" && result === "no-answer") {
    return { icon: PhoneOff, label: "No Answer", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" };
  }
  if (status === "completed" && result === "congestion") {
    return { icon: XCircle, label: "Congestion", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30" };
  }
  if (status === "failed" || (status === "completed" && result === "failed")) {
    return { icon: XCircle, label: "Failed", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30" };
  }
  if (status === "dialing") {
    return { icon: PhoneOutgoing, label: "Dialing", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" };
  }
  if (status === "claimed") {
    return { icon: PhoneOutgoing, label: "Claimed", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/30" };
  }
  if (status === "pending") {
    return { icon: Clock, label: "Pending", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-muted" };
  }
  return { icon: Phone, label: status, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-muted" };
}

function CallActivityFeed() {
  const { user } = useAuth();
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const activity = trpc.dashboard.callActivity.useQuery(
    { limit: 50 },
    { enabled: !!user, refetchInterval: 3000 }
  );

  const items = activity.data ?? [];

  // Track new items for animation
  useEffect(() => {
    if (items.length > prevCountRef.current && autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevCountRef.current = items.length;
  }, [items.length, autoScroll]);

  if (!items.length) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Call Activity Feed</CardTitle>
          </div>
          <CardDescription>Real-time call events will appear here when campaigns are running</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Phone className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No recent call activity</p>
            <p className="text-xs mt-1">Start a campaign to see live events</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Count active/recent stats
  const activeCount = items.filter(i => i.status === "dialing" || i.status === "claimed").length;
  const answeredCount = items.filter(i => i.result === "answered").length;
  const failedCount = items.filter(i => i.result === "failed" || i.result === "congestion").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`h-5 w-5 ${activeCount > 0 ? "text-blue-500 animate-pulse" : "text-muted-foreground"}`} />
            <CardTitle className="text-lg">Call Activity Feed</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Badge variant="outline" className="text-blue-500 border-blue-500/30">
                <PhoneOutgoing className="h-3 w-3 mr-1" />{activeCount} active
              </Badge>
            )}
            <Badge variant="outline" className="text-green-500 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />{answeredCount} answered
            </Badge>
            {failedCount > 0 && (
              <Badge variant="outline" className="text-red-500 border-red-500/30">
                <XCircle className="h-3 w-3 mr-1" />{failedCount} failed
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">Auto-refresh 3s</span>
          </div>
        </div>
        <CardDescription>Latest {items.length} call events across all campaigns</CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={feedRef} className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {items.map((item, idx) => {
            const cfg = getStatusConfig(item.status, item.result);
            const Icon = cfg.icon;
            const isActive = item.status === "dialing" || item.status === "claimed";
            const dur = formatDuration(item.callDuration);

            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${cfg.border} ${cfg.bg} ${isActive ? "animate-pulse" : ""} ${idx === 0 ? "ring-1 ring-primary/20" : ""}`}
              >
                {/* Status Icon */}
                <div className={`flex-shrink-0 p-1.5 rounded-full ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{formatPhone(item.phoneNumber)}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color} ${cfg.border}`}>
                      {cfg.label}
                    </Badge>
                    {dur && (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium">
                        <Timer className="h-3 w-3" />{dur}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {item.campaignName && (
                      <span className="flex items-center gap-1">
                        <Megaphone className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{item.campaignName}</span>
                      </span>
                    )}
                    {item.agentName && (
                      <span className="flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        <span className="truncate max-w-[100px]">{item.agentName}</span>
                      </span>
                    )}
                    {item.callerIdStr && (
                      <span className="font-mono text-[10px] opacity-60">CID: {item.callerIdStr}</span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-right">
                  <span className="text-xs text-muted-foreground">{timeAgo(item.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const stats = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user });
  const amiStatus = trpc.dashboard.amiStatus.useQuery(undefined, { enabled: !!user, refetchInterval: 15000 });
  const dialerLive = trpc.dashboard.dialerLive.useQuery(undefined, { enabled: !!user, refetchInterval: 3000 });

  const isDialerActive = (dialerLive.data?.activeCampaignCount ?? 0) > 0;

  const totalDurationSecs = stats.data?.totalDurationSecs ?? 0;
  const avgDurationSecs = stats.data?.avgDurationSecs ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">AI TTS Broadcast Dialer Overview</p>
          </div>
          <div className="flex items-center gap-2">
            {isDialerActive && (
              <Badge variant="default" className="flex items-center gap-1.5 px-3 py-1 bg-green-600 animate-pulse">
                <Radio className="h-3.5 w-3.5" />
                Dialer Active
              </Badge>
            )}
            <Badge
              variant={amiStatus.data?.connected ? "default" : "destructive"}
              className="flex items-center gap-1.5 px-3 py-1"
            >
              {amiStatus.data?.connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              FreePBX {amiStatus.data?.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </div>

        {/* Live Dialer Stats - Always visible */}
        <Card className={isDialerActive ? "border-green-500/50 bg-green-500/5" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`h-5 w-5 ${isDialerActive ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
                <CardTitle className="text-lg">Live Dialer Status</CardTitle>
              </div>
              {isDialerActive && (
                <span className="text-xs text-muted-foreground">Auto-refreshing every 3s</span>
              )}
            </div>
            <CardDescription>
              {isDialerActive
                ? `${dialerLive.data?.activeCampaignCount} active campaign(s) running`
                : "No active campaigns — start a campaign to see live stats"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <PhoneCall className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Active Calls</span>
                </div>
                <div className={`text-4xl font-bold tabular-nums ${isDialerActive ? "text-green-500" : ""}`}>
                  {dialerLive.data?.activeCalls ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Currently ringing / connected</p>
              </div>

              <div className="rounded-lg border p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Leads in Hopper</span>
                </div>
                <div className={`text-4xl font-bold tabular-nums ${isDialerActive ? "text-amber-500" : ""}`}>
                  {dialerLive.data?.leadsInHopper ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Queued and waiting to be dialed</p>
              </div>

              <div className="rounded-lg border p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Concurrent Limit</span>
                </div>
                <div className="text-4xl font-bold tabular-nums">
                  {dialerLive.data?.activeCalls ?? 0}
                  <span className="text-lg text-muted-foreground font-normal"> / {dialerLive.data?.concurrentLimit ?? 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Active vs. max concurrent calls</p>
                {(dialerLive.data?.concurrentLimit ?? 0) > 0 && (
                  <Progress
                    value={((dialerLive.data?.activeCalls ?? 0) / (dialerLive.data?.concurrentLimit ?? 1)) * 100}
                    className="h-1.5 mt-2"
                  />
                )}
              </div>
            </div>

            {/* Per-campaign breakdown when active */}
            {isDialerActive && dialerLive.data?.campaigns && dialerLive.data.campaigns.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Active Campaign Breakdown</h4>
                <div className="space-y-2">
                  {dialerLive.data.campaigns.map((c: any) => (
                    <div key={c.id} className="text-sm p-3 rounded bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span><PhoneCall className="h-3 w-3 inline mr-1" />{c.activeCalls} calling</span>
                          <span><Timer className="h-3 w-3 inline mr-1" />{c.pending} pending</span>
                          <span><Zap className="h-3 w-3 inline mr-1" />{c.maxConcurrent} max</span>
                        </div>
                      </div>
                      {c.pacing && c.pacing.mode !== "fixed" && (
                        <div className="flex items-center gap-3 text-xs border-t pt-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium capitalize">
                            {c.pacing.mode} Pacing
                          </span>
                          <span className="text-muted-foreground">Answer: {Math.round(c.pacing.windowAnswerRate)}%</span>
                          <span className="text-muted-foreground">Drop: {Math.round(c.pacing.windowDropRate)}%</span>
                          {c.pacing.avgCallDuration > 0 && (
                            <span className="text-muted-foreground">Avg: {c.pacing.avgCallDuration}s</span>
                          )}
                          {c.pacing.recentAdjustments?.length > 0 && (
                            <span className={`text-xs ${c.pacing.recentAdjustments[0].includes("Increased") ? "text-green-500" : c.pacing.recentAdjustments[0].includes("Decreased") ? "text-amber-500" : "text-muted-foreground"}`}>
                              {c.pacing.recentAdjustments[0]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Campaigns</CardTitle>
              <Megaphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.data?.totalCampaigns ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.data?.activeCampaigns ?? 0} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contact Lists</CardTitle>
              <ListChecks className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.data?.totalLists ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.data?.totalContacts ?? 0} total contacts</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.data?.totalCalls ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.data?.answeredCalls ?? 0} answered</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Talk Time</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatMinutes(totalDurationSecs)}</div>
              <p className="text-xs text-muted-foreground mt-1">Avg {avgDurationSecs}s per call</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Answer Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(stats.data?.totalCalls ?? 0) > 0
                  ? `${Math.round(((stats.data?.answeredCalls ?? 0) / (stats.data?.totalCalls ?? 1)) * 100)}%`
                  : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {(stats.data?.answeredCalls ?? 0)} of {(stats.data?.totalCalls ?? 0)} calls
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Real-time Call Activity Feed */}
        <CallActivityFeed />

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">FreePBX Connection</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">PBX Agents</span>
                <span className="text-sm font-mono">{amiStatus.data?.agents ?? 0} registered</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Online</span>
                <span className="text-sm font-mono">{amiStatus.data?.onlineAgents ?? 0} agent(s)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={amiStatus.data?.connected ? "default" : "outline"}>
                  {amiStatus.data?.connected ? "Connected" : "Disconnected"}
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => amiStatus.refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh Status
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = "/campaigns"}>
                <Megaphone className="h-4 w-4 mr-2" />Create New Campaign
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = "/contacts"}>
                <Users className="h-4 w-4 mr-2" />Manage Contacts
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = "/audio"}>
                <PhoneCall className="h-4 w-4 mr-2" />Generate TTS Audio
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
