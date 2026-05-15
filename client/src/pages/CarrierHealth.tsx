import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  Activity,
  PhoneOff,
  Shield,
  TrendingDown,
  TrendingUp,
  Pause,
  Play,
  Download,
  RotateCcw,
  Zap,
  Timer,
  Radio,
} from "lucide-react";

export default function CarrierHealth() {
  const [errorLogFilter, setErrorLogFilter] = useState<{ status?: string; campaignId?: number }>({});
  const [selectedQuarantine, setSelectedQuarantine] = useState<Set<number>>(new Set());

  // Real-time failure rate (5s refresh)
  const { data: failureRate } = trpc.carrierHealth.failureRate.useQuery(
    { windowMinutes: 5 },
    { refetchInterval: 5000 }
  );

  // Failure trend chart
  const { data: failureTrend } = trpc.carrierHealth.failureTrend.useQuery(
    { hours: 24 },
    { refetchInterval: 30000 }
  );

  // Drop rate stats (5s refresh)
  const { data: dropRate } = trpc.carrierHealth.dropRate.useQuery(
    { windowMinutes: 60 },
    { refetchInterval: 5000 }
  );

  // Failure by campaign
  const { data: byCampaign } = trpc.carrierHealth.failureByCampaign.useQuery(
    { windowMinutes: 60 },
    { refetchInterval: 15000 }
  );

  // Error log
  const { data: errorLog, refetch: refetchErrorLog } = trpc.carrierHealth.errorLog.useQuery(
    { limit: 50, ...errorLogFilter },
    { refetchInterval: 10000 }
  );

  // Auto-rules
  const { data: rules, refetch: refetchRules } = trpc.carrierHealth.getRules.useQuery();

  // Quarantined numbers
  const { data: quarantined, refetch: refetchQuarantine } = trpc.carrierHealth.quarantined.useQuery({});

  const updateRulesMutation = trpc.carrierHealth.updateRules.useMutation({
    onSuccess: () => {
      toast.success("Auto-response rules updated");
      refetchRules();
    },
    onError: (err) => toast.error(err.message),
  });

  const evaluateMutation = trpc.carrierHealth.evaluate.useMutation({
    onSuccess: (data) => {
      toast.success(`Evaluation complete — ${data.currentFailureRate}% failure rate, ${data.quarantineCandidates.length} quarantined`);
      refetchQuarantine();
    },
    onError: (err) => toast.error(err.message),
  });

  const unquarantineMutation = trpc.carrierHealth.unquarantine.useMutation({
    onSuccess: (data) => {
      toast.success(`Released ${data.released} number(s) from quarantine`);
      setSelectedQuarantine(new Set());
      refetchQuarantine();
    },
    onError: (err) => toast.error(err.message),
  });

  const getFailureColor = (rate: number) => {
    if (rate >= 50) return "text-red-400";
    if (rate >= 25) return "text-yellow-400";
    return "text-green-400";
  };

  const getGaugeColor = (rate: number) => {
    if (rate >= 50) return "#ef4444";
    if (rate >= 25) return "#eab308";
    return "#22c55e";
  };

  const exportErrorLog = () => {
    if (!errorLog?.items) return;
    const csv = [
      "Timestamp,Phone,Status,Error,Campaign ID,Caller ID,Duration,Attempt",
      ...errorLog.items.map((item: any) =>
        `${item.createdAt},${item.phoneNumber},${item.status},${(item.errorMessage || "").replace(/,/g, ";")},${item.campaignId},${item.callerIdUsed || ""},${item.duration || ""},${item.attempt}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carrier-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Error log exported");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carrier Health & Drop Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time carrier failure monitoring, drop rate tracking, and automated response rules
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
            className="gap-1.5"
          >
            <Shield className="h-3.5 w-3.5" />
            Run Health Check
          </Button>
          <Badge variant="outline" className="gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Failure Dashboard</TabsTrigger>
          <TabsTrigger value="drops">Drop Rate</TabsTrigger>
          <TabsTrigger value="rules">Auto-Response Rules</TabsTrigger>
          <TabsTrigger value="errors">Error Log</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Carrier Failure Dashboard ─── */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Failure Rate (5 min)</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${getFailureColor(failureRate?.failureRate || 0)}`}>
                  {failureRate?.failureRate || 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {failureRate?.failedCalls || 0} failed of {failureRate?.totalCalls || 0} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls (5 min)</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{failureRate?.totalCalls || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  In the last 5 minutes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Quarantined</CardTitle>
                <PhoneOff className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-400">{quarantined?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Numbers blocked due to repeated failures
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
                <Radio className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">
                  {(failureRate?.failureRate || 0) >= 50 ? (
                    <Badge variant="destructive" className="gap-1"><Pause className="h-3 w-3" /> Critical</Badge>
                  ) : (failureRate?.failureRate || 0) >= 25 ? (
                    <Badge className="gap-1 bg-yellow-600"><TrendingDown className="h-3 w-3" /> Degraded</Badge>
                  ) : (
                    <Badge className="gap-1 bg-green-600"><Play className="h-3 w-3" /> Healthy</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {rules?.autoPauseEnabled ? "Auto-pause active" : "Auto-pause disabled"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Failure Breakdown by Type */}
          {failureRate?.byType && failureRate.byType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Failure Breakdown by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={failureRate.byType} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="result" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {failureRate.byType.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.result === "failed" ? "#ef4444" : entry.result === "busy" ? "#eab308" : "#f97316"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Failure Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Failure Rate Trend (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              {failureTrend && failureTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={failureTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(val: string) => val.split(" ")[1] || val}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Area type="monotone" dataKey="failureRate" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Failure Rate %" />
                    <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="Total Calls" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Activity className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">No call data in the last 24 hours</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Failure by Campaign */}
          {byCampaign && byCampaign.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Failure Rate by Campaign (Last Hour)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left font-medium">Campaign ID</th>
                        <th className="p-3 text-left font-medium">Total Calls</th>
                        <th className="p-3 text-left font-medium">Failed</th>
                        <th className="p-3 text-left font-medium">Failure Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCampaign.map((c: any) => (
                        <tr key={c.campaignId} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">#{c.campaignId}</td>
                          <td className="p-3">{c.total}</td>
                          <td className="p-3">{c.failed}</td>
                          <td className="p-3">
                            <span className={getFailureColor(c.failureRate)}>{c.failureRate}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab 2: Drop Rate Monitor ─── */}
        <TabsContent value="drops" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Drop Rate</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${getFailureColor(dropRate?.dropRate || 0)}`}>
                  {dropRate?.dropRate || 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Short calls (&lt;5s) as % of answered
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">False Connects</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-400">{dropRate?.falseConnects || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Connected &lt;3s (likely carrier issue)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Short Calls</CardTitle>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-400">{dropRate?.shortCalls || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Duration &lt;5s (possible audio issues)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ring Timeouts</CardTitle>
                <PhoneOff className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{dropRate?.ringTimeouts || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  No answer (ring timeout exceeded)
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What These Metrics Mean</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3 items-start">
                <Badge variant="destructive" className="text-xs shrink-0">False Connects</Badge>
                <span>Calls that show as "answered" but disconnect within 3 seconds. Usually indicates carrier-level issues like early media detection, SIP 183 misinterpretation, or trunk problems. High counts suggest your carrier is reporting false positives.</span>
              </div>
              <div className="flex gap-3 items-start">
                <Badge className="text-xs bg-yellow-600 shrink-0">Short Calls</Badge>
                <span>Calls lasting less than 5 seconds. Could indicate: audio not playing (codec mismatch), recipient immediately hanging up, or one-way audio issues. Check your TTS audio format compatibility.</span>
              </div>
              <div className="flex gap-3 items-start">
                <Badge variant="outline" className="text-xs shrink-0">Ring Timeouts</Badge>
                <span>Calls that rang but were never answered. Normal at 30-60% depending on your contact list quality. Abnormally high rates may indicate your DIDs are being flagged as spam.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Automated Response Rules ─── */}
        <TabsContent value="rules" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Auto-Pause Rule */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Pause className="h-4 w-4" />
                  Auto-Pause Campaigns
                </CardTitle>
                <CardDescription>
                  Automatically pause active campaigns when carrier failure rate exceeds threshold
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-pause">Enable Auto-Pause</Label>
                  <Switch
                    id="auto-pause"
                    checked={rules?.autoPauseEnabled || false}
                    onCheckedChange={(checked) => updateRulesMutation.mutate({ autoPauseEnabled: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Failure Rate Threshold (%)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={100}
                    value={rules?.autoPauseThreshold || 50}
                    onChange={(e) => updateRulesMutation.mutate({ autoPauseThreshold: parseInt(e.target.value) || 50 })}
                    className="w-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Evaluation Window (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={rules?.autoPauseWindowMinutes || 5}
                    onChange={(e) => updateRulesMutation.mutate({ autoPauseWindowMinutes: parseInt(e.target.value) || 5 })}
                    className="w-24"
                  />
                </div>
                <p className="text-xs text-muted-foreground border-l-2 border-yellow-500 pl-2">
                  When failure rate exceeds {rules?.autoPauseThreshold || 50}% over {rules?.autoPauseWindowMinutes || 5} minutes, all active campaigns will be paused and you'll be notified.
                </p>
              </CardContent>
            </Card>

            {/* Auto-Throttle Rule */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Auto-Throttle Concurrency
                </CardTitle>
                <CardDescription>
                  Automatically reduce concurrent calls when congestion is detected
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-throttle">Enable Auto-Throttle</Label>
                  <Switch
                    id="auto-throttle"
                    checked={rules?.autoThrottleEnabled || false}
                    onCheckedChange={(checked) => updateRulesMutation.mutate({ autoThrottleEnabled: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Congestion Threshold (%)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={100}
                    value={rules?.autoThrottleThreshold || 30}
                    onChange={(e) => updateRulesMutation.mutate({ autoThrottleThreshold: parseInt(e.target.value) || 30 })}
                    className="w-24"
                  />
                </div>
                <p className="text-xs text-muted-foreground border-l-2 border-blue-500 pl-2">
                  When failure rate hits {rules?.autoThrottleThreshold || 30}%, concurrency will be reduced by 50% to relieve trunk pressure. Restores automatically when rate drops below threshold.
                </p>
              </CardContent>
            </Card>

            {/* Number Quarantine */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Number Quarantine
                </CardTitle>
                <CardDescription>
                  Automatically quarantine numbers that consistently cause carrier errors
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="quarantine">Enable Auto-Quarantine</Label>
                  <Switch
                    id="quarantine"
                    checked={rules?.quarantineEnabled || false}
                    onCheckedChange={(checked) => updateRulesMutation.mutate({ quarantineEnabled: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Consecutive Failures Before Quarantine</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={rules?.quarantineThreshold || 3}
                    onChange={(e) => updateRulesMutation.mutate({ quarantineThreshold: parseInt(e.target.value) || 3 })}
                    className="w-24"
                  />
                </div>

                {/* Quarantined Numbers List */}
                {quarantined && quarantined.total > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Quarantined Numbers ({quarantined.total})</h4>
                      {selectedQuarantine.size > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unquarantineMutation.mutate({ ids: Array.from(selectedQuarantine) })}
                          disabled={unquarantineMutation.isPending}
                          className="gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Release Selected ({selectedQuarantine.size})
                        </Button>
                      )}
                    </div>
                    <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted">
                          <tr className="border-b">
                            <th className="p-2 text-left w-8">
                              <Checkbox
                                checked={selectedQuarantine.size === quarantined.items.length}
                                onCheckedChange={() => {
                                  if (selectedQuarantine.size === quarantined.items.length) {
                                    setSelectedQuarantine(new Set());
                                  } else {
                                    setSelectedQuarantine(new Set(quarantined.items.map((i: any) => i.id)));
                                  }
                                }}
                              />
                            </th>
                            <th className="p-2 text-left font-medium">Phone</th>
                            <th className="p-2 text-left font-medium">Reason</th>
                            <th className="p-2 text-left font-medium">Quarantined At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quarantined.items.map((item: any) => (
                            <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30">
                              <td className="p-2">
                                <Checkbox
                                  checked={selectedQuarantine.has(item.id)}
                                  onCheckedChange={() => {
                                    const next = new Set(selectedQuarantine);
                                    if (next.has(item.id)) next.delete(item.id);
                                    else next.add(item.id);
                                    setSelectedQuarantine(next);
                                  }}
                                />
                              </td>
                              <td className="p-2 font-mono text-xs">{item.phoneNumber}</td>
                              <td className="p-2 text-xs text-muted-foreground">{item.reason || "Repeated failures"}</td>
                              <td className="p-2 text-xs text-muted-foreground">
                                {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 4: Carrier Error Log ─── */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Carrier Error Log</CardTitle>
                  <CardDescription>
                    All failed calls with error details — {errorLog?.total || 0} total errors
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={errorLogFilter.status || "all"}
                    onValueChange={(v) => setErrorLogFilter(prev => ({ ...prev, status: v === "all" ? undefined : v }))}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="busy">Busy</SelectItem>
                      <SelectItem value="no-answer">No Answer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={exportErrorLog} className="gap-1.5 h-8">
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {errorLog && errorLog.items.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="border-b">
                          <th className="p-2 text-left font-medium">Time</th>
                          <th className="p-2 text-left font-medium">Phone</th>
                          <th className="p-2 text-left font-medium">Status</th>
                          <th className="p-2 text-left font-medium">Error</th>
                          <th className="p-2 text-left font-medium">Campaign</th>
                          <th className="p-2 text-left font-medium">DID Used</th>
                          <th className="p-2 text-left font-medium">Attempt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorLog.items.map((item: any) => (
                          <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                              {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                            </td>
                            <td className="p-2 font-mono text-xs">{item.phoneNumber}</td>
                            <td className="p-2">
                              <Badge
                                variant={item.status === "failed" ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {item.status}
                              </Badge>
                            </td>
                            <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate" title={item.errorMessage || ""}>
                              {item.errorMessage || "—"}
                            </td>
                            <td className="p-2 text-xs">#{item.campaignId}</td>
                            <td className="p-2 font-mono text-xs">{item.callerIdUsed || "—"}</td>
                            <td className="p-2 text-xs text-center">{item.attempt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Shield className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">No carrier errors recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
