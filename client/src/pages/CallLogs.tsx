import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Phone, PhoneOff, PhoneMissed, Clock, CheckCircle2, XCircle, Timer, DollarSign } from "lucide-react";
import VtigerCrmButton from "@/components/VtigerCrmButton";

const STATUS_ICON: Record<string, React.ReactNode> = {
  answered: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  busy: <Phone className="h-3.5 w-3.5 text-yellow-500" />,
  "no-answer": <PhoneMissed className="h-3.5 w-3.5 text-orange-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  calling: <Phone className="h-3.5 w-3.5 text-primary animate-pulse" />,
  dialing: <Phone className="h-3.5 w-3.5 text-primary animate-pulse" />,
  ringing: <Phone className="h-3.5 w-3.5 text-primary animate-pulse" />,
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  answered: "default",
  completed: "default",
  busy: "secondary",
  "no-answer": "outline",
  failed: "destructive",
  pending: "outline",
  calling: "default",
  dialing: "default",
  ringing: "default",
};

function formatDuration(secs: number | null | undefined): string {
  if (!secs || secs <= 0) return "—";
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

export default function CallLogs() {
  const params = new URLSearchParams(window.location.search);
  const initialCampaignId = params.get("campaign") ? parseInt(params.get("campaign")!) : 0;
  const [selectedCampaignId, setSelectedCampaignId] = useState<number>(initialCampaignId);

  const campaigns = trpc.campaigns.list.useQuery();
  const callLogs = trpc.callLogs.list.useQuery(
    { campaignId: selectedCampaignId },
    { enabled: !!selectedCampaignId, refetchInterval: 10000 }
  );
  const costSettings = trpc.costEstimator.getSettings.useQuery();

  const stats = useMemo(() => {
    if (!callLogs.data) return { answered: 0, busy: 0, noAnswer: 0, failed: 0, pending: 0, calling: 0, totalDuration: 0, avgDuration: 0, estimatedCost: 0 };
    const answered = callLogs.data.filter(l => l.status === "answered" || l.status === "completed").length;
    const busy = callLogs.data.filter(l => l.status === "busy").length;
    const noAnswer = callLogs.data.filter(l => l.status === "no-answer").length;
    const failed = callLogs.data.filter(l => l.status === "failed").length;
    const pending = callLogs.data.filter(l => l.status === "pending").length;
    const calling = callLogs.data.filter(l => l.status === "dialing" || l.status === "ringing").length;

    // Duration stats
    const durations = callLogs.data.filter(l => l.duration && l.duration > 0).map(l => l.duration!);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const avgDuration = durations.length > 0 ? Math.round(totalDuration / durations.length) : 0;

    // Cost estimate (trunk cost per minute)
    const costPerMin = parseFloat(costSettings.data?.trunkCostPerMinute || "0.01");
    const estimatedCost = (totalDuration / 60) * costPerMin;

    return { answered, busy, noAnswer, failed, pending, calling, totalDuration, avgDuration, estimatedCost };
  }, [callLogs.data, costSettings.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Call Logs</h1>
            <p className="text-muted-foreground mt-1 text-sm">View detailed call results for each campaign</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-full sm:w-72">
            <Select value={selectedCampaignId ? String(selectedCampaignId) : ""} onValueChange={v => setSelectedCampaignId(parseInt(v))}>
              <SelectTrigger><SelectValue placeholder="Select a campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.data?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedCampaignId > 0 && callLogs.data && (
          <>
            {/* Status summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-green-600">{stats.answered}</div>
                  <div className="text-xs text-green-600/70">Answered</div>
                </CardContent>
              </Card>
              <Card className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-yellow-600">{stats.busy}</div>
                  <div className="text-xs text-yellow-600/70">Busy</div>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-orange-600">{stats.noAnswer}</div>
                  <div className="text-xs text-orange-600/70">No Answer</div>
                </CardContent>
              </Card>
              <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-red-600">{stats.failed}</div>
                  <div className="text-xs text-red-600/70">Failed</div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">{stats.calling}</div>
                  <div className="text-xs text-blue-600/70">Active</div>
                </CardContent>
              </Card>
              <Card className="bg-gray-50 dark:bg-gray-950/20">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-muted-foreground">{stats.pending}</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
                <CardContent className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Timer className="h-3.5 w-3.5 text-purple-600" />
                    <div className="text-xl font-bold text-purple-600">{formatMinutes(stats.totalDuration)}</div>
                  </div>
                  <div className="text-xs text-purple-600/70">Talk Time (avg {stats.avgDuration}s)</div>
                </CardContent>
              </Card>
              <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
                <CardContent className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                    <div className="text-xl font-bold text-emerald-600">{stats.estimatedCost.toFixed(2)}</div>
                  </div>
                  <div className="text-xs text-emerald-600/70">Est. Trunk Cost</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Caller ID</TableHead>
                      <TableHead>Attempt</TableHead>
                      <TableHead>Called At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callLogs.data.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No call logs yet</TableCell></TableRow>
                    ) : callLogs.data.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-1">
                            {log.phoneNumber}
                            <VtigerCrmButton phoneNumber={log.phoneNumber} compact />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{log.contactName || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[log.status] || "outline"} className="flex items-center gap-1 w-fit">
                            {STATUS_ICON[log.status]}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.duration && log.duration > 0 ? (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                              <Timer className="h-3 w-3" />
                              {formatDuration(log.duration)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-xs">{log.callerIdUsed || "—"}</TableCell>
                        <TableCell className="text-sm">{log.attempt}</TableCell>
                        <TableCell className="text-sm">{log.startedAt ? new Date(log.startedAt).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {!selectedCampaignId && (
          <Card><CardContent className="p-12 text-center text-muted-foreground">
            <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Select a campaign to view call logs</p>
          </CardContent></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
