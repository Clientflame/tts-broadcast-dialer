import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Phone, PhoneOff, PhoneMissed, Clock, CheckCircle2, XCircle } from "lucide-react";

const STATUS_ICON: Record<string, React.ReactNode> = {
  answered: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  busy: <Phone className="h-3.5 w-3.5 text-yellow-500" />,
  "no-answer": <PhoneMissed className="h-3.5 w-3.5 text-orange-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  calling: <Phone className="h-3.5 w-3.5 text-primary animate-pulse" />,
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  answered: "default",
  busy: "secondary",
  "no-answer": "outline",
  failed: "destructive",
  pending: "outline",
  calling: "default",
};

export default function CallLogs() {
  const params = new URLSearchParams(window.location.search);
  const initialCampaignId = params.get("campaign") ? parseInt(params.get("campaign")!) : 0;
  const [selectedCampaignId, setSelectedCampaignId] = useState<number>(initialCampaignId);

  const campaigns = trpc.campaigns.list.useQuery();
  const callLogs = trpc.callLogs.list.useQuery(
    { campaignId: selectedCampaignId },
    { enabled: !!selectedCampaignId, refetchInterval: 10000 }
  );

  const statusCounts = useMemo(() => {
    if (!callLogs.data) return { answered: 0, busy: 0, noAnswer: 0, failed: 0, pending: 0, calling: 0 };
    return {
      answered: callLogs.data.filter(l => l.status === "answered").length,
      busy: callLogs.data.filter(l => l.status === "busy").length,
      noAnswer: callLogs.data.filter(l => l.status === "no-answer").length,
      failed: callLogs.data.filter(l => l.status === "failed").length,
      pending: callLogs.data.filter(l => l.status === "pending").length,
      calling: callLogs.data.filter(l => l.status === "dialing" || l.status === "ringing").length,
    };
  }, [callLogs.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Call Logs</h1>
            <p className="text-muted-foreground mt-1">View detailed call results for each campaign</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-72">
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-green-600">{statusCounts.answered}</div>
                  <div className="text-xs text-green-600/70">Answered</div>
                </CardContent>
              </Card>
              <Card className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-yellow-600">{statusCounts.busy}</div>
                  <div className="text-xs text-yellow-600/70">Busy</div>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-orange-600">{statusCounts.noAnswer}</div>
                  <div className="text-xs text-orange-600/70">No Answer</div>
                </CardContent>
              </Card>
              <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-red-600">{statusCounts.failed}</div>
                  <div className="text-xs text-red-600/70">Failed</div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">{statusCounts.calling}</div>
                  <div className="text-xs text-blue-600/70">Active</div>
                </CardContent>
              </Card>
              <Card className="bg-gray-50 dark:bg-gray-950/20">
                <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-muted-foreground">{statusCounts.pending}</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Attempt</TableHead>
                      <TableHead>Called At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callLogs.data.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No call logs yet</TableCell></TableRow>
                    ) : callLogs.data.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">{log.phoneNumber}</TableCell>
                        <TableCell className="text-sm">{log.contactName || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[log.status] || "outline"} className="flex items-center gap-1 w-fit">
                            {STATUS_ICON[log.status]}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.duration ? `${log.duration}s` : "—"}</TableCell>
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
