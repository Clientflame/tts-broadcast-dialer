import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Rocket, Paintbrush, Server, Key, Mail, Bot, ShieldCheck,
  ArrowRight, ArrowLeft, Check, CheckCircle2, Circle, Loader2,
  SkipForward, Eye, EyeOff, AlertTriangle, ExternalLink,
  Wifi, WifiOff, Copy, Terminal, Sparkles, ChevronRight,
  RefreshCw, Download, Globe, Zap, X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  required: boolean;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: "welcome", title: "Welcome", description: "Let's set up your broadcast dialer", icon: Rocket, required: true },
  { id: "branding", title: "Branding", description: "Company name and appearance", icon: Paintbrush, required: true },
  { id: "freepbx", title: "FreePBX", description: "Connect your PBX server", icon: Server, required: false },
  { id: "agent", title: "PBX Agent", description: "Install the dialing agent", icon: Bot, required: false },
  { id: "apikeys", title: "API Keys", description: "TTS service credentials", icon: Key, required: false },
  { id: "smtp", title: "Email", description: "Notification settings", icon: Mail, required: false },
  { id: "health", title: "Health Check", description: "Verify all connections", icon: ShieldCheck, required: true },
];

// ─── Welcome Step ───────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6 text-center max-w-lg mx-auto">
      <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-primary/10 mx-auto">
        <Rocket className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Welcome to Your Broadcast Dialer</h2>
        <p className="text-muted-foreground mt-2">
          This wizard will guide you through configuring your system. You can skip optional steps
          and configure them later from the Settings page.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
        {[
          { icon: Paintbrush, label: "Branding", desc: "Your company name & colors" },
          { icon: Server, label: "FreePBX", desc: "Connect your PBX server" },
          { icon: Bot, label: "PBX Agent", desc: "Install the dialing agent" },
          { icon: Key, label: "API Keys", desc: "OpenAI & Google TTS" },
          { icon: Mail, label: "Email", desc: "SMTP for notifications" },
          { icon: ShieldCheck, label: "Health Check", desc: "Verify everything works" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <item.icon className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={onNext} size="lg" className="gap-2 mt-4">
        Get Started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Branding Step ──────────────────────────────────────────────────────────

function BrandingStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [appName, setAppName] = useState("AI TTS Broadcast Dialer");
  const [tagline, setTagline] = useState("Intelligent Voice Broadcasting Platform");
  const [primaryColor, setPrimaryColor] = useState("#16a34a");
  const [accentColor, setAccentColor] = useState("#f97316");

  const saveBranding = trpc.setupWizard.saveBranding.useMutation({
    onSuccess: () => {
      toast.success("Branding saved!");
      onNext();
    },
    onError: (err) => toast.error(err.message),
  });

  // Load existing branding
  const { data: branding } = trpc.appSettings.getBranding.useQuery();
  useEffect(() => {
    if (branding) {
      setAppName(branding.appName);
      if (branding.tagline) setTagline(branding.tagline);
      if (branding.primaryColor) setPrimaryColor(branding.primaryColor);
      if (branding.accentColor) setAccentColor(branding.accentColor);
    }
  }, [branding]);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Paintbrush className="h-5 w-5 text-primary" />
          Branding
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize how your dialer looks. These can be changed later in Settings.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="appName">Company / Application Name</Label>
          <Input
            id="appName"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="My Company Dialer"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="tagline">Tagline (optional)</Label>
          <Input
            id="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Intelligent Voice Broadcasting Platform"
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="primaryColor">Primary Color</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="color"
                id="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="accentColor">Accent Color</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="color"
                id="accentColor"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-2">Preview</p>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: primaryColor }}>
              {appName.charAt(0)}
            </div>
            <div>
              <p className="font-semibold" style={{ color: primaryColor }}>{appName}</p>
              <p className="text-xs text-muted-foreground">{tagline}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={() => saveBranding.mutate({ appName, tagline, primaryColor, accentColor })}
          disabled={saveBranding.isPending || !appName}
          className="gap-2"
        >
          {saveBranding.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save & Continue
        </Button>
      </div>
    </div>
  );
}

// ─── FreePBX Step ───────────────────────────────────────────────────────────

function FreePBXStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [host, setHost] = useState("");
  const [amiUser, setAmiUser] = useState("dialer");
  const [amiPassword, setAmiPassword] = useState("");
  const [amiPort, setAmiPort] = useState("5038");
  const [sshUser, setSshUser] = useState("root");
  const [sshPassword, setSshPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [testingAmi, setTestingAmi] = useState(false);
  const [testingSsh, setTestingSsh] = useState(false);
  const [amiResult, setAmiResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [sshResult, setSshResult] = useState<{ success: boolean; error?: string } | null>(null);

  const testAmi = trpc.appSettings.freepbxTestConnection.useMutation({
    onSuccess: (result) => { setAmiResult(result); setTestingAmi(false); },
    onError: (err) => { setAmiResult({ success: false, error: err.message }); setTestingAmi(false); },
  });

  const testSsh = trpc.appSettings.freepbxTestSsh.useMutation({
    onSuccess: (result) => { setSshResult(result); setTestingSsh(false); },
    onError: (err) => { setSshResult({ success: false, error: err.message }); setTestingSsh(false); },
  });

  const saveFreepbx = trpc.setupWizard.saveFreepbx.useMutation({
    onSuccess: () => {
      toast.success("FreePBX settings saved!");
      onNext();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTestAmi = () => {
    setTestingAmi(true);
    setAmiResult(null);
    testAmi.mutate({ host, port: Number(amiPort), username: amiUser, password: amiPassword });
  };

  const handleTestSsh = () => {
    setTestingSsh(true);
    setSshResult(null);
    testSsh.mutate({ host, port: 22, username: sshUser, password: sshPassword });
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          FreePBX Connection
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect to your FreePBX/Asterisk server. You need both AMI and SSH access.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="pbxHost">FreePBX Server IP or Hostname</Label>
          <Input id="pbxHost" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.100" className="mt-1.5" />
        </div>

        <Separator />
        <p className="text-sm font-medium">AMI (Asterisk Manager Interface)</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amiUser">AMI Username</Label>
            <Input id="amiUser" value={amiUser} onChange={(e) => setAmiUser(e.target.value)} placeholder="dialer" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="amiPort">AMI Port</Label>
            <Input id="amiPort" value={amiPort} onChange={(e) => setAmiPort(e.target.value)} placeholder="5038" className="mt-1.5" />
          </div>
        </div>

        <div>
          <Label htmlFor="amiPassword">AMI Password</Label>
          <div className="relative mt-1.5">
            <Input
              id="amiPassword"
              type={showPasswords ? "text" : "password"}
              value={amiPassword}
              onChange={(e) => setAmiPassword(e.target.value)}
              placeholder="AMI password"
            />
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleTestAmi} disabled={testingAmi || !host || !amiUser || !amiPassword} className="gap-2">
          {testingAmi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
          Test AMI Connection
        </Button>
        {amiResult && (
          <div className={`text-sm flex items-center gap-2 ${amiResult.success ? "text-green-500" : "text-red-500"}`}>
            {amiResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {amiResult.success ? "AMI connection successful!" : amiResult.error}
          </div>
        )}

        <Separator />
        <p className="text-sm font-medium">SSH Access (for PBX Agent installation)</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sshUser">SSH Username</Label>
            <Input id="sshUser" value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="root" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="sshPassword">SSH Password</Label>
            <div className="relative mt-1.5">
              <Input
                id="sshPassword"
                type={showPasswords ? "text" : "password"}
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
                placeholder="SSH password"
              />
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleTestSsh} disabled={testingSsh || !host || !sshUser || !sshPassword} className="gap-2">
          {testingSsh ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
          Test SSH Connection
        </Button>
        {sshResult && (
          <div className={`text-sm flex items-center gap-2 ${sshResult.success ? "text-green-500" : "text-red-500"}`}>
            {sshResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {sshResult.success ? "SSH connection successful!" : sshResult.error}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button
            onClick={() => saveFreepbx.mutate({ host, amiUser, amiPassword, amiPort: Number(amiPort), sshUser, sshPassword })}
            disabled={saveFreepbx.isPending || !host || !amiUser || !amiPassword || !sshUser || !sshPassword}
            className="gap-2"
          >
            {saveFreepbx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── PBX Agent Step ─────────────────────────────────────────────────────────

function AgentStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  const { data: agents = [], refetch: refetchAgents } = trpc.freepbx.listAgents.useQuery(undefined, { refetchInterval: 5000 });
  const { data: freepbxStatus } = trpc.freepbx.status.useQuery(undefined, { refetchInterval: 5000 });

  const registerAgent = trpc.freepbx.registerAgent.useMutation({
    onSuccess: (result) => {
      setAgentId(result.agentId);
      toast.success("PBX agent registered!");
      refetchAgents();
    },
    onError: (err) => toast.error(err.message),
  });

  const remoteInstall = trpc.setupWizard.remoteInstallAgent.useMutation({
    onSuccess: (result) => {
      setInstalling(false);
      if (result.success) {
        setInstallOutput(result.output);
        setInstallError(null);
        toast.success("PBX Agent installed successfully!");
        refetchAgents();
      } else {
        setInstallError(result.error || "Installation failed");
        setInstallOutput(result.output || null);
      }
    },
    onError: (err) => {
      setInstalling(false);
      setInstallError(err.message);
    },
  });

  const markDone = trpc.setupWizard.markAgentDone.useMutation({
    onSuccess: () => onNext(),
  });

  const hasOnlineAgent = freepbxStatus?.connected ?? false;
  const existingAgent = agents.length > 0 ? agents[0] : null;
  const effectiveAgentId = agentId || (existingAgent as any)?.agentId;

  const handleRegisterAndInstall = async () => {
    if (!effectiveAgentId) {
      // Register first
      registerAgent.mutate({ name: "Primary PBX Agent", maxCalls: 5, cpsLimit: 1, cpsPacingMs: 1000 });
    }
  };

  const handleRemoteInstall = () => {
    if (!effectiveAgentId) return;
    setInstalling(true);
    setInstallOutput(null);
    setInstallError(null);
    remoteInstall.mutate({ agentId: effectiveAgentId, origin: window.location.origin });
  };

  // Auto-trigger remote install after registration
  useEffect(() => {
    if (agentId && !installing && !installOutput && !installError) {
      handleRemoteInstall();
    }
  }, [agentId]);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          PBX Agent Installation
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          The PBX agent runs on your FreePBX server and handles call origination.
          {agents.length === 0 ? " We'll register and install it automatically via SSH." : ""}
        </p>
      </div>

      {/* Status */}
      {hasOnlineAgent && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
          <div>
            <p className="font-medium text-green-600 dark:text-green-400">PBX Agent Online</p>
            <p className="text-sm text-muted-foreground">
              {agents.length} agent(s) registered and connected. You're all set!
            </p>
          </div>
        </div>
      )}

      {!hasOnlineAgent && agents.length > 0 && !installing && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0" />
          <div>
            <p className="font-medium text-yellow-600 dark:text-yellow-400">Agent Registered but Offline</p>
            <p className="text-sm text-muted-foreground">
              The agent is registered but not sending heartbeats. Try installing it remotely.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      {!hasOnlineAgent && (
        <div className="space-y-3">
          {agents.length === 0 && (
            <Button
              onClick={handleRegisterAndInstall}
              disabled={registerAgent.isPending || installing}
              className="w-full gap-2"
              size="lg"
            >
              {registerAgent.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Registering...</>
              ) : (
                <><Download className="h-4 w-4" /> Register & Install PBX Agent via SSH</>
              )}
            </Button>
          )}

          {agents.length > 0 && !installing && (
            <Button onClick={handleRemoteInstall} className="w-full gap-2" size="lg">
              <Download className="h-4 w-4" /> Re-install PBX Agent via SSH
            </Button>
          )}

          {installing && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="font-medium">Installing PBX Agent...</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Connecting via SSH, downloading agent, configuring systemd service...
                This may take 30-60 seconds.
              </p>
              <Progress value={50} className="h-1.5" />
            </div>
          )}

          {installOutput && !installError && (
            <div className="rounded-lg bg-gray-900 p-3 max-h-40 overflow-y-auto">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{installOutput.slice(-2000)}</pre>
            </div>
          )}

          {installError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <p className="font-medium text-red-500">Installation Failed</p>
              </div>
              <p className="text-sm text-muted-foreground">{installError}</p>
              {installOutput && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Show output</summary>
                  <pre className="text-xs text-muted-foreground font-mono mt-1 whitespace-pre-wrap max-h-32 overflow-y-auto">{installOutput.slice(-2000)}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> The PBX agent requires SSH access configured in the previous step.
          If remote install fails, you can manually install by running the command shown on the FreePBX page.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button onClick={() => markDone.mutate()} disabled={markDone.isPending} className="gap-2">
            {markDone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {hasOnlineAgent ? "Continue" : "Continue Anyway"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── API Keys Step ──────────────────────────────────────────────────────────

function ApiKeysStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [testingOpenai, setTestingOpenai] = useState(false);
  const [testingGoogle, setTestingGoogle] = useState(false);
  const [openaiResult, setOpenaiResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [googleResult, setGoogleResult] = useState<{ success: boolean; error?: string } | null>(null);

  const testTtsKey = trpc.appSettings.testTtsKey.useMutation();

  const saveApiKeys = trpc.setupWizard.saveApiKeys.useMutation({
    onSuccess: () => {
      toast.success("API keys saved!");
      onNext();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTestOpenai = async () => {
    setTestingOpenai(true);
    setOpenaiResult(null);
    try {
      const result = await testTtsKey.mutateAsync({ provider: "openai", apiKey: openaiKey });
      setOpenaiResult({ success: result.valid, error: result.error || undefined });
    } catch (err: any) {
      setOpenaiResult({ success: false, error: err.message });
    }
    setTestingOpenai(false);
  };

  const handleTestGoogle = async () => {
    setTestingGoogle(true);
    setGoogleResult(null);
    try {
      const result = await testTtsKey.mutateAsync({ provider: "google", apiKey: googleKey });
      setGoogleResult({ success: result.valid, error: result.error || undefined });
    } catch (err: any) {
      setGoogleResult({ success: false, error: err.message });
    }
    setTestingGoogle(false);
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          API Keys
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your TTS (Text-to-Speech) API keys. You need at least one provider.
        </p>
      </div>

      <div className="space-y-5">
        {/* OpenAI */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <p className="font-medium">OpenAI TTS</p>
            </div>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
              Get API Key <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">High-quality voices: alloy, echo, fable, onyx, nova, shimmer</p>
          <div className="relative">
            <Input
              type={showKeys ? "text" : "password"}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
            />
            <button
              type="button"
              onClick={() => setShowKeys(!showKeys)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTestOpenai} disabled={testingOpenai || !openaiKey} className="gap-1.5">
              {testingOpenai ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Test
            </Button>
            {openaiResult && (
              <span className={`text-sm flex items-center gap-1 ${openaiResult.success ? "text-green-500" : "text-red-500"}`}>
                {openaiResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {openaiResult.success ? "Valid!" : (openaiResult.error || "Invalid")}
              </span>
            )}
          </div>
        </div>

        {/* Google TTS */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              <p className="font-medium">Google Cloud TTS</p>
            </div>
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
              Get API Key <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">400+ voices across 50+ languages. Journey, Studio, Neural2, Wavenet.</p>
          <div className="relative">
            <Input
              type={showKeys ? "text" : "password"}
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              placeholder="AIza..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTestGoogle} disabled={testingGoogle || !googleKey} className="gap-1.5">
              {testingGoogle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Test
            </Button>
            {googleResult && (
              <span className={`text-sm flex items-center gap-1 ${googleResult.success ? "text-green-500" : "text-red-500"}`}>
                {googleResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {googleResult.success ? "Valid!" : (googleResult.error || "Invalid")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button
            onClick={() => saveApiKeys.mutate({ openaiKey: openaiKey || undefined, googleTtsKey: googleKey || undefined })}
            disabled={saveApiKeys.isPending || (!openaiKey && !googleKey)}
            className="gap-2"
          >
            {saveApiKeys.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── SMTP Step ──────────────────────────────────────────────────────────────

function SmtpStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [showPass, setShowPass] = useState(false);

  const saveSmtp = trpc.setupWizard.saveSmtp.useMutation({
    onSuccess: () => {
      toast.success("SMTP settings saved!");
      onNext();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Email Notifications (SMTP)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure SMTP to receive campaign completion alerts and system notifications.
          This is optional — you can set it up later.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="smtpHost">SMTP Host</Label>
            <Input id="smtpHost" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="smtpPort">Port</Label>
            <Input id="smtpPort" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" className="mt-1.5" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="smtpSecure" checked={secure} onCheckedChange={setSecure} />
          <Label htmlFor="smtpSecure">Use TLS/SSL</Label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="smtpUser">Username</Label>
            <Input id="smtpUser" value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@gmail.com" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="smtpPass">Password</Label>
            <div className="relative mt-1.5">
              <Input
                id="smtpPass"
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="App password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="fromEmail">From Email</Label>
            <Input id="fromEmail" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@company.com" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="fromName">From Name</Label>
            <Input id="fromName" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="TTS Dialer" className="mt-1.5" />
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button
            onClick={() => saveSmtp.mutate({ host, port: Number(port), secure, user, pass, fromEmail, fromName })}
            disabled={saveSmtp.isPending || !host || !user || !pass || !fromEmail || !fromName}
            className="gap-2"
          >
            {saveSmtp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Health Check Step ──────────────────────────────────────────────────────

function HealthCheckStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const { data: healthData, isLoading, refetch } = trpc.setupWizard.healthCheck.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const [, setLocation] = useLocation();

  const completeWizard = trpc.setupWizard.complete.useMutation({
    onSuccess: () => {
      toast.success("Setup complete! Welcome to your broadcast dialer.");
      onFinish();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "ok": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "error": return <X className="h-5 w-5 text-red-500" />;
      case "unconfigured": return <Circle className="h-5 w-5 text-muted-foreground" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case "ok": return "border-green-500/20 bg-green-500/5";
      case "warning": return "border-yellow-500/20 bg-yellow-500/5";
      case "error": return "border-red-500/20 bg-red-500/5";
      default: return "border-border bg-muted/30";
    }
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          System Health Check
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Verifying all services and connections. Items marked as "unconfigured" can be set up later.
        </p>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground">Running health checks...</p>
        </div>
      ) : healthData ? (
        <div className="space-y-2">
          {healthData.checks.map((check: any) => (
            <div key={check.name} className={`rounded-lg border p-3 flex items-center gap-3 ${statusBg(check.status)}`}>
              {statusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{check.name}</p>
                <p className="text-xs text-muted-foreground">{check.message}</p>
              </div>
              {check.fixUrl && check.status !== "ok" && (
                <Button variant="ghost" size="sm" onClick={() => setLocation(check.fixUrl!)} className="text-xs shrink-0">
                  Fix
                </Button>
              )}
            </div>
          ))}

          {/* Summary */}
          <div className="rounded-lg border p-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {healthData.summary.ok} of {healthData.summary.total} services healthy
                </p>
                <p className="text-xs text-muted-foreground">
                  {healthData.summary.warning > 0 && `${healthData.summary.warning} warning(s). `}
                  {healthData.summary.unconfigured > 0 && `${healthData.summary.unconfigured} not configured yet.`}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={() => completeWizard.mutate()}
          disabled={completeWizard.isPending}
          size="lg"
          className="gap-2"
        >
          {completeWizard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Finish Setup
        </Button>
      </div>
    </div>
  );
}

// ─── Main Wizard ────────────────────────────────────────────────────────────

export default function SetupWizard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);

  const { data: progress } = trpc.setupWizard.getProgress.useQuery(undefined, {
    enabled: !!user,
  });

  const skipWizard = trpc.setupWizard.skip.useMutation({
    onSuccess: () => {
      toast.success("Setup wizard skipped. You can configure everything from Settings.");
      setLocation("/");
    },
  });

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleFinish = () => {
    setLocation("/");
  };

  // Calculate step completion based on progress
  const getStepStatus = (stepId: string): boolean => {
    if (!progress) return false;
    switch (stepId) {
      case "welcome": return true;
      case "branding": return progress.branding;
      case "freepbx": return progress.freepbx;
      case "agent": return progress.agent;
      case "apikeys": return progress.apiKeys;
      case "smtp": return progress.smtp;
      case "health": return false; // Always show as current
      default: return false;
    }
  };

  const completedCount = progress
    ? [progress.branding, progress.freepbx, progress.agent, progress.apiKeys, progress.smtp].filter(Boolean).length
    : 0;
  const progressPercent = ((currentStep) / (WIZARD_STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Rocket className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Setup Wizard</p>
              <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {WIZARD_STEPS.length}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => skipWizard.mutate()}
            disabled={skipWizard.isPending}
            className="text-muted-foreground gap-1.5"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip Wizard
          </Button>
        </div>

        {/* Step indicators */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-1">
            {WIZARD_STEPS.map((step, index) => {
              const isCompleted = getStepStatus(step.id);
              const isCurrent = index === currentStep;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(index)}
                  className={`flex-1 h-1.5 rounded-full transition-all ${
                    isCurrent
                      ? "bg-primary"
                      : isCompleted
                      ? "bg-green-500"
                      : index < currentStep
                      ? "bg-primary/30"
                      : "bg-muted"
                  }`}
                  title={step.title}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            {WIZARD_STEPS.map((step, index) => {
              const isCompleted = getStepStatus(step.id);
              const isCurrent = index === currentStep;
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(index)}
                  className={`flex flex-col items-center gap-0.5 transition-all ${
                    isCurrent ? "text-primary" : isCompleted ? "text-green-500" : "text-muted-foreground"
                  }`}
                  title={step.title}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium hidden sm:block">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {currentStep === 0 && <WelcomeStep onNext={goNext} />}
        {currentStep === 1 && <BrandingStep onNext={goNext} onBack={goBack} />}
        {currentStep === 2 && <FreePBXStep onNext={goNext} onBack={goBack} />}
        {currentStep === 3 && <AgentStep onNext={goNext} onBack={goBack} />}
        {currentStep === 4 && <ApiKeysStep onNext={goNext} onBack={goBack} />}
        {currentStep === 5 && <SmtpStep onNext={goNext} onBack={goBack} />}
        {currentStep === 6 && <HealthCheckStep onFinish={handleFinish} onBack={goBack} />}
      </div>
    </div>
  );
}
