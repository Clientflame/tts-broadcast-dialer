import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Search, Megaphone, Users, FileText, Phone, Bot, Loader2 } from "lucide-react";

const CATEGORY_ICONS: Record<string, any> = {
  campaign: Megaphone,
  contactList: Users,
  script: FileText,
  callerId: Phone,
  voiceAiPrompt: Bot,
};

const CATEGORY_LABELS: Record<string, string> = {
  campaign: "Campaign",
  contactList: "Contact List",
  script: "Call Script",
  callerId: "Caller ID",
  voiceAiPrompt: "Voice AI Prompt",
};

const CATEGORY_COLORS: Record<string, string> = {
  campaign: "text-blue-500",
  contactList: "text-green-500",
  script: "text-purple-500",
  callerId: "text-orange-500",
  voiceAiPrompt: "text-pink-500",
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchResults = trpc.globalSearch.search.useQuery(
    { query, limit: 20 },
    { enabled: query.length >= 1, placeholderData: (prev: any) => prev }
  );

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const results = searchResults.data?.results || [];

  const handleSelect = useCallback((url: string) => {
    setLocation(url);
    setOpen(false);
    setQuery("");
  }, [setLocation]);

  // Arrow key navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex].url);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, results, selectedIndex, handleSelect]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search campaigns, contacts, scripts, caller IDs..."
            className="border-0 focus-visible:ring-0 shadow-none h-12"
            autoFocus
          />
          {searchResults.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {query.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">⌘K</kbd> to search across all resources
            </div>
          )}
          {query.length > 0 && results.length === 0 && !searchResults.isFetching && (
            <div className="p-6 text-center text-sm text-muted-foreground">No results found</div>
          )}
          {results.map((result, i) => {
            const Icon = CATEGORY_ICONS[result.category] || Search;
            const colorClass = CATEGORY_COLORS[result.category] || "text-muted-foreground";
            return (
              <button
                key={`${result.category}-${result.id}`}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors ${i === selectedIndex ? "bg-accent" : ""}`}
                onClick={() => handleSelect(result.url)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <Icon className={`h-4 w-4 shrink-0 ${colorClass}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{result.name}</div>
                  <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[result.category] || result.category}{(result as any).detail ? ` · ${(result as any).detail}` : ""}</div>
                </div>
              </button>
            );
          })}
        </div>
        {results.length > 0 && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-4">
            <span><kbd className="px-1 rounded bg-muted font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="px-1 rounded bg-muted font-mono">↵</kbd> select</span>
            <span><kbd className="px-1 rounded bg-muted font-mono">esc</kbd> close</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
