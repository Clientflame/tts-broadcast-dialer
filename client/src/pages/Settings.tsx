import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Settings as SettingsIcon, Key, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ExternalLink, Save } from "lucide-react";
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
  },
  {
    key: "google_tts_api_key",
    label: "Google Cloud TTS API Key",
    description: "Used for Google TTS voices (Journey, Studio, Neural2, Wavenet). More voice options, ~$4/1M characters.",
    placeholder: "AIza...",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    helpLabel: "Get API Key",
    isSecret: 1,
  },
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
            Manage your application settings and API keys.
          </p>
        </div>

        <Separator />

        {isAdmin ? (
          <TTSApiKeysSection />
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
  const utils = trpc.useUtils();

  // Local form state for each key
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Initialize form values from server data
  useEffect(() => {
    if (settingsList.data) {
      const initial: Record<string, string> = {};
      for (const setting of TTS_SETTINGS) {
        const serverVal = settingsList.data.find(s => s.key === setting.key);
        // If value is masked (••••••••), show empty to let user re-enter
        initial[setting.key] = serverVal?.value && serverVal.value !== "••••••••" ? serverVal.value : "";
      }
      setValues(initial);
    }
  }, [settingsList.data]);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    const updates = TTS_SETTINGS
      .filter(s => {
        const currentVal = values[s.key] || "";
        // Only send if user entered a value (non-empty)
        return currentVal.length > 0;
      })
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
      await utils.appSettings.list.invalidate();
      await utils.appSettings.ttsStatus.invalidate();
      toast.success("API key cleared");
    } catch (err: any) {
      toast.error(err.message || "Failed to clear key");
    }
  };

  return (
    <div className="space-y-6">
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
            <StatusBadge
              label="OpenAI TTS"
              configured={ttsStatus.data?.openaiConfigured ?? false}
              loading={ttsStatus.isLoading}
            />
            <StatusBadge
              label="Google TTS"
              configured={ttsStatus.data?.googleConfigured ?? false}
              loading={ttsStatus.isLoading}
            />
          </div>

          {/* Key inputs */}
          {TTS_SETTINGS.map(setting => {
            const hasServerValue = settingsList.data?.some(s => s.key === setting.key && s.value && s.value !== "");
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
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowValues(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showValues[setting.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
    </div>
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
