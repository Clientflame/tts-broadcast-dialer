import { useState, useRef } from "react";
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
import { Phone, Plus, Upload, Trash2, Activity, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, RotateCcw, Clock, Calendar } from "lucide-react";

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
      setShowBulk(false); setBulkText("");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.callerIds.update.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); } });
  const deleteMut = trpc.callerIds.delete.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); toast.success("Caller ID removed"); } });
  const bulkDeleteMut = trpc.callerIds.bulkDelete.useMutation({
    onSuccess: () => { utils.callerIds.list.invalidate(); setSelected(new Set()); toast.success("Selected caller IDs removed"); },
    onError: (e) => toast.error(e.message),
  });
  const healthCheckMut = trpc.callerIds.triggerHealthCheck.useMutation({
    onSuccess: (r) => {
      toast.success(r.message);
      // Poll for results after a delay
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

  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!phone.trim()) return;
    createMut.mutate({ phoneNumber: phone.trim(), label: label.trim() || undefined });
  };

  const handleBulkAdd = () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const entries = lines.map(line => {
      const parts = line.split(",").map(p => p.trim());
      return { phoneNumber: parts[0], label: parts[1] || undefined };
    });
    bulkCreateMut.mutate({ entries });
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
      bulkCreateMut.mutate({ entries });
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

  const activeCount = callerIds.filter(c => c.isActive === 1).length;
  const healthyCount = callerIds.filter(c => c.healthStatus === "healthy").length;
  const failedCount = callerIds.filter(c => c.healthStatus === "failed").length;
  const autoDisabledCount = callerIds.filter(c => c.autoDisabled === 1).length;
  const uncheckedCount = callerIds.filter(c => c.healthStatus === "unknown").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Caller IDs (DIDs)</h1>
            <p className="text-muted-foreground">Manage your outbound caller ID rotation pool</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {selected.size > 0 && (
              <>
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
            <Dialog open={showBulk} onOpenChange={setShowBulk}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1" /> Bulk Add</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Add Caller IDs</DialogTitle>
                  <DialogDescription>Enter one caller ID per line. Format: phone_number, label (optional). Duplicates will be automatically skipped.</DialogDescription>
                </DialogHeader>
                <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={10} placeholder={"4071234567, Main Line\n4079876543, Sales\n8001234567"} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
                  <Button onClick={handleBulkAdd} disabled={bulkCreateMut.isPending}>
                    {bulkCreateMut.isPending ? "Adding..." : "Add All"}
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <table className="w-full text-sm">
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
                    <th className="p-3 text-right">Actions</th>
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
                      <td className="p-3">{cid.label || "—"}</td>
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
      </div>
    </DashboardLayout>
  );
}
