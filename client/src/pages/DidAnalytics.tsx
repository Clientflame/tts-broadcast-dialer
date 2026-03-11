import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useMemo } from "react";
import {
  Activity, Phone, PhoneCall, PhoneOff, Clock, TrendingUp, TrendingDown,
  ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, AlertTriangle,
  BarChart3, Timer, DollarSign, ArrowUpDown, ChevronDown, ChevronUp,
} from "lucide-react";

type SortField = "phoneNumber" | "totalCalls" | "answerRate" | "avgDuration" | "failureRate";
type SortDir = "asc" | "desc";

function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatMinutes(seconds: number): string {
  if (!seconds) return "0m";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function HealthIcon({ status, autoDisabled }: { status: string; autoDisabled: number }) {
  if (autoDisabled) return <ShieldX className="h-4 w-4 text-red-500" />;
  switch (status) {
    case "healthy": return <ShieldCheck className="h-4 w-4 text-green-500" />;
    case "degraded": return <ShieldAlert className="h-4 w-4 text-yellow-500" />;
    case "failed": return <ShieldX className="h-4 w-4 text-red-500" />;
    default: return <ShieldQuestion className="h-4 w-4 text-muted-foreground" />;
  }
}

function AnswerRateBar({ rate, size = "md" }: { rate: number; size?: "sm" | "md" }) {
  const color = rate >= 5 ? "bg-green-500" : rate >= 2 ? "bg-yellow-500" : "bg-red-500";
  const h = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className={`w-full ${h} bg-muted rounded-full overflow-hidden`}>
      <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${Math.min(rate, 100)}%` }} />
    </div>
  );
}

export default function DidAnalytics() {
  const { data: summary = [], isLoading } = trpc.callerIds.analyticsSummary.useQuery();
  const [days, setDays] = useState(7);
  const { data: volumeData = [] } = trpc.callerIds.callVolume.useQuery({ days });
  const { data: flagHistory = [] } = trpc.callerIds.flagHistory.useQuery();
  const [sortField, setSortField] = useState<SortField>("totalCalls");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedDid, setSelectedDid] = useState<string | null>(null);
  const { data: campaignBreakdown = [] } = trpc.callerIds.campaignBreakdown.useQuery(
    { callerIdStr: selectedDid! },
    { enabled: !!selectedDid }
  );

  // Aggregate stats
  const totals = useMemo(() => {
    const t = { totalCalls: 0, answered: 0, failed: 0, noAnswer: 0, busy: 0, congestion: 0, totalDuration: 0, activeDids: 0, flaggedDids: 0 };
    for (const d of summary) {
      t.totalCalls += d.totalCalls;
      t.answered += d.answered;
      t.failed += d.failed;
      t.noAnswer += d.noAnswer;
      t.busy += d.busy;
      t.congestion += d.congestion;
      t.totalDuration += d.totalDuration;
      if (d.isActive === 1 && !d.autoDisabled) t.activeDids++;
      if (d.autoDisabled) t.flaggedDids++;
    }
    return { ...t, answerRate: t.totalCalls > 0 ? Math.round((t.answered / t.totalCalls) * 100) : 0 };
  }, [summary]);

  // Sorted data
  const sorted = useMemo(() => {
    return [...summary].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [summary, sortField, sortDir]);

  // Volume chart data - aggregate per date
  const volumeByDate = useMemo(() => {
    const map = new Map<string, { total: number; answered: number; failed: number }>();
    for (const v of volumeData) {
      const existing = map.get(v.date) || { total: 0, answered: 0, failed: 0 };
      existing.total += v.total;
      existing.answered += v.answered;
      existing.failed += v.failed;
      map.set(v.date, existing);
    }
    return Array.from(map.entries()).map(([date, data]) => ({ date, ...data }));
  }, [volumeData]);

  // Best and worst performing DIDs
  const bestDid = useMemo(() => {
    const withCalls = summary.filter(d => d.totalCalls >= 10);
    return withCalls.sort((a, b) => b.answerRate - a.answerRate)[0];
  }, [summary]);

  const worstDid = useMemo(() => {
    const withCalls = summary.filter(d => d.totalCalls >= 10);
    return withCalls.sort((a, b) => a.answerRate - b.answerRate)[0];
  }, [summary]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">DID Analytics</h1>
          <p className="text-muted-foreground">Per-DID performance metrics, answer rates, and flagging history</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Total DIDs</CardDescription>
              <CardTitle className="text-2xl">{summary.length}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{totals.activeDids} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><PhoneCall className="h-3.5 w-3.5" /> Total Calls</CardDescription>
              <CardTitle className="text-2xl">{totals.totalCalls.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{totals.answered.toLocaleString()} answered</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-green-500" /> Avg Answer Rate</CardDescription>
              <CardTitle className="text-2xl text-green-600">{totals.answerRate}%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AnswerRateBar rate={totals.answerRate} size="sm" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Total Talk Time</CardDescription>
              <CardTitle className="text-2xl">{formatMinutes(totals.totalDuration)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{totals.answered > 0 ? formatDuration(Math.round(totals.totalDuration / totals.answered)) : "0s"} avg/call</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><PhoneOff className="h-3.5 w-3.5 text-red-500" /> Failed Calls</CardDescription>
              <CardTitle className="text-2xl text-red-600">{totals.failed.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{totals.congestion} congestion errors</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Flagged DIDs</CardDescription>
              <CardTitle className="text-2xl text-yellow-600">{totals.flaggedDids}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{totals.flaggedDids > 0 ? "In cooldown or disabled" : "All DIDs healthy"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Best / Worst Performers */}
        {(bestDid || worstDid) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestDid && (
              <Card className="border-green-200 bg-green-50/30">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-green-600" /> Best Performing DID</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-lg font-semibold">{bestDid.phoneNumber}</p>
                      <p className="text-sm text-muted-foreground">{bestDid.label || "No label"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">{bestDid.answerRate}%</p>
                      <p className="text-xs text-muted-foreground">{bestDid.totalCalls.toLocaleString()} calls</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {worstDid && worstDid.phoneNumber !== bestDid?.phoneNumber && (
              <Card className="border-red-200 bg-red-50/30">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-red-600" /> Lowest Performing DID</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-lg font-semibold">{worstDid.phoneNumber}</p>
                      <p className="text-sm text-muted-foreground">{worstDid.label || "No label"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-600">{worstDid.answerRate}%</p>
                      <p className="text-xs text-muted-foreground">{worstDid.totalCalls.toLocaleString()} calls</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Call Volume Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Call Volume Over Time</CardTitle>
                <CardDescription>Daily call volume across all DIDs</CardDescription>
              </div>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {volumeByDate.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No call data for this period</p>
            ) : (
              <div className="space-y-2">
                {/* Simple bar chart */}
                <div className="flex items-end gap-1 h-40">
                  {volumeByDate.map((v, i) => {
                    const maxTotal = Math.max(...volumeByDate.map(d => d.total), 1);
                    const height = (v.total / maxTotal) * 100;
                    const answeredHeight = v.total > 0 ? (v.answered / v.total) * height : 0;
                    const failedHeight = v.total > 0 ? (v.failed / v.total) * height : 0;
                    const otherHeight = height - answeredHeight - failedHeight;
                    return (
                      <TooltipProvider key={i}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-1 flex flex-col justify-end cursor-pointer" style={{ minWidth: 8 }}>
                              <div className="bg-green-500 rounded-t" style={{ height: `${answeredHeight}%`, minHeight: answeredHeight > 0 ? 2 : 0 }} />
                              <div className="bg-gray-300" style={{ height: `${otherHeight}%`, minHeight: otherHeight > 0 ? 1 : 0 }} />
                              <div className="bg-red-400 rounded-b" style={{ height: `${failedHeight}%`, minHeight: failedHeight > 0 ? 2 : 0 }} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{new Date(v.date + "T00:00:00").toLocaleDateString()}</p>
                            <p className="text-xs">Total: {v.total} | Answered: {v.answered} | Failed: {v.failed}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{volumeByDate[0]?.date ? new Date(volumeByDate[0].date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
                  <span>{volumeByDate[volumeByDate.length - 1]?.date ? new Date(volumeByDate[volumeByDate.length - 1].date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center pt-1">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Answered</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300 inline-block" /> Other</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Failed</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-DID Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Per-DID Performance</CardTitle>
            <CardDescription>Click a row to see campaign breakdown for that DID</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left">Health</th>
                    <th className="p-3 text-left cursor-pointer hover:text-foreground" onClick={() => toggleSort("phoneNumber")}>
                      <span className="flex items-center gap-1">Phone Number <SortIcon field="phoneNumber" /></span>
                    </th>
                    <th className="p-3 text-left">Label</th>
                    <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("totalCalls")}>
                      <span className="flex items-center gap-1 justify-end">Total Calls <SortIcon field="totalCalls" /></span>
                    </th>
                    <th className="p-3 text-right">Answered</th>
                    <th className="p-3 text-right">Failed</th>
                    <th className="p-3 text-right">No Answer</th>
                    <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("answerRate")}>
                      <span className="flex items-center gap-1 justify-end">Answer Rate <SortIcon field="answerRate" /></span>
                    </th>
                    <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("avgDuration")}>
                      <span className="flex items-center gap-1 justify-end">Avg Duration <SortIcon field="avgDuration" /></span>
                    </th>
                    <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("failureRate")}>
                      <span className="flex items-center gap-1 justify-end">Live Fail % <SortIcon field="failureRate" /></span>
                    </th>
                    <th className="p-3 text-right">Talk Time</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : sorted.length === 0 ? (
                    <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">
                      <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No DIDs found. Add caller IDs to start tracking performance.
                    </td></tr>
                  ) : sorted.map(did => (
                    <tr
                      key={did.id}
                      className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${selectedDid === did.phoneNumber ? "bg-primary/5 border-primary/20" : ""} ${did.autoDisabled ? "bg-red-50/30" : ""}`}
                      onClick={() => setSelectedDid(selectedDid === did.phoneNumber ? null : did.phoneNumber)}
                    >
                      <td className="p-3">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <HealthIcon status={did.healthStatus} autoDisabled={did.autoDisabled} />
                            </TooltipTrigger>
                            <TooltipContent>
                              {did.autoDisabled ? "Flagged/Disabled" : did.healthStatus}
                              {did.flagReason ? ` — ${did.flagReason}` : ""}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="p-3 font-mono font-medium">{did.phoneNumber}</td>
                      <td className="p-3 text-muted-foreground">{did.label || "—"}</td>
                      <td className="p-3 text-right font-medium">{did.totalCalls.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-600">{did.answered.toLocaleString()}</td>
                      <td className="p-3 text-right text-red-600">{did.failed.toLocaleString()}</td>
                      <td className="p-3 text-right text-muted-foreground">{did.noAnswer.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <AnswerRateBar rate={did.answerRate} size="sm" />
                          <span className={`font-medium min-w-[3ch] ${did.answerRate >= 5 ? "text-green-600" : did.answerRate >= 2 ? "text-yellow-600" : "text-red-600"}`}>
                            {did.answerRate}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">{formatDuration(did.avgDuration)}</td>
                      <td className="p-3 text-right">
                        {did.recentCallCount >= 10 ? (
                          <Badge variant={did.failureRate >= 70 ? "destructive" : did.failureRate >= 50 ? "secondary" : "outline"} className="text-xs">
                            {did.failureRate}%
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">{formatMinutes(did.totalDuration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Campaign Breakdown for Selected DID */}
        {selectedDid && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Campaign Breakdown — <span className="font-mono">{selectedDid}</span>
              </CardTitle>
              <CardDescription>Performance of this DID across different campaigns</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left">Campaign</th>
                      <th className="p-3 text-right">Total Calls</th>
                      <th className="p-3 text-right">Answered</th>
                      <th className="p-3 text-right">Failed</th>
                      <th className="p-3 text-right">No Answer</th>
                      <th className="p-3 text-right">Answer Rate</th>
                      <th className="p-3 text-right">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignBreakdown.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No campaign data for this DID</td></tr>
                    ) : campaignBreakdown.map((cb, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{cb.campaignName}</td>
                        <td className="p-3 text-right">{cb.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-green-600">{cb.answered.toLocaleString()}</td>
                        <td className="p-3 text-right text-red-600">{cb.failed.toLocaleString()}</td>
                        <td className="p-3 text-right text-muted-foreground">{cb.noAnswer.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <span className={`font-medium ${cb.answerRate >= 5 ? "text-green-600" : cb.answerRate >= 2 ? "text-yellow-600" : "text-red-600"}`}>
                            {cb.answerRate}%
                          </span>
                        </td>
                        <td className="p-3 text-right text-muted-foreground">{formatDuration(cb.avgDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flag History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> DID Flag History</CardTitle>
            <CardDescription>Recent flagging, reactivation, and health check events</CardDescription>
          </CardHeader>
          <CardContent>
            {flagHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No flagging events recorded yet</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {flagHistory.map(event => {
                  const details = event.details as Record<string, any> | null;
                  const isFlag = event.action === "did.flagged";
                  const isReactivate = event.action === "did.reactivated";
                  return (
                    <div key={event.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isFlag ? "border-red-200 bg-red-50/30" : isReactivate ? "border-green-200 bg-green-50/30" : "border-border"}`}>
                      <div className="mt-0.5">
                        {isFlag ? <ShieldX className="h-4 w-4 text-red-500" /> :
                         isReactivate ? <ShieldCheck className="h-4 w-4 text-green-500" /> :
                         <Activity className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {isFlag ? "DID Flagged" : isReactivate ? "DID Reactivated" : event.action}
                          </span>
                          {details?.phoneNumber && <span className="font-mono text-xs text-muted-foreground">{details.phoneNumber}</span>}
                        </div>
                        {details?.reason && <p className="text-xs text-muted-foreground mt-0.5">{details.reason}</p>}
                        {details?.failureRate !== undefined && (
                          <p className="text-xs text-muted-foreground mt-0.5">Failure rate: {details.failureRate}%</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
