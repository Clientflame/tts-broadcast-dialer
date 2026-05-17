import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield, ShieldAlert, ShieldX, ShieldCheck,
  ArrowLeft, RefreshCw, Search, Ban, Unlock,
  AlertTriangle, CheckCircle2, XCircle, Clock,
  Globe, Activity, Eye, ChevronLeft, ChevronRight,
  Loader2, Plus, Filter, Users, Lock,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Event Type Config ──────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  login_success: { label: "Login Success", color: "bg-green-500/10 text-green-500 border-green-500/30", icon: CheckCircle2 },
  login_failed: { label: "Login Failed", color: "bg-red-500/10 text-red-500 border-red-500/30", icon: XCircle },
  login_blocked: { label: "Login Blocked", color: "bg-red-500/10 text-red-600 border-red-600/30", icon: Ban },
  ip_banned: { label: "IP Banned", color: "bg-orange-500/10 text-orange-500 border-orange-500/30", icon: ShieldAlert },
  ip_unbanned: { label: "IP Unbanned", color: "bg-blue-500/10 text-blue-500 border-blue-500/30", icon: Unlock },
  rate_limited: { label: "Rate Limited", color: "bg-amber-500/10 text-amber-500 border-amber-500/30", icon: AlertTriangle },
  suspicious_request: { label: "Suspicious", color: "bg-purple-500/10 text-purple-500 border-purple-500/30", icon: Eye },
  password_reset: { label: "Password Reset", color: "bg-blue-500/10 text-blue-400 border-blue-400/30", icon: Lock },
  session_expired: { label: "Session Expired", color: "bg-gray-500/10 text-gray-500 border-gray-500/30", icon: Clock },
};

// ─── Stats Cards ────────────────────────────────────────────────────────────

