import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  CheckCircle2, AlertTriangle, XCircle, Settings,
  RefreshCw, Copy, Check, ExternalLink, Terminal,
  Lock, Globe, Server, FileKey, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";

// Remediation data for each security check
const remediationGuides: Record<string, {
  icon: any;
  description: string;
  why: string;
  steps: Array<{ label: string; command?: string; note?: string }>;
  learnMore?: string;
}> = {
  "Firewall (UFW)": {
    icon: Shield,
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

function SecurityCheckCard({ check }: { check: { name: string; status: string; message: string; detail?: string } }) {
  const guide = remediationGuides[check.name];
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
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Remediation steps */}
        {!isOk && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Terminal className="h-4 w-4" />
              How to fix
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
                Security status and remediation guides for your self-hosted deployment
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
            {/* Failed checks first, then warnings, then passed */}
            {[...security.data.checks]
              .sort((a: any, b: any) => {
                const order: Record<string, number> = { error: 0, warning: 1, unconfigured: 2, ok: 3 };
                return (order[a.status] ?? 2) - (order[b.status] ?? 2);
              })
              .map((check: any) => (
                <SecurityCheckCard key={check.name} check={check} />
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
