import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, ChevronLeft, X, Megaphone, Users,
  Phone, ScrollText, BarChart3, Server, LayoutDashboard,
  Sparkles, ArrowRight,
} from "lucide-react";

const TOUR_COMPLETED_KEY = "product_tour_completed";
const TOUR_VERSION = "1"; // Bump this to re-show tour after major updates

interface TourStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  image: string;
  icon: React.ElementType;
  accentColor: string;
  path: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to TTS Broadcast Dialer",
    subtitle: "Your AI-Powered Outbound Calling Platform",
    description: "Let's take a quick tour of the main features. This will only take a minute and will help you get the most out of the platform.",
    features: [
      "AI-powered text-to-speech with personalized messages",
      "Automated broadcast campaigns with DID rotation",
      "Real-time analytics and call monitoring",
      "FreePBX integration with one-click setup",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-welcome-MWG4pybx6bRJTCwcqjj9wQ.webp",
    icon: Sparkles,
    accentColor: "from-blue-500/20 to-purple-500/20",
    path: "/",
  },
  {
    id: "campaigns",
    title: "Broadcast Campaigns",
    subtitle: "Launch & Manage Outbound Calls",
    description: "Create campaigns that automatically dial your contact lists with personalized TTS messages. Set concurrency limits, schedule windows, and let the system handle the rest.",
    features: [
      "Personalized TTS with merge fields like {{first_name}}",
      "Adjustable concurrent call limits (1-50 channels)",
      "Business hours scheduling with timezone support",
      "Real-time progress tracking and pause/resume controls",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-campaigns-QYH49g53RniPufuD5hHaTk.webp",
    icon: Megaphone,
    accentColor: "from-green-500/20 to-emerald-500/20",
    path: "/campaigns",
  },
  {
    id: "contacts",
    title: "Contact Management",
    subtitle: "Import & Organize Your Call Lists",
    description: "Upload contacts via CSV with automatic phone number normalization and duplicate detection. Create multiple lists and assign them to different campaigns.",
    features: [
      "CSV import with automatic field mapping",
      "Phone number normalization to US 10-digit format",
      "Duplicate detection across all lists",
      "DNC (Do Not Call) list integration",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-contacts-BaJyNydMSLNXwXsdY9USXt.webp",
    icon: Users,
    accentColor: "from-cyan-500/20 to-blue-500/20",
    path: "/contacts",
  },
  {
    id: "scripts",
    title: "Call Scripts & TTS",
    subtitle: "Build Multi-Segment Voice Messages",
    description: "Create call scripts with multiple segments — each with its own voice, speed, and content. Use merge fields to personalize every call with the contact's name and your callback number.",
    features: [
      "Multi-segment scripts with different voices per segment",
      "OpenAI and Google TTS voice options",
      "Merge fields: {{first_name}}, {{last_name}}, {{callback_number}}",
      "Preview audio before launching campaigns",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-scripts-XCAkrMK7EKo8RwAh7iyoR2.webp",
    icon: ScrollText,
    accentColor: "from-purple-500/20 to-pink-500/20",
    path: "/scripts",
  },
  {
    id: "callerids",
    title: "Caller ID Rotation",
    subtitle: "Maximize Answer Rates with DID Pools",
    description: "Add multiple outbound DIDs and the system automatically rotates them during campaigns. This improves answer rates and distributes call volume across numbers.",
    features: [
      "Automatic DID rotation during campaigns",
      "Label-based DID pools for different campaign types",
      "Real-time DID health monitoring and analytics",
      "Automatic flagging of numbers with high failure rates",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-callerids-iqwjUzUgnrENHbcwrCLfoK.webp",
    icon: Phone,
    accentColor: "from-teal-500/20 to-green-500/20",
    path: "/caller-ids",
  },
  {
    id: "freepbx",
    title: "FreePBX Integration",
    subtitle: "One-Click PBX Agent Setup",
    description: "Connect your FreePBX server with a single command. The PBX agent handles call origination, status reporting, and extension monitoring automatically.",
    features: [
      "One-liner install script for your PBX server",
      "Automatic AMI credential configuration",
      "Real-time extension status monitoring (Operator Panel)",
      "Auto-reconnect and health reporting every 10 seconds",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-freepbx-a3bBEKHzkMZGMBeCMQxbZn.webp",
    icon: Server,
    accentColor: "from-orange-500/20 to-amber-500/20",
    path: "/freepbx",
  },
  {
    id: "analytics",
    title: "Analytics & Reporting",
    subtitle: "Track Performance in Real Time",
    description: "Monitor campaign performance with live dashboards, call logs, and exportable reports. Track answer rates, call durations, and DID performance across all your campaigns.",
    features: [
      "Real-time campaign progress and call status",
      "DID-level analytics with answer rate tracking",
      "Exportable call logs and campaign reports",
      "System health dashboard with service monitoring",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-analytics-RpYcKhjziVsgGGQi4rxm9g.webp",
    icon: BarChart3,
    accentColor: "from-amber-500/20 to-orange-500/20",
    path: "/analytics",
  },
  {
    id: "dashboard",
    title: "You're All Set!",
    subtitle: "Your Command Center Awaits",
    description: "The dashboard gives you a bird's-eye view of everything — active campaigns, system health, PBX status, and recent activity. Start by setting up your FreePBX connection from the Getting Started guide.",
    features: [
      "Live system health monitoring",
      "Active campaign status at a glance",
      "PBX agent connection status",
      "Quick actions to launch campaigns and manage contacts",
    ],
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663328121958/QaP68Z2AATogwpccsoDAFH/tutorial-dashboard-GSuoLctiqUP6rtiKhu7oY9.webp",
    icon: LayoutDashboard,
    accentColor: "from-blue-500/20 to-indigo-500/20",
    path: "/",
  },
];

export function useProductTour() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY);
    if (completed !== TOUR_VERSION) {
      setShouldShow(true);
    }
  }, []);

  // Listen for replay event from sidebar
  useEffect(() => {
    const handleReplay = () => setShouldShow(true);
    window.addEventListener("replay-product-tour", handleReplay);
    return () => window.removeEventListener("replay-product-tour", handleReplay);
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_COMPLETED_KEY, TOUR_VERSION);
    setShouldShow(false);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    setShouldShow(true);
  }, []);

  return { shouldShow, completeTour, resetTour };
}