function StatsCards({ days }: { days: number }) {
  const stats = trpc.security.stats.useQuery({ days });

  if (stats.isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="py-6"><div className="h-16 bg-muted/30 animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const data = stats.data;
  if (!data) return null;

  const cards = [
    { title: "Total Events", value: data.totalEvents, icon: Activity, color: "text-blue-500" },
    { title: "Failed Logins", value: data.failedLogins, icon: XCircle, color: "text-red-500" },
    { title: "IPs Banned", value: data.blockedIps, icon: Ban, color: "text-orange-500" },
    { title: "Successful Logins", value: data.successfulLogins, icon: CheckCircle2, color: "text-green-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(card => (
        <Card key={card.title}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold mt-1">{card.value.toLocaleString()}</p>
              </div>
              <card.icon className={`h-8 w-8 ${card.color} opacity-60`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Top Offenders ──────────────────────────────────────────────────────────

function TopOffenders({ days }: { days: number }) {
  const stats = trpc.security.stats.useQuery({ days });
  const offenders = stats.data?.topOffenders || [];

  if (offenders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Top Offending IPs
          </CardTitle>
          <CardDescription>No offending IPs detected in the last {days} days</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxCount = Math.max(...offenders.map((o: any) => o.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Top Offending IPs
        </CardTitle>
        <CardDescription>Most frequent failed login / blocked IPs in the last {days} days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {offenders.map((offender: any, i: number) => (
            <div key={offender.ipAddress} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
              <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded min-w-[130px]">{offender.ipAddress}</code>
              <div className="flex-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${(offender.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-medium min-w-[60px] text-right">{offender.count} hits</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Event Log Table ────────────────────────────────────────────────────────

function EventLogTable() {
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ipSearch, setIpSearch] = useState("");
  const pageSize = 25;

  const events = trpc.security.events.useQuery({
    limit: pageSize,
    offset: page * pageSize,
    eventType: typeFilter !== "all" ? typeFilter : undefined,
    ipAddress: ipSearch || undefined,
  }, { refetchInterval: 10000 });

  const data = events.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Security Event Log
            </CardTitle>
            <CardDescription>
              {data ? `${data.total.toLocaleString()} total events` : "Loading..."}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => events.refetch()} disabled={events.isFetching}>
            <RefreshCw className={`h-4 w-4 ${events.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {/* Filters */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by IP..."
              value={ipSearch}
              onChange={(e) => { setIpSearch(e.target.value); setPage(0); }}
              className="pl-8 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="login_success">Login Success</SelectItem>
              <SelectItem value="login_failed">Login Failed</SelectItem>
              <SelectItem value="login_blocked">Login Blocked</SelectItem>
              <SelectItem value="ip_banned">IP Banned</SelectItem>
              <SelectItem value="ip_unbanned">IP Unbanned</SelectItem>
              <SelectItem value="rate_limited">Rate Limited</SelectItem>
              <SelectItem value="suspicious_request">Suspicious</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {events.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No security events found</p>
            <p className="text-xs mt-1">Events will appear here as they are logged</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Time</TableHead>
                    <TableHead className="w-[140px]">Event</TableHead>
                    <TableHead className="w-[140px]">IP Address</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((event: any) => {
                    const config = EVENT_TYPE_CONFIG[event.eventType] || {
                      label: event.eventType,
                      color: "bg-gray-500/10 text-gray-500 border-gray-500/30",
                      icon: Activity,
                    };
                    const EventIcon = config.icon;
                    return (
                      <TableRow key={event.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(event.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${config.color} text-xs`}>
                            <EventIcon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {event.ipAddress}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                          {event.email && <span className="mr-2">User: {event.email}</span>}
                          {event.details && typeof event.details === "object"
                            ? Object.entries(event.details).map(([k, v]) => `${k}: ${v}`).join(", ")
                            : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.total)} of {data.total}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= data.total} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── IP Blocklist Management ────────────────────────────────────────────────

function BlocklistManager() {
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banIp, setBanIp] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<string>("24");
  const [page, setPage] = useState(0);
  const [activeOnly, setActiveOnly] = useState(true);
  const pageSize = 25;

  const blocklist = trpc.security.blocklist.useQuery({
    limit: pageSize,
    offset: page * pageSize,
    activeOnly,
  }, { refetchInterval: 15000 });

  const utils = trpc.useUtils();

  const banMutation = trpc.security.banIp.useMutation({
    onSuccess: () => {
      toast.success("IP banned successfully");
      setShowBanDialog(false);
      setBanIp("");
      setBanReason("");
      setBanDuration("24");
      utils.security.blocklist.invalidate();
      utils.security.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const unbanMutation = trpc.security.unbanIp.useMutation({
    onSuccess: () => {
      toast.success("IP unbanned successfully");
      utils.security.blocklist.invalidate();
      utils.security.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = blocklist.data;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Ban className="h-4 w-4" />
                IP Blocklist
              </CardTitle>
              <CardDescription>
                {data ? `${data.total} ${activeOnly ? "active" : "total"} blocked IPs` : "Loading..."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveOnly(!activeOnly)}
              >
                {activeOnly ? "Show All" : "Active Only"}
              </Button>
              <Button size="sm" onClick={() => setShowBanDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Ban IP
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {blocklist.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">No blocked IPs</p>
              <p className="text-xs mt-1">IPs will appear here when they are banned</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Banned At</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.entries.map((entry: any) => {
                      const isExpired = entry.expiresAt && new Date(entry.expiresAt) < new Date();
                      const isUnbanned = !!entry.unbannedAt;
                      return (
                        <TableRow key={entry.id} className={isUnbanned || isExpired ? "opacity-50" : ""}>
                          <TableCell>
                            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              {entry.ipAddress}
                            </code>
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{entry.reason}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {entry.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{entry.failedAttempts}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(entry.bannedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.expiresAt
                              ? new Date(entry.expiresAt).toLocaleString()
                              : <span className="text-red-400">Permanent</span>}
                          </TableCell>
                          <TableCell>
                            {!isUnbanned && !isExpired && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => unbanMutation.mutate({ ipAddress: entry.ipAddress })}
                                disabled={unbanMutation.isPending}
                              >
                                <Unlock className="h-3 w-3 mr-1" />
                                Unban
                              </Button>
                            )}
                            {(isUnbanned || isExpired) && (
                              <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                                Released
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.total)} of {data.total}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= data.total} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ban IP Dialog */}
      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban IP Address</DialogTitle>
            <DialogDescription>
              Manually add an IP address to the blocklist. This will prevent the IP from accessing the application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">IP Address</label>
              <Input
                placeholder="e.g., 192.168.1.100"
                value={banIp}
                onChange={(e) => setBanIp(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Reason</label>
              <Input
                placeholder="e.g., Repeated brute-force attempts"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Duration</label>
              <Select value={banDuration} onValueChange={setBanDuration}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBanDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => banMutation.mutate({
                ipAddress: banIp,
                reason: banReason || "Manual ban",
                duration: banDuration === "permanent" ? undefined : parseInt(banDuration),
              })}
              disabled={!banIp || banMutation.isPending}
            >
              {banMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Ban className="h-4 w-4 mr-1" />}
              Ban IP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Security Logs Page ────────────────────────────────────────────────

export default function SecurityLogs() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const [statsDays, setStatsDays] = useState(30);

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="container py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">Only administrators can view security logs.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container py-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/security")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-6 w-6" />
                Security Logs
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Login attempts, IP bans, fail2ban reports, and threat monitoring
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={String(statsDays)} onValueChange={(v) => setStatsDays(parseInt(v))}>
              <SelectTrigger className="w-[130px] h-9">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
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
        </div>

        {/* Stats Overview */}
        <StatsCards days={statsDays} />

        {/* Top Offenders */}
        <TopOffenders days={statsDays} />

        {/* IP Blocklist */}
        <BlocklistManager />

        {/* Event Log */}
        <EventLogTable />
      </div>
    </DashboardLayout>
  );
}
