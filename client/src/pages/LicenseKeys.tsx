import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Key, Plus, Trash2, RefreshCw, Copy, CheckCircle2,
  XCircle, AlertTriangle, Pause, Edit, Shield,
  Users, Phone, Headset, Calendar,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  suspended: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  revoked: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function LicenseKeys() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [maxDids, setMaxDids] = useState(10);
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState(5);
  const [maxAgents, setMaxAgents] = useState(3);
  const [notes, setNotes] = useState("");

  const licensesQuery = trpc.licenses.list.useQuery();
  const createMutation = trpc.licenses.create.useMutation();
  const updateMutation = trpc.licenses.update.useMutation();
  const deleteMutation = trpc.licenses.delete.useMutation();
  const utils = trpc.useUtils();

  const licenses = licensesQuery.data || [];

  const resetForm = () => {
    setClientName("");
    setClientEmail("");
    setMaxDids(10);
    setMaxConcurrentCalls(5);
    setMaxAgents(3);
    setNotes("");
  };

  const handleCreate = async () => {
    if (!clientName.trim()) { toast.error("Client name is required"); return; }
    try {
      const result = await createMutation.mutateAsync({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        maxDids,
        maxConcurrentCalls,
        maxAgents,
        notes: notes.trim() || undefined,
      });
      toast.success(`License key created for ${clientName}`);
      resetForm();
      setShowCreate(false);
      utils.licenses.list.invalidate();
      // Auto-copy the new key
      if (result.licenseKey) {
        navigator.clipboard.writeText(result.licenseKey);
        setCopiedKey(result.licenseKey);
        setTimeout(() => setCopiedKey(null), 3000);
        toast.info("License key copied to clipboard!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create license key");
    }
  };

  const handleStatusChange = async (id: number, status: "active" | "suspended" | "revoked") => {
    try {
      await updateMutation.mutateAsync({ id, status });
      toast.success(`License ${status}`);
      utils.licenses.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to update license");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this license key? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("License key deleted");
      utils.licenses.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete license");
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
    toast.success("License key copied!");
  };

  const activeCount = licenses.filter(l => l.status === "active").length;
  const suspendedCount = licenses.filter(l => l.status === "suspended").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Key className="h-6 w-6" />
              License Keys
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage client installation licenses for distribution control
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => licensesQuery.refetch()}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${licensesQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Generate Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate License Key</DialogTitle>
                  <DialogDescription>Create a new license key for a client installation</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Client Name *</Label>
                    <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Acme Corp" />
                  </div>
                  <div>
                    <Label>Client Email</Label>
                    <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="admin@acme.com" type="email" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="flex items-center gap-1"><Phone className="h-3 w-3" /> Max DIDs</Label>
                      <Input type="number" value={maxDids} onChange={e => setMaxDids(parseInt(e.target.value) || 10)} min={1} max={1000} />
                    </div>
                    <div>
                      <Label className="flex items-center gap-1"><Headset className="h-3 w-3" /> Max Calls</Label>
                      <Input type="number" value={maxConcurrentCalls} onChange={e => setMaxConcurrentCalls(parseInt(e.target.value) || 5)} min={1} max={500} />
                    </div>
                    <div>
                      <Label className="flex items-center gap-1"><Users className="h-3 w-3" /> Max Agents</Label>
                      <Input type="number" value={maxAgents} onChange={e => setMaxAgents(parseInt(e.target.value) || 3)} min={1} max={100} />
                    </div>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes about this client" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Generating..." : "Generate Key"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Licenses</p>
                  <p className="text-2xl font-bold">{activeCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Pause className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Suspended</p>
                  <p className="text-2xl font-bold">{suspendedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Key className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Keys</p>
                  <p className="text-2xl font-bold">{licenses.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* License List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              License Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!licenses.length ? (
              <div className="p-8 text-center text-muted-foreground">
                <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No license keys yet</p>
                <p className="text-xs mt-1">Generate a key for each client installation</p>
              </div>
            ) : (
              <div className="divide-y">
                {licenses.map(license => (
                  <div key={license.id} className="px-6 py-4 hover:bg-muted/30">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{license.clientName}</h3>
                          <Badge className={STATUS_COLORS[license.status]}>{license.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded select-all">
                            {license.licenseKey}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => copyKey(license.licenseKey)}
                          >
                            {copiedKey === license.licenseKey ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {license.clientEmail && <span>{license.clientEmail}</span>}
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {license.maxDids} DIDs</span>
                          <span className="flex items-center gap-1"><Headset className="h-3 w-3" /> {license.maxConcurrentCalls} calls</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {license.maxAgents} agents</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Created: {formatDate(license.createdAt ? new Date(license.createdAt).getTime() : null)}</span>
                          {license.expiresAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Expires: {formatDate(license.expiresAt)}</span>}
                          {license.lastValidatedAt && <span>Last validated: {timeAgo(license.lastValidatedAt)}</span>}
                        </div>
                        {license.notes && <p className="text-xs text-muted-foreground italic">{license.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {license.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(license.id, "suspended")} title="Suspend">
                            <Pause className="h-4 w-4 text-amber-500" />
                          </Button>
                        )}
                        {license.status === "suspended" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(license.id, "active")} title="Reactivate">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                        {license.status !== "revoked" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(license.id, "revoked")} title="Revoke">
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(license.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
