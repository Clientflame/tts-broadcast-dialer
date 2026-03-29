import { useState, useRef, useMemo, useEffect } from "react";
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
import { Phone, Plus, Upload, Trash2, Activity, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, RotateCcw, Clock, Calendar, Route, Loader2, ArrowRight, ChevronDown, ChevronUp, Pencil, ExternalLink, Search, AlertCircle, Tag, Check, X, Filter, AlertTriangle, Download } from "lucide-react";

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
  const [autoApplied, setAutoApplied] = useState(false);

  // Auto-select the first queue as default destination when destinations load
  useEffect(() => {
    if (!autoApplied && destinations.length > 0 && globalDest === "none" && entries.length > 0) {
      const firstQueue = destinations.find(d => d.type === "queue");
      if (firstQueue) {
        setGlobalDest(firstQueue.destination);
        onEntriesChange(entries.map(e => ({
          ...e,
          destination: e.destination === "none" ? firstQueue.destination : e.destination,
          description: e.description || "TTS Dialer",
        })));
        setAutoApplied(true);
      }
    }
  }, [destinations, entries.length, autoApplied]);

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
        <Badge variant="secondary" className="text-xs">Auto-configured</Badge>
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
  const createWithRouteMut = trpc.callerIds.createWithRoute.useMutation({
    onSuccess: (r: any) => {
      utils.callerIds.list.invalidate();
      if (r.inboundRoute) {
        if (r.inboundRoute.success && !r.inboundRoute.alreadyExists) {
          toast.success("Caller ID added with inbound route");
        } else if (r.inboundRoute.alreadyExists) {
          toast.success("Caller ID added (route already existed)");
        } else {
          toast.success(`Caller ID added but route failed: ${r.inboundRoute.error || "unknown error"}`);
        }
      } else {
        toast.success("Caller ID added");
      }
      setShowAdd(false); setPhone(""); setLabel(""); setSingleRouteDest("none"); setSingleRouteDesc("TTS Dialer"); setSingleRouteCidPrefix("");
    },
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
      if (r.inboundRoutes && r.inboundRoutes.summary) {
        const { created, skipped, failed } = r.inboundRoutes.summary;
        const parts = [];
        if (created > 0) parts.push(`${created} route(s) created`);
        if (skipped > 0) parts.push(`${skipped} already existed`);
        if (failed > 0) parts.push(`${failed} failed`);
        if (parts.length > 0) {
          toast.success(`${cidMsg}. Routes: ${parts.join(", ")}`);
        } else {
          toast.success(`${cidMsg}. No new routes needed.`);
        }
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

  // Vitelity DID import
  const [showVitelityImport, setShowVitelityImport] = useState(false);
  const [vitelitySelected, setVitelitySelected] = useState<Set<string>>(new Set());
  const [vitelityLabel, setVitelityLabel] = useState("");
  const [vitelityRouteEnabled, setVitelityRouteEnabled] = useState(true);
  const [vitelityRouteDest, setVitelityRouteDest] = useState("none");
  const [vitelityRouteDesc, setVitelityRouteDesc] = useState("TTS Dialer");
  const [vitelityRouteCidPrefix, setVitelityRouteCidPrefix] = useState("");
  const [vitelityImportProgress, setVitelityImportProgress] = useState<string | null>(null);

  // Route conflict resolution state
  type ConflictAction = "update" | "skip" | "keep";
  type ConflictEntry = {
    did: string;
    existingRoute: { destination: string; description: string; cidPrefix: string };
    newRoute: { destination: string; description: string; cidPrefix?: string };
    action: ConflictAction;
  };
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictSource, setConflictSource] = useState<"bulk" | "vitelity">("bulk");
  const [pendingNonConflictEntries, setPendingNonConflictEntries] = useState<any[]>([]);
  const checkConflictsMut = trpc.callerIds.checkInboundRoutesDetailed.useMutation();

  // DID Purchase state
  const [showPurchase, setShowPurchase] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<"search" | "results" | "confirm">("search");
  const [purchaseState, setPurchaseState] = useState("");
  const [purchaseRateCenter, setPurchaseRateCenter] = useState("");
  const [purchaseSelected, setPurchaseSelected] = useState<Set<string>>(new Set());
  const [purchaseLabel, setPurchaseLabel] = useState("");
  const [purchaseRouteEnabled, setPurchaseRouteEnabled] = useState(true);
  const [purchaseRouteDest, setPurchaseRouteDest] = useState("none");
  const [purchaseRouteDesc, setPurchaseRouteDesc] = useState("TTS Dialer");
  const [purchaseRouteSip, setPurchaseRouteSip] = useState("");
  const [purchaseProgress, setPurchaseProgress] = useState<string | null>(null);

  const { data: vitelityDIDs = [], isLoading: vitelityLoading, refetch: refetchVitelity, error: vitelityError } = trpc.callerIds.listVitelityDIDs.useQuery(undefined, {
    enabled: showVitelityImport,
    staleTime: 30000,
    retry: false,
  });
  const vitelityImportMut = trpc.callerIds.importFromVitelity.useMutation({
    onSuccess: (r) => {
      utils.callerIds.list.invalidate();
      const cidMsg = `${r.callerIds.count} DID(s) imported${r.callerIds.duplicatesOmitted > 0 ? ` (${r.callerIds.duplicatesOmitted} duplicates skipped)` : ""}`;
      if (r.inboundRoutes) {
        const rm = r.inboundRoutes.summary;
        toast.success(`${cidMsg}. Routes: ${rm.created} created, ${rm.skipped} existing, ${rm.failed} failed`);
      } else {
        toast.success(cidMsg);
      }
      setShowVitelityImport(false);
      setVitelitySelected(new Set());
      setVitelityLabel("");
      setVitelityImportProgress(null);
    },
    onError: (e) => { toast.error(e.message); setVitelityImportProgress(null); },
  });

  // DID Purchase queries and mutations
  const { data: availableStates = [], isLoading: statesLoading } = trpc.callerIds.availableStates.useQuery(undefined, {
    enabled: showPurchase,
    staleTime: 60000,
    retry: false,
  });
  const { data: availableRateCenters = [], isLoading: rateCentersLoading } = trpc.callerIds.availableRateCenters.useQuery(
    { state: purchaseState },
    { enabled: showPurchase && purchaseState.length === 2, staleTime: 60000, retry: false }
  );
  const { data: availableDIDs = [], isLoading: didsSearchLoading } = trpc.callerIds.searchAvailableDIDs.useQuery(
    { state: purchaseState, rateCenter: purchaseRateCenter || undefined },
    { enabled: showPurchase && purchaseStep === "results" && purchaseState.length === 2, staleTime: 30000, retry: false }
  );
  const { data: vitelityBalance } = trpc.callerIds.vitelityBalance.useQuery(undefined, {
    enabled: showPurchase,
    staleTime: 30000,
  });
  const bulkPurchaseMut = trpc.callerIds.bulkPurchaseDIDs.useMutation({
    onSuccess: (r) => {
      utils.callerIds.list.invalidate();
      const purchased = r.results.filter(x => x.purchased).length;
      const failed = r.results.filter(x => !x.purchased).length;
      if (failed > 0) {
        toast.warning(`${purchased} DID(s) purchased, ${failed} failed`);
      } else {
        toast.success(`${purchased} DID(s) purchased and added`);
      }
      setShowPurchase(false);
      setPurchaseSelected(new Set());
      setPurchaseStep("search");
      setPurchaseProgress(null);
    },
    onError: (e) => { toast.error(e.message); setPurchaseProgress(null); },
  });

  // CNAM lookup mutations
  const cnamLookupMut = trpc.callerIds.cnamLookup.useMutation({
    onSuccess: (r) => {
      utils.callerIds.list.invalidate();
      if (r.success && r.name) {
        toast.success(`CNAM: ${r.name}`);
      } else {
        toast.info(`CNAM lookup returned no name for ${r.did}`);
      }
    },
    onError: (e) => toast.error(`CNAM lookup failed: ${e.message}`),
  });
  const bulkCnamLookupMut = trpc.callerIds.bulkCnamLookup.useMutation({
    onSuccess: (results) => {
      utils.callerIds.list.invalidate();
      const found = results.filter(r => r.success && r.name).length;
      toast.success(`CNAM lookup complete: ${found} of ${results.length} names found`);
    },
    onError: (e) => toast.error(`Bulk CNAM lookup failed: ${e.message}`),
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
  const [showRouteConfig, setShowRouteConfig] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkEditLabel, setShowBulkEditLabel] = useState(false);
  const [bulkEditLabelValue, setBulkEditLabelValue] = useState("");
  const [didSearch, setDidSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("__all__");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: "single" | "bulk"; id?: number; ids?: number[]; phoneNumbers?: string[] } | null>(null);
  const [singleRouteEnabled, setSingleRouteEnabled] = useState(true);
  const [singleRouteDest, setSingleRouteDest] = useState("none");
  const [singleRouteDesc, setSingleRouteDesc] = useState("TTS Dialer");
  const [singleRouteCidPrefix, setSingleRouteCidPrefix] = useState("");
  const [singleRouteAutoApplied, setSingleRouteAutoApplied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-select first queue for single add route when destinations load
  useEffect(() => {
    if (!singleRouteAutoApplied && destinations.length > 0 && singleRouteDest === "none") {
      const firstQueue = destinations.find((d: any) => d.type === "queue");
      if (firstQueue) {
        setSingleRouteDest(firstQueue.destination);
        setSingleRouteAutoApplied(true);
      }
    }
  }, [destinations, singleRouteAutoApplied, singleRouteDest]);

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
    if (singleRouteEnabled && singleRouteDest && singleRouteDest !== "none") {
      createWithRouteMut.mutate({
        phoneNumber: phone.trim(),
        label: label.trim() || undefined,
        inboundRoute: {
          destination: singleRouteDest,
          description: singleRouteDesc || "TTS Dialer",
          cidPrefix: singleRouteCidPrefix || undefined,
        },
      });
    } else {
      createMut.mutate({ phoneNumber: phone.trim(), label: label.trim() || undefined });
    }
  };

  const handleBulkAdd = () => {
    // If route config toggle is off, just create caller IDs without routes
    if (!showRouteConfig) {
      const entries = bulkRouteEntries.length > 0
        ? bulkRouteEntries.map(e => ({ phoneNumber: e.phoneNumber, label: e.label }))
        : parseBulkEntries(bulkText, bulkLabel).map(e => ({ phoneNumber: e.phoneNumber, label: e.label }));
      if (entries.length === 0) return;
      bulkCreateMut.mutate({ entries });
      return;
    }

    // Route config is ON — use bulkRouteEntries or parse fresh
    let routeEntries = bulkRouteEntries;
    if (routeEntries.length === 0) {
      routeEntries = parseBulkEntries(bulkText, bulkLabel);
    }
    if (routeEntries.length === 0) return;

    // Check if any entries have inbound routes configured
    const hasRoutes = routeEntries.some(e => e.destination && e.destination !== "none");

    if (hasRoutes) {
      // Check for existing routes before creating
      const didsWithRoutes = routeEntries.filter(e => e.destination && e.destination !== "none").map(e => e.phoneNumber);
      checkConflictsMut.mutate({ dids: didsWithRoutes }, {
        onSuccess: (existingRoutes) => {
          const conflictList: ConflictEntry[] = [];
          const nonConflictEntries = routeEntries.map(e => {
            const existing = existingRoutes[e.phoneNumber];
            if (existing && e.destination && e.destination !== "none") {
              conflictList.push({
                did: e.phoneNumber,
                existingRoute: { destination: existing.destination, description: existing.description, cidPrefix: existing.cidPrefix },
                newRoute: { destination: e.destination, description: e.description || "TTS Dialer", cidPrefix: e.cidPrefix || undefined },
                action: "update",
              });
              return null; // Will be handled via conflict dialog
            }
            return {
              phoneNumber: e.phoneNumber,
              label: e.label,
              inboundRoute: e.destination && e.destination !== "none" ? {
                destination: e.destination,
                description: e.description || "TTS Dialer",
                cidPrefix: e.cidPrefix || undefined,
              } : undefined,
            };
          }).filter(Boolean);

          if (conflictList.length > 0) {
            setConflicts(conflictList);
            setConflictSource("bulk");
            setPendingNonConflictEntries(nonConflictEntries);
            setShowConflictDialog(true);
          } else {
            // No conflicts — proceed directly
            bulkCreateWithRoutesMut.mutate({ entries: nonConflictEntries as any });
          }
        },
        onError: () => {
          // If conflict check fails, proceed anyway (best effort)
          bulkCreateWithRoutesMut.mutate({
            entries: routeEntries.map(e => ({
              phoneNumber: e.phoneNumber,
              label: e.label,
              inboundRoute: e.destination && e.destination !== "none" ? {
                destination: e.destination,
                description: e.description || "TTS Dialer",
                cidPrefix: e.cidPrefix || undefined,
              } : undefined,
            })),
          });
        },
      });
    } else {
      // Route toggle is on but no destinations selected — still create without routes
      bulkCreateMut.mutate({
        entries: routeEntries.map(e => ({ phoneNumber: e.phoneNumber, label: e.label })),
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

  // Unique labels for the filter dropdown
  const uniqueLabels = useMemo(() => {
    const labels = callerIds.map(c => c.label || "").filter(Boolean);
    return Array.from(new Set(labels)).sort();
  }, [callerIds]);

  // Filtered caller IDs based on search and label filter
  const filteredCallerIds = useMemo(() => {
    let result = callerIds;
    if (didSearch) {
      const q = didSearch.toLowerCase();
      result = result.filter(c =>
        c.phoneNumber.toLowerCase().includes(q) ||
        (c.label || "").toLowerCase().includes(q)
      );
    }
    if (labelFilter !== "__all__") {
      if (labelFilter === "__none__") {
        result = result.filter(c => !c.label);
      } else {
        result = result.filter(c => c.label === labelFilter);
      }
    }
    return result;
  }, [callerIds, didSearch, labelFilter]);

  const handleConfirmDelete = () => {
    if (!showDeleteConfirm) return;
    if (showDeleteConfirm.type === "single" && showDeleteConfirm.id) {
      deleteMut.mutate({ id: showDeleteConfirm.id });
    } else if (showDeleteConfirm.type === "bulk" && showDeleteConfirm.ids) {
      bulkDeleteMut.mutate({ ids: showDeleteConfirm.ids });
    }
    setShowDeleteConfirm(null);
  };

  const activeCount = callerIds.filter(c => c.isActive === 1).length;
  const healthyCount = callerIds.filter(c => c.healthStatus === "healthy").length;
  const failedCount = callerIds.filter(c => c.healthStatus === "failed").length;
  const autoDisabledCount = callerIds.filter(c => c.autoDisabled === 1).length;
  const uncheckedCount = callerIds.filter(c => c.healthStatus === "unknown").length;

  const isBulkPending = bulkCreateMut.isPending || bulkCreateWithRoutesMut.isPending;
  const [bulkProgress, setBulkProgress] = useState<{ stage: "idle" | "adding" | "routes" | "done"; count: number } >({ stage: "idle", count: 0 });

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
                <Button variant="destructive" size="sm" onClick={() => {
                  const ids = Array.from(selected);
                  const phones = callerIds.filter(c => ids.includes(c.id)).map(c => c.phoneNumber);
                  setShowDeleteConfirm({ type: "bulk", ids, phoneNumbers: phones });
                }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete {selected.size}
                </Button>
                <Button variant="outline" size="sm" onClick={() => healthCheckMut.mutate({ ids: Array.from(selected) })} disabled={healthCheckMut.isPending}>
                  <Activity className="h-4 w-4 mr-1" /> Check {selected.size}
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const ids = Array.from(selected);
                  const dids = callerIds.filter(c => ids.includes(c.id)).map(c => ({
                    did: c.phoneNumber.replace(/^1/, ""),
                    callerIdId: c.id,
                  }));
                  bulkCnamLookupMut.mutate({ dids });
                }} disabled={bulkCnamLookupMut.isPending}>
                  {bulkCnamLookupMut.isPending
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Looking up...</>
                    : <><Search className="h-4 w-4 mr-1" /> CNAM Lookup ({selected.size})</>
                  }
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
            <Button variant="outline" size="sm" onClick={() => { setShowVitelityImport(true); setFetchDests(true); }}>
              <ExternalLink className="h-4 w-4 mr-1" /> Import from Vitelity
            </Button>
            <Button variant="default" size="sm" onClick={() => { setShowPurchase(true); setFetchDests(true); setPurchaseStep("search"); }}>
              <Phone className="h-4 w-4 mr-1" /> Purchase DIDs
            </Button>
            <Dialog open={showBulk} onOpenChange={(open) => {
              setShowBulk(open);
              if (open) setFetchDests(true);
              if (!open) { setShowRouteConfig(true); setBulkRouteEntries([]); setBulkLabel(""); }
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

                {/* Progress indicator during bulk add */}
                {isBulkPending && (
                  <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="font-medium">
                        {bulkCreateWithRoutesMut.isPending
                          ? "Adding DIDs and creating FreePBX inbound routes..."
                          : "Adding DIDs to database..."}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: bulkCreateWithRoutesMut.isPending ? "60%" : "30%" }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {bulkCreateWithRoutesMut.isPending
                          ? `Processing ${bulkRouteEntries.length} DID(s) with route creation via SSH`
                          : `Processing ${bulkRouteEntries.length || "..."} DID(s)`}
                      </span>
                      <span>This may take a moment for large batches</span>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowBulk(false)} disabled={isBulkPending}>Cancel</Button>
                  <Button onClick={handleBulkAdd} disabled={isBulkPending}>
                    {isBulkPending ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        {showRouteConfig && bulkRouteEntries.some(e => e.destination !== "none")
                          ? "Adding DIDs & Creating Routes..."
                          : "Adding..."}
                      </>
                    ) : showRouteConfig && bulkRouteEntries.some(e => e.destination !== "none") ? (
                      <><Route className="h-4 w-4 mr-1" /> Add with Routes</>
                    ) : (
                      "Add All"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={showAdd} onOpenChange={(open) => {
              setShowAdd(open);
              if (open) setFetchDests(true);
            }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Caller ID</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
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

                  {/* Inbound Route Config */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={singleRouteEnabled}
                      onCheckedChange={setSingleRouteEnabled}
                    />
                    <Label className="text-sm cursor-pointer" onClick={() => setSingleRouteEnabled(!singleRouteEnabled)}>
                      Create inbound route on FreePBX
                    </Label>
                  </div>

                  {singleRouteEnabled && (
                    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Inbound Route</span>
                        <Badge variant="secondary" className="text-xs">Auto-configured</Badge>
                      </div>
                      <div>
                        <Label className="text-xs">Destination</Label>
                        {destsLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading destinations...
                          </div>
                        ) : (
                          <DestinationPicker
                            value={singleRouteDest}
                            onChange={setSingleRouteDest}
                            destinations={destinations}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Route Label</Label>
                          <Input
                            className="mt-1"
                            value={singleRouteDesc}
                            onChange={e => setSingleRouteDesc(e.target.value)}
                            placeholder="TTS Dialer"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">CID Prefix (optional)</Label>
                          <Input
                            className="mt-1"
                            value={singleRouteCidPrefix}
                            onChange={e => setSingleRouteCidPrefix(e.target.value)}
                            placeholder="e.g. CB:"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button onClick={handleAdd} disabled={createMut.isPending || createWithRouteMut.isPending}>
                    {(createMut.isPending || createWithRouteMut.isPending) ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...</>
                    ) : singleRouteEnabled && singleRouteDest !== "none" ? (
                      <><Route className="h-4 w-4 mr-1" /> Add with Route</>
                    ) : (
                      "Add"
                    )}
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
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border-b bg-muted/20">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by number or label..."
                  value={didSearch}
                  onChange={e => setDidSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={labelFilter} onValueChange={setLabelFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by label" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Labels</SelectItem>
                    <SelectItem value="__none__">No Label</SelectItem>
                    {uniqueLabels.map(label => (
                      <SelectItem key={label} value={label}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(didSearch || labelFilter !== "__all__") && (
                  <Button variant="ghost" size="sm" onClick={() => { setDidSearch(""); setLabelFilter("__all__"); }}>
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>
              {filteredCallerIds.length !== callerIds.length && (
                <Badge variant="outline" className="text-xs">
                  Showing {filteredCallerIds.length} of {callerIds.length}
                </Badge>
              )}
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={() => {
                  const rows = filteredCallerIds.map(c => ({
                    phoneNumber: c.phoneNumber,
                    label: c.label || "",
                    status: c.isActive ? "Active" : "Inactive",
                    healthStatus: (c as any).healthStatus || "unknown",
                    callCount: c.callCount,
                    lastUsedAt: c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "",
                    createdAt: c.createdAt ? new Date(c.createdAt).toLocaleString() : "",
                  }));
                  const headers = ["Phone Number", "Label", "Status", "Health", "Call Count", "Last Used", "Created"];
                  const csv = [headers.join(","), ...rows.map(r => [
                    r.phoneNumber, `"${r.label}"`, r.status, r.healthStatus, r.callCount, `"${r.lastUsedAt}"`, `"${r.createdAt}"`
                  ].join(","))].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `caller-ids${labelFilter !== "__all__" ? `-${labelFilter}` : ""}${didSearch ? `-search` : ""}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${filteredCallerIds.length} DIDs to CSV`);
                }}>
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left w-10">
                      <Checkbox checked={selected.size === filteredCallerIds.length && filteredCallerIds.length > 0} onCheckedChange={() => {
                        if (selected.size === filteredCallerIds.length) setSelected(new Set());
                        else setSelected(new Set(filteredCallerIds.map(c => c.id)));
                      }} />
                    </th>
                    <th className="p-3 text-left">Phone Number</th>
                    <th className="p-3 text-left">Label</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Health</th>
                    <th className="p-3 text-left">Date Added</th>
                    <th className="p-3 text-left">Calls Made</th>
                    <th className="p-3 text-left">Last Used</th>
                    <th className="p-3 text-left">CNAM</th>
                    <th className="p-3 text-right min-w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : callerIds.length === 0 ? (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No caller IDs yet. Add DIDs to enable caller ID rotation.
                    </td></tr>
                  ) : filteredCallerIds.length === 0 ? (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No caller IDs match your search or filter.
                    </td></tr>
                  ) : filteredCallerIds.map(cid => (
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
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {(cid as any).cnamName ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs max-w-[120px] truncate cursor-help">
                                    {(cid as any).cnamName}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{(cid as any).cnamName}</p>
                                  {(cid as any).cnamLookedUpAt && (
                                    <p className="text-xs text-muted-foreground">Looked up: {new Date((cid as any).cnamLookedUpAt).toLocaleString()}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    const did = cid.phoneNumber.replace(/^1/, "");
                                    cnamLookupMut.mutate({ did, callerIdId: cid.id });
                                  }}
                                  disabled={cnamLookupMut.isPending}
                                >
                                  <Search className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>CNAM Lookup ($0.01/lookup)</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
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
                          <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm({ type: "single", id: cid.id, phoneNumbers: [cid.phoneNumber] })}>
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

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Confirm Deletion
              </DialogTitle>
              <DialogDescription>
                {showDeleteConfirm?.type === "single"
                  ? "This will permanently delete the caller ID and its inbound route on FreePBX."
                  : `This will permanently delete ${showDeleteConfirm?.ids?.length || 0} caller ID(s) and their inbound routes on FreePBX.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Route className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800 dark:text-amber-300">
                    <p className="font-medium">FreePBX inbound routes will also be removed</p>
                    <p className="text-xs mt-1 text-amber-700 dark:text-amber-400">
                      Any inbound routes configured for {showDeleteConfirm?.type === "single" ? "this number" : "these numbers"} on FreePBX will be automatically deleted. This cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
              {showDeleteConfirm?.phoneNumbers && showDeleteConfirm.phoneNumbers.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Affected number{showDeleteConfirm.phoneNumbers.length > 1 ? "s" : ""}:</span>
                  <span className="font-mono ml-1">
                    {showDeleteConfirm.phoneNumbers.slice(0, 8).join(", ")}
                    {showDeleteConfirm.phoneNumbers.length > 8 ? ` +${showDeleteConfirm.phoneNumbers.length - 8} more` : ""}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteMut.isPending || bulkDeleteMut.isPending}>
                {(deleteMut.isPending || bulkDeleteMut.isPending) ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-1" /> Delete {showDeleteConfirm?.type === "single" ? "Caller ID" : `${showDeleteConfirm?.ids?.length} Caller IDs`}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {/* Vitelity DID Import Dialog */}
        <Dialog open={showVitelityImport} onOpenChange={(open) => {
          setShowVitelityImport(open);
          if (!open) {
            setVitelitySelected(new Set());
            setVitelityLabel("");
            setVitelityImportProgress(null);
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5" /> Import DIDs from Vitelity
              </DialogTitle>
              <DialogDescription>
                Select DIDs from your Vitelity account to import. Already-existing DIDs will be skipped.
              </DialogDescription>
            </DialogHeader>

            {vitelityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-muted-foreground">Fetching DIDs from Vitelity...</span>
              </div>
            ) : vitelityError ? (
              <div className="py-8 text-center">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-destructive font-medium">Failed to connect to Vitelity</p>
                <p className="text-sm text-muted-foreground mt-1">{vitelityError.message}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchVitelity()}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Retry
                </Button>
              </div>
            ) : vitelityDIDs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No DIDs found on your Vitelity account.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={vitelitySelected.size === vitelityDIDs.length && vitelityDIDs.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) setVitelitySelected(new Set(vitelityDIDs.map(d => d.did)));
                        else setVitelitySelected(new Set());
                      }}
                    />
                    <span className="text-sm font-medium">
                      {vitelitySelected.size > 0 ? `${vitelitySelected.size} of ${vitelityDIDs.length} selected` : `${vitelityDIDs.length} DIDs available`}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => refetchVitelity()}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                </div>

                <div className="border rounded-md max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 w-8"></th>
                        <th className="p-2 text-left font-medium">Phone Number</th>
                        <th className="p-2 text-left font-medium">Rate Center</th>
                        <th className="p-2 text-left font-medium">State</th>
                        <th className="p-2 text-left font-medium">Rate/Min</th>
                        <th className="p-2 text-left font-medium">Sub Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vitelityDIDs.map((d) => (
                        <tr key={d.did} className={`border-t hover:bg-muted/30 cursor-pointer ${vitelitySelected.has(d.did) ? "bg-primary/5" : ""}`}
                          onClick={() => {
                            const next = new Set(vitelitySelected);
                            if (next.has(d.did)) next.delete(d.did); else next.add(d.did);
                            setVitelitySelected(next);
                          }}>
                          <td className="p-2">
                            <Checkbox checked={vitelitySelected.has(d.did)} onCheckedChange={() => {}} />
                          </td>
                          <td className="p-2 font-mono">{d.did.length === 10 ? `(${d.did.slice(0,3)}) ${d.did.slice(3,6)}-${d.did.slice(6)}` : d.did}</td>
                          <td className="p-2 text-muted-foreground">{d.rateCenter}</td>
                          <td className="p-2 text-muted-foreground">{d.state}</td>
                          <td className="p-2 text-muted-foreground">${d.ratePerMinute}</td>
                          <td className="p-2 text-muted-foreground">{d.subAccount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Label */}
                <div className="mt-4 space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Apply Label to All</Label>
                    <Input
                      placeholder="e.g., Vitelity Import, Sales, Region A"
                      value={vitelityLabel}
                      onChange={(e) => setVitelityLabel(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  {/* Inbound Route Config */}
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4" />
                        <Label className="text-sm font-medium">Create Inbound Routes on FreePBX</Label>
                      </div>
                      <Switch checked={vitelityRouteEnabled} onCheckedChange={setVitelityRouteEnabled} />
                    </div>
                    {vitelityRouteEnabled && (
                      <div className="space-y-2 pl-6">
                        <div>
                          <Label className="text-xs text-muted-foreground">Destination</Label>
                          {destsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Loading destinations...
                            </div>
                          ) : (
                            <Select value={vitelityRouteDest} onValueChange={setVitelityRouteDest}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select destination" />
                              </SelectTrigger>
                              <SelectContent>
                                {destinations.map((d: any) => (
                                  <SelectItem key={d.destination} value={d.destination}>
                                    <span className="capitalize">{d.type}</span>: {d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Description</Label>
                            <Input value={vitelityRouteDesc} onChange={(e) => setVitelityRouteDesc(e.target.value)} className="mt-1" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">CID Prefix (optional)</Label>
                            <Input value={vitelityRouteCidPrefix} onChange={(e) => setVitelityRouteCidPrefix(e.target.value)} placeholder="e.g., [VIT]" className="mt-1" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress */}
                {vitelityImportProgress && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {vitelityImportProgress}
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowVitelityImport(false)} disabled={vitelityImportMut.isPending}>
                Cancel
              </Button>
              <Button
                disabled={vitelitySelected.size === 0 || vitelityImportMut.isPending || (vitelityRouteEnabled && vitelityRouteDest === "none")}
                onClick={() => {
                  const selectedDids = Array.from(vitelitySelected);
                  const dids = selectedDids.map(did => ({
                    phoneNumber: did,
                    label: vitelityLabel || undefined,
                    inboundRoute: vitelityRouteEnabled && vitelityRouteDest !== "none" ? {
                      destination: vitelityRouteDest,
                      description: vitelityRouteDesc || "TTS Dialer",
                      cidPrefix: vitelityRouteCidPrefix || undefined,
                    } : undefined,
                  }));

                  // If routes are enabled, check for conflicts first
                  if (vitelityRouteEnabled && vitelityRouteDest !== "none") {
                    setVitelityImportProgress("Checking for existing routes...");
                    checkConflictsMut.mutate({ dids: selectedDids }, {
                      onSuccess: (existingRoutes) => {
                        const conflictList: ConflictEntry[] = [];
                        const nonConflictDids = dids.filter(d => {
                          const existing = existingRoutes[d.phoneNumber];
                          if (existing && d.inboundRoute) {
                            conflictList.push({
                              did: d.phoneNumber,
                              existingRoute: { destination: existing.destination, description: existing.description, cidPrefix: existing.cidPrefix },
                              newRoute: { destination: d.inboundRoute.destination, description: d.inboundRoute.description || "TTS Dialer", cidPrefix: d.inboundRoute.cidPrefix },
                              action: "update",
                            });
                            return false;
                          }
                          return true;
                        });

                        if (conflictList.length > 0) {
                          setVitelityImportProgress(null);
                          setConflicts(conflictList);
                          setConflictSource("vitelity");
                          // Store non-conflict entries for after conflict resolution
                          setPendingNonConflictEntries(nonConflictDids);
                          setShowConflictDialog(true);
                        } else {
                          setVitelityImportProgress(`Importing ${dids.length} DID(s) and creating inbound routes...`);
                          vitelityImportMut.mutate({ dids });
                        }
                      },
                      onError: () => {
                        // If conflict check fails, proceed anyway
                        setVitelityImportProgress(`Importing ${dids.length} DID(s) and creating inbound routes...`);
                        vitelityImportMut.mutate({ dids });
                      },
                    });
                  } else {
                    setVitelityImportProgress("Importing DIDs...");
                    vitelityImportMut.mutate({ dids });
                  }
                }}
              >
                {vitelityImportMut.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing...</>
                ) : (
                  <><Download className="h-4 w-4 mr-1" /> Import {vitelitySelected.size} DID(s)</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Route Conflict Resolution Dialog */}
        <Dialog open={showConflictDialog} onOpenChange={(open) => {
          if (!open) { setShowConflictDialog(false); setConflicts([]); setPendingNonConflictEntries([]); }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Route Conflicts Detected
              </DialogTitle>
              <DialogDescription>
                {conflicts.length} DID(s) already have inbound routes on FreePBX. Choose how to handle each one.
              </DialogDescription>
            </DialogHeader>

            {/* Quick actions */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Set all to:</span>
              <Button variant="outline" size="sm" onClick={() => setConflicts(conflicts.map(c => ({ ...c, action: "update" })))}>
                <RefreshCw className="h-3 w-3 mr-1" /> Update All
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConflicts(conflicts.map(c => ({ ...c, action: "skip" })))}>
                <X className="h-3 w-3 mr-1" /> Skip All
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConflicts(conflicts.map(c => ({ ...c, action: "keep" })))}>
                <Check className="h-3 w-3 mr-1" /> Keep All Existing
              </Button>
            </div>

            <div className="border rounded-md max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium">DID</th>
                    <th className="p-2 text-left font-medium">Existing Route</th>
                    <th className="p-2 text-left font-medium">New Route</th>
                    <th className="p-2 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((c, idx) => {
                    const existDestName = destinations.find((d: any) => d.destination === c.existingRoute.destination)?.name || c.existingRoute.destination;
                    const newDestName = destinations.find((d: any) => d.destination === c.newRoute.destination)?.name || c.newRoute.destination;
                    return (
                      <tr key={c.did} className="border-t">
                        <td className="p-2 font-mono">
                          {c.did.length === 10 ? `(${c.did.slice(0,3)}) ${c.did.slice(3,6)}-${c.did.slice(6)}` : c.did}
                        </td>
                        <td className="p-2">
                          <div className="text-xs">
                            <span className="text-muted-foreground">Dest:</span> {existDestName}
                          </div>
                          {c.existingRoute.description && (
                            <div className="text-xs text-muted-foreground">{c.existingRoute.description}</div>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="text-xs">
                            <span className="text-muted-foreground">Dest:</span> {newDestName}
                          </div>
                          {c.newRoute.description && (
                            <div className="text-xs text-muted-foreground">{c.newRoute.description}</div>
                          )}
                        </td>
                        <td className="p-2">
                          <Select value={c.action} onValueChange={(val) => {
                            const updated = [...conflicts];
                            updated[idx] = { ...c, action: val as ConflictAction };
                            setConflicts(updated);
                          }}>
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="update">
                                <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Update</span>
                              </SelectItem>
                              <SelectItem value="skip">
                                <span className="flex items-center gap-1"><X className="h-3 w-3" /> Skip</span>
                              </SelectItem>
                              <SelectItem value="keep">
                                <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Keep Existing</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Update</strong> — Replace the existing route with the new destination</p>
              <p><strong>Skip</strong> — Don't create a route for this DID (DID still gets imported)</p>
              <p><strong>Keep Existing</strong> — Keep the current route as-is (DID still gets imported)</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowConflictDialog(false); setConflicts([]); setPendingNonConflictEntries([]); }}>
                Cancel Import
              </Button>
              <Button onClick={async () => {
                setShowConflictDialog(false);

                // Process conflicts: update routes that user chose to update
                const toUpdate = conflicts.filter(c => c.action === "update");
                const toSkip = conflicts.filter(c => c.action === "skip" || c.action === "keep");

                // Update existing routes
                let updateCount = 0;
                for (const c of toUpdate) {
                  try {
                    await utils.client.callerIds.updateInboundRoute.mutate({
                      did: c.did,
                      destination: c.newRoute.destination,
                      description: c.newRoute.description,
                      cidPrefix: c.newRoute.cidPrefix || undefined,
                    });
                    updateCount++;
                  } catch (e) {
                    console.error(`Failed to update route for ${c.did}:`, e);
                  }
                }

                if (updateCount > 0) toast.success(`Updated ${updateCount} existing route(s)`);
                if (toSkip.length > 0) toast.info(`Skipped/kept ${toSkip.length} existing route(s)`);

                // Now proceed with non-conflict entries
                if (conflictSource === "vitelity") {
                  // For Vitelity imports, use the vitelity import mutation
                  const allConflictDids = conflicts.map(c => ({
                    phoneNumber: c.did,
                    label: vitelityLabel || undefined,
                    inboundRoute: undefined as any, // Routes already handled above
                  }));
                  const allDids = [...(pendingNonConflictEntries as any[]), ...allConflictDids];
                  if (allDids.length > 0) {
                    setVitelityImportProgress(`Importing ${allDids.length} DID(s)...`);
                    vitelityImportMut.mutate({ dids: allDids });
                  }
                } else {
                  // For bulk add
                  if (pendingNonConflictEntries.length > 0) {
                    setBulkProgress({ stage: "adding", count: pendingNonConflictEntries.length });
                    bulkCreateWithRoutesMut.mutate({ entries: pendingNonConflictEntries as any });
                  } else {
                    // All entries were conflicts — just create the DIDs without routes
                    const allDids = conflicts.map(c => c.did);
                    const entries = allDids.map(did => {
                      const entry = bulkRouteEntries.find(e => e.phoneNumber === did);
                      return { phoneNumber: did, label: entry?.label };
                    });
                    if (entries.length > 0) bulkCreateMut.mutate({ entries });
                  }
                }

                setConflicts([]);
                setPendingNonConflictEntries([]);
              }}>
                <Check className="h-4 w-4 mr-1" /> Proceed with Import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Purchase DIDs Dialog */}
        <Dialog open={showPurchase} onOpenChange={(open) => {
          setShowPurchase(open);
          if (!open) {
            setPurchaseStep("search");
            setPurchaseState("");
            setPurchaseRateCenter("");
            setPurchaseSelected(new Set());
            setPurchaseLabel("");
            setPurchaseRouteEnabled(true);
            setPurchaseRouteDest("none");
            setPurchaseRouteDesc("TTS Dialer");
            setPurchaseRouteSip("");
            setPurchaseProgress(null);
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" /> Purchase DIDs from Vitelity
              </DialogTitle>
              <DialogDescription>
                Search and purchase new phone numbers from your Vitelity account.
                {vitelityBalance && <span className="ml-2 font-medium text-green-600">Balance: ${vitelityBalance}</span>}
              </DialogDescription>
            </DialogHeader>

            {purchaseStep === "search" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Select value={purchaseState} onValueChange={(v) => { setPurchaseState(v); setPurchaseRateCenter(""); }}>
                      <SelectTrigger>
                        <SelectValue placeholder={statesLoading ? "Loading states..." : "Select state"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {availableStates.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Rate Center (optional)</Label>
                    <Select value={purchaseRateCenter} onValueChange={setPurchaseRateCenter} disabled={!purchaseState}>
                      <SelectTrigger>
                        <SelectValue placeholder={rateCentersLoading ? "Loading..." : "All rate centers"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="all">All Rate Centers</SelectItem>
                        {availableRateCenters.map(rc => (
                          <SelectItem key={rc} value={rc}>{rc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={() => setPurchaseStep("results")}
                  disabled={!purchaseState}
                  className="w-full"
                >
                  <Search className="h-4 w-4 mr-2" /> Search Available DIDs
                </Button>
              </div>
            )}

            {purchaseStep === "results" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setPurchaseStep("search")}>
                    <ArrowRight className="h-4 w-4 mr-1 rotate-180" /> Back to Search
                  </Button>
                  <Badge variant="secondary">
                    {didsSearchLoading ? "Searching..." : `${availableDIDs.length} DID(s) found`}
                  </Badge>
                </div>

                {didsSearchLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Searching available DIDs...
                  </div>
                ) : availableDIDs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No DIDs available for this state/rate center. Try a different search.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        checked={purchaseSelected.size === availableDIDs.length && availableDIDs.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setPurchaseSelected(new Set(availableDIDs.map(d => d.did)));
                          } else {
                            setPurchaseSelected(new Set());
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground">Select all ({availableDIDs.length})</span>
                      {purchaseSelected.size > 0 && (
                        <Badge>{purchaseSelected.size} selected</Badge>
                      )}
                    </div>
                    <div className="border rounded-md max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="p-2 w-8"></th>
                            <th className="p-2 text-left">Phone Number</th>
                            <th className="p-2 text-left">Rate Center</th>
                            <th className="p-2 text-left">State</th>
                            <th className="p-2 text-right">$/min</th>
                            <th className="p-2 text-right">$/month</th>
                          </tr>
                        </thead>
                        <tbody>
                          {availableDIDs.map(d => (
                            <tr key={d.did} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => {
                              const next = new Set(purchaseSelected);
                              if (next.has(d.did)) next.delete(d.did); else next.add(d.did);
                              setPurchaseSelected(next);
                            }}>
                              <td className="p-2">
                                <Checkbox checked={purchaseSelected.has(d.did)} onCheckedChange={() => {
                                  const next = new Set(purchaseSelected);
                                  if (next.has(d.did)) next.delete(d.did); else next.add(d.did);
                                  setPurchaseSelected(next);
                                }} />
                              </td>
                              <td className="p-2 font-mono">{d.did.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}</td>
                              <td className="p-2">{d.rateCenter}</td>
                              <td className="p-2">{d.state}</td>
                              <td className="p-2 text-right">{d.ratePerMinute}</td>
                              <td className="p-2 text-right">{d.ratePerMonth}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {purchaseSelected.size > 0 && (
                  <Button onClick={() => setPurchaseStep("confirm")} className="w-full">
                    <ArrowRight className="h-4 w-4 mr-2" /> Configure & Purchase {purchaseSelected.size} DID(s)
                  </Button>
                )}
              </div>
            )}

            {purchaseStep === "confirm" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setPurchaseStep("results")}>
                  <ArrowRight className="h-4 w-4 mr-1 rotate-180" /> Back to Results
                </Button>

                <div className="bg-muted/50 rounded-md p-3">
                  <span className="font-medium">{purchaseSelected.size} DID(s) selected for purchase</span>
                  <div className="text-sm text-muted-foreground mt-1 font-mono">
                    {Array.from(purchaseSelected).slice(0, 5).join(", ")}
                    {purchaseSelected.size > 5 && ` +${purchaseSelected.size - 5} more`}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Label (applied to all purchased DIDs)</Label>
                  <Input value={purchaseLabel} onChange={e => setPurchaseLabel(e.target.value)} placeholder="e.g., Sales, Marketing" />
                </div>

                <div className="space-y-2">
                  <Label>Route to SIP Server (optional)</Label>
                  <Input value={purchaseRouteSip} onChange={e => setPurchaseRouteSip(e.target.value)} placeholder="e.g., sip.yourserver.com" />
                  <p className="text-xs text-muted-foreground">Routes the DID on Vitelity's side to your SIP server</p>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={purchaseRouteEnabled} onCheckedChange={setPurchaseRouteEnabled} />
                  <Label>Create FreePBX inbound routes</Label>
                </div>

                {purchaseRouteEnabled && (
                  <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label>Destination</Label>
                      <DestinationPicker
                        value={purchaseRouteDest}
                        onChange={setPurchaseRouteDest}
                        destinations={destinations}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input value={purchaseRouteDesc} onChange={e => setPurchaseRouteDesc(e.target.value)} />
                    </div>
                  </div>
                )}

                {purchaseProgress && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-sm text-blue-700 dark:text-blue-300">{purchaseProgress}</span>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowPurchase(false)}>Cancel</Button>
                  <Button
                    disabled={bulkPurchaseMut.isPending || purchaseSelected.size === 0}
                    onClick={() => {
                      setPurchaseProgress(`Purchasing ${purchaseSelected.size} DID(s)...`);
                      const dids = Array.from(purchaseSelected).map(did => {
                        const found = availableDIDs.find(d => d.did === did);
                        return { did, rateCenter: found?.rateCenter, state: found?.state };
                      });
                      bulkPurchaseMut.mutate({
                        dids,
                        routeSip: purchaseRouteSip || undefined,
                        label: purchaseLabel || undefined,
                        createInboundRoute: purchaseRouteEnabled,
                        destination: purchaseRouteEnabled ? purchaseRouteDest : undefined,
                        description: purchaseRouteEnabled ? purchaseRouteDesc : undefined,
                      });
                    }}
                  >
                    {bulkPurchaseMut.isPending
                      ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Purchasing...</>
                      : <><Phone className="h-4 w-4 mr-1" /> Purchase {purchaseSelected.size} DID(s)</>
                    }
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
