import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Copy, Clock, Mic } from "lucide-react";

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC"];

export default function Templates() {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.templates.list.useQuery();
  const createMut = trpc.templates.create.useMutation({ onSuccess: () => { utils.templates.list.invalidate(); toast.success("Template saved"); setShowCreate(false); resetForm(); } });
  const deleteMut = trpc.templates.delete.useMutation({ onSuccess: () => { utils.templates.list.invalidate(); toast.success("Template deleted"); } });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", messageText: "", voice: "alloy",
    maxConcurrentCalls: 1, retryAttempts: 0, retryDelay: 300,
    timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
    useDidRotation: 0,
  });

  const resetForm = () => setForm({
    name: "", description: "", messageText: "", voice: "alloy",
    maxConcurrentCalls: 1, retryAttempts: 0, retryDelay: 300,
    timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
    useDidRotation: 0,
  });

  const loadTemplate = (t: typeof templates[0]) => {
    setForm({
      name: t.name + " (copy)", description: t.description || "",
      messageText: t.messageText || "", voice: t.voice || "alloy",
      maxConcurrentCalls: t.maxConcurrentCalls || 1,
      retryAttempts: t.retryAttempts || 0, retryDelay: t.retryDelay || 300,
      timezone: t.timezone || "America/New_York",
      timeWindowStart: t.timeWindowStart || "09:00", timeWindowEnd: t.timeWindowEnd || "21:00",
      useDidRotation: t.useDidRotation || 0,
    });
    setShowCreate(true);
  };

  const handleCreate = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    createMut.mutate({
      ...form,
      description: form.description || undefined,
      messageText: form.messageText || undefined,
      voice: form.voice as any,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Broadcast Templates</h1>
            <p className="text-muted-foreground">Save and reuse campaign configurations</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Template</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Broadcast Template</DialogTitle>
                <DialogDescription>Save campaign settings as a reusable template</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Template Name</Label>
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Morning Broadcast" />
                  </div>
                  <div className="col-span-2">
                    <Label>Description</Label>
                    <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Standard morning broadcast settings" />
                  </div>
                  <div className="col-span-2">
                    <Label>Default Message Text</Label>
                    <Textarea value={form.messageText} onChange={e => setForm(f => ({ ...f, messageText: e.target.value }))} rows={3} placeholder="Enter default TTS message..." />
                  </div>
                  <div>
                    <Label>Voice</Label>
                    <Select value={form.voice} onValueChange={v => setForm(f => ({ ...f, voice: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VOICES.map(v => <SelectItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Max Concurrent Calls</Label>
                    <Input type="number" min={1} max={10} value={form.maxConcurrentCalls} onChange={e => setForm(f => ({ ...f, maxConcurrentCalls: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label>Retry Attempts</Label>
                    <Input type="number" min={0} max={5} value={form.retryAttempts} onChange={e => setForm(f => ({ ...f, retryAttempts: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label>Retry Delay (seconds)</Label>
                    <Input type="number" min={60} max={3600} value={form.retryDelay} onChange={e => setForm(f => ({ ...f, retryDelay: parseInt(e.target.value) || 300 }))} />
                  </div>
                  <div>
                    <Label>Timezone</Label>
                    <Select value={form.timezone} onValueChange={v => setForm(f => ({ ...f, timezone: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label>Window Start</Label>
                      <Input type="time" value={form.timeWindowStart} onChange={e => setForm(f => ({ ...f, timeWindowStart: e.target.value }))} />
                    </div>
                    <div className="flex-1">
                      <Label>Window End</Label>
                      <Input type="time" value={form.timeWindowEnd} onChange={e => setForm(f => ({ ...f, timeWindowEnd: e.target.value }))} />
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-3 p-3 border rounded-lg">
                    <Switch checked={form.useDidRotation === 1} onCheckedChange={c => setForm(f => ({ ...f, useDidRotation: c ? 1 : 0 }))} />
                    <div>
                      <Label>Enable DID Rotation</Label>
                      <p className="text-xs text-muted-foreground">Rotate through your caller ID pool for each call</p>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? "Saving..." : "Save Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-1">No Templates Yet</h3>
              <p className="text-muted-foreground mb-4">Create templates to quickly set up new campaigns</p>
              <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Create Template</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <Card key={t.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      {t.description && <CardDescription className="mt-1">{t.description}</CardDescription>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1"><Mic className="h-3 w-3" />{t.voice}</Badge>
                    <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{t.timeWindowStart}-{t.timeWindowEnd}</Badge>
                    {t.useDidRotation === 1 && <Badge variant="secondary">DID Rotation</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Concurrent: {t.maxConcurrentCalls} | Retries: {t.retryAttempts}</div>
                    <div>Timezone: {t.timezone}</div>
                    {t.messageText && <div className="truncate">Message: {t.messageText}</div>}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => loadTemplate(t)}>
                      <Copy className="h-3 w-3 mr-1" /> Duplicate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: t.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
