import { useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { LayoutDashboard, Megaphone, Volume2, Rocket, Mic } from "lucide-react";
import QuickCampaignWizard from "./QuickCampaignWizard";

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  path?: string;
  action?: string;
  color?: string;
};

const quickNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Home", path: "/" },
  { icon: Mic, label: "Record", action: "record", color: "text-red-500" },
  { icon: Rocket, label: "Launch", action: "quick-campaign", color: "text-green-500" },
  { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
  { icon: Volume2, label: "Audio", path: "/audio" },
];

export default function MobileQuickNav() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Only show on mobile, only when logged in, only for admin users
  if (!isMobile || !user || user.role !== "admin") return null;

  // Don't show on login/setup pages
  if (location === "/login" || location === "/setup" || location === "/setup-wizard" || location === "/onboarding") return null;

  const handleItemClick = (item: NavItem) => {
    if (item.action === "record") {
      setLocation("/audio");
      // Small delay to let the page mount before dispatching event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open-voice-recorder"));
      }, 100);
    } else if (item.action === "quick-campaign") {
      setWizardOpen(true);
    } else if (item.path) {
      setLocation(item.path);
    }
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-t safe-area-bottom">
        <div className="flex items-center justify-around h-14 px-1">
          {quickNavItems.map((item, idx) => {
            const isActive = item.path
              ? item.path === "/"
                ? location === "/"
                : location.startsWith(item.path)
              : false;

            const isSpecial = !!item.action;

            return (
              <button
                key={idx}
                onClick={() => handleItemClick(item)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-h-[44px] ${
                  isSpecial
                    ? item.color || "text-primary"
                    : isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                }`}
              >
                {item.action === "record" ? (
                  <div className="relative">
                    <div className="absolute -inset-1 bg-red-500/20 rounded-full animate-pulse" />
                    <item.icon className="h-5 w-5 relative" />
                  </div>
                ) : item.action === "quick-campaign" ? (
                  <div className="relative">
                    <div className="absolute -inset-1.5 bg-green-500/15 rounded-full" />
                    <item.icon className="h-5 w-5 relative" />
                  </div>
                ) : (
                  <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                )}
                <span className={`text-[10px] font-medium leading-none ${isSpecial ? item.color || "" : ""}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <QuickCampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}
