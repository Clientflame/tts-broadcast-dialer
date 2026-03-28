import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Server, Plus, Pencil, Trash2, Globe, Wifi, WifiOff, AlertTriangle,
  Loader2, Activity, HardDrive, Cpu, MemoryStick, Shield, Clock,
  ExternalLink, RefreshCw, ChevronDown, ChevronUp, Mail, Phone,
  Wrench, CheckCircle2, XCircle, CircleDot, Settings2,
} from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

// Status badge component
function StatusBadge({ status, lastHeartbeat }: { status: string; lastHeartbeat?: number | null }) {
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;

  // Override status if heartbeat is stale
  let effectiveStatus = status;
  if (status === "online" && lastHeartbeat && lastHeartbeat < fiveMinAgo) {
    effectiveStatus = "stale";
  }

  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    online: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Online" },
    offline: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <XCircle className="h-3.5 w-3.5" />, label: "Offline" },
    degraded: { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Degraded" },
    maintenance: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: <Wrench className="h-3.5 w-3.5" />, label: "Maintenance" },
    provisioning: { color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: <Settings2 className="h-3.5 w-3.5" />, label: "Provisioning" },
    stale: { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: <Clock className="h-3.5 w-3.5" />, label: "Stale" },
  };

  const c = config[effectiveStatus] || config.offline;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.color}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

// Bridge status badge
function BridgeBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    connected: { color: "text-emerald-400", label: "Connected" },
    disconnected: { color: "text-red-400", label: "Disconnected" },
    unknown: { color: "text-muted-foreground", label: "Unknown" },
  };
  const c = config[status] || config.unknown;
  return <span className={`text-xs font-medium ${c.color}`}>{c.label}</span>;
}

// Relative time helper
function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Environment badge
function EnvBadge({ env }: { env: string }) {
  const colors: Record<string, string> = {
    production: "bg-emerald-500/10 text-emerald-400",
    staging: "bg-yellow-500/10 text-yellow-400",
    development: "bg-blue-500/10 text-blue-400",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${colors[env] || "bg-muted text-muted-foreground"}`}>
      {env}
    </span>
  );
}

// Stats cards at the top
function DeploymentStats() {
  const stats = trpc.deployments.stats.useQuery(undefined, { refetchInterval: 30000 });

  if (!stats.data) return null;

  const cards = [
    { label: "Total", value: stats.data.total, icon: Server, color: "text-foreground" },
    { label: "Online", value: stats.data.online, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Degraded", value: stats.data.degraded, icon: AlertTriangle, color: "text-yellow-400" },
    { label: "Offline", value: stats.data.offline, icon: XCircle, color: "text-red-400" },
    { label: "Maintenance", value: stats.data.maintenance, icon: Wrench, color: "text-blue-400" },
    { label: "Provisioning", value: stats.data.provisioning, icon: Settings2, color: "text-purple-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <c.icon className={`h-5 w-5 ${c.color} shrink-0`} />
            <div>
              <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Deployment row (expandable)
function DeploymentRow({
  deployment,
  onEdit,
  onDelete,
}: {
  deployment: any;
  onEdit: (d: any) => void;
  onDelete: (d: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Main row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{deployment.clientName}</span>
            <EnvBadge env={deployment.environment} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{deployment.domain || "—"}</span>
            <span className="flex items-center gap-1"><Server className="h-3 w-3" />{deployment.serverIp}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 shrink-0">
          {deployment.version && (
            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">v{deployment.version}</span>
          )}
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Last heartbeat</div>
            <div className="text-xs font-medium">{relativeTime(deployment.lastHeartbeat)}</div>
          </div>
        </div>

        <StatusBadge status={deployment.status} lastHeartbeat={deployment.lastHeartbeat} />

        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(deployment)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(deployment)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t bg-muted/10 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* System metrics */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Metrics</h4>
              <div className="space-y-1.5">
                <MetricBar icon={<HardDrive className="h-3.5 w-3.5" />} label="Disk" value={deployment.diskUsagePercent} unit="%" />
                <MetricBar icon={<MemoryStick className="h-3.5 w-3.5" />} label="Memory" value={deployment.memoryUsageMb} unit=" MB" />
                <MetricBar icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={deployment.cpuUsagePercent} unit="%" />
              </div>
            </div>

            {/* PBX Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PBX Integration</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PBX Host</span>
                  <span className="font-mono text-xs">{deployment.pbxHost || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent Version</span>
                  <span className="font-mono text-xs">{deployment.pbxAgentVersion || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bridge</span>
                  <BridgeBadge status={deployment.bridgeStatus} />
                </div>
              </div>
            </div>

            {/* SSL & Security */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Security</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">SSL Expiry</span>
                  <span className={`text-xs font-medium ${deployment.sslExpiry && deployment.sslExpiry < Date.now() + 7 * 86400000 ? "text-red-400" : ""}`}>
                    {deployment.sslExpiry ? new Date(deployment.sslExpiry).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Installed</span>
                  <span className="text-xs">{deployment.installedAt ? new Date(deployment.installedAt).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
              <div className="space-y-1.5 text-sm">
                {deployment.contactEmail && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${deployment.contactEmail}`} className="text-xs hover:underline truncate">{deployment.contactEmail}</a>
                  </div>
                )}
                {deployment.contactPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">{deployment.contactPhone}</span>
                  </div>
                )}
                {deployment.domain && (
                  <a
                    href={`https://${deployment.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Visit Site
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {deployment.notes && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
              <span className="font-semibold">Notes:</span> {deployment.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Metric bar component
function MetricBar({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: number | null | undefined; unit: string }) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  const pct = unit === "%" ? value : 0;
  const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="text-muted-foreground w-14">{label}</span>
      {unit === "%" && (
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(value, 100)}%` }} />
        </div>
      )}
      <span className="ml-auto text-xs font-mono">{value}{unit}</span>
    </div>
  );
}

