import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Activity, Server, Database, Phone, Shield, Wifi, WifiOff,
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock,
  Cpu, HardDrive, Globe, Zap, Radio, Volume2, Brain,
  ArrowUpRight, ChevronRight, Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ServiceStatus = "healthy" | "degraded" | "offline" | "not_configured" | "unknown";

function StatusDot({ status }: { status: ServiceStatus }) {
  const colors: Record<ServiceStatus, string> = {
    healthy: "bg-green-500",
    degraded: "bg-amber-500",
    offline: "bg-red-500",
    not_configured: "bg-gray-400",
    unknown: "bg-gray-400",
  };
  return (
    <span className="relative flex h-3 w-3">
      {status === "healthy" && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${colors[status]}`} />
    </span>
  );
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const variants: Record<ServiceStatus, { label: string; className: string }> = {
    healthy: { label: "Healthy", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
    degraded: { label: "Degraded", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
    offline: { label: "Offline", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
    not_configured: { label: "Not Configured", className: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800" },
    unknown: { label: "Unknown", className: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800" },
  };
  const v = variants[status];
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function UptimeDisplay({ seconds }: { seconds: number }) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return <span>{days}d {hours}h {mins}m</span>;
  if (hours > 0) return <span>{hours}h {mins}m</span>;
  return <span>{mins}m</span>;
}

export default function SystemStatus() {
  const [, navigate] = useLocation();
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const healthQuery = trpc.dashboard.systemHealth.useQuery(undefined, { refetchInterval: 30000 });
  const serverQuery = trpc.dashboard.serverInfo.useQuery(undefined, { refetchInterval: 60000 });
  const amiQuery = trpc.dashboard.amiStatus.useQuery(undefined, { refetchInterval: 15000 });
  const ttsQuery = trpc.appSettings.ttsStatus.useQuery(undefined, { refetchInterval: 60000 });
  const bridgeQuery = trpc.bridgeHealth.stats.useQuery(undefined, { refetchInterval: 30000 });
  const vitelityQuery = trpc.callerIds.vitelityBalance.useQuery(undefined, { refetchInterval: 120000, retry: false });
  const rateLimitQuery = trpc.rateLimits.status.useQuery(undefined, { refetchInterval: 10000 });
  const smtpQuery = trpc.appSettings.smtpStatus.useQuery(undefined, { refetchInterval: 60000 });

  const health = healthQuery.data;
  const server = serverQuery.data;

  const refreshAll = () => {
    healthQuery.refetch();
    serverQuery.refetch();
    amiQuery.refetch();
    ttsQuery.refetch();
    bridgeQuery.refetch();
    vitelityQuery.refetch();
    rateLimitQuery.refetch();
    smtpQuery.refetch();
    setLastRefresh(Date.now());
    toast.success("Refreshing all status checks...");
  };

  // Compute overall system status
  const getOverallStatus = (): ServiceStatus => {
    if (!health) return "unknown";
    const statuses = [
      health.ami.status === "connected" ? "healthy" : "offline",
      health.database.status === "connected" ? "healthy" : "offline",
      health.openai.status === "configured" ? "healthy" : "not_configured",
    ] as ServiceStatus[];
    if (statuses.includes("offline")) return "degraded";
    if (statuses.every(s => s === "healthy")) return "healthy";
    return "degraded";
  };

  const overallStatus = getOverallStatus();

  // Service cards data
  const services = [
    {
      name: "PBX Agent",
      icon: Phone,
      status: health?.ami.status === "connected" ? "healthy" as ServiceStatus : "offline" as ServiceStatus,
      detail: health?.ami.detail || "Checking...",
      extra: amiQuery.data ? {
        agents: amiQuery.data.agents,
        online: amiQuery.data.onlineAgents,
        outdated: amiQuery.data.outdatedAgents,
      } : null,
      link: "/freepbx",
    },
    {
      name: "Database",
      icon: Database,
      status: health?.database.status === "connected" ? "healthy" as ServiceStatus : "offline" as ServiceStatus,
      detail: health?.database.detail || "Checking...",
      link: "/settings",
    },
    {
      name: "OpenAI TTS",
      icon: Volume2,
      status: health?.openai.status === "configured" ? "healthy" as ServiceStatus : "not_configured" as ServiceStatus,
      detail: health?.openai.detail || "Checking...",
      link: "/settings",
    },
    {
      name: "Google TTS",
      icon: Volume2,
      status: health?.google.status === "configured" ? "healthy" as ServiceStatus : "not_configured" as ServiceStatus,
      detail: health?.google.detail || "Checking...",
      link: "/settings",
    },
    {
      name: "SSH Connection",
      icon: Server,
      status: health?.ssh.status === "configured" ? "healthy" as ServiceStatus : "not_configured" as ServiceStatus,
      detail: health?.ssh.detail || "Checking...",
      link: "/settings",
    },
    {
      name: "Voice AI Bridge",
      icon: Brain,
      status: bridgeQuery.data && bridgeQuery.data.totalChecks > 0
        ? (bridgeQuery.data.uptimePercent >= 80 ? "healthy" as ServiceStatus
          : bridgeQuery.data.uptimePercent >= 50 ? "degraded" as ServiceStatus
          : "offline" as ServiceStatus)
        : "not_configured" as ServiceStatus,
      detail: bridgeQuery.data
        ? `${bridgeQuery.data.healthyChecks}/${bridgeQuery.data.totalChecks} checks healthy`
        : "Checking...",
      link: "/voice-ai",
    },
    {
      name: "SMTP / Email",
      icon: Globe,
      status: smtpQuery.data?.configured ? "healthy" as ServiceStatus : "not_configured" as ServiceStatus,
      detail: smtpQuery.data?.configured
        ? `${smtpQuery.data.host}:${smtpQuery.data.port}`
        : "Not configured",
      link: "/settings",
    },
    {
      name: "Vitelity API",
      icon: Zap,
      status: vitelityQuery.data ? "healthy" as ServiceStatus : "not_configured" as ServiceStatus,
      detail: vitelityQuery.data
        ? `Balance: $${vitelityQuery.data}`
        : "Not configured or unavailable",
      link: "/caller-ids",
    },
  ];

  const healthyCount = services.filter(s => s.status === "healthy").length;
  const degradedCount = services.filter(s => s.status === "degraded").length;
  const offlineCount = services.filter(s => s.status === "offline").length;
  const unconfiguredCount = services.filter(s => s.status === "not_configured").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6" />
              System Status
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Consolidated health dashboard for all integrations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Last refresh: {new Date(lastRefresh).toLocaleTimeString()}
            </span>
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${healthQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh All
            </Button>
          </div>
        </div>

        {/* Overall Status Banner */}
        <Card className={
          overallStatus === "healthy" ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" :
          overallStatus === "degraded" ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" :
          "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
        }>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${
                  overallStatus === "healthy" ? "bg-green-100 dark:bg-green-900/40" :
                  overallStatus === "degraded" ? "bg-amber-100 dark:bg-amber-900/40" :
                  "bg-red-100 dark:bg-red-900/40"
                }`}>
                  {overallStatus === "healthy" ? <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" /> :
                   overallStatus === "degraded" ? <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" /> :
                   <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    {overallStatus === "healthy" ? "All Systems Operational" :
                     overallStatus === "degraded" ? "Some Services Need Attention" :
                     "System Issues Detected"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {healthyCount} healthy, {degradedCount > 0 ? `${degradedCount} degraded, ` : ""}
                    {offlineCount > 0 ? `${offlineCount} offline, ` : ""}
                    {unconfiguredCount > 0 ? `${unconfiguredCount} not configured` : ""}
                  </p>
                </div>
              </div>
              {server && (
                <div className="hidden md:flex flex-col items-end text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5" />
                    <span>{server.ip}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Uptime: <UptimeDisplay seconds={server.uptimeSeconds} /></span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trunk Utilization (if active) */}
        {rateLimitQuery.data && rateLimitQuery.data.activeCalls > 0 && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Active Calls</p>
                    <p className="text-sm text-muted-foreground">
                      {rateLimitQuery.data.activeCalls} active / {rateLimitQuery.data.trunkCapacity} capacity
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        rateLimitQuery.data.utilizationPct >= 90 ? "bg-red-500" :
                        rateLimitQuery.data.utilizationPct >= 70 ? "bg-amber-500" :
                        "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(rateLimitQuery.data.utilizationPct, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-medium w-12 text-right">
                    {rateLimitQuery.data.utilizationPct}%
                  </span>
                </div>
              </div>
              {rateLimitQuery.data.alerts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {rateLimitQuery.data.alerts.map((alert, i) => (
                    <div key={i} className={`text-sm flex items-center gap-2 ${
                      alert.level === "critical" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    }`}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {alert.message}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Service Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {services.map((service) => (
            <Card
              key={service.name}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => navigate(service.link)}
            >
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${
                      service.status === "healthy" ? "bg-green-100 dark:bg-green-900/30" :
                      service.status === "degraded" ? "bg-amber-100 dark:bg-amber-900/30" :
                      service.status === "offline" ? "bg-red-100 dark:bg-red-900/30" :
                      "bg-gray-100 dark:bg-gray-900/30"
                    }`}>
                      <service.icon className={`h-4 w-4 ${
                        service.status === "healthy" ? "text-green-600 dark:text-green-400" :
                        service.status === "degraded" ? "text-amber-600 dark:text-amber-400" :
                        service.status === "offline" ? "text-red-600 dark:text-red-400" :
                        "text-gray-500 dark:text-gray-400"
                      }`} />
                    </div>
                    <StatusDot status={service.status} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-semibold text-sm">{service.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.detail}</p>
                <div className="mt-3">
                  <StatusBadge status={service.status} />
                </div>
                {/* Extra info for PBX */}
                {service.extra && (
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    <p>{service.extra.online}/{service.extra.agents} agents online</p>
                    {service.extra.outdated > 0 && (
                      <p className="text-amber-600 dark:text-amber-400">
                        {service.extra.outdated} outdated
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Server Details */}
        {server && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Server Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">IP Address</p>
                  <p className="font-mono text-sm mt-1">{server.ip}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Hostname</p>
                  <p className="font-mono text-sm mt-1">{server.hostname}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Uptime</p>
                  <p className="font-mono text-sm mt-1"><UptimeDisplay seconds={server.uptimeSeconds} /></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Started</p>
                  <p className="font-mono text-sm mt-1">{new Date(server.startedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PBX Agent Versions */}
        {amiQuery.data && amiQuery.data.agentVersions && amiQuery.data.agentVersions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4" />
                PBX Agent Details
              </CardTitle>
              <CardDescription>
                Required version: {amiQuery.data.requiredVersion}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {amiQuery.data.agentVersions.map((agent, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{agent.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {agent.hasMultiSegment && (
                        <Badge variant="outline" className="text-xs">Multi-Segment</Badge>
                      )}
                      <Badge variant={agent.version === amiQuery.data?.requiredVersion ? "default" : "destructive"} className="font-mono text-xs">
                        v{agent.version}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
