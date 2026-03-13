import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Shield, Search, ChevronLeft, ChevronRight, Filter,
  Clock, User, Activity, Settings, Phone, FileText,
  Users, Megaphone, AlertTriangle, RefreshCw, X,
} from "lucide-react";

const PAGE_SIZE = 50;

// Color-coded action categories
const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  add: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  edit: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  remove: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  login: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  logout: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  flag: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  disable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  enable: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  start: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  stop: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  complete: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  import: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  export: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

const RESOURCE_ICONS: Record<string, typeof Shield> = {
  campaign: Megaphone,
  contact: Users,
  callerId: Phone,
  did: Phone,
  audio: FileText,
  user: User,
  settings: Settings,
  dnc: AlertTriangle,
  script: FileText,
  system: Activity,
};

function getActionColor(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
}

function getResourceIcon(resource: string) {
  const lower = resource.toLowerCase();
  for (const [key, Icon] of Object.entries(RESOURCE_ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return Activity;
}

function formatTimestamp(ts: string | Date) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " EST";
}

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(details)) {
    if (val === null || val === undefined) continue;
    const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
    parts.push(`${label}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`);
  }
  return parts.join(" | ");
}

function timeAgo(ts: string | Date): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return `${Math.floor(diff / 604800000)}w ago`;
}

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionFilter, setActionFilter] = useState<string | undefined>();

  const actionsQuery = trpc.auditLogs.actions.useQuery();
  const logsQuery = trpc.auditLogs.filtered.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: search || undefined,
    action: actionFilter,
  }, { refetchInterval: 15000 });

  const totalPages = Math.ceil((logsQuery.data?.total || 0) / PAGE_SIZE);
  const logs = logsQuery.data?.logs || [];

  // Group actions by category for filter dropdown
  const actionGroups = useMemo(() => {
    if (!actionsQuery.data) return [];
    return actionsQuery.data.sort();
  }, [actionsQuery.data]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setActionFilter(undefined);
    setPage(0);
  };

  const hasFilters = search || actionFilter;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Audit Log
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              System activity timeline — {logsQuery.data?.total || 0} total events
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logsQuery.refetch()}
            disabled={logsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${logsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by user, action, or details..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleSearch} size="default">
                  Search
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={actionFilter || ""}
                  onChange={(e) => { setActionFilter(e.target.value || undefined); setPage(0); }}
                >
                  <option value="">All Actions</option>
                  {actionGroups.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity Timeline
            </CardTitle>
            <CardDescription>
              Showing {logs.length} of {logsQuery.data?.total || 0} events
              {hasFilters && " (filtered)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[120px]">User</TableHead>
                  <TableHead className="w-[180px]">Action</TableHead>
                  <TableHead className="w-[120px]">Resource</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !logs.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium">No audit events found</p>
                      <p className="text-xs mt-1">{hasFilters ? "Try adjusting your filters" : "Activity will appear here as users interact with the system"}</p>
                    </TableCell>
                  </TableRow>
                ) : logs.map(log => {
                  const ResourceIcon = getResourceIcon(log.resource);
                  return (
                    <TableRow key={log.id} className="group hover:bg-muted/30">
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs">{formatTimestamp(log.createdAt)}</span>
                          <span className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate max-w-[100px]">{log.userName || "System"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`font-mono text-xs ${getActionColor(log.action)}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <ResourceIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{log.resource}</span>
                          {log.resourceId && (
                            <span className="text-xs text-muted-foreground">#{log.resourceId}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="block max-w-[350px] truncate group-hover:whitespace-normal group-hover:break-words" title={formatDetails(log.details)}>
                          {formatDetails(log.details) || "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