// Create/Edit dialog
function DeploymentDialog({
  open,
  onOpenChange,
  deployment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deployment?: any;
}) {
  const utils = trpc.useUtils();
  const create = trpc.deployments.create.useMutation();
  const update = trpc.deployments.update.useMutation();
  const isEdit = !!deployment;

  const [form, setForm] = useState({
    clientName: deployment?.clientName || "",
    serverIp: deployment?.serverIp || "",
    domain: deployment?.domain || "",
    version: deployment?.version || "",
    environment: deployment?.environment || "production",
    status: deployment?.status || "provisioning",
    pbxHost: deployment?.pbxHost || "",
    notes: deployment?.notes || "",
    contactEmail: deployment?.contactEmail || "",
    contactPhone: deployment?.contactPhone || "",
  });

  const handleSubmit = async () => {
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: deployment.id,
          clientName: form.clientName,
          serverIp: form.serverIp,
          domain: form.domain || null,
          version: form.version || null,
          environment: form.environment as any,
          status: form.status as any,
          pbxHost: form.pbxHost || null,
          notes: form.notes || null,
          contactEmail: form.contactEmail || null,
          contactPhone: form.contactPhone || null,
        });
        toast.success("Deployment updated");
      } else {
        await create.mutateAsync({
          clientName: form.clientName,
          serverIp: form.serverIp,
          domain: form.domain || undefined,
          version: form.version || undefined,
          environment: form.environment as any,
          pbxHost: form.pbxHost || undefined,
          notes: form.notes || undefined,
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
        });
        toast.success("Deployment created");
      }
      await utils.deployments.invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save deployment");
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Deployment" : "Add Client Deployment"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the deployment details." : "Register a new client installation for monitoring."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="clientName">Client Name *</Label>
              <Input id="clientName" placeholder="Acme Corp" value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serverIp">Server IP *</Label>
              <Input id="serverIp" placeholder="187.124.94.97" value={form.serverIp} onChange={e => setForm(p => ({ ...p, serverIp: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input id="domain" placeholder="app.client.com" value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="version">Version</Label>
              <Input id="version" placeholder="1.4.0" value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select value={form.environment} onValueChange={v => setForm(p => ({ ...p, environment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="provisioning">Provisioning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="pbxHost">PBX Host</Label>
            <Input id="pbxHost" placeholder="45.77.75.198" value={form.pbxHost} onChange={e => setForm(p => ({ ...p, pbxHost: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input id="contactEmail" type="email" placeholder="admin@client.com" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input id="contactPhone" placeholder="+1 (555) 123-4567" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Any relevant notes about this deployment..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.clientName || !form.serverIp}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Save Changes" : "Add Deployment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DeploymentStatus() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const deployments = trpc.deployments.list.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30000,
  });
  const deleteMutation = trpc.deployments.delete.useMutation();
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const handleEdit = useCallback((d: any) => {
    setEditTarget(d);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback((d: any) => {
    setDeleteTarget(d);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
      await utils.deployments.invalidate();
      toast.success(`Deleted deployment: ${deleteTarget.clientName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
    setDeleteTarget(null);
  };

  const handleRefresh = () => {
    deployments.refetch();
    toast.success("Refreshing deployment data...");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Deployment Status
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage all client installations across your infrastructure.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => { setEditTarget(null); setDialogOpen(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Deployment
            </Button>
          </div>
        </div>

        {!isAdmin ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Only administrators can view deployment status.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <DeploymentStats />

            <Separator />

            {/* Deployment list */}
            {deployments.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !deployments.data?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <h3 className="font-semibold mb-1">No Deployments Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add your first client deployment to start monitoring.
                  </p>
                  <Button size="sm" onClick={() => { setEditTarget(null); setDialogOpen(true); }} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add Deployment
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {deployments.data.map(d => (
                  <DeploymentRow
                    key={d.id}
                    deployment={d}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {dialogOpen && (
        <DeploymentDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditTarget(null);
          }}
          deployment={editTarget}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deployment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.clientName}</strong> ({deleteTarget?.serverIp}) from the deployment tracker? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
