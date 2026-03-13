import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Settings as SettingsIcon, Key, Eye, EyeOff, CheckCircle2, XCircle,
  Loader2, ExternalLink, Save, Server, FlaskConical, ShieldCheck, ShieldAlert,
  PlugZap, Unplug, Wifi, Terminal, RotateCcw, AlertTriangle, Bell, BellOff,
  Mail,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Known setting keys for TTS API configuration
const TTS_SETTINGS = [
  {
    key: "openai_api_key",
    label: "OpenAI API Key",
    description: "Used for OpenAI TTS voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer). Higher quality, ~$15/1M characters.",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpLabel: "Get API Key",
    isSecret: 1,
    provider: "openai" as const,
  },
  {
    key: "google_tts_api_key",
    label: "Google Cloud TTS API Key",
    description: "Used for Google TTS voices (Journey, Studio, Neural2, Wavenet). More voice options, ~$4/1M characters.",
    placeholder: "AIza...",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    helpLabel: "Get API Key",
    isSecret: 1,
    provider: "google" as const,
  },
];

// FreePBX connection settings
const FREEPBX_SETTINGS = [
  { key: "freepbx_host", label: "FreePBX Host / IP", placeholder: "192.168.1.100", isSecret: 0, type: "text" },
  { key: "freepbx_ami_user", label: "AMI Username", placeholder: "broadcast_dialer", isSecret: 0, type: "text" },
  { key: "freepbx_ami_password", label: "AMI Password", placeholder: "Enter AMI password", isSecret: 1, type: "password" },
  { key: "freepbx_ami_port", label: "AMI Port", placeholder: "5038", isSecret: 0, type: "text" },
  { key: "freepbx_ssh_user", label: "SSH Username", placeholder: "root", isSecret: 0, type: "text" },
  { key: "freepbx_ssh_password", label: "SSH Password", placeholder: "Enter SSH password", isSecret: 1, type: "password" },
];

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-6 w-6" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your application settings, API keys, and FreePBX connection.
          </p>
        </div>

        <Separator />

        {isAdmin ? (
          <>
            <TTSApiKeysSection />
            <FreePBXSettingsSection />
            <SmtpSettingsSection />
            <NotificationPreferencesSection />
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>Only administrators can manage settings.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function TTSApiKeysSection() {
  const settingsList = trpc.appSettings.list.useQuery();
  const ttsStatus = trpc.appSettings.ttsStatus.useQuery();
  const bulkUpdate = trpc.appSettings.bulkUpdate.useMutation();
  const testKey = trpc.appSettings.testTtsKey.useMutation();
  const utils = trpc.useUtils();

  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; error: string | null; detail?: string } | null>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);

  useEffect(() => {
    if (settingsList.data) {
      const initial: Record<string, string> = {};
      for (const setting of TTS_SETTINGS) {
        const serverVal = settingsList.data.find(s => s.key === setting.key);
        initial[setting.key] = serverVal?.value && serverVal.value !== "••••••••" ? serverVal.value : "";
      }
      setValues(initial);
    }
  }, [settingsList.data]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
    // Clear test result when key changes
    setTestResults(prev => ({ ...prev, [key]: null }));
  };

  const handleSave = async () => {
    const updates = TTS_SETTINGS
      .filter(s => (values[s.key] || "").length > 0)
      .map(s => ({
        key: s.key,
        value: values[s.key] || null,
        description: s.description,
        isSecret: s.isSecret,
      }));

    if (updates.length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await bulkUpdate.mutateAsync(updates);
      await utils.appSettings.list.invalidate();
      await utils.appSettings.ttsStatus.invalidate();
      setIsDirty(false);
      toast.success("API keys saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
  };

  const handleClear = async (key: string) => {
    try {
      await bulkUpdate.mutateAsync([{ key, value: null, isSecret: 1 }]);
      setValues(prev => ({ ...prev, [key]: "" }));
      setTestResults(prev => ({ ...prev, [key]: null }));
      await utils.appSettings.list.invalidate();
      await utils.appSettings.ttsStatus.invalidate();
      toast.success("API key cleared");
    } catch (err: any) {
      toast.error(err.message || "Failed to clear key");
    }
  };

  const handleTestKey = async (setting: typeof TTS_SETTINGS[0]) => {
    const keyValue = values[setting.key];
    if (!keyValue) {
      toast.error("Enter an API key first");
      return;
    }
    setTestingKey(setting.key);
    setTestResults(prev => ({ ...prev, [setting.key]: null }));
    try {
      const result = await testKey.mutateAsync({
        provider: setting.provider,
        apiKey: keyValue,
      });
      setTestResults(prev => ({ ...prev, [setting.key]: result }));
      if (result.valid) {
        toast.success(`${setting.label} is valid!${result.detail ? ` ${result.detail}` : ""}`);
      } else {
        toast.error(`${setting.label} test failed: ${result.error}`);
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [setting.key]: { valid: false, error: err.message } }));
      toast.error(err.message || "Test failed");
    } finally {
      setTestingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          TTS API Keys
        </CardTitle>
        <CardDescription>
          Configure your text-to-speech API keys. You need at least one key to generate voice audio for campaigns.
          Keys entered here are stored securely in the database and take priority over environment variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status summary */}
        <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
          <StatusBadge label="OpenAI TTS" configured={ttsStatus.data?.openaiConfigured ?? false} loading={ttsStatus.isLoading} />
          <StatusBadge label="Google TTS" configured={ttsStatus.data?.googleConfigured ?? false} loading={ttsStatus.isLoading} />
        </div>

        {/* Key inputs */}
        {TTS_SETTINGS.map(setting => {
          const hasServerValue = settingsList.data?.some(s => s.key === setting.key && s.value && s.value !== "");
          const result = testResults[setting.key];
          return (
            <div key={setting.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={setting.key} className="text-sm font-medium">
                  {setting.label}
                </Label>
                <a
                  href={setting.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {setting.helpLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-muted-foreground">{setting.description}</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={setting.key}
                    type={showValues[setting.key] ? "text" : "password"}
                    placeholder={hasServerValue ? "••••••••  (key saved — enter new value to replace)" : setting.placeholder}
                    value={values[setting.key] || ""}
                    onChange={e => handleChange(setting.key, e.target.value)}
                    className={`pr-10 font-mono text-sm ${result ? (result.valid ? "border-green-500" : "border-red-500") : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowValues(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showValues[setting.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => handleTestKey(setting)}
                  disabled={!values[setting.key] || testingKey === setting.key}
                >
                  {testingKey === setting.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5" />
                  )}
                  Test
                </Button>
                {hasServerValue && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => handleClear(setting.key)}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {/* Test result feedback */}
              {result && (
                <div className={`flex items-center gap-2 text-xs mt-1 ${result.valid ? "text-green-600" : "text-red-500"}`}>
                  {result.valid ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                  <span>{result.valid ? `Key is valid${result.detail ? ` — ${result.detail}` : ""}` : result.error}</span>
                </div>
              )}
            </div>
          );
        })}

        <Separator />

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!isDirty || bulkUpdate.isPending}
            className="gap-2"
          >
            {bulkUpdate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save API Keys
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FreePBXSettingsSection() {
  const settingsList = trpc.appSettings.list.useQuery();
  const freepbxStatus = trpc.appSettings.freepbxStatus.useQuery();
  const saveAndReconnect = trpc.appSettings.freepbxSaveAndReconnect.useMutation();
  const reconnect = trpc.appSettings.freepbxReconnect.useMutation();
  const testAmi = trpc.appSettings.freepbxTestConnection.useMutation();
  const testSsh = trpc.appSettings.freepbxTestSsh.useMutation();
  const restartFreepbx = trpc.appSettings.freepbxRestart.useMutation();
  const utils = trpc.useUtils();

  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [amiTestResult, setAmiTestResult] = useState<{ success: boolean; error?: string; latencyMs?: number } | null>(null);
  const [sshTestResult, setSshTestResult] = useState<{ success: boolean; error?: string; latencyMs?: number } | null>(null);
  const [reconnectResult, setReconnectResult] = useState<{ success: boolean; host?: string; error?: string } | null>(null);
  const [restartResult, setRestartResult] = useState<{ success: boolean; output?: string; error?: string } | null>(null);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  useEffect(() => {
    if (settingsList.data && freepbxStatus.data) {
      const initial: Record<string, string> = {};
      for (const setting of FREEPBX_SETTINGS) {
        const serverVal = settingsList.data.find(s => s.key === setting.key);
        if (serverVal?.value && serverVal.value !== "••••••••") {
          initial[setting.key] = serverVal.value;
        } else {
          // Pre-fill from freepbxStatus (which reads env vars)
          if (setting.key === "freepbx_host") initial[setting.key] = freepbxStatus.data.host || "";
          else if (setting.key === "freepbx_ami_user") initial[setting.key] = freepbxStatus.data.amiUser || "";
          else if (setting.key === "freepbx_ami_port") initial[setting.key] = freepbxStatus.data.amiPort || "5038";
          else if (setting.key === "freepbx_ssh_user") initial[setting.key] = freepbxStatus.data.sshUser || "";
          else initial[setting.key] = "";
        }
      }
      setValues(initial);
    }
  }, [settingsList.data, freepbxStatus.data]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    const updates = FREEPBX_SETTINGS
      .filter(s => (values[s.key] || "").length > 0)
      .map(s => ({
        key: s.key,
        value: values[s.key] || null,
        description: `FreePBX ${s.label}`,
        isSecret: s.isSecret,
      }));

    if (updates.length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      const result = await saveAndReconnect.mutateAsync(updates);
      await utils.appSettings.list.invalidate();
      await utils.appSettings.freepbxStatus.invalidate();
      setIsDirty(false);
      setAmiTestResult(null);
      setSshTestResult(null);
      if (result.reconnect.success) {
        setReconnectResult({ success: true, host: result.reconnect.host });
        toast.success(`Settings saved & AMI reconnected to ${result.reconnect.host}:${result.reconnect.port}`);
      } else {
        setReconnectResult({ success: false, error: result.reconnect.error });
        toast.success("Settings saved.");
        toast.error(`AMI auto-reconnect failed: ${result.reconnect.error}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
  };

  const handleTestAmi = async () => {
    const host = values["freepbx_host"];
    const username = values["freepbx_ami_user"];
    const password = values["freepbx_ami_password"];
    const port = parseInt(values["freepbx_ami_port"] || "5038");

    if (!host || !username || !password) {
      toast.error("Fill in Host, AMI Username, and AMI Password to test");
      return;
    }

    setAmiTestResult(null);
    try {
      const result = await testAmi.mutateAsync({ host, port, username, password });
      setAmiTestResult(result);
      if (result.success) {
        toast.success(`AMI connection successful (${result.latencyMs}ms)`);
      } else {
        toast.error(`AMI connection failed: ${result.error}`);
      }
    } catch (err: any) {
      setAmiTestResult({ success: false, error: err.message });
      toast.error(err.message || "AMI test failed");
    }
  };

  const handleTestSsh = async () => {
    const host = values["freepbx_host"];
    const username = values["freepbx_ssh_user"];
    const password = values["freepbx_ssh_password"];

    if (!host || !username || !password) {
      toast.error("Fill in Host, SSH Username, and SSH Password to test");
      return;
    }

    setSshTestResult(null);
    try {
      const result = await testSsh.mutateAsync({ host, port: 22, username, password });
      setSshTestResult(result);
      if (result.success) {
        toast.success(`SSH connection successful (${result.latencyMs}ms)`);
      } else {
        toast.error(`SSH connection failed: ${result.error}`);
      }
    } catch (err: any) {
      setSshTestResult({ success: false, error: err.message });
      toast.error(err.message || "SSH test failed");
    }
  };

  const handleReconnect = async () => {
    setReconnectResult(null);
    try {
      const result = await reconnect.mutateAsync();
      setReconnectResult(result);
      if (result.success) {
        toast.success(`Reconnected to ${result.host}:${result.port}`);
      } else {
        toast.error(`Reconnect failed: ${result.error}`);
      }
    } catch (err: any) {
      setReconnectResult({ success: false, error: err.message });
      toast.error(err.message || "Reconnect failed");
    }
  };

  const handleRestartFreePBX = async () => {
    setShowRestartConfirm(false);
    setRestartResult(null);
    try {
      const result = await restartFreepbx.mutateAsync();
      setRestartResult(result);
      if (result.success) {
        toast.success("FreePBX services restarted successfully");
      } else {
        toast.error(`FreePBX restart failed: ${result.error}`);
      }
    } catch (err: any) {
      setRestartResult({ success: false, error: err.message });
      toast.error(err.message || "FreePBX restart failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          FreePBX Connection
        </CardTitle>
        <CardDescription>
          Configure your FreePBX server connection. These settings are used by the PBX agent for AMI communication
          and SSH access. Settings here override environment variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status summary */}
        <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
          <StatusBadge label="Host" configured={freepbxStatus.data?.hostConfigured ?? false} loading={freepbxStatus.isLoading} />
          <StatusBadge label="AMI Credentials" configured={freepbxStatus.data?.amiConfigured ?? false} loading={freepbxStatus.isLoading} />
          <StatusBadge label="SSH Credentials" configured={freepbxStatus.data?.sshConfigured ?? false} loading={freepbxStatus.isLoading} />
        </div>

        {/* Settings inputs */}
        <div className="grid gap-4">
          {FREEPBX_SETTINGS.map(setting => {
            const isPassword = setting.isSecret === 1;
            const showPassword = showValues[setting.key];
            return (
              <div key={setting.key} className="space-y-1.5">
                <Label htmlFor={setting.key} className="text-sm font-medium">
                  {setting.label}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={setting.key}
                      type={isPassword && !showPassword ? "password" : "text"}
                      placeholder={setting.placeholder}
                      value={values[setting.key] || ""}
                      onChange={e => handleChange(setting.key, e.target.value)}
                      className={`${isPassword ? "pr-10" : ""} font-mono text-sm`}
                    />
                    {isPassword && (
                      <button
                        type="button"
                        onClick={() => setShowValues(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Test result feedback */}
        <div className="space-y-2">
          {amiTestResult && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${amiTestResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
              {amiTestResult.success ? <Wifi className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}
              <span>
                {amiTestResult.success
                  ? `AMI connection successful${amiTestResult.latencyMs ? ` (${amiTestResult.latencyMs}ms)` : ""}`
                  : `AMI connection failed: ${amiTestResult.error}`}
              </span>
            </div>
          )}
          {sshTestResult && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${sshTestResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
              {sshTestResult.success ? <Terminal className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}
              <span>
                {sshTestResult.success
                  ? `SSH connection successful${sshTestResult.latencyMs ? ` (${sshTestResult.latencyMs}ms)` : ""}`
                  : `SSH connection failed: ${sshTestResult.error}`}
              </span>
            </div>
          )}
          {reconnectResult && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${reconnectResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
              {reconnectResult.success ? <PlugZap className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}
              <span>
                {reconnectResult.success
                  ? `AMI reconnected to ${reconnectResult.host}`
                  : `Reconnect failed: ${reconnectResult.error}`}
              </span>
            </div>
          )}
          {restartResult && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${restartResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
              {restartResult.success ? <RotateCcw className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <div className="flex-1">
                <span>
                  {restartResult.success
                    ? "FreePBX services restarted successfully"
                    : `FreePBX restart failed: ${restartResult.error}`}
                </span>
                {restartResult.output && (
                  <pre className="mt-2 text-xs bg-black/10 dark:bg-white/5 p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">{restartResult.output}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestAmi}
              disabled={testAmi.isPending}
              className="gap-1.5"
            >
              {testAmi.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              Test AMI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestSsh}
              disabled={testSsh.isPending}
              className="gap-1.5"
            >
              {testSsh.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Terminal className="h-3.5 w-3.5" />
              )}
              Test SSH
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconnect}
              disabled={reconnect.isPending}
              className="gap-1.5"
            >
              {reconnect.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              Reconnect
            </Button>
          </div>
          <div className="flex gap-2">
            {showRestartConfirm ? (
              <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600 dark:text-amber-400">Restart FreePBX services?</span>
                <Button size="sm" variant="destructive" onClick={handleRestartFreePBX} disabled={restartFreepbx.isPending} className="gap-1.5 h-7">
                  {restartFreepbx.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRestartConfirm(false)} className="h-7">
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRestartConfirm(true)}
                disabled={restartFreepbx.isPending}
                className="gap-1.5 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
              >
                {restartFreepbx.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Restart FreePBX
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!isDirty || saveAndReconnect.isPending}
              className="gap-2"
            >
              {saveAndReconnect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save & Reconnect
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// SMTP settings for email sending (password resets, notifications)
const SMTP_SETTINGS = [
  { key: "smtp_host", label: "SMTP Host", placeholder: "smtp.gmail.com", isSecret: 0, type: "text" },
  { key: "smtp_port", label: "SMTP Port", placeholder: "587", isSecret: 0, type: "text" },
  { key: "smtp_secure", label: "Use TLS/SSL", placeholder: "false", isSecret: 0, type: "toggle" },
  { key: "smtp_user", label: "SMTP Username", placeholder: "your@email.com", isSecret: 0, type: "text" },
  { key: "smtp_pass", label: "SMTP Password", placeholder: "App password or SMTP password", isSecret: 1, type: "password" },
  { key: "smtp_from_email", label: "From Email", placeholder: "noreply@yourdomain.com", isSecret: 0, type: "text" },
  { key: "smtp_from_name", label: "From Name", placeholder: "TTS Broadcast Dialer", isSecret: 0, type: "text" },
];

function SmtpSettingsSection() {
  const settingsList = trpc.appSettings.list.useQuery();
  const smtpStatus = trpc.appSettings.smtpStatus.useQuery();
  const bulkUpdate = trpc.appSettings.bulkUpdate.useMutation();
  const testSmtp = trpc.appSettings.testSmtp.useMutation();
  const utils = trpc.useUtils();

  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (settingsList.data) {
      const initial: Record<string, string> = {};
      for (const setting of SMTP_SETTINGS) {
        const serverVal = settingsList.data.find(s => s.key === setting.key);
        initial[setting.key] = serverVal?.value && serverVal.value !== "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" ? serverVal.value : "";
      }
      setValues(initial);
    }
  }, [settingsList.data]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setTestResult(null);
  };

  const handleSave = async () => {
    const updates = SMTP_SETTINGS
      .filter(s => (values[s.key] || "").length > 0)
      .map(s => ({
        key: s.key,
        value: values[s.key] || null,
        description: `SMTP ${s.label}`,
        isSecret: s.isSecret,
      }));

    if (updates.length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await bulkUpdate.mutateAsync(updates);
      await utils.appSettings.list.invalidate();
      await utils.appSettings.smtpStatus.invalidate();
      setIsDirty(false);
      toast.success("SMTP settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save SMTP settings");
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testSmtp.mutateAsync();
      setTestResult(result);
      if (result.success) {
        toast.success("SMTP connection successful");
      } else {
        toast.error(`SMTP test failed: ${result.error}`);
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
      toast.error(err.message || "SMTP test failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email / SMTP Settings
        </CardTitle>
        <CardDescription>
          Configure SMTP settings to enable password reset emails and other notifications.
          For Gmail, use an App Password (not your regular password) with smtp.gmail.com on port 587.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
          <StatusBadge label="SMTP" configured={smtpStatus.data?.configured ?? false} loading={smtpStatus.isLoading} />
          {smtpStatus.data?.configured && smtpStatus.data.fromEmail && (
            <span className="text-xs text-muted-foreground">Sending as: {smtpStatus.data.fromName} &lt;{smtpStatus.data.fromEmail}&gt;</span>
          )}
        </div>

        {/* Settings inputs */}
        <div className="grid gap-4">
          {SMTP_SETTINGS.filter(s => s.type !== "toggle").map(setting => {
            const isPassword = setting.isSecret === 1;
            const showPassword = showValues[setting.key];
            return (
              <div key={setting.key} className="space-y-1.5">
                <Label htmlFor={setting.key} className="text-sm font-medium">
                  {setting.label}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={setting.key}
                      type={isPassword && !showPassword ? "password" : "text"}
                      placeholder={setting.placeholder}
                      value={values[setting.key] || ""}
                      onChange={e => handleChange(setting.key, e.target.value)}
                      className={`${isPassword ? "pr-10" : ""} font-mono text-sm`}
                    />
                    {isPassword && (
                      <button
                        type="button"
                        onClick={() => setShowValues(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* TLS toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="text-sm font-medium">Use TLS/SSL</Label>
              <p className="text-xs text-muted-foreground">Enable for port 465 (SSL) or STARTTLS on port 587</p>
            </div>
            <Switch
              checked={values["smtp_secure"] === "true"}
              onCheckedChange={(checked) => handleChange("smtp_secure", checked ? "true" : "false")}
            />
          </div>
        </div>

        <Separator />

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${testResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
            {testResult.success ? <Mail className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span>
              {testResult.success
                ? "SMTP connection verified successfully"
                : `SMTP test failed: ${testResult.error}`}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testSmtp.isPending}
            className="gap-1.5"
          >
            {testSmtp.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            Test Connection
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || bulkUpdate.isPending}
            className="gap-2"
          >
            {bulkUpdate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save SMTP Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationPreferencesSection() {
  const prefsQuery = trpc.appSettings.getNotificationPrefs.useQuery();
  const setPref = trpc.appSettings.setNotificationPref.useMutation();
  const utils = trpc.useUtils();

  const [localPrefs, setLocalPrefs] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (prefsQuery.data && !initialized) {
      const prefs: Record<string, boolean> = {};
      // preferences is Record<string, boolean> from backend
      for (const type of prefsQuery.data.types) {
        prefs[type.key] = prefsQuery.data.preferences[type.key] ?? false;
      }
      setLocalPrefs(prefs);
      setInitialized(true);
    }
  }, [prefsQuery.data, initialized]);

  const handleToggle = async (key: string, enabled: boolean) => {
    setLocalPrefs(prev => ({ ...prev, [key]: enabled }));
    try {
      await setPref.mutateAsync({ key, enabled });
      await utils.appSettings.getNotificationPrefs.invalidate();
      toast.success(`Notification ${enabled ? "enabled" : "disabled"}`);
    } catch (err: any) {
      // Revert on error
      setLocalPrefs(prev => ({ ...prev, [key]: !enabled }));
      toast.error(err.message || "Failed to update preference");
    }
  };

  if (prefsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const types = prefsQuery.data?.types || [];
  const enabledCount = Object.values(localPrefs).filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Control which notifications you receive. {enabledCount} of {types.length} notifications enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {types.map(type => {
          const enabled = localPrefs[type.key] ?? false;
          return (
            <div
              key={type.key}
              className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-1.5 rounded-md ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{type.description}</p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => handleToggle(type.key, checked)}
                disabled={setPref.isPending}
              />
            </div>
          );
        })}
        {types.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No notification types configured.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ label, configured, loading }: { label: string; configured: boolean; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 text-sm ${configured ? "text-green-600" : "text-muted-foreground"}`}>
      {configured ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      <span>{label}: {configured ? "Configured" : "Not set"}</span>
    </div>
  );
}
