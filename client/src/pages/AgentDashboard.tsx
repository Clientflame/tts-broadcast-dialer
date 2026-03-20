import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Phone, PhoneCall, PhoneOff, PhoneIncoming, PhoneOutgoing,
  Clock, Timer, Activity, Headphones, BarChart3,
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  User, Wifi, WifiOff, TrendingUp, Zap,
} from "lucide-react";

function useESTClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const est = now.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      const day = now.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      setTime(`${day} ${est} EST`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatDuration(secs: number | null): string {
  if (!secs || secs <= 0) return "0s";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

function timeAgo(ts: number | string | null) {
  if (!ts) return "";
  const d = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getStatusColor(status: string) {
  switch (status) {
    case "available": return { text: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/30", dot: "bg-green-500" };
    case "on_call": return { text: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-500" };
    case "ringing": return { text: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500 animate-pulse" };
    case "wrap_up": return { text: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30", dot: "bg-purple-500" };
    case "on_break": return { text: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-500" };
    case "reserved": return { text: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/30", dot: "bg-cyan-500" };
    default: return { text: "text-muted-foreground", bg: "bg-muted/30", border: "border-muted", dot: "bg-muted-foreground" };
  }
}

function getDispositionConfig(disposition: string | null) {
  switch (disposition) {
    case "connected": return { label: "Connected", color: "text-green-500", bg: "bg-green-500/10" };
    case "promise_to_pay": return { label: "Promise to Pay", color: "text-blue-500", bg: "bg-blue-500/10" };
    case "payment_made": return { label: "Payment Made", color: "text-emerald-500", bg: "bg-emerald-500/10" };
    case "callback_requested": return { label: "Callback", color: "text-amber-500", bg: "bg-amber-500/10" };
    case "wrong_number": return { label: "Wrong Number", color: "text-red-500", bg: "bg-red-500/10" };
    case "deceased": return { label: "Deceased", color: "text-gray-500", bg: "bg-gray-500/10" };
    case "disputed": return { label: "Disputed", color: "text-orange-500", bg: "bg-orange-500/10" };
    case "refused_to_pay": return { label: "Refused", color: "text-red-500", bg: "bg-red-500/10" };
    case "no_contact": return { label: "No Contact", color: "text-muted-foreground", bg: "bg-muted/30" };
    case "left_message": return { label: "Left Message", color: "text-cyan-500", bg: "bg-cyan-500/10" };
    default: return { label: disposition || "Other", color: "text-muted-foreground", bg: "bg-muted/30" };
  }
}

function AgentStatusCard({ agent }: { agent: any }) {
  const statusColors = getStatusColor(agent.status);
  const statusLabel = agent.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <Card className={`${statusColors.border} border-2`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full ${statusColors.bg} flex items-center justify-center`}>
              <Headphones className={`h-5 w-5 ${statusColors.text}`} />
            </div>
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <span>Ext. {agent.sipExtension}</span>
                {agent.email && <span className="text-xs">({agent.email})</span>}
              </CardDescription>
            </div>
          </div>
          <Badge className={`${statusColors.bg} ${statusColors.text} border ${statusColors.border} px-3 py-1`}>
            <span className={`inline-block h-2 w-2 rounded-full mr-2 ${statusColors.dot}`} />
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Max Calls</div>
            <div className="text-xl font-bold">{agent.maxConcurrentCalls}</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Handled</div>
            <div className="text-xl font-bold">{agent.totalCallsHandled}</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Talk Time</div>
            <div className="text-xl font-bold">{formatDuration(agent.totalTalkTime)}</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg Handle</div>
            <div className="text-xl font-bold">{formatDuration(agent.avgHandleTime)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TodayStatsCards({ todayStats, performance }: { todayStats: any; performance: any }) {
  const answerRate = performance?.totalCalls > 0
    ? Math.round((performance.answeredCalls / performance.totalCalls) * 100)
    : 0;

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Calls Today</CardTitle>
          <Phone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{todayStats?.callsToday ?? 0}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {performance?.totalCalls ?? 0} all-time
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Talk Time Today</CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatDuration(todayStats?.talkTimeToday ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Avg {formatDuration(todayStats?.avgTalkTimeToday ?? 0)} per call
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">All-Time Talk</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatDuration(performance?.totalTalkTime ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Avg {formatDuration(performance?.avgTalkTime ?? 0)} per call
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Answer Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {performance?.totalCalls > 0 ? `${answerRate}%` : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {performance?.answeredCalls ?? 0} of {performance?.totalCalls ?? 0} calls
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DispositionBreakdown({ performance }: { performance: any }) {
  if (!performance?.dispositions || Object.keys(performance.dispositions).length === 0) {
    return null;
  }

  const sorted = Object.entries(performance.dispositions)
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const total = sorted.reduce((sum, [, count]) => sum + (count as number), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Disposition Breakdown
        </CardTitle>
        <CardDescription>All-time call outcomes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sorted.map(([disposition, cnt]) => {
            const config = getDispositionConfig(disposition);
            const pct = total > 0 ? Math.round(((cnt as number) / total) * 100) : 0;
            return (
              <div key={disposition} className="flex items-center gap-3">
                <div className="w-32 sm:w-40 truncate">
                  <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${config.bg.replace("/10", "/40")}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="w-16 text-right">
                  <span className="text-sm font-mono">{cnt as number}</span>
                  <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CallHistoryTable({ callHistory }: { callHistory: any[] }) {
  if (!callHistory || callHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            Recent Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No call history yet</p>
            <p className="text-xs mt-1">Your calls will appear here once you start taking them</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PhoneCall className="h-4 w-4" />
              Recent Call History
            </CardTitle>
            <CardDescription>Last {callHistory.length} calls</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-4 font-medium">Phone</th>
                <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Contact</th>
                <th className="text-left py-2 pr-4 font-medium">Disposition</th>
                <th className="text-right py-2 pr-4 font-medium hidden md:table-cell">Talk Time</th>
                <th className="text-right py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {callHistory.map((call: any) => {
                const config = getDispositionConfig(call.disposition);
                return (
                  <tr key={call.id} className="border-b border-muted/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs">{formatPhone(call.phoneNumber)}</span>
                    </td>
                    <td className="py-2.5 pr-4 hidden sm:table-cell">
                      <span className="text-xs truncate max-w-[150px] block">{call.contactName || "—"}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline" className={`${config.bg} ${config.color} text-xs`}>
                        {config.label}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right hidden md:table-cell">
                      <span className="font-mono text-xs">{call.talkDuration ? formatDuration(call.talkDuration) : "—"}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="text-xs text-muted-foreground">{timeAgo(call.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function NotLinkedState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-semibold">Agent Not Linked</h2>
          <p className="text-muted-foreground text-sm">
            Your user account is not linked to a phone agent extension yet.
            Please ask your administrator to link your account to your SIP extension.
          </p>
          <div className="pt-2">
            <Badge variant="outline" className="text-xs">
              <User className="h-3 w-3 mr-1" />
              Contact your admin
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const estClock = useESTClock();

  const myAgent = trpc.agentDashboard.myAgent.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5000,
  });
  const todayStats = trpc.agentDashboard.todayStats.useQuery(undefined, {
    enabled: !!user && !!myAgent.data,
    refetchInterval: 10000,
  });
  const performance = trpc.agentDashboard.performance.useQuery(undefined, {
    enabled: !!user && !!myAgent.data,
    refetchInterval: 30000,
  });
  const callHistory = trpc.agentDashboard.callHistory.useQuery(undefined, {
    enabled: !!user && !!myAgent.data,
    refetchInterval: 10000,
  });

  const agent = myAgent.data;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Agent Dashboard</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-muted-foreground text-sm">Your call center workspace</p>
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono bg-muted/50 px-2 py-0.5 rounded">
                <Clock className="h-3 w-3" />
                {estClock}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                myAgent.refetch();
                todayStats.refetch();
                performance.refetch();
                callHistory.refetch();
                toast.info("Refreshing...");
              }}
              disabled={myAgent.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${myAgent.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Not linked state */}
        {!myAgent.isLoading && !agent && <NotLinkedState />}

        {/* Loading state */}
        {myAgent.isLoading && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Loading your agent profile...</p>
            </div>
          </div>
        )}

        {/* Agent content */}
        {agent && (
          <>
            {/* Agent Status Card */}
            <AgentStatusCard agent={agent} />

            {/* Today's Stats */}
            <TodayStatsCards todayStats={todayStats.data} performance={performance.data} />

            {/* Two-column layout for disposition + call history */}
            <div className="grid gap-6 lg:grid-cols-2">
              <DispositionBreakdown performance={performance.data} />
              <CallHistoryTable callHistory={callHistory.data || []} />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
