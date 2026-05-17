import { useIsMobile } from "@/hooks/useMobile";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { LayoutDashboard, Megaphone, Volume2, PhoneCall, Mic } from "lucide-react";

const quickNavItems = [
  { icon: LayoutDashboard, label: "Home", path: "/" },
  { icon: Megaphone, label: "Campaigns", path: "/campaigns" },
  { icon: Volume2, label: "Audio", path: "/audio" },
  { icon: PhoneCall, label: "Caller IDs", path: "/caller-ids" },
  { icon: Mic, label: "Record", path: "/audio?record=1" },
];

export default function MobileQuickNav() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  // Only show on mobile, only when logged in, only for admin users
  if (!isMobile || !user || user.role !== "admin") return null;

  // Don't show on login/setup pages
  if (location === "/login" || location === "/setup" || location === "/setup-wizard" || location === "/onboarding") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-t safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-1">
        {quickNavItems.map((item) => {
          const isActive = item.path === "/" 
            ? location === "/" 
            : item.path.startsWith("/audio?record")
              ? false
              : location.startsWith(item.path);
          const isRecord = item.path === "/audio?record=1";

          return (
            <button
              key={item.path}
              onClick={() => {
                if (isRecord) {
                  // Navigate to audio page with record param to trigger voice memo
                  setLocation("/audio?record=1");
                  // Dispatch custom event so Audio page can open the recorder
                  window.dispatchEvent(new CustomEvent("open-voice-recorder"));
                } else {
                  setLocation(item.path);
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-h-[44px] ${
                isRecord
                  ? "text-red-500"
                  : isActive
                    ? "text-primary"
                    : "text-muted-foreground"
              }`}
            >
              {isRecord ? (
                <div className="relative">
                  <div className="absolute -inset-1 bg-red-500/20 rounded-full animate-pulse" />
                  <item.icon className="h-5 w-5 relative" />
                </div>
              ) : (
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              )}
              <span className={`text-[10px] font-medium leading-none ${isRecord ? "text-red-500" : ""}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
