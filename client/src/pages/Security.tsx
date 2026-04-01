import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  CheckCircle2, AlertTriangle, XCircle, Settings,
  RefreshCw, Copy, Check, ExternalLink, Terminal,
  Lock, Globe, Server, FileKey, ArrowLeft,
  Play, Loader2, TrendingUp, TrendingDown, Minus,
  History, Wifi, WifiOff, Eye, EyeOff, Save,
} from "lucide-react";
import { useLocation } from "wouter";

// Remediation data for each security check
const remediationGuides: Record<string, {
  icon: any;
  description: string;
  why: string;
  fixable: boolean; // whether "Run Fix" can auto-fix this
  steps: Array<{ label: string; command?: string; note?: string }>;
  learnMore?: string;
}> = {
  "Firewall (UFW)": {
    icon: Shield,
    fixable: true,
    description: "UFW (Uncomplicated Firewall) blocks unauthorized network access to your server, allowing only the ports your application needs.",
    why: "Without a firewall, every service running on your server is exposed to the internet. Attackers can scan and exploit any open port.",
    steps: [
      { label: "Install UFW", command: "sudo apt install ufw -y" },
      { label: "Set default deny policy", command: "sudo ufw default deny incoming" },
      { label: "Allow SSH (port 22)", command: "sudo ufw allow 22/tcp" },
      { label: "Allow web app (port 3000)", command: "sudo ufw allow 3000/tcp" },
      { label: "Allow HTTP (port 80)", command: "sudo ufw allow 80/tcp" },
      { label: "Allow HTTPS (port 443)", command: "sudo ufw allow 443/tcp" },
      { label: "Enable the firewall", command: "sudo ufw enable" },
      { label: "Verify status", command: "sudo ufw status verbose" },
    ],
    learnMore: "https://help.ubuntu.com/community/UFW",
  },
  "Fail2Ban (SSH)": {
    icon: Lock,
    fixable: true,
    description: "Fail2Ban monitors log files for failed login attempts and automatically bans offending IP addresses, protecting against brute-force attacks.",
    why: "SSH is the #1 target for automated attacks. Without Fail2Ban, bots will continuously try username/password combinations against your server.",
    steps: [
      { label: "Install Fail2Ban", command: "sudo apt install fail2ban -y" },
      { label: "Create SSH jail config", command: "sudo tee /etc/fail2ban/jail.d/sshd.conf << 'EOF'\n[sshd]\nenabled = true\nport = ssh\nfilter = sshd\nlogpath = /var/log/auth.log\nmaxretry = 5\nbantime = 3600\nfindtime = 600\nEOF" },
      { label: "Start and enable Fail2Ban", command: "sudo systemctl enable --now fail2ban" },
      { label: "Check status", command: "sudo fail2ban-client status sshd" },
    ],
    learnMore: "https://www.fail2ban.org/wiki/index.php/Main_Page",
  },
  "SSH Auth Method": {
    icon: FileKey,
    fixable: false, // requires manual SSH key setup
    description: "SSH key authentication is more secure than password authentication because keys are cryptographically strong and immune to brute-force attacks.",
    why: "Password-based SSH login is vulnerable to brute-force attacks. SSH keys provide a much stronger authentication mechanism.",
    steps: [
      { label: "Generate SSH key pair (on your local machine)", command: "ssh-keygen -t ed25519 -C \"your_email@example.com\"", note: "Run this on your local computer, not the server" },
      { label: "Copy your public key to the server", command: "ssh-copy-id root@YOUR_SERVER_IP", note: "Replace YOUR_SERVER_IP with your server's IP address" },
      { label: "Test key-based login", command: "ssh root@YOUR_SERVER_IP", note: "Should log in without asking for a password" },
      { label: "Disable password authentication", command: "sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config" },
      { label: "Restart SSH service", command: "sudo systemctl restart sshd" },
    ],
    learnMore: "https://www.ssh.com/academy/ssh/key",
  },
  "SSL/HTTPS": {
    icon: Globe,
    fixable: false, // requires domain setup
    description: "SSL/HTTPS encrypts all traffic between users and your server, preventing eavesdropping and man-in-the-middle attacks.",
    why: "Without HTTPS, login credentials and sensitive data are transmitted in plain text. Anyone on the network can intercept them.",
    steps: [
      { label: "Ensure you have a domain name pointing to your server", note: "You need a domain (e.g., dialer.yourcompany.com) with DNS A record pointing to your server's IP" },
      { label: "Update your .env file with the domain", command: "# Edit /opt/tts-dialer/.env\nDOMAIN=dialer.yourcompany.com\nAPP_PROTOCOL=https" },
      { label: "Caddy handles SSL automatically", note: "The included Caddy reverse proxy will auto-obtain and renew Let's Encrypt certificates" },
      { label: "Restart Docker services", command: "cd /opt/tts-dialer && docker compose down && docker compose up -d" },
      { label: "Verify HTTPS", note: "Visit https://dialer.yourcompany.com — you should see a green padlock" },
    ],
    learnMore: "https://caddyserver.com/docs/automatic-https",
  },
  "Auto Security Updates": {
    icon: Server,
    fixable: true,
    description: "Unattended-upgrades automatically installs security patches for your operating system, keeping your server protected against known vulnerabilities.",
    why: "New security vulnerabilities are discovered daily. Without automatic updates, your server accumulates unpatched vulnerabilities over time.",
    steps: [
      { label: "Install unattended-upgrades", command: "sudo apt install unattended-upgrades -y" },
      { label: "Enable automatic updates", command: "sudo dpkg-reconfigure -plow unattended-upgrades", note: "Select 'Yes' when prompted" },
      { label: "Verify it's running", command: "sudo systemctl status unattended-upgrades" },
    ],
    learnMore: "https://help.ubuntu.com/community/AutomaticSecurityUpdates",
  },
  ".env File Security": {
    icon: FileKey,
    fixable: true,
    description: "The .env file contains sensitive credentials (database passwords, API keys, JWT secrets). Restricting file permissions ensures only root can read it.",
    why: "If the .env file is world-readable, any user on the system can access your database password, API keys, and other secrets.",
    steps: [
      { label: "Set restrictive permissions", command: "sudo chmod 600 /opt/tts-dialer/.env" },
      { label: "Ensure root ownership", command: "sudo chown root:root /opt/tts-dialer/.env" },
      { label: "Verify permissions", command: "ls -la /opt/tts-dialer/.env", note: "Should show: -rw------- 1 root root" },
    ],
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function SecurityCheckCard({ check, onRefresh }: { check: { name: string; status: string; message: string; detail?: string }; onRefresh: () => void }) {
  const guide = remediationGuides[check.name];
  const [fixOutput, setFixOutput] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const runFix = trpc.setupWizard.runSecurityFix.useMutation({
    onSuccess: (result) => {
      setFixOutput(result.output);
      setShowOutput(true);
      if (result.success) {
        toast.success(`Fix applied: ${check.name}`);
        // Refresh security status after a short delay
        setTimeout(() => onRefresh(), 2000);
      } else {
        toast.error(`Fix failed for ${check.name}`);
      }
    },
    onError: (err: any) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  if (!guide) return null;

  const Icon = guide.icon;
  const isOk = check.status === "ok";
  const isWarning = check.status === "warning";
  const isError = check.status === "error";

  const statusColor = isOk ? "text-green-500" : isWarning ? "text-amber-500" : isError ? "text-red-500" : "text-muted-foreground";
  const borderColor = isOk ? "border-green-500/20" : isWarning ? "border-amber-500/20" : isError ? "border-red-500/20" : "border-muted";
  const bgColor = isOk ? "bg-green-500/5" : isWarning ? "bg-amber-500/5" : isError ? "bg-red-500/5" : "bg-muted/5";

  const StatusIcon = isOk ? CheckCircle2 : isWarning ? AlertTriangle : isError ? XCircle : Settings;

  return (
    <Card className={`${borderColor} ${bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isOk ? "bg-green-500/10" : isWarning ? "bg-amber-500/10" : isError ? "bg-red-500/10" : "bg-muted/10"}`}>
              <Icon className={`h-5 w-5 ${statusColor}`} />
            </div>
            <div>
              <CardTitle className="text-base">{check.name}</CardTitle>
              <div className={`flex items-center gap-1.5 mt-0.5 text-sm ${statusColor}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                <span>{check.message}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Run Fix button — only for fixable checks that aren't passing */}
            {!isOk && guide.fixable && (
              <Button
                size="sm"
                variant={isError ? "destructive" : "default"}
                onClick={() => runFix.mutate({ checkName: check.name })}
                disabled={runFix.isPending}
                className="gap-1.5"
              >
                {runFix.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {runFix.isPending ? "Fixing..." : "Run Fix"}
              </Button>
            )}
            <Badge
              variant="outline"
              className={
                isOk ? "text-green-500 border-green-500/30" :
                isWarning ? "text-amber-500 border-amber-500/30" :
                isError ? "text-red-500 border-red-500/30" :
                "text-muted-foreground border-muted"
              }
            >
              {isOk ? "Passed" : isWarning ? "Warning" : isError ? "Failed" : "Unknown"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fix output */}
        {showOutput && fixOutput && (
          <div className="rounded-lg border border-primary/30 bg-zinc-950 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Fix Output
              </p>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowOutput(false)}>
                Hide
              </Button>
            </div>
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
              {fixOutput}
            </pre>
          </div>
        )}

        {/* Description */}
        <div>
          <p className="text-sm text-muted-foreground">{guide.description}</p>
        </div>

        {/* Why it matters */}
        {!isOk && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
            <p className="text-sm font-medium text-amber-500 mb-1">Why this matters</p>
            <p className="text-sm text-muted-foreground">{guide.why}</p>
          </div>
        )}

        {/* Manual steps note for non-fixable checks */}
        {!isOk && !guide.fixable && (
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
            <p className="text-sm font-medium text-blue-500 mb-1">Manual configuration required</p>
            <p className="text-sm text-muted-foreground">
              This check requires manual setup that cannot be automated. Follow the steps below on your server.
            </p>
          </div>
        )}

        {/* Remediation steps */}
        {!isOk && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Terminal className="h-4 w-4" />
              {guide.fixable ? "Manual steps (alternative to Run Fix)" : "How to fix"}
            </p>
            <div className="space-y-2">
              {guide.steps.map((step, i) => (
                <div key={i} className="rounded-lg border bg-card/50 p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{step.label}</p>
                      {step.command && (
                        <div className="mt-1.5 flex items-start gap-1">
                          <pre className="flex-1 bg-zinc-950 text-green-400 rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {step.command}
                          </pre>
                          <CopyButton text={step.command} />
                        </div>
                      )}
                      {step.note && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{step.note}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current detail */}
        {check.detail && isOk && (
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{check.detail}</p>
          </div>
        )}

        {/* Learn more link */}
        {guide.learnMore && !isOk && (
          <a
            href={guide.learnMore}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Host SSH Configuration Card ────────────────────────────────────────

function HostSSHConfigCard({ onSaved }: { onSaved: () => void }) {
  const [hostIp, setHostIp] = useState("172.17.0.1");
  const [hostUser, setHostUser] = useState("root");
  const [hostPassword, setHostPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load existing settings
  const hostIpSetting = trpc.appSettings.get.useQuery({ key: "host_ssh_ip" });
  const hostUserSetting = trpc.appSettings.get.useQuery({ key: "host_ssh_user" });
  const hostPassSetting = trpc.appSettings.get.useQuery({ key: "host_ssh_password" });
  useEffect(() => {
    if (hostIpSetting.data?.value) setHostIp(hostIpSetting.data.value);
    if (hostUserSetting.data?.value) setHostUser(hostUserSetting.data.value);
    if (hostPassSetting.data?.value) setHostPassword(hostPassSetting.data.value);
  }, [hostIpSetting.data, hostUserSetting.data, hostPassSetting.data]);

  const saveSetting = trpc.appSettings.update.useMutation();

  const handleSave = async () => {
    try {
      await saveSetting.mutateAsync({ key: "host_ssh_ip", value: hostIp });
      await saveSetting.mutateAsync({ key: "host_ssh_user", value: hostUser });
      await saveSetting.mutateAsync({ key: "host_ssh_password", value: hostPassword });
      toast.success("Host SSH credentials saved");
      onSaved();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first, then test via the security status endpoint
      await saveSetting.mutateAsync({ key: "host_ssh_ip", value: hostIp });
      await saveSetting.mutateAsync({ key: "host_ssh_user", value: hostUser });
      await saveSetting.mutateAsync({ key: "host_ssh_password", value: hostPassword });
      // Trigger a security status check which will use SSH
      onSaved();
      setTestResult({ success: true, message: "Credentials saved. Refresh the page to see security status via SSH." });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const hasPassword = !!hostPassword;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4 text-amber-500" />
          Host SSH Configuration Required
        </CardTitle>
        <CardDescription>
          The app runs inside Docker and needs SSH access to the host server to check and fix security settings (firewall, fail2ban, etc.).
          By default, it connects to the Docker bridge gateway (172.17.0.1) as root.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="host-ip">Host IP Address</Label>
            <Input
              id="host-ip"
              value={hostIp}
              onChange={(e) => setHostIp(e.target.value)}
              placeholder="172.17.0.1"
            />
            <p className="text-xs text-muted-foreground">Docker bridge: 172.17.0.1</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="host-user">SSH Username</Label>
            <Input
              id="host-user"
              value={hostUser}
              onChange={(e) => setHostUser(e.target.value)}
              placeholder="root"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="host-pass">SSH Password</Label>
            <div className="relative">
              <Input
                id="host-pass"
                type={showPassword ? "text" : "password"}
                value={hostPassword}
                onChange={(e) => setHostPassword(e.target.value)}
                placeholder="Enter host root password"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {testResult && (
          <div className={`rounded-lg p-3 text-sm ${testResult.success ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
            <div className="flex items-center gap-2">
              {testResult.success ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {testResult.message}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!hasPassword || saveSetting.isPending} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saveSetting.isPending ? "Saving..." : "Save & Apply"}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={!hasPassword || testing} className="gap-1.5">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            {testing ? "Testing..." : "Test & Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Grade History Chart ──────────────────────────────────────────────────

const GRADE_VALUES: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444",
};

function GradeHistoryChart() {
  const { data: historyData, isLoading } = trpc.setupWizard.gradeHistory.useQuery(
    { limit: 50 },
    { refetchInterval: 60000 }
  );

  const entries = useMemo(() => {
    if (!historyData?.entries) return [];
    // Reverse to show oldest first (left to right)
    return [...historyData.entries].reverse();
  }, [historyData]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="h-48 rounded-lg bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Security Grade History
          </CardTitle>
          <CardDescription>
            Grade history will appear here after the security monitor runs its first check (every 6 hours)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-muted">
            <p className="text-sm text-muted-foreground">No history data yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate trend
  const latestGrade = entries[entries.length - 1]?.grade || "F";
  const previousGrade = entries.length > 1 ? entries[entries.length - 2]?.grade || latestGrade : latestGrade;
  const latestVal = GRADE_VALUES[latestGrade] || 1;
  const prevVal = GRADE_VALUES[previousGrade] || 1;
  const trend = latestVal > prevVal ? "up" : latestVal < prevVal ? "down" : "stable";

  // Chart dimensions
  const chartWidth = 100; // percentage
  const chartHeight = 160;
  const padding = { top: 20, bottom: 30, left: 0, right: 0 };
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const plotWidth = chartWidth;

  // Build SVG path
  const pointSpacing = entries.length > 1 ? plotWidth / (entries.length - 1) : plotWidth / 2;
  const points = entries.map((entry, i) => {
    const x = entries.length === 1 ? plotWidth / 2 : i * pointSpacing;
    const gradeVal = GRADE_VALUES[entry.grade] || 1;
    const y = padding.top + plotHeight - ((gradeVal - 1) / 4) * plotHeight;
    return { x, y, entry };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = pathD + ` L ${points[points.length - 1].x} ${chartHeight - padding.bottom} L ${points[0].x} ${chartHeight - padding.bottom} Z`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Security Grade History
            </CardTitle>
            <CardDescription>
              Grade trend over the last {entries.length} check{entries.length !== 1 ? "s" : ""} (checked every 6 hours)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-sm font-medium ${
              trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground"
            }`}>
              {trend === "up" ? <TrendingUp className="h-4 w-4" /> : trend === "down" ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}
            </div>
            <Badge variant="outline" className={`text-lg font-bold px-3 py-1 ${
              latestGrade === "A" ? "text-green-500 border-green-500/30" :
              latestGrade === "B" ? "text-blue-500 border-blue-500/30" :
              latestGrade === "C" ? "text-amber-500 border-amber-500/30" :
              latestGrade === "D" ? "text-orange-500 border-orange-500/30" :
              "text-red-500 border-red-500/30"
            }`}>
              {latestGrade}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height: chartHeight }}>
          {/* Y-axis grade labels */}
          {["A", "B", "C", "D", "F"].map((grade, i) => {
            const y = padding.top + (i / 4) * plotHeight;
            return (
              <div key={grade} className="absolute flex items-center" style={{ top: y - 8, left: -24 }}>
                <span className="text-xs font-mono font-medium" style={{ color: GRADE_COLORS[grade] }}>{grade}</span>
              </div>
            );
          })}

          {/* Grid lines */}
          <svg width="100%" height={chartHeight} className="absolute inset-0" style={{ left: 0 }}>
            {["A", "B", "C", "D", "F"].map((grade, i) => {
              const y = padding.top + (i / 4) * plotHeight;
              return (
                <line key={grade} x1="0%" x2="100%" y1={y} y2={y}
                  stroke="currentColor" strokeOpacity={0.08} strokeDasharray="4 4" />
              );
            })}

            {/* Area fill */}
            <path d={areaD} fill="url(#gradeGradient)" opacity={0.15} />

            {/* Line */}
            <path d={pathD} fill="none" stroke="url(#lineGradient)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

            {/* Data points */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={`${p.x}%`} cy={p.y} r={4} fill={GRADE_COLORS[p.entry.grade] || "#888"} stroke="var(--background)" strokeWidth={2} />
                {/* Tooltip area */}
                <title>{`Grade: ${p.entry.grade} | ${new Date(p.entry.checkedAt).toLocaleString()}\n${p.entry.okCount} passed, ${p.entry.warningCount} warnings, ${p.entry.errorCount} errors`}</title>
              </g>
            ))}

            {/* Gradients */}
            <defs>
              <linearGradient id="gradeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="lineGradient" x1="0%" y1="0" x2="100%" y2="0">
                {points.map((p, i) => (
                  <stop key={i} offset={`${(i / Math.max(points.length - 1, 1)) * 100}%`} stopColor={GRADE_COLORS[p.entry.grade] || "#888"} />
                ))}
              </linearGradient>
            </defs>
          </svg>

          {/* X-axis timestamps */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-0" style={{ height: padding.bottom }}>
            {entries.length <= 10 ? entries.map((entry, i) => (
              <span key={i} className="text-[10px] text-muted-foreground font-mono" style={{ position: "absolute", left: `${entries.length === 1 ? 50 : (i / (entries.length - 1)) * 100}%`, transform: "translateX(-50%)", bottom: 0 }}>
                {new Date(entry.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )) : (
              <>
                <span className="text-[10px] text-muted-foreground font-mono absolute left-0 bottom-0">
                  {new Date(entries[0].checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono absolute right-0 bottom-0">
                  {new Date(entries[entries.length - 1].checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Stats row */}
        {entries.length > 0 && (
          <div className="flex gap-4 mt-4 pt-4 border-t">
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Total Checks</p>
              <p className="text-lg font-semibold">{entries.length}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Best Grade</p>
              <p className="text-lg font-semibold" style={{ color: GRADE_COLORS[entries.reduce((best, e) => (GRADE_VALUES[e.grade] || 1) > (GRADE_VALUES[best] || 1) ? e.grade : best, "F")] }}>
                {entries.reduce((best, e) => (GRADE_VALUES[e.grade] || 1) > (GRADE_VALUES[best] || 1) ? e.grade : best, "F")}
              </p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Worst Grade</p>
              <p className="text-lg font-semibold" style={{ color: GRADE_COLORS[entries.reduce((worst, e) => (GRADE_VALUES[e.grade] || 1) < (GRADE_VALUES[worst] || 1) ? e.grade : worst, "A")] }}>
                {entries.reduce((worst, e) => (GRADE_VALUES[e.grade] || 1) < (GRADE_VALUES[worst] || 1) ? e.grade : worst, "A")}
              </p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-lg font-semibold" style={{ color: GRADE_COLORS[latestGrade] }}>
                {latestGrade}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Security Page ──────────────────────────────────────────────────

export default function Security() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";

  const security = trpc.setupWizard.securityStatus.useQuery(undefined, {
    enabled: !!user && isAdmin,
    retry: false,
  });

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="container py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">Only administrators can view security settings.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const gradeColors: Record<string, string> = {
    A: "text-green-500 border-green-500/30 bg-green-500/10",
    B: "text-blue-500 border-blue-500/30 bg-blue-500/10",
    C: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    D: "text-orange-500 border-orange-500/30 bg-orange-500/10",
    F: "text-red-500 border-red-500/30 bg-red-500/10",
  };

  const gradeDescriptions: Record<string, string> = {
    A: "Excellent — all security controls are properly configured.",
    B: "Good — minor improvements recommended but no critical issues.",
    C: "Fair — some security controls need attention.",
    D: "Poor — multiple security issues need to be addressed.",
    F: "Critical — your server has significant security gaps that need immediate attention.",
  };

  const GradeIcon = security.data?.summary.grade === "A" || security.data?.summary.grade === "B"
    ? ShieldCheck
    : security.data?.summary.grade === "C"
    ? Shield
    : ShieldAlert;

  return (
    <DashboardLayout>
      <div className="container py-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-6 w-6" />
                Server Security
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Security status, one-click fixes, and grade history for your self-hosted deployment
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => security.refetch()}
            disabled={security.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${security.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Host SSH Config — shown when checks are unconfigured due to missing SSH */}
        {security.data && security.data.checks.some((c: any) => c.message === "Host SSH not configured") && (
          <HostSSHConfigCard onSaved={() => security.refetch()} />
        )}

        {/* Grade Summary Card */}
        {security.data && (
          <Card className={security.data.summary.error > 0 ? "border-red-500/30" : security.data.summary.warning > 0 ? "border-amber-500/30" : "border-green-500/30"}>
            <CardContent className="py-6">
              <div className="flex items-center gap-6">
                <div className={`flex items-center justify-center h-20 w-20 rounded-2xl border-2 ${gradeColors[security.data.summary.grade] || gradeColors.C}`}>
                  <span className="text-4xl font-bold">{security.data.summary.grade}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <GradeIcon className={`h-5 w-5 ${security.data.summary.error > 0 ? "text-red-500" : security.data.summary.warning > 0 ? "text-amber-500" : "text-green-500"}`} />
                    <h2 className="text-lg font-semibold">Security Grade: {security.data.summary.grade}</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {gradeDescriptions[security.data.summary.grade] || gradeDescriptions.C}
                  </p>
                  <div className="flex gap-3">
                    <Badge variant="outline" className="text-green-500 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />{security.data.summary.ok} passed
                    </Badge>
                    {security.data.summary.warning > 0 && (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                        <AlertTriangle className="h-3 w-3 mr-1" />{security.data.summary.warning} warning{security.data.summary.warning > 1 ? "s" : ""}
                      </Badge>
                    )}
                    {security.data.summary.error > 0 && (
                      <Badge variant="outline" className="text-red-500 border-red-500/30">
                        <XCircle className="h-3 w-3 mr-1" />{security.data.summary.error} failed
                      </Badge>
                    )}
                    {security.data.summary.unconfigured > 0 && (
                      <Badge variant="outline" className="text-muted-foreground border-muted">
                        <Settings className="h-3 w-3 mr-1" />{security.data.summary.unconfigured} unconfigured
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Grade History Chart */}
        <GradeHistoryChart />

        {/* Loading state */}
        {security.isLoading && (
          <div className="space-y-4">
            {[1,2,3,4,5,6].map(i => (
              <Card key={i}>
                <CardContent className="py-6">
                  <div className="h-24 rounded-lg bg-muted/30 animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Individual check cards */}
        {security.data && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Security Checks
            </h3>
            {/* Failed checks first, then warnings, then passed */}
            {[...security.data.checks]
              .sort((a: any, b: any) => {
                const order: Record<string, number> = { error: 0, warning: 1, unconfigured: 2, ok: 3 };
                return (order[a.status] ?? 2) - (order[b.status] ?? 2);
              })
              .map((check: any) => (
                <SecurityCheckCard key={check.name} check={check} onRefresh={() => security.refetch()} />
              ))}
          </div>
        )}

        {/* Quick fix all script */}
        {security.data && security.data.summary.error > 0 && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Quick Fix Script
              </CardTitle>
              <CardDescription>
                Run this single script on your server to fix all critical issues at once
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-1">
                <pre className="flex-1 bg-zinc-950 text-green-400 rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`#!/bin/bash
# Quick Security Fix Script for TTS Broadcast Dialer
set -e

echo "=== Installing Security Tools ==="

# 1. Install and enable UFW
sudo apt install ufw -y
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable

# 2. Install and configure Fail2Ban
sudo apt install fail2ban -y
sudo tee /etc/fail2ban/jail.d/sshd.conf << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
sudo systemctl enable --now fail2ban

# 3. Install unattended-upgrades
sudo apt install unattended-upgrades -y
sudo systemctl enable --now unattended-upgrades

# 4. Secure .env file
if [ -f /opt/tts-dialer/.env ]; then
  sudo chmod 600 /opt/tts-dialer/.env
  sudo chown root:root /opt/tts-dialer/.env
fi

echo ""
echo "=== Security Hardening Complete ==="
echo "UFW: $(sudo ufw status | head -1)"
echo "Fail2Ban: $(sudo systemctl is-active fail2ban)"
echo "Auto-updates: $(sudo systemctl is-active unattended-upgrades)"
echo ""
echo "NOTE: SSH key auth must be configured manually."
echo "NOTE: SSL/HTTPS requires a domain name."
`}
                </pre>
                <CopyButton text={`#!/bin/bash
# Quick Security Fix Script for TTS Broadcast Dialer
set -e

echo "=== Installing Security Tools ==="

# 1. Install and enable UFW
sudo apt install ufw -y
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable

# 2. Install and configure Fail2Ban
sudo apt install fail2ban -y
sudo tee /etc/fail2ban/jail.d/sshd.conf << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
sudo systemctl enable --now fail2ban

# 3. Install unattended-upgrades
sudo apt install unattended-upgrades -y
sudo systemctl enable --now unattended-upgrades

# 4. Secure .env file
if [ -f /opt/tts-dialer/.env ]; then
  sudo chmod 600 /opt/tts-dialer/.env
  sudo chown root:root /opt/tts-dialer/.env
fi

echo ""
echo "=== Security Hardening Complete ==="
echo "UFW: $(sudo ufw status | head -1)"
echo "Fail2Ban: $(sudo systemctl is-active fail2ban)"
echo "Auto-updates: $(sudo systemctl is-active unattended-upgrades)"
echo ""
echo "NOTE: SSH key auth must be configured manually."
echo "NOTE: SSL/HTTPS requires a domain name."`} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
