import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Megaphone, Users, Phone, PhoneCall, CheckCircle2,
  ListChecks, Wifi, WifiOff, RefreshCw, Activity,
  Zap, Timer, Radio, ArrowDown, Pause, XCircle,
  PhoneOff, PhoneIncoming, PhoneOutgoing, Clock,
  MapPin, Shield, Terminal, Key, Database, AlertTriangle,
  Settings, Volume2, Bot, Download, Globe, Copy, Check, ArrowUp, Server, RotateCcw,
  ArrowDownCircle, Loader2 as UpdateSpinner, PackageCheck,
} from "lucide-react";
import { APP_VERSION } from "@shared/const";
import ProductTour, { useProductTour } from "@/components/ProductTour";

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

// ─── Update Button Component ────────────────────────────────────────────────
function UpdateButton() {
  const updateCheck = trpc.updater.checkForUpdate.useQuery(undefined, {
    refetchInterval: 300000, // Check every 5 minutes
    staleTime: 60000,
  });
  const triggerUpdate = trpc.updater.triggerUpdate.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message, { duration: 8000 });
      } else {
        toast.error(data.message, { duration: 8000 });
      }
    },
    onError: (err) => {
      toast.error(`Update failed: ${err.message}`);
    },
  });

  const [showDetails, setShowDetails] = useState(false);

  if (updateCheck.isLoading) {
    return (
      <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Checking...
      </Badge>
    );
  }

  if (!updateCheck.data?.updateAvailable) {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 px-3 py-1 text-green-600 border-green-500/30 cursor-pointer hover:bg-green-500/10 transition-colors"
        onClick={() => { updateCheck.refetch(); toast.info("Checking for updates..."); }}
        title="Click to check for updates"
      >
        <PackageCheck className="h-3.5 w-3.5" />
        Up to Date
      </Badge>
    );
  }

  // Update available
  return (
    <>
      <Badge
        variant="default"
        className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 cursor-pointer animate-pulse transition-colors"
        onClick={() => setShowDetails(true)}
        title={`Update available: v${updateCheck.data.latestVersion}`}
      >
        <ArrowDownCircle className="h-3.5 w-3.5" />
        Update v{updateCheck.data.latestVersion}
      </Badge>

      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDetails(false)}>
          <div className="bg-card text-card-foreground border rounded-xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ArrowDownCircle className="h-5 w-5 text-blue-500" />
                Update Available
              </h3>
              <button onClick={() => setShowDetails(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Version</span>
                <span className="font-mono">v{updateCheck.data.currentVersion}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Latest Version</span>
                <span className="font-mono font-semibold text-blue-500">v{updateCheck.data.latestVersion}</span>
              </div>
              {updateCheck.data.releaseName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Release</span>
                  <span className="truncate ml-4">{updateCheck.data.releaseName}</span>
                </div>
              )}
              {updateCheck.data.publishedAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Published</span>
                  <span>{new Date(updateCheck.data.publishedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {updateCheck.data.releaseNotes && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes</p>
                <p className="whitespace-pre-wrap text-foreground/80">{updateCheck.data.releaseNotes}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDetails(false)}
              >
                Later
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  triggerUpdate.mutate({ targetVersion: updateCheck.data!.latestVersion });
                  setShowDetails(false);
                }}
                disabled={triggerUpdate.isPending}
              >
                {triggerUpdate.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</>
                ) : (
                  <><ArrowDownCircle className="h-4 w-4 mr-2" />Install Update</>
                )}
              </Button>
            </div>

            {updateCheck.data.releaseUrl && (
              <a
                href={updateCheck.data.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 justify-center"
              >
                <Globe className="h-3 w-3" />
                View on GitHub
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}

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

function SystemHealthWidget() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const health = trpc.dashboard.systemHealth.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });
  const bridgeStatus = trpc.voiceAi.getBridgeStatus.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });
  const installBridge = trpc.voiceAi.installBridgeViaSSH.useMutation({
    onSuccess: (data) => {
      setInstalling(false);
      if (data.success) {
        toast.success("Voice AI Bridge installed successfully!");
        bridgeStatus.refetch();
      } else {
        toast.error(`Installation failed: ${data.error || "Unknown error"}`);
      }
      setInstallOutput(data.output || data.error || null);
    },
    onError: (err) => {
      setInstalling(false);
      toast.error(err.message);
    },
  });

  if (health.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">System Health</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = health.data;
  if (!data) return null;

  const services = [
    {
      key: "ami",
      label: "FreePBX / AMI",
      icon: Wifi,
      status: data.ami.status,
      detail: data.ami.detail,
      ok: data.ami.status === "connected",
    },
    {
      key: "ssh",
      label: "SSH Transfer",
      icon: Terminal,
      status: data.ssh.status,
      detail: data.ssh.detail,
      ok: data.ssh.status === "configured",
    },
    {
      key: "openai",
      label: "OpenAI TTS",
      icon: Key,
      status: data.openai.status,
      detail: data.openai.detail,
      ok: data.openai.status === "configured",
    },
    {
      key: "google",
      label: "Google TTS",
      icon: Key,
      status: data.google.status,
      detail: data.google.detail,
      ok: data.google.status === "configured",
    },
    {
      key: "database",
      label: "Database",
      icon: Database,
      status: data.database.status,
      detail: data.database.detail,
      ok: data.database.status === "connected",
    },
    {
      key: "voiceai",
      label: "Voice AI Bridge",
      icon: Bot,
      status: bridgeStatus.data?.status ?? "unknown",
      detail: bridgeStatus.data?.status === "online"
        ? "Connected"
        : bridgeStatus.data?.status === "not_installed"
        ? "Not installed"
        : bridgeStatus.data?.status === "offline"
        ? (bridgeStatus.data?.message || "Bridge offline")
        : "Checking...",
      ok: bridgeStatus.data?.status === "online",
    },
  ];

  const allOk = services.every(s => s.ok);
  const issueCount = services.filter(s => !s.ok).length;

  return (
    <Card className={!allOk ? "border-amber-500/30" : "border-green-500/30"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${allOk ? "text-green-500" : "text-amber-500"}`} />
            <CardTitle className="text-lg">System Health</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {allOk ? (
              <Badge variant="outline" className="text-green-500 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />All Systems OK
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />{issueCount} issue{issueCount > 1 ? "s" : ""}
              </Badge>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => health.refetch()}>
              <RefreshCw className={`h-3.5 w-3.5 ${health.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {services.map(svc => {
            const Icon = svc.icon;
            const showInstallBtn = svc.key === "voiceai" && bridgeStatus.data?.status === "not_installed";
            const showUpdateBtn = svc.key === "voiceai" && (bridgeStatus.data?.status === "online" || bridgeStatus.data?.status === "offline");
            return (
              <div
                key={svc.key}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  svc.ok
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-amber-500/20 bg-amber-500/5"
                }`}
              >
                <button
                  onClick={() => svc.key === "voiceai" ? setLocation("/voice-ai") : svc.key !== "database" && setLocation("/settings")}
                  className="w-full text-left hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className={`h-4 w-4 ${svc.ok ? "text-green-500" : "text-amber-500"}`} />
                    <span className="text-xs font-medium truncate">{svc.label}</span>
                  </div>
                  <div className={`text-xs ${svc.ok ? "text-green-600" : "text-amber-600"}`}>
                    {svc.ok ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{svc.detail}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{svc.detail}</span>
                      </span>
                    )}
                  </div>
                </button>
                {showInstallBtn && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    disabled={installing}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInstalling(true);
                      setInstallOutput(null);
                      installBridge.mutate({ origin: window.location.origin });
                    }}
                  >
                    {installing ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />Installing...</>
                    ) : (
                      <><Zap className="h-3 w-3" />Auto-Install</>
                    )}
                  </Button>
                )}
                {showUpdateBtn && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 h-7 text-xs gap-1.5 border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                    disabled={installing}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInstalling(true);
                      setInstallOutput(null);
                      installBridge.mutate({ origin: window.location.origin });
                    }}
                  >
                    {installing ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />Updating...</>
                    ) : (
                      <><RefreshCw className="h-3 w-3" />Reinstall / Update</>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {/* Install output display */}
        {installOutput && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Installation Output</span>
              <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => setInstallOutput(null)}>
                <XCircle className="h-3 w-3" />
              </Button>
            </div>
            <pre className="bg-zinc-950 text-green-400 rounded-lg p-3 text-xs font-mono max-h-40 overflow-auto whitespace-pre-wrap">
              {installOutput}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityStatusWidget() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const security = trpc.setupWizard.securityStatus.useQuery(undefined, {
    enabled: !!user && isAdmin,
    refetchInterval: 60000, // refresh every minute
    retry: false,
  });

  // Don't show for non-admins
  if (!isAdmin) return null;

  if (security.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Server Security</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (security.error || !security.data) return null;

  const { checks, summary } = security.data;
  const gradeColors: Record<string, string> = {
    A: "text-green-500 border-green-500/30 bg-green-500/10",
    B: "text-blue-500 border-blue-500/30 bg-blue-500/10",
    C: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    D: "text-orange-500 border-orange-500/30 bg-orange-500/10",
    F: "text-red-500 border-red-500/30 bg-red-500/10",
  };
  const gradeColor = gradeColors[summary.grade] || gradeColors.C;
  const borderColor = summary.error > 0 ? "border-red-500/30" : summary.warning > 0 ? "border-amber-500/30" : "border-green-500/30";

  const statusIcon = (status: string) => {
    switch (status) {
      case "ok": return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />;
      case "warning": return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
      default: return <Settings className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case "ok": return "border-green-500/20 bg-green-500/5";
      case "warning": return "border-amber-500/20 bg-amber-500/5";
      case "error": return "border-red-500/20 bg-red-500/5";
      default: return "border-muted bg-muted/5";
    }
  };

  const statusText = (status: string) => {
    switch (status) {
      case "ok": return "text-green-600";
      case "warning": return "text-amber-600";
      case "error": return "text-red-600";
      default: return "text-muted-foreground";
    }
  };

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${summary.error > 0 ? "text-red-500" : summary.warning > 0 ? "text-amber-500" : "text-green-500"}`} />
            <CardTitle className="text-lg">
              <button onClick={() => setLocation("/security")} className="hover:underline hover:text-primary transition-colors">
                Server Security
              </button>
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={gradeColor + " font-bold cursor-pointer hover:opacity-80"} onClick={() => setLocation("/security")}>
              Grade: {summary.grade}
            </Badge>
            <Badge variant="outline" className={summary.error > 0 ? "text-red-500 border-red-500/30" : summary.warning > 0 ? "text-amber-500 border-amber-500/30" : "text-green-500 border-green-500/30"}>
              {summary.ok}/{summary.total} passed
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => security.refetch()}>
              <RefreshCw className={`h-3.5 w-3.5 ${security.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {checks.map((check: any) => (
            <button
              key={check.name}
              onClick={() => setLocation("/security")}
              className={`rounded-lg border p-3 text-left transition-colors cursor-pointer hover:opacity-80 ${statusBg(check.status)}`}
              title={check.detail || check.message}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {statusIcon(check.status)}
                <span className="text-xs font-medium truncate">{check.name}</span>
              </div>
              <div className={`text-xs ${statusText(check.status)}`}>
                <span className="flex items-center gap-1">
                  <span className="truncate">{check.message}</span>
                </span>
              </div>
              {check.detail && check.status !== "ok" && (
                <p className="text-[10px] text-muted-foreground mt-1 truncate" title={check.detail}>
                  {check.detail}
                </p>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
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

function TestCallWidget() {
  const { user } = useAuth();
  const [testPhone, setTestPhone] = useState("");
  const [testAudioId, setTestAudioId] = useState<number | null>(null);
  const [testCallerId, setTestCallerId] = useState<number | undefined>(undefined);
  const [callPollingId, setCallPollingId] = useState<number | null>(null);
  const [callStatusMsg, setCallStatusMsg] = useState("");

  // Fetch audio files and caller IDs
  const audioFiles = trpc.audio.list.useQuery(undefined, { enabled: !!user });
  const callerIds = trpc.callerIds.list.useQuery(undefined, { enabled: !!user });

  const readyFiles = (audioFiles.data ?? []).filter((f: any) => f.s3Url);
  const activeCallerIds = (callerIds.data ?? []).filter((c: any) => c.isActive);

  // Poll for call status
  const callStatusQuery = trpc.quickTest.getCallStatus.useQuery(
    { queueId: callPollingId! },
    {
      enabled: !!callPollingId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2000;
        if (data.status === "completed" || data.status === "failed" || data.status === "not_found") return false;
        return 2000;
      },
    }
  );

  // React to call status changes
  useEffect(() => {
    if (!callStatusQuery.data || !callPollingId) return;
    const { status, result, failureReason, duration } = callStatusQuery.data;
    if (status === "completed" || result === "answered") {
      const dur = duration ? ` (${duration}s)` : "";
      toast.success(`Call completed successfully${dur}`);
      setCallStatusMsg(`Call answered${dur}`);
      setCallPollingId(null);
    } else if (status === "failed") {
      toast.error(`Call failed: ${failureReason || "Unknown"}`);
      setCallStatusMsg(`Failed: ${failureReason || "Unknown"}`);
      setCallPollingId(null);
    } else if (status === "claimed") {
      setCallStatusMsg("PBX agent dialing...");
    }
  }, [callStatusQuery.data, callPollingId]);

  const quickTestMut = trpc.quickTest.dial.useMutation({
    onSuccess: (r) => {
      if (r.success) {
        toast.success(r.message || "Test call initiated!");
        if (r.queueId) {
          setCallPollingId(r.queueId);
          setCallStatusMsg("Queued, waiting for PBX agent...");
        }
      } else {
        toast.error(r.message || "Failed to initiate call");
      }
    },
    onError: (e) => {
      toast.error(e.message);
      setCallStatusMsg(`Error: ${e.message}`);
    },
  });

  const canDial = testPhone.replace(/\D/g, "").length >= 10 && testAudioId;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Test Call</CardTitle>
        </div>
        <CardDescription className="text-xs">Quick dial to test your system</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Phone Number</Label>
          <Input
            placeholder="(407) 555-1177"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Audio File</Label>
          <Select
            value={testAudioId?.toString() || ""}
            onValueChange={(v) => setTestAudioId(v ? parseInt(v) : null)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select audio..." />
            </SelectTrigger>
            <SelectContent>
              {readyFiles.map((f: any) => (
                <SelectItem key={f.id} value={f.id.toString()}>
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3" />
                    {f.name}
                  </span>
                </SelectItem>
              ))}
              {readyFiles.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No audio files ready</div>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Caller ID</Label>
          <Select
            value={testCallerId?.toString() || "auto"}
            onValueChange={(v) => setTestCallerId(v === "auto" ? undefined : parseInt(v))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Auto (random)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (random rotation)</SelectItem>
              {activeCallerIds.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.label ? `${c.label} - ${c.phoneNumber}` : c.phoneNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="w-full"
          size="sm"
          disabled={!canDial || quickTestMut.isPending || !!callPollingId}
          onClick={() => {
            if (testAudioId && testPhone) {
              setCallStatusMsg("");
              setCallPollingId(null);
              quickTestMut.mutate({
                phoneNumber: testPhone,
                audioFileId: testAudioId,
                callerIdId: testCallerId,
              });
            }
          }}
        >
          {(quickTestMut.isPending || !!callPollingId) ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{callPollingId ? "Call in progress..." : "Calling..."}</>
          ) : (
            <><PhoneCall className="h-4 w-4 mr-2" />Dial Test Call</>
          )}
        </Button>
        {callStatusMsg && (
          <div className={`mt-2 p-2 rounded text-xs font-medium ${
            callStatusMsg.startsWith("Failed") || callStatusMsg.startsWith("Error")
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : callStatusMsg.startsWith("Call answered") || callStatusMsg.startsWith("Call completed")
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          }`}>
            {callStatusMsg}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AreaCodeDistribution() {
  const { user } = useAuth();
  const areaCodeData = trpc.dashboard.areaCodeDistribution.useQuery(
    { hours: 24 },
    { enabled: !!user, refetchInterval: 10000 }
  );

  const data = areaCodeData.data;
  if (!data || data.total === 0) return null;

  const topCodes = data.areaCodes.slice(0, 15);
  const maxTotal = topCodes.length > 0 ? topCodes[0].total : 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Area Code Distribution</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {data.areaCodes.length} area codes
            </Badge>
            <Badge variant="outline">
              {data.total} calls (24h)
            </Badge>
          </div>
        </div>
        <CardDescription>Call distribution by area code in the last 24 hours</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topCodes.map((ac) => (
            <div key={ac.areaCode} className="flex items-center gap-3">
              <span className="font-mono text-sm font-medium w-10 text-right">{ac.areaCode}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${Math.max((ac.total / maxTotal) * 100, 2)}%` }}>
                      {ac.answered > 0 && (
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${(ac.answered / ac.total) * 100}%` }}
                          title={`${ac.answered} answered`}
                        />
                      )}
                      {ac.failed > 0 && (
                        <div
                          className="h-full bg-red-400"
                          style={{ width: `${(ac.failed / ac.total) * 100}%` }}
                          title={`${ac.failed} failed`}
                        />
                      )}
                      {ac.noAnswer > 0 && (
                        <div
                          className="h-full bg-amber-400"
                          style={{ width: `${(ac.noAnswer / ac.total) * 100}%` }}
                          title={`${ac.noAnswer} no answer`}
                        />
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {ac.total} ({ac.percentage}%)
                  </span>
                  <span className={`text-xs font-medium w-12 text-right ${ac.answerRate >= 30 ? "text-green-600" : ac.answerRate >= 15 ? "text-amber-600" : "text-red-500"}`}>
                    {ac.answerRate}% ans
                  </span>
                </div>
              </div>
            </div>
          ))}
          {data.areaCodes.length > 15 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              + {data.areaCodes.length - 15} more area codes
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Answered</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Failed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> No Answer</span>
        </div>
      </CardContent>
    </Card>
  );
}

const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const estClock = useESTClock();
  const { shouldShow: showTour, completeTour } = useProductTour();

  // Redirect non-admin users to agent dashboard
  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/agent");
    }
  }, [user, setLocation]);

  const stats = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user && user?.role === "admin", refetchInterval: 10000 });

  // Auto-redirect: Setup Wizard on fresh install, then Onboarding for remaining steps
  // Uses sessionStorage so it only triggers once per browser session
  const setupNeeded = trpc.setupWizard.isSetupNeeded.useQuery(undefined, { enabled: !!user && user?.role === "admin" });
  const onboardingStatus = trpc.onboarding.status.useQuery(undefined, { enabled: !!user && user?.role === "admin" });
  useEffect(() => {
    if (typeof window === "undefined" || sessionStorage.getItem("onboarding_shown")) return;
    // Priority 1: If setup wizard hasn't been completed, redirect there first
    if (setupNeeded.data?.needed) {
      sessionStorage.setItem("onboarding_shown", "true");
      setLocation("/setup-wizard");
      return;
    }
    // Priority 2: If onboarding checklist isn't complete, redirect to onboarding
    if (
      onboardingStatus.data &&
      !onboardingStatus.data.isComplete &&
      localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== "true"
    ) {
      sessionStorage.setItem("onboarding_shown", "true");
      setLocation("/onboarding");
    }
  }, [setupNeeded.data, onboardingStatus.data, setLocation]);
  const amiStatus = trpc.dashboard.amiStatus.useQuery(undefined, { enabled: !!user, refetchInterval: 15000 });
  const serverInfo = trpc.dashboard.serverInfo.useQuery(undefined, { enabled: !!user, staleTime: 300000 });
  const agentAutoUpdate = trpc.agentAutoUpdate.update.useMutation();
  const dialerLive = trpc.dashboard.dialerLive.useQuery(undefined, { enabled: !!user, refetchInterval: 3000 });

  const isDialerActive = (dialerLive.data?.activeCampaignCount ?? 0) > 0;
  const [ipCopied, setIpCopied] = useState(false);

  const totalDurationSecs = stats.data?.totalDurationSecs ?? 0;
  const avgDurationSecs = stats.data?.avgDurationSecs ?? 0;

  return (
    <DashboardLayout>
      {showTour && user?.role === "admin" && (
        <ProductTour onComplete={completeTour} onNavigate={setLocation} />
      )}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard <span className="text-sm font-normal text-muted-foreground ml-2">v{APP_VERSION}</span>{serverInfo.data?.ip && serverInfo.data.ip !== "Unknown" && (<button onClick={() => { navigator.clipboard.writeText(serverInfo.data!.ip); setIpCopied(true); setTimeout(() => setIpCopied(false), 2000); toast.success("IP copied to clipboard"); }} className="text-xs font-mono text-muted-foreground ml-2 bg-muted/50 px-2 py-0.5 rounded inline-flex items-center gap-1 hover:bg-muted transition-colors cursor-pointer border-0" title="Click to copy IP"><Globe className="h-3 w-3" />{serverInfo.data.ip}{ipCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-50" />}</button>)}</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-muted-foreground text-sm">{import.meta.env.VITE_APP_TITLE || "AI TTS Broadcast Dialer"} Overview</p>
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono bg-muted/50 px-2 py-0.5 rounded">
                <Clock className="h-3 w-3" />
                {estClock}
              </span>
              {serverInfo.data?.uptimeSeconds != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono bg-muted/50 px-2 py-0.5 rounded" title="Server uptime">
                  <ArrowUp className="h-3 w-3" />
                  {formatUptime(serverInfo.data.uptimeSeconds)}
                </span>
              )}
              {serverInfo.data?.hostname && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono bg-muted/50 px-2 py-0.5 rounded" title="Server hostname">
                  <Server className="h-3 w-3" />
                  {serverInfo.data.hostname}
                </span>
              )}
              {serverInfo.data?.startedAt && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono bg-muted/50 px-2 py-0.5 rounded" title="Last restarted">
                  <RotateCcw className="h-3 w-3" />
                  {new Date(serverInfo.data.startedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDialerActive && (
              <Badge variant="default" className="flex items-center gap-1.5 px-3 py-1 bg-green-600 animate-pulse">
                <Radio className="h-3.5 w-3.5" />
                Dialer Active
              </Badge>
            )}
            <UpdateButton />
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <span className="text-xs font-medium uppercase tracking-wider">Remaining Leads</span>
                </div>
                <div className={`text-4xl font-bold tabular-nums ${isDialerActive ? "text-amber-500" : ""}`}>
                  {dialerLive.data?.leadsInHopper ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Total leads left to dial</p>
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

        {/* Rate Limit Alerts */}
        <RateLimitAlerts />

        {/* Overview Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Calls Dialed</CardTitle>
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

        {/* System Health Widget */}
        <SystemHealthWidget />

        {/* Server Security Status Widget */}
        <SecurityStatusWidget />

        {/* Real-time Call Activity Feed */}
        <CallActivityFeed />

        {/* Area Code Distribution */}
        <AreaCodeDistribution />

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
              {/* Agent version info */}
              {amiStatus.data?.agentVersions && amiStatus.data.agentVersions.length > 0 && (
                <div className="space-y-1">
                  {amiStatus.data.agentVersions.map((av: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{av.name || `Agent ${i+1}`}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono">v{av.version}</span>
                        {av.version !== "unknown" && av.version >= (amiStatus.data?.requiredVersion || "1.5.0") ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(amiStatus.data?.outdatedAgents ?? 0) > 0 && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-600">Agent Update Required</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {amiStatus.data?.outdatedAgents} agent(s) need updating to v{amiStatus.data?.requiredVersion} for multi-segment script support.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                        onClick={() => {
                          agentAutoUpdate.mutate(undefined, {
                            onSuccess: (res: any) => {
                              if (res.success) {
                                toast.success("Agent updated successfully! It will reconnect shortly.");
                                amiStatus.refetch();
                              } else {
                                toast.error(res.error || "Update failed");
                              }
                            },
                            onError: (err: any) => toast.error(err.message),
                          });
                        }}
                        disabled={agentAutoUpdate.isPending}
                      >
                        {agentAutoUpdate.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Updating...</> : <><Download className="h-3 w-3 mr-1" />Auto-Update Agent</>}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full mt-2" disabled={amiStatus.isFetching} onClick={() => { amiStatus.refetch(); toast.info("Refreshing status..."); }}>
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${amiStatus.isFetching ? "animate-spin" : ""}`} />Refresh Status
              </Button>
            </CardContent>
          </Card>
          <TestCallWidget />
        </div>
      </div>
    </DashboardLayout>
  );
}

function RateLimitAlerts() {
  const rateLimits = trpc.rateLimits.status.useQuery(undefined, { refetchInterval: 10000 });
  const data = rateLimits.data;
  if (!data || (data.alerts.length === 0 && data.utilizationPct < 50)) return null;
  return (
    <Card className={data.alerts.some(a => a.level === "critical") ? "border-red-500/50 bg-red-500/5" : data.alerts.length > 0 ? "border-amber-500/50 bg-amber-500/5" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="text-sm font-medium">Trunk Utilization</span>
          </div>
          <span className={`text-lg font-bold tabular-nums ${data.utilizationPct >= 90 ? "text-red-500" : data.utilizationPct >= 70 ? "text-amber-500" : "text-green-500"}`}>
            {data.utilizationPct}%
          </span>
        </div>
        <Progress value={data.utilizationPct} className="h-2 mb-3" />
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <div><div className="font-bold text-base tabular-nums">{data.activeCalls}</div><span className="text-muted-foreground">Active</span></div>
          <div><div className="font-bold text-base tabular-nums">{data.trunkCapacity}</div><span className="text-muted-foreground">Capacity</span></div>
          <div><div className="font-bold text-base tabular-nums">{data.callsLastMinute}</div><span className="text-muted-foreground">Last Min</span></div>
          <div><div className="font-bold text-base tabular-nums">{data.callsLastHour}</div><span className="text-muted-foreground">Last Hour</span></div>
        </div>
        {data.alerts.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.alerts.map((alert, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${alert.level === "critical" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`}>
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
