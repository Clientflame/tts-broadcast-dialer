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
} from "lucide-react";
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
  const bulkUpdate = trpc.appSettings.bulkUpdate.useMutation();
  const utils = trpc.useUtils();

  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);

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
      await bulkUpdate.mutateAsync(updates);
      await utils.appSettings.list.invalidate();
      await utils.appSettings.freepbxStatus.invalidate();
      setIsDirty(false);
      toast.success("FreePBX settings saved. Restart the application for changes to take effect.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
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

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Changes require an application restart to take effect.
          </p>
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
            Save FreePBX Settings
          </Button>
        </div>
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
