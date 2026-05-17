import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Key, Plus, Copy, Trash2, ShieldOff, Clock, Activity, AlertTriangle, BarChart3 } from "lucide-react";
import ApiUsageAnalytics from "@/components/ApiUsageAnalytics";
import { useState } from "react";
import { toast } from "sonner";

export default function ApiKeys() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; prefix: string } | null>(null);
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [permissions, setPermissions] = useState({
    campaigns: { read: true, write: false, launch: false },
    contacts: { read: true, write: false, import: false },
    callLogs: { read: true },
    reports: { read: true },
    dnc: { read: true, write: false },
  });

  const keysQuery = trpc.apiKeys.list.useQuery();
  const logsQuery = trpc.apiKeys.logs.useQuery({ limit: 50 });
  const createMutation = trpc.apiKeys.create.useMutation();
  const revokeMutation = trpc.apiKeys.revoke.useMutation();
  const deleteMutation = trpc.apiKeys.delete.useMutation();
  const utils = trpc.useUtils();

  const keys = keysQuery.data || [];
  const logs = logsQuery.data || [];

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const result = await createMutation.mutateAsync({
        name: newKeyName,
        permissions,
        rateLimit,
        expiresInDays,
      });
      setNewKeyResult({ key: result.key, prefix: result.prefix });
      toast.success("API key created successfully");
      utils.apiKeys.invalidate();
    } catch (err) {
      toast.error("Failed to create API key");
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Revoke this API key? It will immediately stop working.")) return;
    try {
      await revokeMutation.mutateAsync({ id });
      toast.success("API key revoked");
      utils.apiKeys.invalidate();
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this API key? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("API key deleted");
      utils.apiKeys.invalidate();
    } catch {
      toast.error("Failed to delete key");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const togglePermission = (category: string, perm: string) => {
    setPermissions(prev => ({
      ...prev,
      [category]: { ...(prev as any)[category], [perm]: !(prev as any)[category][perm] },
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage API keys for external integrations. Use these keys to access the REST API at <code className="bg-muted px-1 rounded">/api/v1/*</code>
            </p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            setShowCreateDialog(open);
            if (!open) { setNewKeyResult(null); setNewKeyName(""); }
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Create API Key</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{newKeyResult ? "API Key Created" : "Create API Key"}</DialogTitle>
                <DialogDescription>
                  {newKeyResult
                    ? "Copy this key now. It will not be shown again."
                    : "Create a new API key for external system access."}
                </DialogDescription>
              </DialogHeader>

              {newKeyResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-sm font-medium text-green-500 mb-2">Your API Key:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded break-all">{newKeyResult.key}</code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKeyResult.key)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-500">
                      This key is shown only once. Store it securely. If lost, you'll need to create a new key.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>Key Name</Label>
                    <Input
                      placeholder="e.g. CRM Integration, Lead Gen API"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Rate Limit (requests/minute)</Label>
                    <Input
                      type="number"
                      value={rateLimit}
                      onChange={(e) => setRateLimit(Number(e.target.value))}
                      min={1}
                      max={1000}
                    />
                  </div>
                  <div>
                    <Label>Expires In (days, leave empty for no expiration)</Label>
                    <Input
                      type="number"
                      placeholder="Never"
                      value={expiresInDays ?? ""}
                      onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
                      min={1}
                      max={365}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Permissions</Label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(permissions).map(([category, perms]) => (
                        <div key={category} className="space-y-1">
                          <p className="font-medium capitalize text-muted-foreground">{category}</p>
                          {Object.entries(perms).map(([perm, enabled]) => (
                            <label key={perm} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={enabled}
                                onCheckedChange={() => togglePermission(category, perm)}
                              />
                              <span className="capitalize">{perm}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                {newKeyResult ? (
                  <Button onClick={() => { setShowCreateDialog(false); setNewKeyResult(null); setNewKeyName(""); }}>Done</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending || !newKeyName.trim()}>
                      {createMutation.isPending ? "Creating..." : "Create Key"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* API Documentation Card */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm space-y-2">
                <p className="font-medium text-blue-500">REST API Documentation</p>
                <div className="text-muted-foreground space-y-1">
                  <p><code className="bg-muted px-1 rounded">GET /api/v1/campaigns</code> — List all campaigns</p>
                  <p><code className="bg-muted px-1 rounded">POST /api/v1/campaigns/:id/launch</code> — Launch a campaign</p>
                  <p><code className="bg-muted px-1 rounded">GET /api/v1/contacts?campaignId=X</code> — List contacts</p>
                  <p><code className="bg-muted px-1 rounded">POST /api/v1/contacts/import</code> — Import contacts (JSON)</p>
                  <p><code className="bg-muted px-1 rounded">GET /api/v1/call-logs/:campaignId</code> — Get call logs</p>
                  <p><code className="bg-muted px-1 rounded">GET /api/v1/reports/summary</code> — Summary report</p>
                  <p><code className="bg-muted px-1 rounded">GET /api/v1/dnc</code> — List DNC numbers</p>
                  <p><code className="bg-muted px-1 rounded">POST /api/v1/dnc</code> — Add to DNC</p>
                  <p><code className="bg-muted px-1 rounded">DELETE /api/v1/dnc/:phoneNumber</code> — Remove from DNC</p>
                </div>
                <p className="text-muted-foreground mt-2">
                  Auth: <code className="bg-muted px-1 rounded">Authorization: Bearer tbd_...</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Keys Table */}
        <Card>
          <CardHeader>
            <CardTitle>Active Keys</CardTitle>
            <CardDescription>{keys.length} API key{keys.length !== 1 ? "s" : ""} configured</CardDescription>
          </CardHeader>
          <CardContent>
            {keys.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No API keys</p>
                <p className="text-sm mt-1">Create an API key to enable external integrations</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 pr-4">Name</th>
                      <th className="pb-3 pr-4">Key Prefix</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Rate Limit</th>
                      <th className="pb-3 pr-4">Last Used</th>
                      <th className="pb-3 pr-4">Created</th>
                      <th className="pb-3 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 pr-4 font-medium">{key.name}</td>
                        <td className="py-3 pr-4 font-mono text-sm text-muted-foreground">{key.keyPrefix}...</td>
                        <td className="py-3 pr-4">
                          {key.isActive ? (
                            <Badge className="bg-green-500/20 text-green-500 border-green-500/50">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Revoked</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-sm">{key.rateLimit}/min</td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 flex gap-1">
                          {key.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleRevoke(key.id)}
                              title="Revoke key"
                            >
                              <ShieldOff className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(key.id)}
                            title="Delete key"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent API Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Recent API Requests
            </CardTitle>
            <CardDescription>Last 50 API requests across all keys</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No API requests yet</p>
            ) : (
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 pr-4">Method</th>
                      <th className="pb-3 pr-4">Endpoint</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Time</th>
                      <th className="pb-3 pr-4">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: any) => (
                      <tr key={log.id} className="border-b last:border-0 text-sm">
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="font-mono text-xs">{log.method}</Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{log.endpoint}</td>
                        <td className="py-2 pr-4">
                          <Badge className={
                            log.statusCode < 300 ? "bg-green-500/20 text-green-500" :
                            log.statusCode < 400 ? "bg-yellow-500/20 text-yellow-500" :
                            "bg-red-500/20 text-red-500"
                          }>
                            {log.statusCode}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{log.responseTimeMs}ms</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Usage Analytics Dashboard */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              <div>
                <CardTitle>API Usage Analytics</CardTitle>
                <CardDescription>Request volume, error rates, endpoint breakdown, and usage trends</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ApiUsageAnalytics />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
