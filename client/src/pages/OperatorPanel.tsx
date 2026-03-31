import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import VtigerCrmButton from "@/components/VtigerCrmButton";
import { toast } from "sonner";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneForwarded,
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Server,
  Activity,
  Clock,
  Brain,
  AlertTriangle,
  Gauge,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  LayoutGrid,
  List,
  ParkingSquare,
  X,
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  Monitor,
  User,
  Headphones,
  PhoneMissed,
  CircleDot,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ExtensionData {
  ext: string;
  name: string;
  status: "available" | "in_use" | "ringing" | "on_hold" | "unavailable" | "offline";
  callerNum: string;
  callerName: string;
  duration: number;
  channel: string;
  agentId?: string;
  updatedAt?: number;
}

interface AgentCall {
  id: number;
  phoneNumber: string;
  channel: string;
  status: string;
  callerIdStr: string | null;
  audioName: string | null;
  campaignId: number | null;
  claimedAt: number | null;
  result: string | null;
}

interface AgentData {
  id: number;
  agentId: string;
  name: string;
  status: string;
  activeCalls: number;
  maxCalls: number;
  cpsLimit: number;
  cpsPacingMs: number;
  ipAddress: string | null;
  lastHeartbeat: number | null;
  voiceAiBridge: boolean;
  ariConnected: boolean;
  agentVersion: string | null;
  throttled: boolean;
  throttleReason: string | null;
  calls: AgentCall[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(startMs: number | null): string {
  if (!startMs) return "—";
  const seconds = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getAgentStatusColor(agent: AgentData): string {
  if (agent.status === "offline") return "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700";
  if (agent.throttled) return "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700";
  if (agent.activeCalls > 0) return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700";
  return "bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700";
}

function getStatusDot(agent: AgentData): string {
  if (agent.status === "offline") return "bg-gray-400";
  if (agent.throttled) return "bg-amber-500 animate-pulse";
  if (agent.activeCalls > 0) return "bg-emerald-500 animate-pulse";
  return "bg-blue-500";
}

// Extension status helpers
function getExtensionStatusColor(status: string): string {
  switch (status) {
    case "available": return "bg-emerald-500";
    case "in_use": return "bg-red-500";
    case "ringing": return "bg-amber-400 animate-pulse";
    case "on_hold": return "bg-purple-500 animate-pulse";
    case "unavailable": return "bg-gray-400";
    case "offline":
    default: return "bg-gray-300 dark:bg-gray-600";
  }
}

function getExtensionTileColor(status: string): string {
  switch (status) {
    case "available": return "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700";
    case "in_use": return "border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-700";
    case "ringing": return "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 animate-pulse";
    case "on_hold": return "border-purple-400 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-700";
    case "unavailable": return "border-gray-300 bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700";
    case "offline":
    default: return "border-gray-200 bg-gray-50/50 dark:bg-gray-900/30 dark:border-gray-800 opacity-60";
  }
}

function getExtensionStatusLabel(status: string): string {
  switch (status) {
    case "available": return "Available";
    case "in_use": return "In Call";
    case "ringing": return "Ringing";
    case "on_hold": return "On Hold";
    case "unavailable": return "Unavailable";
    case "offline":
    default: return "Offline";
  }
}

function getExtensionIcon(status: string) {
  switch (status) {
    case "available": return Headphones;
    case "in_use": return PhoneCall;
    case "ringing": return Phone;
    case "on_hold": return CircleDot;
    case "unavailable": return PhoneMissed;
    case "offline":
    default: return Monitor;
  }
}

function formatExtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getCallStatusBadge(status: string): { variant: "default" | "secondary" | "destructive" | "outline"; label: string } {
  switch (status) {
    case "in_progress": return { variant: "default", label: "In Call" };
    case "dialing": return { variant: "secondary", label: "Dialing" };
    case "claimed": return { variant: "outline", label: "Claimed" };
    case "pending": return { variant: "outline", label: "Pending" };
    default: return { variant: "outline", label: status };
  }
}

// ─── Call Control Buttons Component ───────────────────────────────────────

function CallControlButtons({
  call,
  agentId,
  onTransferClick,
  onParkClick,
}: {
  call: AgentCall;
  agentId?: string;
  onTransferClick: (call: AgentCall, agentId?: string) => void;
  onParkClick: (call: AgentCall, agentId?: string) => void;
}) {
  const utils = trpc.useUtils();

  const hangupMutation = trpc.operatorPanel.hangupCall.useMutation({
    onSuccess: () => {
      toast.success(`Hangup command sent for ${call.phoneNumber}`);
      utils.operatorPanel.liveStatus.invalidate();
    },
    onError: (err) => {
      toast.error(`Hangup failed: ${err.message}`);
    },
  });

  const isActive = call.status === "in_progress" || call.status === "dialing" || call.status === "claimed";

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-1">
      {/* Hangup */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950/30"
            onClick={(e) => {
              e.stopPropagation();
              hangupMutation.mutate({
                queueId: call.id,
                channel: call.channel,
                phoneNumber: call.phoneNumber,
                targetAgentId: agentId,
              });
            }}
            disabled={hangupMutation.isPending}
          >
            {hangupMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PhoneOff className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hangup Call</TooltipContent>
      </Tooltip>

      {/* Transfer */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-950/30"
            onClick={(e) => {
              e.stopPropagation();
              onTransferClick(call, agentId);
            }}
          >
            <PhoneForwarded className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Transfer Call</TooltipContent>
      </Tooltip>

      {/* Park */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/30"
            onClick={(e) => {
              e.stopPropagation();
              onParkClick(call, agentId);
            }}
          >
            <ParkingSquare className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Park Call</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Agent Card Component ──────────────────────────────────────────────────

function AgentCard({
  agent,
  onTransferClick,
  onParkClick,
}: {
  agent: AgentData;
  onTransferClick: (call: AgentCall, agentId?: string) => void;
  onParkClick: (call: AgentCall, agentId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(agent.activeCalls > 0);
  const utilizationPct = agent.maxCalls > 0 ? Math.round((agent.activeCalls / agent.maxCalls) * 100) : 0;

  useEffect(() => {
    if (agent.activeCalls > 0) setExpanded(true);
  }, [agent.activeCalls]);

  return (
    <Card className={`transition-all duration-300 border-2 ${getAgentStatusColor(agent)} hover:shadow-md`}>
      <CardContent className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDot(agent)}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm truncate">{agent.name}</span>
              {agent.voiceAiBridge && (
                <Tooltip>
                  <TooltipTrigger>
                    <Brain className="h-3.5 w-3.5 text-purple-500" />
                  </TooltipTrigger>
                  <TooltipContent>Voice AI Bridge Active</TooltipContent>
                </Tooltip>
              )}
              {agent.throttled && (
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent>{agent.throttleReason || "Throttled"}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{agent.ipAddress || "No IP"}</span>
              {agent.agentVersion && <span>v{agent.agentVersion}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold tabular-nums">
              {agent.activeCalls}<span className="text-xs text-muted-foreground font-normal">/{agent.maxCalls}</span>
            </div>
          </div>
        </div>

        {/* Utilization bar */}
        <div className="mb-2">
          <Progress value={utilizationPct} className="h-1.5" />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            {agent.cpsLimit} CPS
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {agent.lastHeartbeat ? formatDuration(agent.lastHeartbeat) + " ago" : "Never"}
          </span>
          {agent.status === "online" ? (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
              Online
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-600">
              Offline
            </Badge>
          )}
        </div>

        {/* Active calls */}
        {agent.calls.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <PhoneCall className="h-3 w-3" />
              {agent.calls.length} active call{agent.calls.length !== 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="mt-1.5 space-y-1">
                {agent.calls.map((call) => {
                  const badge = getCallStatusBadge(call.status);
                  return (
                    <div
                      key={call.id}
                      className="flex items-center gap-2 text-xs bg-background/60 rounded px-2 py-1.5 border"
                    >
                      <Phone className="h-3 w-3 text-emerald-500 shrink-0" />
                      <span className="font-mono truncate">{call.phoneNumber}</span>
                      <Badge variant={badge.variant} className="text-[10px] h-4 px-1 shrink-0">
                        {badge.label}
                      </Badge>
                      {call.claimedAt && (
                        <span className="text-muted-foreground shrink-0">{formatDuration(call.claimedAt)}</span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <CallControlButtons
                          call={call}
                          agentId={agent.agentId}
                          onTransferClick={onTransferClick}
                          onParkClick={onParkClick}
                        />
                        <VtigerCrmButton phoneNumber={call.phoneNumber} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Call Row (for list view) ───────────────────────────────────────

function ActiveCallRow({
  call,
  onTransferClick,
  onParkClick,
}: {
  call: any;
  onTransferClick: (call: AgentCall, agentId?: string) => void;
  onParkClick: (call: AgentCall, agentId?: string) => void;
}) {
  const badge = getCallStatusBadge(call.status);
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b last:border-0 hover:bg-muted/50 transition-colors">
      <Phone className={`h-4 w-4 shrink-0 ${call.status === "in_progress" ? "text-emerald-500" : call.status === "dialing" ? "text-blue-500" : "text-muted-foreground"}`} />
      <span className="font-mono text-sm w-32 shrink-0">{call.phoneNumber}</span>
      <Badge variant={badge.variant} className="text-xs shrink-0">{badge.label}</Badge>
      <span className="text-xs text-muted-foreground truncate">{call.claimedBy || "Unassigned"}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {call.claimedAt ? formatDuration(call.claimedAt) : "—"}
      </span>
      {call.audioName && (
        <span className="text-xs text-muted-foreground truncate hidden lg:block">{call.audioName}</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <CallControlButtons
          call={call}
          agentId={call.claimedBy}
          onTransferClick={onTransferClick}
          onParkClick={onParkClick}
        />
        <VtigerCrmButton phoneNumber={call.phoneNumber} compact />
      </div>
    </div>
  );
}

// ─── Transfer Dialog ──────────────────────────────────────────────────────

function TransferDialog({
  open,
  call,
  agentId,
  onClose,
}: {
  open: boolean;
  call: AgentCall | null;
  agentId?: string;
  onClose: () => void;
}) {
  const [extension, setExtension] = useState("");
  const utils = trpc.useUtils();

  const transferMutation = trpc.operatorPanel.transferCall.useMutation({
    onSuccess: () => {
      toast.success(`Transfer command sent: ${call?.phoneNumber} → ext ${extension}`);
      utils.operatorPanel.liveStatus.invalidate();
      setExtension("");
      onClose();
    },
    onError: (err) => {
      toast.error(`Transfer failed: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneForwarded className="h-5 w-5 text-blue-500" />
            Transfer Call
          </DialogTitle>
          <DialogDescription>
            Transfer the call to {call?.phoneNumber} to another extension.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="transfer-ext">Target Extension</Label>
            <Input
              id="transfer-ext"
              placeholder="e.g., 100, 200, 5001"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && extension.trim()) {
                  transferMutation.mutate({
                    queueId: call!.id,
                    channel: call?.channel,
                    phoneNumber: call?.phoneNumber,
                    transferExtension: extension.trim(),
                    targetAgentId: agentId,
                  });
                }
              }}
              autoFocus
            />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>The call will be redirected to the specified SIP extension via AMI Redirect.</p>
            <p>Common extensions: 100-199 (SIP phones), 700-799 (ring groups), 800-899 (queues)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!extension.trim() || !call) return;
              transferMutation.mutate({
                queueId: call.id,
                channel: call.channel,
                phoneNumber: call.phoneNumber,
                transferExtension: extension.trim(),
                targetAgentId: agentId,
              });
            }}
            disabled={!extension.trim() || transferMutation.isPending}
          >
            {transferMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <PhoneForwarded className="h-4 w-4 mr-2" />
            )}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Park Dialog ──────────────────────────────────────────────────────────

function ParkDialog({
  open,
  call,
  agentId,
  onClose,
}: {
  open: boolean;
  call: AgentCall | null;
  agentId?: string;
  onClose: () => void;
}) {
  const [parkSlot, setParkSlot] = useState("71");
  const utils = trpc.useUtils();

  const parkMutation = trpc.operatorPanel.parkCall.useMutation({
    onSuccess: () => {
      toast.success(`Park command sent: ${call?.phoneNumber} → slot ${parkSlot}`);
      utils.operatorPanel.liveStatus.invalidate();
      setParkSlot("71");
      onClose();
    },
    onError: (err) => {
      toast.error(`Park failed: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ParkingSquare className="h-5 w-5 text-amber-500" />
            Park Call
          </DialogTitle>
          <DialogDescription>
            Park the call to {call?.phoneNumber} in a parking lot slot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="park-slot">Parking Slot</Label>
            <Input
              id="park-slot"
              placeholder="e.g., 71, 72, 73"
              value={parkSlot}
              onChange={(e) => setParkSlot(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && parkSlot.trim()) {
                  parkMutation.mutate({
                    queueId: call!.id,
                    channel: call?.channel,
                    phoneNumber: call?.phoneNumber,
                    parkSlot: parkSlot.trim(),
                    targetAgentId: agentId,
                  });
                }
              }}
              autoFocus
            />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>The call will be transferred to the parking lot extension.</p>
            <p>Default FreePBX parking: 71-79. Dial the slot number to retrieve the parked call.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!parkSlot.trim() || !call) return;
              parkMutation.mutate({
                queueId: call.id,
                channel: call.channel,
                phoneNumber: call.phoneNumber,
                parkSlot: parkSlot.trim(),
                targetAgentId: agentId,
              });
            }}
            disabled={!parkSlot.trim() || parkMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {parkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ParkingSquare className="h-4 w-4 mr-2" />
            )}
            Park
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Extension Tile Component (FOP2-style) ──────────────────────────────

function ExtensionTile({ ext, onHangup }: { ext: ExtensionData; onHangup?: (ext: ExtensionData) => void }) {
  const Icon = getExtensionIcon(ext.status);
  const isActive = ext.status === "in_use" || ext.status === "ringing" || ext.status === "on_hold";

  return (
    <div
      className={`relative border-2 rounded-lg p-2.5 transition-all duration-200 hover:shadow-md cursor-default select-none ${getExtensionTileColor(ext.status)}`}
      title={`Ext ${ext.ext} — ${getExtensionStatusLabel(ext.status)}${ext.callerNum ? ` — ${ext.callerNum}` : ""}`}
    >
      {/* Status dot */}
      <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${getExtensionStatusColor(ext.status)}`} />

      {/* Extension number + icon */}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-4 w-4 shrink-0 text-foreground/70" />
        <span className="font-bold text-sm font-mono">{ext.ext}</span>
      </div>

      {/* Name */}
      <div className="text-xs truncate text-foreground/80 font-medium mb-0.5" title={ext.name || `Ext ${ext.ext}`}>
        {ext.name || `Extension ${ext.ext}`}
      </div>

      {/* Status label */}
      <div className="text-[10px] uppercase tracking-wider font-semibold text-foreground/60">
        {getExtensionStatusLabel(ext.status)}
      </div>

      {/* Active call info */}
      {isActive && (
        <div className="mt-1.5 pt-1.5 border-t border-current/10">
          {ext.callerNum && (
            <div className="flex items-center gap-1 text-xs">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="font-mono truncate">{ext.callerNum}</span>
            </div>
          )}
          {ext.callerName && (
            <div className="flex items-center gap-1 text-[10px] text-foreground/60">
              <User className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{ext.callerName}</span>
            </div>
          )}
          <div className="flex items-center justify-between mt-1">
            {ext.duration > 0 && (
              <span className="text-[10px] font-mono text-foreground/60">
                {formatExtDuration(ext.duration)}
              </span>
            )}
            {/* Hangup button for active calls */}
            {onHangup && ext.channel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHangup(ext);
                    }}
                  >
                    <PhoneOff className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hangup</TooltipContent>
              </Tooltip>
            )}
            {/* CRM button */}
            {ext.callerNum && (
              <VtigerCrmButton phoneNumber={ext.callerNum} compact />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Extension Grid Section ──────────────────────────────────────────────

function ExtensionGrid() {
  const [extSearch, setExtSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState(false);
  const utils = trpc.useUtils();

  const extensionStatus = trpc.operatorPanel.extensionStatus.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const hangupMutation = trpc.operatorPanel.hangupCall.useMutation({
    onSuccess: () => {
      toast.success("Hangup command sent");
      utils.operatorPanel.extensionStatus.invalidate();
      utils.operatorPanel.liveStatus.invalidate();
    },
    onError: (err: any) => {
      toast.error(`Hangup failed: ${err.message}`);
    },
  });

  const handleExtHangup = (ext: ExtensionData) => {
    hangupMutation.mutate({
      queueId: 0, // Extension-level hangup, not queue-level
      channel: ext.channel,
      phoneNumber: ext.callerNum || ext.ext,
      targetAgentId: ext.agentId,
    });
  };

  const extensions = extensionStatus.data?.extensions ?? [];

  const filteredExtensions = useMemo(() => {
    let result = extensions;
    if (extSearch.trim()) {
      const q = extSearch.toLowerCase();
      result = result.filter(
        (e: any) =>
          e.ext.includes(q) ||
          e.name?.toLowerCase().includes(q) ||
          e.callerNum?.includes(q) ||
          e.callerName?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((e: any) => e.status === statusFilter);
    }
    return result;
  }, [extensions, extSearch, statusFilter]);

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: extensions.length, available: 0, in_use: 0, ringing: 0, on_hold: 0, unavailable: 0, offline: 0 };
    for (const ext of extensions) {
      const s = (ext as any).status;
      if (counts[s] !== undefined) counts[s]++;
    }
    return counts;
  }, [extensions]);

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <Monitor className="h-4 w-4" />
        SIP Extensions ({extensions.length})
        {extensionStatus.data?.lastUpdate && (
          <span className="text-[10px] font-normal normal-case tracking-normal ml-2">
            Updated {new Date(extensionStatus.data.lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </button>

      {!collapsed && (
        <>
          {extensions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No SIP extensions detected</p>
                <p className="text-xs mt-1">Extension status is reported by the PBX agent (v1.7.0+) via heartbeat.</p>
                <p className="text-xs mt-1">Make sure your PBX agent is updated and online.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Filter bar */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search extensions..."
                    value={extSearch}
                    onChange={(e) => setExtSearch(e.target.value)}
                    className="pl-8 h-8 w-40 text-sm"
                  />
                </div>
                {/* Status filter pills */}
                {(["all", "available", "in_use", "ringing", "on_hold", "unavailable", "offline"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {s !== "all" && <div className={`w-2 h-2 rounded-full ${getExtensionStatusColor(s)}`} />}
                    {s === "all" ? "All" : getExtensionStatusLabel(s)}
                    <span className="font-mono text-[10px]">({statusCounts[s] || 0})</span>
                  </button>
                ))}
              </div>

              {/* Extension grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
                {filteredExtensions.map((ext: any) => (
                  <ExtensionTile
                    key={ext.ext}
                    ext={ext}
                    onHangup={handleExtHangup}
                  />
                ))}
              </div>

              {filteredExtensions.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No extensions match the current filter
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Command History Panel ────────────────────────────────────────────────

function CommandHistoryPanel() {
  const [showHistory, setShowHistory] = useState(false);
  const commandHistory = trpc.operatorPanel.commandHistory.useQuery(undefined, {
    enabled: showHistory,
    refetchInterval: showHistory ? 5000 : false,
  });

  return (
    <div>
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
      >
        {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <History className="h-4 w-4" />
        Command History
      </button>

      {showHistory && (
        <Card>
          <CardContent className="p-0">
            {!commandHistory.data || commandHistory.data.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">
                No recent commands
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y">
                {commandHistory.data.map((cmd: any) => (
                  <div key={cmd.id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/50">
                    {/* Status icon */}
                    {cmd.status === "executed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : cmd.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : cmd.status === "delivered" ? (
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}

                    {/* Command type badge */}
                    <Badge
                      variant={cmd.type === "hangup" ? "destructive" : cmd.type === "transfer" ? "default" : "secondary"}
                      className="text-[10px] h-4 px-1.5 shrink-0"
                    >
                      {cmd.type}
                    </Badge>

                    {/* Phone number */}
                    <span className="font-mono">{cmd.phoneNumber || `#${cmd.queueId}`}</span>

                    {/* Transfer target */}
                    {cmd.transferExtension && (
                      <span className="text-muted-foreground">→ ext {cmd.transferExtension}</span>
                    )}
                    {cmd.parkSlot && (
                      <span className="text-muted-foreground">→ slot {cmd.parkSlot}</span>
                    )}

                    {/* Status */}
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-4 px-1 shrink-0 ${
                        cmd.status === "executed"
                          ? "border-emerald-300 text-emerald-600"
                          : cmd.status === "failed"
                          ? "border-red-300 text-red-600"
                          : ""
                      }`}
                    >
                      {cmd.status}
                    </Badge>

                    {/* Issued by */}
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {cmd.issuedBy || "—"}
                    </span>

                    {/* Time */}
                    <span className="text-muted-foreground shrink-0">
                      {new Date(cmd.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function OperatorPanel() {
  const [search, setSearch] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [agentSectionCollapsed, setAgentSectionCollapsed] = useState(false);
  const [callSectionCollapsed, setCallSectionCollapsed] = useState(false);

  // Transfer/Park dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [parkDialogOpen, setParkDialogOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<AgentCall | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();

  const handleTransferClick = (call: AgentCall, agentId?: string) => {
    setSelectedCall(call);
    setSelectedAgentId(agentId);
    setTransferDialogOpen(true);
  };

  const handleParkClick = (call: AgentCall, agentId?: string) => {
    setSelectedCall(call);
    setSelectedAgentId(agentId);
    setParkDialogOpen(true);
  };

  // Auto-refresh every 3 seconds
  const liveStatus = trpc.operatorPanel.liveStatus.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const data = liveStatus.data;

  // Filter agents by search
  const filteredAgents = useMemo(() => {
    if (!data?.agents) return [];
    if (!search.trim()) return data.agents;
    const q = search.toLowerCase();
    return data.agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.agentId.toLowerCase().includes(q) ||
        a.ipAddress?.toLowerCase().includes(q) ||
        a.calls.some((c) => c.phoneNumber.includes(q))
    );
  }, [data?.agents, search]);

  // Sort: online first, then by active calls desc
  const sortedAgents = useMemo(() => {
    return [...filteredAgents].sort((a, b) => {
      if (a.status !== b.status) return a.status === "online" ? -1 : 1;
      return b.activeCalls - a.activeCalls;
    });
  }, [filteredAgents]);

  const filteredCalls = useMemo(() => {
    if (!data?.activeCalls) return [];
    if (!search.trim()) return data.activeCalls;
    const q = search.toLowerCase();
    return data.activeCalls.filter(
      (c) =>
        c.phoneNumber.includes(q) ||
        c.claimedBy?.toLowerCase().includes(q) ||
        c.audioName?.toLowerCase().includes(q)
    );
  }, [data?.activeCalls, search]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const metrics = data?.metrics;

  const content = (
    <div className="space-y-4">
      {/* ─── Top Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Operator Panel</h1>
        </div>

        {/* Metrics pills */}
        {metrics && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1 font-mono">
              <Server className="h-3 w-3" />
              {metrics.onlineAgents}/{metrics.totalAgents} Agents
            </Badge>
            <Badge
              variant={metrics.totalActiveCalls > 0 ? "default" : "outline"}
              className="gap-1 font-mono"
            >
              <PhoneCall className="h-3 w-3" />
              {metrics.totalActiveCalls} Active
            </Badge>
            <Badge variant="outline" className="gap-1 font-mono">
              <Clock className="h-3 w-3" />
              {metrics.callsLastMinute}/min
            </Badge>
            <Badge variant="outline" className="gap-1 font-mono">
              {metrics.callsLastHour}/hr
            </Badge>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search agents, numbers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          >
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => liveStatus.refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${liveStatus.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ─── Agents Section ──────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setAgentSectionCollapsed(!agentSectionCollapsed)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
        >
          {agentSectionCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Server className="h-4 w-4" />
          PBX Agents ({sortedAgents.length})
        </button>

        {!agentSectionCollapsed && (
          <>
            {sortedAgents.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No PBX agents registered</p>
                  <p className="text-xs mt-1">Install the PBX agent on your FreePBX server to get started</p>
                </CardContent>
              </Card>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {sortedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent as AgentData}
                    onTransferClick={handleTransferClick}
                    onParkClick={handleParkClick}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {sortedAgents.map((agent) => {
                      const a = agent as AgentData;
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDot(a)}`} />
                          <span className="font-semibold text-sm w-40 truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground w-28">{a.ipAddress || "—"}</span>
                          <div className="flex items-center gap-1 w-20">
                            <PhoneCall className="h-3 w-3" />
                            <span className="text-sm font-mono">{a.activeCalls}/{a.maxCalls}</span>
                          </div>
                          <Progress value={a.maxCalls > 0 ? (a.activeCalls / a.maxCalls) * 100 : 0} className="h-1.5 w-24" />
                          <span className="text-xs text-muted-foreground w-16">{a.cpsLimit} CPS</span>
                          {a.voiceAiBridge && <Brain className="h-3.5 w-3.5 text-purple-500" />}
                          {a.throttled && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          <Badge variant={a.status === "online" ? "default" : "secondary"} className="text-xs ml-auto">
                            {a.status === "online" ? "Online" : "Offline"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ─── SIP Extensions Grid (FOP2-style) ───────────────────────── */}
      <ExtensionGrid />

      {/* ─── Active Calls Section ────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setCallSectionCollapsed(!callSectionCollapsed)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
        >
          {callSectionCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <Phone className="h-4 w-4" />
          Active Call Queue ({filteredCalls.length})
        </button>

        {!callSectionCollapsed && (
          <>
            {filteredCalls.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-muted-foreground">
                  <PhoneOff className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active calls in queue</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                    <span className="w-4" />
                    <span className="w-32">Phone Number</span>
                    <span className="w-20">Status</span>
                    <span className="flex-1">Agent</span>
                    <span className="w-16">Duration</span>
                    <span className="hidden lg:block flex-1">Script</span>
                    <span className="w-32 text-right">Actions</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {filteredCalls.map((call) => (
                      <ActiveCallRow
                        key={call.id}
                        call={call}
                        onTransferClick={handleTransferClick}
                        onParkClick={handleParkClick}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ─── Command History ─────────────────────────────────────────── */}
      <CommandHistoryPanel />

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Wifi className="h-3 w-3" />
        Auto-refreshing every 3 seconds
        {liveStatus.dataUpdatedAt && (
          <span>· Last update: {new Date(liveStatus.dataUpdatedAt).toLocaleTimeString()}</span>
        )}
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────────────── */}
      <TransferDialog
        open={transferDialogOpen}
        call={selectedCall}
        agentId={selectedAgentId}
        onClose={() => {
          setTransferDialogOpen(false);
          setSelectedCall(null);
        }}
      />
      <ParkDialog
        open={parkDialogOpen}
        call={selectedCall}
        agentId={selectedAgentId}
        onClose={() => {
          setParkDialogOpen(false);
          setSelectedCall(null);
        }}
      />
    </div>
  );

  return <DashboardLayout>{content}</DashboardLayout>;
}
