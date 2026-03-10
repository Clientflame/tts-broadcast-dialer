import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Copy, Clock, Mic, Pencil } from "lucide-react";

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC"];
const SPEED_PRESETS = [
  { label: "Low", value: 10 },
  { label: "Med", value: 25 },
  { label: "High", value: 50 },
  { label: "Max", value: 100 },
];

interface FormState {
  name: string;
  description: string;
  messageText: string;
  voice: string;
  maxConcurrentCalls: number;
  retryAttempts: number;
  retryDelay: number;
  timezone: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  useDidRotation: number;
}

const DEFAULT_FORM: FormState = {
  name: "", description: "", messageText: "", voice: "alloy",
  maxConcurrentCalls: 10, retryAttempts: 0, retryDelay: 300,
  timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
  useDidRotation: 0,
};

export default function Templates() {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.templates.list.useQuery();
  const createMut = trpc.templates.create.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast.success("Template created"); setShowCreate(false); setForm(DEFAULT_FORM); },
  });
  const updateMut = trpc.templates.update.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast.success("Template updated"); setEditId(null); setShowCreate(false); },
  });
  const deleteMut = trpc.templates.delete.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast.success("Template deleted"); },
  });
  const bulkDeleteMut = trpc.templates.bulkDelete.useMutation({
    onSuccess: (data) => { utils.templates.list.invalidate(); toast.success(`${data.deleted} template(s) deleted`); setSelected(new Set()); },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const allSelected = useMemo(() => templates.length > 0 && templates.every(t => selected.has(t.id)), [templates, selected]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(templates.map(t => t.id)));
    }
  };

  const openEdit = (t: typeof templates[0]) => {
    setEditId(t.id);
    setForm({
      name: t.name,
      description: t.description || "",
      messageText: t.messageText || "",
      voice: t.voice || "alloy",
      maxConcurrentCalls: t.maxConcurrentCalls || 10,
      retryAttempts: t.retryAttempts || 0,
      retryDelay: t.retryDelay || 300,
      timezone: t.timezone || "America/New_York",
      timeWindowStart: t.timeWindowStart || "09:00",
      timeWindowEnd: t.timeWindowEnd || "21:00",
      useDidRotation: t.useDidRotation || 0,
    });
    setShowCreate(true);
  };

  const openDuplicate = (t: typeof templates[0]) => {
    setEditId(null);
    setForm({
      name: t.name + " (copy)",
      description: t.description || "",
      messageText: t.messageText || "",
      voice: t.voice || "alloy",
      maxConcurrentCalls: t.maxConcurrentCalls || 10,
      retryAttempts: t.retryAttempts || 0,
      retryDelay: t.retryDelay || 300,
      timezone: t.timezone || "America/New_York",
      timeWindowStart: t.timeWindowStart || "09:00",
      timeWindowEnd: t.timeWindowEnd || "21:00",
      useDidRotation: t.useDidRotation || 0,
    });
    setShowCreate(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      ...form,
      description: form.description || undefined,
      messageText: form.messageText || undefined,
      voice: form.voice as any,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const TemplateForm = () => (
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
          <Label>Max Concurrent Calls: {form.maxConcurrentCalls}</Label>
          <div className="flex items-center gap-2 mt-1">
            <Slider
              value={[form.maxConcurrentCalls]}
              onValueChange={([v]) => setForm(f => ({ ...f, maxConcurrentCalls: v }))}
              min={10} max={100} step={1}
              className="flex-1"
            />
          </div>
          <div className="flex gap-1 mt-1">
            {SPEED_PRESETS.map(p => (
              <Button key={p.label} variant={form.maxConcurrentCalls === p.value ? "default" : "outline"} size="sm" className="text-xs h-6 px-2"
                onClick={() => setForm(f => ({ ...f, maxConcurrentCalls: p.value }))}>
                {p.label}
              </Button>
            ))}
          </div>
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
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Broadcast Templates</h1>
            <p className="text-muted-foreground">Save and reuse campaign configurations</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <Button variant="destructive" size="sm" onClick={() => setShowBulkConfirm(true)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete ({selected.size})
                </Button>
                <Dialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete {selected.size} Template(s)?</DialogTitle>
                      <DialogDescription>This action cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowBulkConfirm(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={() => { bulkDeleteMut.mutate({ ids: Array.from(selected) }); setShowBulkConfirm(false); }}>
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setEditId(null); setForm(DEFAULT_FORM); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Template</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editId ? "Edit Template" : "Create Broadcast Template"}</DialogTitle>
                  <DialogDescription>{editId ? "Update template settings" : "Save campaign settings as a reusable template"}</DialogDescription>
                </DialogHeader>
                <TemplateForm />
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); setForm(DEFAULT_FORM); }}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={isPending}>
                    {isPending ? "Saving..." : editId ? "Update Template" : "Save Template"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            <span className="text-sm text-muted-foreground">Select all ({templates.length})</span>
          </div>
        )}

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
              <Card key={t.id} className={`hover:shadow-md transition-shadow ${selected.has(t.id) ? "ring-2 ring-destructive" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} className="mt-1" />
                      <div>
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        {t.description && <CardDescription className="mt-1">{t.description}</CardDescription>}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1"><Mic className="h-3 w-3" />{t.voice}</Badge>
                    <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{t.timeWindowStart}-{t.timeWindowEnd}</Badge>
                    <Badge variant="outline">Speed: {t.maxConcurrentCalls}</Badge>
                    {t.useDidRotation === 1 && <Badge variant="secondary">DID Rotation</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Retries: {t.retryAttempts} | Delay: {t.retryDelay}s | TZ: {t.timezone}</div>
                    {t.messageText && <div className="truncate">Message: {t.messageText}</div>}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(t)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openDuplicate(t)}>
                      <Copy className="h-3 w-3 mr-1" /> Duplicate
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this template?")) deleteMut.mutate({ id: t.id }); }}>
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
