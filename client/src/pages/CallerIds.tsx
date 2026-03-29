import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Phone, Plus, Upload, Trash2, Activity, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, RotateCcw, Clock, Calendar, Route, Loader2, ArrowRight, ChevronDown, ChevronUp, Pencil, ExternalLink, Search, AlertCircle, Tag, Check, X } from "lucide-react";

function HealthBadge({ status, autoDisabled, lastCheckAt, lastCheckResult, consecutiveFailures, failureRate, recentCallCount, flagReason, cooldownUntil }: {
  status: string;
  autoDisabled: number;
  lastCheckAt: number | null;
  lastCheckResult: string | null;
  consecutiveFailures: number;
  failureRate?: number;
  recentCallCount?: number;
  flagReason?: string | null;
  cooldownUntil?: number | null;
}) {
  const config: Record<string, { icon: React.ReactNode; label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
    unknown: { icon: <ShieldQuestion className="h-3 w-3" />, label: "Unchecked", variant: "outline", color: "text-muted-foreground" },
    healthy: { icon: <ShieldCheck className="h-3 w-3" />, label: "Healthy", variant: "default", color: "text-green-600" },
    degraded: { icon: <ShieldAlert className="h-3 w-3" />, label: "Degraded", variant: "secondary", color: "text-yellow-600" },
    failed: { icon: <ShieldX className="h-3 w-3" />, label: "Failed", variant: "destructive", color: "text-red-600" },
  };
  const c = config[status] || config.unknown;

  const isCoolingDown = cooldownUntil && cooldownUntil > Date.now();
  const cooldownRemaining = isCoolingDown ? Math.ceil((cooldownUntil - Date.now()) / 60000) : 0;

  const tooltipContent = [
    recentCallCount && recentCallCount > 0 ? `Failure rate: ${failureRate || 0}% (${recentCallCount} recent calls)` : null,
    lastCheckAt ? `Last health check: ${new Date(lastCheckAt).toLocaleString()}` : null,
    lastCheckResult ? `Check result: ${lastCheckResult}` : null,
    consecutiveFailures > 0 ? `Consecutive check failures: ${consecutiveFailures}` : null,
    flagReason ? `Flagged: ${flagReason}` : null,
    isCoolingDown ? `Cooldown: ${cooldownRemaining} min remaining` : null,
    autoDisabled && !isCoolingDown ? "Auto-disabled — reset to re-enable" : null,
  ].filter(Boolean).join("\n");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <Badge variant={c.variant} className={`text-xs gap-1 ${autoDisabled ? "border-red-400 bg-red-50 text-red-700" : ""}`}>
              {c.icon} {isCoolingDown ? "Cooldown" : autoDisabled ? "Flagged" : c.label}
            </Badge>
            {recentCallCount && recentCallCount >= 10 && !autoDisabled ? (
              <span className={`text-[10px] font-mono ${(failureRate || 0) >= 50 ? "text-yellow-600" : "text-muted-foreground"}`}>
                {failureRate || 0}%
              </span>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent className="whitespace-pre-line text-xs max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Destination Type Labels ─────────────────────────────────────────────────

const DEST_TYPE_LABELS: Record<string, string> = {
  extension: "Extension",
  queue: "Call Queue",
  ring_group: "Ring Group",
  ivr: "IVR Menu",
  voicemail: "Voicemail",
  announcement: "Announcement",
  terminate: "Terminate",
};

const DEST_TYPE_OPTIONS = [
  { value: "queue", label: "Call Queue" },
  { value: "ring_group", label: "Ring Group" },
  { value: "extension", label: "Extension" },
  { value: "ivr", label: "IVR Menu" },
  { value: "voicemail", label: "Voicemail" },
  { value: "announcement", label: "Announcement" },
  { value: "terminate", label: "Terminate" },
];

// ─── Two-Step Destination Picker ────────────────────────────────────────────

function DestinationPicker({
  value,
  onChange,
  destinations,
  size = "default",
}: {
  value: string;
  onChange: (dest: string) => void;
  destinations: any[];
  size?: "default" | "compact";
}) {
  const getTypeFromDest = (dest: string): string => {
    if (!dest || dest === "none") return "none";
    if (dest.startsWith("from-did-direct,")) return "extension";
    if (dest.startsWith("ext-queues,")) return "queue";
    if (dest.startsWith("ext-group,")) return "ring_group";
    if (dest.startsWith("ivr-")) return "ivr";
    if (dest.startsWith("ext-local,vm")) return "voicemail";
    if (dest.startsWith("app-announcement-")) return "announcement";
    if (dest.startsWith("app-blackhole,")) return "terminate";
    return "none";
  };

  const [selectedType, setSelectedType] = useState(getTypeFromDest(value));

  const itemsForType = useMemo(() => {
    return destinations.filter(d => d.type === selectedType);
  }, [destinations, selectedType]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    if (type === "none") {
      onChange("none");
    } else {
      const items = destinations.filter(d => d.type === type);
      if (items.length === 1) {
        onChange(items[0].destination);
      } else {
        onChange("none");
      }
    }
  };

  const isCompact = size === "compact";
  const triggerClass = isCompact ? "h-8 text-xs" : "mt-1";

  const hasNonTerminate = destinations.some(d => d.type !== "terminate");

  return (
    <div className="space-y-2">
      {!hasNonTerminate && destinations.length > 0 && !isCompact && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded p-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Could not connect to FreePBX via SSH. Only basic options are available. Check your FreePBX SSH credentials in Settings.</span>
        </div>
      )}
      <div className={`flex gap-2 ${isCompact ? "flex-1" : "grid grid-cols-2"}`}>
        <div className={isCompact ? "w-32 shrink-0" : ""}>
          {!isCompact && <Label className="text-xs">Destination Type</Label>}
          <Select value={selectedType} onValueChange={handleTypeChange}>
            <SelectTrigger className={triggerClass}>
              <SelectValue placeholder="Type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No route</SelectItem>
              {DEST_TYPE_OPTIONS.map(opt => {
                const count = destinations.filter(d => d.type === opt.value).length;
                return count > 0 ? (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label} ({count})
                  </SelectItem>
                ) : null;
              })}
            </SelectContent>
          </Select>
        </div>
      {selectedType !== "none" && itemsForType.length > 0 && (
        <div className={isCompact ? "flex-1" : ""}>
          {!isCompact && <Label className="text-xs">{DEST_TYPE_LABELS[selectedType] || "Item"}</Label>}
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={triggerClass}>
              <SelectValue placeholder={`Select ${DEST_TYPE_LABELS[selectedType]?.toLowerCase() || "item"}...`} />
            </SelectTrigger>
            <SelectContent>
              {itemsForType.map((d: any) => (
                <SelectItem key={`${d.type}-${d.id}`} value={d.destination}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
        {selectedType !== "none" && itemsForType.length === 0 && (
          <div className={`flex items-center text-xs text-muted-foreground ${isCompact ? "" : "mt-6"}`}>
            No {DEST_TYPE_LABELS[selectedType]?.toLowerCase() || "items"} found on FreePBX
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inbound Route Config Panel ──────────────────────────────────────────────

interface InboundRouteEntry {
  phoneNumber: string;
  label?: string;
  destination: string;
  description: string;
  cidPrefix: string;
}

function InboundRouteConfigPanel({
  entries,
  onEntriesChange,
  destinations,
  destinationsLoading,
}: {
  entries: InboundRouteEntry[];
  onEntriesChange: (entries: InboundRouteEntry[]) => void;
  destinations: any[];
  destinationsLoading: boolean;
}) {
  const [showPerNumber, setShowPerNumber] = useState(false);
  const [globalDest, setGlobalDest] = useState("none");
  const [globalDesc, setGlobalDesc] = useState("TTS Dialer");
  const [globalCidPrefix, setGlobalCidPrefix] = useState("");

  const applyToAll = (dest: string, desc: string, prefix: string) => {
    onEntriesChange(entries.map(e => ({
      ...e,
      destination: dest,
      description: desc,
      cidPrefix: prefix,
    })));
  };

  const handleGlobalDestChange = (val: string) => {
    setGlobalDest(val);
    applyToAll(val, globalDesc, globalCidPrefix);
  };

  const handleGlobalDescChange = (val: string) => {
    setGlobalDesc(val);
    applyToAll(globalDest, val, globalCidPrefix);
  };

  const handleGlobalCidPrefixChange = (val: string) => {
    setGlobalCidPrefix(val);
    applyToAll(globalDest, globalDesc, val);
  };

  const updateEntry = (idx: number, field: keyof InboundRouteEntry, value: string) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], [field]: value };
    onEntriesChange(updated);
  };

  if (destinationsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading FreePBX destinations...
      </div>
    );
  }

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Inbound Route Configuration</span>
        <Badge variant="outline" className="text-xs">Optional</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Auto-create inbound routes on FreePBX so return calls to these DIDs are routed to the right destination.
      </p>

      {/* Global settings */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Destination (all numbers)</Label>
          <DestinationPicker
            value={globalDest}
            onChange={handleGlobalDestChange}
            destinations={destinations}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Route Label</Label>
            <Input
              className="mt-1"
              value={globalDesc}
              onChange={e => handleGlobalDescChange(e.target.value)}
              placeholder="TTS Dialer"
            />
          </div>
          <div>
            <Label className="text-xs">CID Name Prefix (optional)</Label>
            <Input
              className="mt-1"
              value={globalCidPrefix}
              onChange={e => handleGlobalCidPrefixChange(e.target.value)}
              placeholder="e.g. CB: or TTS:"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">CID prefix is prepended to caller name on inbound calls (e.g. "CB: John Smith")</p>
      </div>

      {/* Per-number toggle */}
      {entries.length > 1 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={() => setShowPerNumber(!showPerNumber)}
          >
            {showPerNumber ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showPerNumber ? "Hide" : "Show"} per-number settings ({entries.length} numbers)
          </Button>

          {showPerNumber && (
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-background rounded border text-xs">
                  <span className="font-mono w-28 shrink-0">{entry.phoneNumber}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <DestinationPicker
                    value={entry.destination}
                    onChange={(val) => updateEntry(idx, "destination", val)}
                    destinations={destinations}
                    size="compact"
                  />
                  <Input
                    className="h-8 text-xs w-24"
                    value={entry.description}
                    onChange={e => updateEntry(idx, "description", e.target.value)}
                    placeholder="Label"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline Editable Label Cell ─────────────────────────────────────────────

function InlineEditLabel({
  value,
  onSave,
  isPending,
}: {
  value: string;
  onSave: (newLabel: string) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleStartEdit = () => {
    setEditValue(value);
    setEditing(true);
  };

  const handleSave = () => {
    if (editValue.trim() !== value) {
      onSave(editValue.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          className="h-7 text-xs w-32"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="Label..."
        />
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave} disabled={isPending}>
          <Check className="h-3.5 w-3.5 text-green-600" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCancel}>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group cursor-pointer" onClick={handleStartEdit}>
      <span className={`text-sm ${value ? "" : "text-muted-foreground"}`}>
        {value || "—"}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CallerIds() {
  const utils = trpc.useUtils();
  const { data: callerIds = [], isLoading } = trpc.callerIds.list.useQuery();
  const createMut = trpc.callerIds.create.useMutation({
    onSuccess: () => { utils.callerIds.list.invalidate(); toast.success("Caller ID added"); setShowAdd(false); setPhone(""); setLabel(""); },
    onError: (e) => toast.error(e.message),
  });
  const bulkCreateMut = trpc.callerIds.bulkCreate.useMutation({
    onSuccess: (r: any) => {
      utils.callerIds.list.invalidate();
      if (r.duplicatesOmitted > 0) {
        toast.success(`${r.count} caller IDs added (${r.duplicatesOmitted} duplicate${r.duplicatesOmitted > 1 ? 's' : ''} omitted)`);
      } else {
        toast.success(`${r.count} caller IDs added`);
      }
      setShowBulk(false); setBulkText(""); setBulkRouteEntries([]);
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkCreateWithRoutesMut = trpc.callerIds.bulkCreateWithRoutes.useMutation({
    onSuccess: (r: any) => {
      utils.callerIds.list.invalidate();
      const cidMsg = r.callerIds.duplicatesOmitted > 0
        ? `${r.callerIds.count} caller IDs added (${r.callerIds.duplicatesOmitted} dupes skipped)`
        : `${r.callerIds.count} caller IDs added`;
      if (r.inboundRoutes) {
        const { created, skipped, failed } = r.inboundRoutes.summary;
        const routeMsg = [
          created > 0 ? `${created} route(s) created` : null,
          skipped > 0 ? `${skipped} already existed` : null,
          failed > 0 ? `${failed} failed` : null,
        ].filter(Boolean).join(", ");
        toast.success(`${cidMsg}. Routes: ${routeMsg}`);
      } else {
        toast.success(cidMsg);
      }
      setShowBulk(false); setBulkText(""); setBulkRouteEntries([]);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.callerIds.update.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); } });
  const deleteMut = trpc.callerIds.delete.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); toast.success("Caller ID removed"); } });
  const bulkDeleteMut = trpc.callerIds.bulkDelete.useMutation({
    onSuccess: () => { utils.callerIds.list.invalidate(); setSelected(new Set()); toast.success("Selected caller IDs removed"); },
    onError: (e) => toast.error(e.message),
  });
  const bulkUpdateMut = trpc.callerIds.bulkUpdate.useMutation({
    onSuccess: (r) => {
      utils.callerIds.list.invalidate();
      toast.success(`Labels updated for ${r.count} caller ID(s)`);
      setShowBulkEditLabel(false);
      setBulkEditLabelValue("");
    },
    onError: (e) => toast.error(e.message),
  });
  const healthCheckMut = trpc.callerIds.triggerHealthCheck.useMutation({
    onSuccess: (r) => {
      toast.success(r.message);
      setTimeout(() => utils.callerIds.list.invalidate(), 5000);
      setTimeout(() => utils.callerIds.list.invalidate(), 15000);
      setTimeout(() => utils.callerIds.list.invalidate(), 30000);
    },
    onError: (e) => toast.error(e.message),
  });
  const resetHealthMut = trpc.callerIds.resetHealth.useMutation({
    onSuccess: () => { utils.callerIds.list.invalidate(); toast.success("Health status reset and caller ID re-enabled"); },
    onError: (e) => toast.error(e.message),
  });
  const { data: schedule } = trpc.callerIds.getSchedule.useQuery();
  const updateScheduleMut = trpc.callerIds.updateSchedule.useMutation({
    onSuccess: () => { utils.callerIds.getSchedule.invalidate(); toast.success("Health check schedule updated"); },
    onError: (e) => toast.error(e.message),
  });

  // Fetch FreePBX destinations when bulk dialog opens or routes tab is active
  const [fetchDests, setFetchDests] = useState(false);
  const { data: destinations = [], isLoading: destsLoading } = trpc.callerIds.getFreePBXDestinations.useQuery(undefined, {
    enabled: fetchDests,
    staleTime: 60000,
  });

  // Inbound Routes tab state
  const [activeTab, setActiveTab] = useState("callerids");
  const [routeSearch, setRouteSearch] = useState("");
  const [editingRoute, setEditingRoute] = useState<{ did: string; destination: string; description: string; cidPrefix: string } | null>(null);
  const [editDest, setEditDest] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCidPrefix, setEditCidPrefix] = useState("");
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());

  const { data: inboundRoutes = [], isLoading: routesLoading, refetch: refetchRoutes } = trpc.callerIds.listInboundRoutes.useQuery(undefined, {
    enabled: activeTab === "routes",
    staleTime: 30000,
  });

  const updateRouteMut = trpc.callerIds.updateInboundRoute.useMutation({
    onSuccess: () => { refetchRoutes(); toast.success("Inbound route updated"); setEditingRoute(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteRoutesMut = trpc.callerIds.deleteInboundRoutes.useMutation({
    onSuccess: (r) => { refetchRoutes(); setSelectedRoutes(new Set()); toast.success(`${r.deleted} route(s) deleted`); },
    onError: (e) => toast.error(e.message),
  });

  // Parse FreePBX destination string to human-readable label
  const destToLabel = (dest: string): string => {
    if (!dest) return "Not set";
    const found = destinations.find(d => d.destination === dest);
    if (found) return found.name;
    if (dest.startsWith("from-did-direct,")) return `Extension ${dest.split(",")[1]}`;
    if (dest.startsWith("ext-queues,")) return `Queue ${dest.split(",")[1]}`;
    if (dest.startsWith("ext-group,")) return `Ring Group ${dest.split(",")[1]}`;
    if (dest.startsWith("ivr-")) return `IVR ${dest.split(",")[0].replace("ivr-", "")}`;
    if (dest.startsWith("ext-local,vm")) return `Voicemail ${dest.split(",")[1]?.replace("vm", "")}`;
    if (dest.startsWith("app-announcement-")) return `Announcement ${dest.split(",")[0].replace("app-announcement-", "")}`;
    if (dest === "app-blackhole,hangup,1") return "Hangup";
    if (dest === "app-blackhole,congestion,1") return "Congestion";
    if (dest === "app-blackhole,busy,1") return "Play Busy";
    return dest;
  };

  const destTypeBadge = (dest: string): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } => {
    if (dest.startsWith("from-did-direct,")) return { label: "Extension", variant: "outline" };
    if (dest.startsWith("ext-queues,")) return { label: "Queue", variant: "default" };
    if (dest.startsWith("ext-group,")) return { label: "Ring Group", variant: "secondary" };
    if (dest.startsWith("ivr-")) return { label: "IVR", variant: "secondary" };
    if (dest.startsWith("ext-local,vm")) return { label: "Voicemail", variant: "outline" };
    if (dest.startsWith("app-announcement-")) return { label: "Announcement", variant: "outline" };
    if (dest.startsWith("app-blackhole,")) return { label: "Terminate", variant: "destructive" };
    return { label: "Custom", variant: "outline" };
  };

  const filteredRoutes = useMemo(() => {
    if (!routeSearch) return inboundRoutes;
    const q = routeSearch.toLowerCase();
    return inboundRoutes.filter(r =>
      r.did.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.destination.toLowerCase().includes(q)
    );
  }, [inboundRoutes, routeSearch]);

  const startEditRoute = (route: typeof inboundRoutes[0]) => {
    setEditingRoute(route);
    setEditDest(route.destination);
    setEditDesc(route.description);
    setEditCidPrefix(route.cidPrefix);
    setFetchDests(true);
  };

  const handleUpdateRoute = () => {
    if (!editingRoute) return;
    updateRouteMut.mutate({
      did: editingRoute.did,
      destination: editDest !== editingRoute.destination ? editDest : undefined,
      description: editDesc !== editingRoute.description ? editDesc : undefined,
      cidPrefix: editCidPrefix !== editingRoute.cidPrefix ? editCidPrefix : undefined,
    });
  };

  const toggleRouteSelect = (did: string) => {
    const next = new Set(selectedRoutes);
    if (next.has(did)) next.delete(did); else next.add(did);
    setSelectedRoutes(next);
  };

  const selectAllRoutes = () => {
    if (selectedRoutes.size === filteredRoutes.length) setSelectedRoutes(new Set());
    else setSelectedRoutes(new Set(filteredRoutes.map(r => r.did)));
  };

  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkLabel, setBulkLabel] = useState("");
  const [bulkRouteEntries, setBulkRouteEntries] = useState<InboundRouteEntry[]>([]);
  const [showRouteConfig, setShowRouteConfig] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkEditLabel, setShowBulkEditLabel] = useState(false);
  const [bulkEditLabelValue, setBulkEditLabelValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Parse bulk text into route entries whenever text changes
  const parseBulkEntries = (text: string, globalLabel?: string): InboundRouteEntry[] => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const parts = line.split(",").map(p => p.trim());
      return {
        phoneNumber: parts[0],
        label: parts[1] || globalLabel || undefined,
        destination: "none",
        description: "TTS Dialer",
        cidPrefix: "",
      };
    }).filter(e => e.phoneNumber);
  };

  const handleBulkTextChange = (text: string) => {
    setBulkText(text);
    setBulkRouteEntries(parseBulkEntries(text, bulkLabel));
  };

  const handleBulkLabelChange = (newLabel: string) => {
    setBulkLabel(newLabel);
    // Apply the global label to entries that don't have a per-line label
    if (bulkText) {
      const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
      const updated = lines.map(line => {
        const parts = line.split(",").map(p => p.trim());
        const existing = bulkRouteEntries.find(e => e.phoneNumber === parts[0]);
        return {
          phoneNumber: parts[0],
          label: parts[1] || newLabel || undefined,
          destination: existing?.destination || "none",
          description: existing?.description || "TTS Dialer",
          cidPrefix: existing?.cidPrefix || "",
        };
      }).filter(e => e.phoneNumber);
      setBulkRouteEntries(updated);
    }
  };

  const handleAdd = () => {
    if (!phone.trim()) return;
    createMut.mutate({ phoneNumber: phone.trim(), label: label.trim() || undefined });
  };

  const handleBulkAdd = () => {
    if (bulkRouteEntries.length === 0) {
      const entries = parseBulkEntries(bulkText, bulkLabel);
      if (entries.length === 0) return;
      bulkCreateMut.mutate({ entries: entries.map(e => ({ phoneNumber: e.phoneNumber, label: e.label })) });
      return;
    }

    // Check if any entries have inbound routes configured
    const hasRoutes = bulkRouteEntries.some(e => e.destination && e.destination !== "none");

    if (hasRoutes) {
      bulkCreateWithRoutesMut.mutate({
        entries: bulkRouteEntries.map(e => ({
          phoneNumber: e.phoneNumber,
          label: e.label,
          inboundRoute: e.destination && e.destination !== "none" ? {
            destination: e.destination,
            description: e.description || "TTS Dialer",
            cidPrefix: e.cidPrefix || undefined,
          } : undefined,
        })),
      });
    } else {
      bulkCreateMut.mutate({
        entries: bulkRouteEntries.map(e => ({ phoneNumber: e.phoneNumber, label: e.label })),
      });
    }
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      const start = lines[0] && /[a-zA-Z]/.test(lines[0].split(",")[0]) ? 1 : 0;
      const entries = lines.slice(start).map(line => {
        const parts = line.split(",").map(p => p.trim());
        return { phoneNumber: parts[0], label: parts[1] || undefined };
      }).filter(e => e.phoneNumber);
      if (entries.length === 0) { toast.error("No valid entries found"); return; }
      const routeEntries: InboundRouteEntry[] = entries.map(e => ({
        phoneNumber: e.phoneNumber,
        label: e.label,
        destination: "none",
        description: "TTS Dialer",
        cidPrefix: "",
      }));
      setBulkText(entries.map(e => e.label ? `${e.phoneNumber}, ${e.label}` : e.phoneNumber).join("\n"));
      setBulkRouteEntries(routeEntries);
      setFetchDests(true);
      setShowRouteConfig(true);
      setShowBulk(true);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === callerIds.length) setSelected(new Set());
    else setSelected(new Set(callerIds.map(c => c.id)));
  };

  const handleBulkEditLabel = () => {
    if (selected.size === 0) return;
    bulkUpdateMut.mutate({ ids: Array.from(selected), label: bulkEditLabelValue });
  };

  const handleInlineEditLabel = (id: number, newLabel: string) => {
    updateMut.mutate({ id, label: newLabel });
  };

  const activeCount = callerIds.filter(c => c.isActive === 1).length;
  const healthyCount = callerIds.filter(c => c.healthStatus === "healthy").length;
  const failedCount = callerIds.filter(c => c.healthStatus === "failed").length;
  const autoDisabledCount = callerIds.filter(c => c.autoDisabled === 1).length;
  const uncheckedCount = callerIds.filter(c => c.healthStatus === "unknown").length;

  const isBulkPending = bulkCreateMut.isPending || bulkCreateWithRoutesMut.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Caller IDs (DIDs)</h1>
            <p className="text-muted-foreground text-sm">Manage your outbound caller ID rotation pool and inbound routes</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {selected.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => { setBulkEditLabelValue(""); setShowBulkEditLabel(true); }}>
                  <Tag className="h-4 w-4 mr-1" /> Edit Labels ({selected.size})
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { if (confirm(`Delete ${selected.size} caller ID(s)?`)) bulkDeleteMut.mutate({ ids: Array.from(selected) }); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete {selected.size}
                </Button>
                <Button variant="outline" size="sm" onClick={() => healthCheckMut.mutate({ ids: Array.from(selected) })} disabled={healthCheckMut.isPending}>
                  <Activity className="h-4 w-4 mr-1" /> Check {selected.size}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => healthCheckMut.mutate()} disabled={healthCheckMut.isPending}>
              {healthCheckMut.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />}
              Health Check All
            </Button>
            <input type="file" ref={fileRef} accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Import CSV
            </Button>
            <Dialog open={showBulk} onOpenChange={(open) => {
              setShowBulk(open);
              if (open) setFetchDests(true);
              if (!open) { setShowRouteConfig(false); setBulkRouteEntries([]); setBulkLabel(""); }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1" /> Bulk Add</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Bulk Add Caller IDs</DialogTitle>
                  <DialogDescription>
                    Enter one caller ID per line. Format: phone_number, label (optional). Duplicates will be automatically skipped.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={bulkText}
                  onChange={e => handleBulkTextChange(e.target.value)}
                  rows={8}
                  placeholder={"4071234567, Main Line\n4079876543, Sales\n8001234567"}
                />
                {bulkRouteEntries.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {bulkRouteEntries.length} number(s) parsed
                  </div>
                )}

                {/* Global Label for all DIDs */}
                <div>
                  <Label className="text-sm flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" /> Apply Label to All
                  </Label>
                  <Input
                    className="mt-1"
                    value={bulkLabel}
                    onChange={e => handleBulkLabelChange(e.target.value)}
                    placeholder="e.g. Campaign A, Sales, etc."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Applied to all DIDs that don't have a per-line label. Per-line labels (after the comma) take priority.
                  </p>
                </div>

                {/* Inbound Route Config Toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showRouteConfig}
                    onCheckedChange={setShowRouteConfig}
                  />
                  <Label className="text-sm cursor-pointer" onClick={() => setShowRouteConfig(!showRouteConfig)}>
                    Create inbound routes on FreePBX
                  </Label>
                </div>

                {showRouteConfig && bulkRouteEntries.length > 0 && (
                  <InboundRouteConfigPanel
                    entries={bulkRouteEntries}
                    onEntriesChange={setBulkRouteEntries}
                    destinations={destinations}
                    destinationsLoading={destsLoading}
                  />
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
                  <Button onClick={handleBulkAdd} disabled={isBulkPending}>
                    {isBulkPending ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...</>
                    ) : showRouteConfig && bulkRouteEntries.some(e => e.destination !== "none") ? (
                      <><Route className="h-4 w-4 mr-1" /> Add with Routes</>
                    ) : (
                      "Add All"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Caller ID</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Caller ID</DialogTitle>
                  <DialogDescription>Add a DID number to your caller ID rotation pool</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Phone Number</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="4071234567" />
                  </div>
                  <div>
                    <Label>Label (optional)</Label>
                    <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Main Line" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button onClick={handleAdd} disabled={createMut.isPending}>
                    {createMut.isPending ? "Adding..." : "Add"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "routes") setFetchDests(true); }}>
          <TabsList>
            <TabsTrigger value="callerids"><Phone className="h-4 w-4 mr-1.5" /> Caller IDs</TabsTrigger>
            <TabsTrigger value="routes"><Route className="h-4 w-4 mr-1.5" /> Inbound Routes</TabsTrigger>
          </TabsList>

          <TabsContent value="callerids" className="space-y-6">

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total DIDs</CardDescription>
              <CardTitle className="text-3xl">{callerIds.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl text-green-500">{activeCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-green-500" /> Healthy</CardDescription>
              <CardTitle className="text-3xl text-green-500">{healthyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><ShieldX className="h-3.5 w-3.5 text-red-500" /> Failed</CardDescription>
              <CardTitle className="text-3xl text-red-500">{failedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><ShieldQuestion className="h-3.5 w-3.5" /> Unchecked</CardDescription>
              <CardTitle className="text-3xl text-muted-foreground">{uncheckedCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {autoDisabledCount > 0 && (
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 text-red-700 text-sm">
                <ShieldX className="h-4 w-4" />
                <span className="font-medium">{autoDisabledCount} DID{autoDisabledCount > 1 ? "s" : ""} auto-flagged</span>
                <span className="text-red-600/80">and removed from rotation due to high failure rates. Flagged DIDs enter a 30-minute cooldown then auto-reactivate, or you can reset manually.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auto Health Check Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Automatic Health Checks</CardTitle>
                  <CardDescription>Schedule periodic DID health checks to automatically detect and disable failing numbers</CardDescription>
                </div>
              </div>
              <Switch
                checked={schedule?.enabled === 1}
                onCheckedChange={(checked) => {
                  updateScheduleMut.mutate({ enabled: checked, intervalHours: schedule?.intervalHours || 24 });
                }}
              />
            </div>
          </CardHeader>
          {schedule?.enabled === 1 && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">Check every</Label>
                  <Select
                    value={String(schedule?.intervalHours || 24)}
                    onValueChange={(val) => updateScheduleMut.mutate({ enabled: true, intervalHours: Number(val) })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="4">4 hours</SelectItem>
                      <SelectItem value="8">8 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">2 days</SelectItem>
                      <SelectItem value="72">3 days</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {schedule?.lastRunAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Last run: {new Date(schedule.lastRunAt).toLocaleString()}
                    </span>
                  )}
                  {schedule?.nextRunAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Next run: {new Date(schedule.nextRunAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left w-10">
                      <Checkbox checked={selected.size === callerIds.length && callerIds.length > 0} onCheckedChange={selectAll} />
                    </th>
                    <th className="p-3 text-left">Phone Number</th>
                    <th className="p-3 text-left">Label</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Health</th>
                    <th className="p-3 text-left">Date Added</th>
                    <th className="p-3 text-left">Calls Made</th>
                    <th className="p-3 text-left">Last Used</th>
                    <th className="p-3 text-right min-w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : callerIds.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                      <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No caller IDs yet. Add DIDs to enable caller ID rotation.
                    </td></tr>
                  ) : callerIds.map(cid => (
                    <tr key={cid.id} className={`border-b hover:bg-muted/30 ${cid.autoDisabled ? "bg-red-50/30" : ""}`}>
                      <td className="p-3"><Checkbox checked={selected.has(cid.id)} onCheckedChange={() => toggleSelect(cid.id)} /></td>
                      <td className="p-3 font-mono">{cid.phoneNumber}</td>
                      <td className="p-3">
                        <InlineEditLabel
                          value={cid.label || ""}
                          onSave={(newLabel) => handleInlineEditLabel(cid.id, newLabel)}
                          isPending={updateMut.isPending}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={cid.isActive === 1}
                            onCheckedChange={(checked) => updateMut.mutate({ id: cid.id, isActive: checked ? 1 : 0 })}
                          />
                          <Badge variant={cid.isActive === 1 ? "default" : "secondary"}>
                            {cid.isActive === 1 ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-3">
                        <HealthBadge
                          status={cid.healthStatus}
                          autoDisabled={cid.autoDisabled}
                          lastCheckAt={cid.lastCheckAt}
                          lastCheckResult={cid.lastCheckResult}
                          consecutiveFailures={cid.consecutiveFailures}
                          failureRate={(cid as any).failureRate}
                          recentCallCount={(cid as any).recentCallCount}
                          flagReason={(cid as any).flagReason}
                          cooldownUntil={(cid as any).cooldownUntil}
                        />
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {cid.createdAt ? new Date(cid.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 font-medium">{cid.callCount}</td>
                      <td className="p-3 text-muted-foreground">
                        {cid.lastUsedAt ? new Date(cid.lastUsedAt).toLocaleString() : "Never"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(cid.healthStatus === "failed" || cid.autoDisabled === 1) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => resetHealthMut.mutate({ id: cid.id })} disabled={resetHealthMut.isPending}>
                                    <RotateCcw className="h-4 w-4 text-blue-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reset health &amp; re-enable</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => healthCheckMut.mutate({ ids: [cid.id] })} disabled={healthCheckMut.isPending}>
                                  <Activity className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Run health check</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: cid.id })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          {/* ─── Inbound Routes Tab ─────────────────────────────────────────── */}
          <TabsContent value="routes" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 w-64"
                    placeholder="Search routes..."
                    value={routeSearch}
                    onChange={e => setRouteSearch(e.target.value)}
                  />
                </div>
                <Badge variant="outline">{inboundRoutes.length} route(s) on FreePBX</Badge>
              </div>
              <div className="flex gap-2">
                {selectedRoutes.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete ${selectedRoutes.size} inbound route(s) from FreePBX?`))
                        deleteRoutesMut.mutate({ dids: Array.from(selectedRoutes) });
                    }}
                    disabled={deleteRoutesMut.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedRoutes.size}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => refetchRoutes()} disabled={routesLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${routesLoading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left w-10">
                          <Checkbox
                            checked={selectedRoutes.size === filteredRoutes.length && filteredRoutes.length > 0}
                            onCheckedChange={selectAllRoutes}
                          />
                        </th>
                        <th className="p-3 text-left">DID Number</th>
                        <th className="p-3 text-left">Description</th>
                        <th className="p-3 text-left">Destination Type</th>
                        <th className="p-3 text-left">Destination</th>
                        <th className="p-3 text-left">CID Prefix</th>
                        <th className="p-3 text-right min-w-[100px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routesLoading ? (
                        <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                          Loading routes from FreePBX...
                        </td></tr>
                      ) : filteredRoutes.length === 0 ? (
                        <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                          <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          {inboundRoutes.length === 0
                            ? "No inbound routes on FreePBX. Import DIDs with route configuration to create them."
                            : "No routes match your search."}
                        </td></tr>
                      ) : filteredRoutes.map(route => {
                        const typeBadge = destTypeBadge(route.destination);
                        return (
                          <tr key={route.did} className="border-b hover:bg-muted/30">
                            <td className="p-3">
                              <Checkbox
                                checked={selectedRoutes.has(route.did)}
                                onCheckedChange={() => toggleRouteSelect(route.did)}
                              />
                            </td>
                            <td className="p-3 font-mono font-medium">{route.did}</td>
                            <td className="p-3 text-muted-foreground">{route.description || "—"}</td>
                            <td className="p-3">
                              <Badge variant={typeBadge.variant} className="text-xs">{typeBadge.label}</Badge>
                            </td>
                            <td className="p-3 text-sm">{destToLabel(route.destination)}</td>
                            <td className="p-3 text-muted-foreground text-xs">{route.cidPrefix || "—"}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" onClick={() => startEditRoute(route)}>
                                        <Pencil className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit route</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm(`Delete inbound route for ${route.did}?`))
                                      deleteRoutesMut.mutate({ dids: [route.did] });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Edit Route Dialog */}
            <Dialog open={!!editingRoute} onOpenChange={(open) => { if (!open) setEditingRoute(null); }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Inbound Route</DialogTitle>
                  <DialogDescription>
                    Update the destination for DID <span className="font-mono font-medium">{editingRoute?.did}</span>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Destination</Label>
                    {destsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading destinations...
                      </div>
                    ) : (
                      <DestinationPicker
                        value={editDest}
                        onChange={setEditDest}
                        destinations={destinations}
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-sm">Route Label / Description</Label>
                    <Input
                      className="mt-1"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="TTS Dialer"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">CID Name Prefix (optional)</Label>
                    <Input
                      className="mt-1"
                      value={editCidPrefix}
                      onChange={e => setEditCidPrefix(e.target.value)}
                      placeholder="e.g. CB: or TTS:"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Prepended to caller name on inbound calls</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingRoute(null)}>Cancel</Button>
                  <Button onClick={handleUpdateRoute} disabled={updateRouteMut.isPending}>
                    {updateRouteMut.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                    ) : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

        </Tabs>

        {/* Bulk Edit Label Dialog */}
        <Dialog open={showBulkEditLabel} onOpenChange={setShowBulkEditLabel}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" /> Bulk Edit Labels
              </DialogTitle>
              <DialogDescription>
                Update the label for {selected.size} selected caller ID{selected.size > 1 ? "s" : ""}. Leave empty to clear labels.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>New Label</Label>
                <Input
                  className="mt-1"
                  value={bulkEditLabelValue}
                  onChange={e => setBulkEditLabelValue(e.target.value)}
                  placeholder="e.g. Campaign A, Sales, etc."
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleBulkEditLabel(); }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {selected.size} DID{selected.size > 1 ? "s" : ""} selected:
                <span className="font-mono ml-1">
                  {callerIds.filter(c => selected.has(c.id)).slice(0, 5).map(c => c.phoneNumber).join(", ")}
                  {selected.size > 5 ? ` +${selected.size - 5} more` : ""}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkEditLabel(false)}>Cancel</Button>
              <Button onClick={handleBulkEditLabel} disabled={bulkUpdateMut.isPending}>
                {bulkUpdateMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Updating...</>
                ) : (
                  <><Tag className="h-4 w-4 mr-1" /> Update Labels</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
