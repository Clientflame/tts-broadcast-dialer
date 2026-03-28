import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, ArrowRight, ArrowLeft,
  Rocket, Server, Phone, Users, Megaphone,
  ExternalLink, Sparkles, ChevronRight, PartyPopper,
  SkipForward, Key, Bot, ShieldCheck, Copy, Globe, Terminal,
} from "lucide-react";
import { useLocation } from "wouter";

const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed";

interface StepConfig {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel: string;
  actionPath: string;
  tips: string[];
}

const STEP_CONFIGS: StepConfig[] = [
  {
    id: "account",
    icon: Sparkles,
    title: "Create Your Account",
    description: "Set up your admin account to get started. This is the first step to configuring your broadcast dialer.",
    actionLabel: "Account Created",
    actionPath: "/setup",
    tips: [
      "Your admin account has full access to all features",
      "You can create additional user accounts from User Management",
      "Each user can have admin or standard access levels",
    ],
  },
  {
    id: "pbx",
    icon: Server,
    title: "Connect FreePBX",
    description: "Link your FreePBX server to enable outbound calling. The one-click installer makes this easy — just run a single command on your PBX server.",
    actionLabel: "Set Up FreePBX",
    actionPath: "/freepbx",
    tips: [
      "You'll need SSH access to your FreePBX server",
      "The installer automatically configures AMI credentials and the dialer agent",
      "Your PBX server should have SIP trunks configured with your carrier (e.g., Telnyx, Twilio)",
      "Make sure ports 5060 (SIP) and 10000-20000 (RTP) are open on your PBX firewall",
    ],
  },
  {
    id: "callerIds",
    icon: Phone,
    title: "Add Caller IDs (DIDs)",
    description: "Import the phone numbers that will appear as the caller ID when making outbound calls. These rotate automatically during campaigns for better answer rates.",
    actionLabel: "Add Caller IDs",
    actionPath: "/caller-ids",
    tips: [
      "Add multiple DIDs for automatic rotation — this improves answer rates",
      "DIDs should match your SIP trunk numbers",
      "The system automatically monitors DID health and flags numbers with high failure rates",
      "You can import DIDs individually or in bulk via CSV",
    ],
  },
  {
    id: "contacts",
    icon: Users,
    title: "Import Your Contacts",
    description: "Upload your contact lists via CSV. Each list can contain up to 50,000 contacts with first name, last name, and phone number.",
    actionLabel: "Import Contacts",
    actionPath: "/contacts",
    tips: [
      "CSV format: first_name, last_name, phone (with headers)",
      "Phone numbers are automatically normalized to 10-digit US format",
      "Duplicate detection prevents the same number from appearing twice",
      "You can create multiple lists and assign them to different campaigns",
    ],
  },
  {
    id: "apiKeys",
    icon: Key,
    title: "Configure API Keys",
    description: "Set up your AI service API keys for text-to-speech generation. You need at least one TTS provider (OpenAI or Google) to generate call audio.",
    actionLabel: "Configure Settings",
    actionPath: "/settings",
    tips: [
      "OpenAI API key enables high-quality TTS voices (alloy, echo, fable, onyx, nova, shimmer)",
      "Google Cloud TTS API key enables 400+ voices across 50+ languages",
      "You can configure both providers and choose per-campaign which one to use",
      "API keys are entered on the Settings page under the API Keys section",
      "Get your OpenAI key at platform.openai.com/api-keys",
    ],
  },
  {
    id: "voiceAiBridge",
    icon: Bot,
    title: "Install Voice AI Bridge",
    description: "The Voice AI Bridge enables real-time AI-powered call handling on your FreePBX server. It connects Asterisk to the AI engine for intelligent call routing and responses.",
    actionLabel: "Set Up Voice AI",
    actionPath: "/voice-ai",
    tips: [
      "The bridge runs as a systemd service on your FreePBX server",
      "Use the Auto-Install button on the Voice AI page for one-click setup",
      "The bridge health is monitored automatically every 5 minutes",
      "Requires Python 3.8+ on your FreePBX server (pre-installed on most systems)",
    ],
  },
  {
    id: "campaign",
    icon: Megaphone,
    title: "Create Your First Campaign",
    description: "Set up a broadcast campaign with your audio message, contact list, and caller IDs. Choose between pre-recorded audio, AI-generated TTS, or personalized TTS with merge fields.",
    actionLabel: "Create Campaign",
    actionPath: "/campaigns",
    tips: [
      "Start with a small test campaign (10-50 contacts) to verify everything works",
      "Personalized TTS lets you include {{first_name}} and {{callback_number}} in your message",
      "Set max concurrent calls to 3-5 for initial testing",
      "The 48-hour dedup window prevents calling the same number twice within 48 hours",
    ],
  },
  {
    id: "systemHealth",
    icon: ShieldCheck,
    title: "System Health Check",
    description: "Verify all critical services are online and working together. This final check ensures your PBX agent is connected, caller IDs are active, and API keys are valid.",
    actionLabel: "View Dashboard",
    actionPath: "/",
    tips: [
      "The dashboard System Health card shows real-time status of all services",
      "Green checkmarks mean the service is healthy and connected",
      "If any service shows a warning, click it for troubleshooting details",
      "DID health checks run automatically during business hours (8am-8pm EST)",
    ],
  },
];

