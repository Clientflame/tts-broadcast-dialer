import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Activity,
  Clock,
  PhoneOff,
  Zap,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Timer,
} from "lucide-react";

type TimeRange = 6 | 12 | 24 | 48 | 168;

export default function QueueMonitor() {
  const [timeRange, setTimeRange] = useState<TimeRange>(24);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Live metrics - auto-refresh every 5s
  const { data: stats, isLoading: statsLoading } = trpc.queueMonitor.stats.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: throughput, isLoading: throughputLoading } = trpc.queueMonitor.throughput.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // Depth history chart
  const { data: depthHistory } = trpc.queueMonitor.depthHistory.useQuery(
    { hours: timeRange },
    { refetchInterval: 30000 }
  );

  // Dead letter queue
  const { data: deadLetter, refetch: refetchDeadLetter } = trpc.queueMonitor.deadLetter.useQuery(
    { limit: 100 },
    { refetchInterval: 15000 }
  );

  const requeueMutation = trpc.queueMonitor.requeueDeadLetter.useMutation({
    onSuccess: (data) => {
      toast.success(`Requeued ${data.requeued} call(s) back to pending`);
      setSelectedIds(new Set());
      refetchDeadLetter();
    },
    onError: (err) => {
      toast.error(`Failed to requeue: ${err.message}`);
    },
  });

  const handleRequeue = (ids: number[]) => {
    requeueMutation.mutate({ ids });
  };

  const handleSelectAll = () => {
    if (!deadLetter) return;
    if (selectedIds.size === deadLetter.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deadLetter.map((item: any) => item.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Color coding for queue depth
  const getDepthColor = (pending: number) => {
    if (pending > 200) return "text-red-400";
    if (pending > 50) return "text-yellow-400";
    return "text-green-400";
  };

  // SLA indicator for wait time
  const getWaitColor = (ms: number) => {
    if (ms > 30000) return "text-red-400";
    if (ms > 10000) return "text-yellow-400";
    return "text-green-400";
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Queue Monitor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time call queue health and dead letter management
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 text-xs">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Live — refreshing every 5s
        </Badge>
      </div>

      {/* Section 1: Live Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Queue Depth */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Queue Depth</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${getDepthColor((stats?.pending || 0) + (stats?.claimed || 0))}`}>
                  {(stats?.pending || 0) + (stats?.claimed || 0)}
                </div>
                <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{stats?.pending || 0} pending</span>
                  <span>·</span>
                  <span>{stats?.claimed || 0} claimed</span>
                  <span>·</span>
                  <span>{stats?.dialing || 0} dialing</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Throughput */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Throughput</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {throughputLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {throughput?.callsPerMinute || 0}
                  <span className="text-sm font-normal text-muted-foreground ml-1">calls/min</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats?.completed || 0} completed · {stats?.failed || 0} failed
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Avg Wait Time */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Wait Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {throughputLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${getWaitColor(throughput?.avgWaitTimeMs || 0)}`}>
                  {formatDuration(throughput?.avgWaitTimeMs || 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {(throughput?.avgWaitTimeMs || 0) <= 10000 ? "Within SLA" : (throughput?.avgWaitTimeMs || 0) <= 30000 ? "Approaching SLA limit" : "SLA breached"}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Avg Call Duration */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Call Duration</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {throughputLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {throughput?.avgCallDurationSec || 0}
                  <span className="text-sm font-normal text-muted-foreground ml-1">sec</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  For answered calls (last 5 min)
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Queue Depth History Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Queue Depth History</CardTitle>
            <div className="flex gap-1">
              {([6, 12, 24, 48, 168] as TimeRange[]).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTimeRange(range)}
                >
                  {range === 168 ? "7d" : `${range}h`}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {depthHistory && depthHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={depthHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(val: string) => {
                    const parts = val.split(" ");
                    return parts[1] || val;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area type="monotone" dataKey="completed" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} name="Completed" />
                <Area type="monotone" dataKey="pending" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} name="Pending" />
                <Area type="monotone" dataKey="claimed" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.4} name="Claimed" />
                <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
              <Activity className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No queue activity in the selected time range</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Dead Letter Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Dead Letter Queue</CardTitle>
              {deadLetter && deadLetter.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {deadLetter.length}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  onClick={() => handleRequeue(Array.from(selectedIds))}
                  disabled={requeueMutation.isPending}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Requeue Selected ({selectedIds.size})
                </Button>
              )}
              {deadLetter && deadLetter.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRequeue(deadLetter.map((item: any) => item.id))}
                  disabled={requeueMutation.isPending}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Requeue All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {deadLetter && deadLetter.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left w-10">
                      <Checkbox
                        checked={selectedIds.size === deadLetter.length && deadLetter.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="p-3 text-left font-medium">Phone Number</th>
                    <th className="p-3 text-left font-medium">Failure Reason</th>
                    <th className="p-3 text-left font-medium">Result</th>
                    <th className="p-3 text-left font-medium">Last Attempt</th>
                    <th className="p-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetter.map((item: any) => (
                    <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </td>
                      <td className="p-3 font-mono text-xs">{item.phoneNumber}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {item.resultDetails?.attempts ? `${item.resultDetails.attempts} attempts` : "Max retries"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={item.result === "congestion" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {item.result || "unknown"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => handleRequeue([item.id])}
                          disabled={requeueMutation.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Requeue
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <PhoneOff className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No dead letter items — all calls processed successfully</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