export default function ProductTour({
  onComplete,
  onNavigate,
}: {
  onComplete: () => void;
  onNavigate?: (path: string) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const Icon = step.icon;

  // Preload next image
  useEffect(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const img = new Image();
      img.src = TOUR_STEPS[currentStep + 1].image;
    }
  }, [currentStep]);

  const goTo = useCallback((index: number) => {
    if (isAnimating || index === currentStep) return;
    setDirection(index > currentStep ? "next" : "prev");
    setIsAnimating(true);
    setImageLoaded(false);
    setTimeout(() => {
      setCurrentStep(index);
      setIsAnimating(false);
    }, 200);
  }, [currentStep, isAnimating]);

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    goTo(currentStep + 1);
  };

  const handlePrev = () => {
    if (!isFirst) goTo(currentStep - 1);
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleGetStarted = () => {
    onComplete();
    if (onNavigate) {
      onNavigate("/onboarding");
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, isAnimating]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Tour card */}
      <div className="relative w-full max-w-3xl mx-4 bg-background rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image section */}
        <div className={`relative h-48 sm:h-56 bg-gradient-to-br ${step.accentColor} overflow-hidden`}>
          <img
            src={step.image}
            alt={step.title}
            className={`w-full h-full object-cover transition-all duration-500 ${
              imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
            }`}
            onLoad={() => setImageLoaded(true)}
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

          {/* Step counter badge */}
          <Badge
            className="absolute top-4 left-4 bg-background/80 backdrop-blur text-foreground border-0 text-xs font-medium"
          >
            {currentStep + 1} of {TOUR_STEPS.length}
          </Badge>
        </div>

        {/* Content section */}
        <div
          className={`px-6 sm:px-8 pb-6 pt-2 transition-all duration-200 ${
            isAnimating
              ? direction === "next"
                ? "opacity-0 translate-x-4"
                : "opacity-0 -translate-x-4"
              : "opacity-100 translate-x-0"
          }`}
        >
          {/* Title area */}
          <div className="flex items-start gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{step.title}</h2>
              <p className="text-sm text-primary font-medium">{step.subtitle}</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {step.description}
          </p>

          {/* Feature list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
            {step.features.map((feature, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span className="text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            {/* Dots */}
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`transition-all duration-300 rounded-full ${
                    i === currentStep
                      ? "w-6 h-2 bg-primary"
                      : i < currentStep
                      ? "w-2 h-2 bg-primary/40 hover:bg-primary/60"
                      : "w-2 h-2 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-muted-foreground"
                >
                  Skip Tour
                </Button>
              )}
              {isLast ? (
                <Button onClick={handleGetStarted} className="gap-2">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleNext} className="gap-1">
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