function StepCard({
  step,
  config,
  isActive,
  stepNumber,
  onAction,
}: {
  step: { id: string; completed: boolean; detail?: string };
  config: StepConfig;
  isActive: boolean;
  stepNumber: number;
  onAction: () => void;
}) {
  const Icon = config.icon;

  return (
    <Card
      className={`transition-all duration-300 ${
        isActive
          ? "border-primary/50 shadow-md ring-1 ring-primary/20"
          : step.completed
          ? "border-green-500/30 bg-green-500/5"
          : "opacity-60"
      }`}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Step indicator */}
          <div className="shrink-0 pt-0.5">
            {step.completed ? (
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            ) : isActive ? (
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{stepNumber}</span>
              </div>
            ) : (
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <span className="text-lg font-bold text-muted-foreground">{stepNumber}</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${step.completed ? "text-green-500" : isActive ? "text-primary" : "text-muted-foreground"}`} />
              <h3 className={`font-semibold ${step.completed ? "text-green-700 dark:text-green-400" : ""}`}>
                {config.title}
              </h3>
              {step.completed && (
                <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                  Complete
                </Badge>
              )}
              {step.detail && !step.completed && (
                <Badge variant="secondary" className="text-xs">{step.detail}</Badge>
              )}
              {step.detail && step.completed && (
                <span className="text-xs text-muted-foreground">{step.detail}</span>
              )}
            </div>

            <p className="text-sm text-muted-foreground mb-3">{config.description}</p>

            {/* Tips - show for active step */}
            {isActive && !step.completed && (
              <div className="mb-3 rounded-lg bg-muted/50 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tips</p>
                {config.tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action button */}
            {!step.completed && isActive && (
              <Button onClick={onAction} className="gap-2">
                {config.actionLabel}
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            {step.completed && isActive && (
              <Button variant="outline" onClick={onAction} className="gap-2" size="sm">
                Review {config.title.replace("Your ", "").replace("Create ", "")}
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickRefItem({ label, value, icon, copyable }: { label: string; value: string; icon: React.ReactNode; copyable?: boolean }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success(`Copied ${label} URL`);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-xs text-muted-foreground block">{label}</span>
        <span className="text-xs font-mono truncate block">{value}</span>
      </div>
      {copyable && (
        <button onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Copy">
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function Onboarding() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const onboardingStatus = trpc.onboarding.status.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5000,
  });

  const steps = onboardingStatus.data?.steps ?? [];
  const completedCount = onboardingStatus.data?.completedCount ?? 0;
  const totalSteps = onboardingStatus.data?.totalSteps ?? 5;
  const isComplete = onboardingStatus.data?.isComplete ?? false;
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  // Find the first incomplete step
  const activeStepIndex = useMemo(() => {
    const idx = steps.findIndex(s => !s.completed);
    return idx >= 0 ? idx : steps.length - 1;
  }, [steps]);

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    setLocation("/");
    toast.success("Onboarding dismissed. You can always come back from the sidebar.");
  };

  const handleGoToDashboard = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    setLocation("/");
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Getting Started</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Complete these steps to set up your broadcast dialer. Each step builds on the previous one.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="gap-1.5 text-muted-foreground shrink-0">
            <SkipForward className="h-4 w-4" />
            Skip Setup
          </Button>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Setup Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedCount} of {totalSteps} steps complete
              </span>
            </div>
            <Progress value={progressPercent} className="h-2.5" />
            {isComplete && (
              <div className="mt-3 flex items-center gap-2 text-green-600">
                <PartyPopper className="h-4 w-4" />
                <span className="text-sm font-medium">All set! Your dialer is ready to go.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completion celebration */}
        {isComplete && (
          <Card className="border-green-500/50 bg-gradient-to-r from-green-500/5 to-emerald-500/5">
            <CardContent className="p-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 mx-auto">
                <PartyPopper className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Setup Complete!</h2>
                <p className="text-muted-foreground mt-1">
                  Your broadcast dialer is fully configured and ready to make calls. Head to the dashboard to monitor your campaigns.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={handleGoToDashboard} className="gap-2">
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => setLocation("/campaigns")} className="gap-2">
                  <Megaphone className="h-4 w-4" />
                  Start a Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => {
            const config = STEP_CONFIGS.find(c => c.id === step.id);
            if (!config) return null;
            return (
              <StepCard
                key={step.id}
                step={step}
                config={config}
                isActive={index === activeStepIndex}
                stepNumber={index + 1}
                onAction={() => setLocation(config.actionPath)}
              />
            );
          })}
        </div>

        {/* Quick Reference Card */}
        <Card className="border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-indigo-500/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold">Quick Reference</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickRefItem label="Dashboard" value={window.location.origin} icon={<Globe className="h-3.5 w-3.5" />} copyable />
              <QuickRefItem label="System Architecture" value={`${window.location.origin}/system-architecture`} icon={<Globe className="h-3.5 w-3.5" />} copyable />
              <QuickRefItem label="FreePBX Integration" value={`${window.location.origin}/freepbx`} icon={<Server className="h-3.5 w-3.5" />} />
              <QuickRefItem label="Voice AI Setup" value={`${window.location.origin}/voice-ai`} icon={<Bot className="h-3.5 w-3.5" />} />
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                For the full system architecture, tech stack, and API reference, visit the{" "}
                <button onClick={() => setLocation("/system-architecture")} className="text-blue-500 hover:underline font-medium">System Architecture</button>{" "}
                page from the sidebar.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bottom help */}
        {!isComplete && (
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground text-center">
                Need help? Each step links to the relevant page where you can complete the setup.
                You can always return to this wizard from the sidebar or by visiting <code className="text-xs bg-muted px-1 py-0.5 rounded">/onboarding</code>.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

/** Hook to check if onboarding should be shown */
export function useOnboardingCheck() {
  const { user } = useAuth();
  const onboardingStatus = trpc.onboarding.status.useQuery(undefined, {
    enabled: !!user,
  });

  const isDismissed = typeof window !== "undefined" && localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
  const shouldShow = !isDismissed && onboardingStatus.data && !onboardingStatus.data.isComplete;

  return { shouldShow, isComplete: onboardingStatus.data?.isComplete, completedCount: onboardingStatus.data?.completedCount, totalSteps: onboardingStatus.data?.totalSteps };
}
