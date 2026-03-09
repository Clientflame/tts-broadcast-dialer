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
import { toast } from "sonner";
import { Phone, Plus, Upload, Trash2, ToggleLeft } from "lucide-react";

export default function CallerIds() {
  const utils = trpc.useUtils();
  const { data: callerIds = [], isLoading } = trpc.callerIds.list.useQuery();
  const createMut = trpc.callerIds.create.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); toast.success("Caller ID added"); setShowAdd(false); } });
  const bulkCreateMut = trpc.callerIds.bulkCreate.useMutation({ onSuccess: (r) => { utils.callerIds.list.invalidate(); toast.success(`${r.count} caller IDs added`); setShowBulk(false); setBulkText(""); } });
  const updateMut = trpc.callerIds.update.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); } });
  const deleteMut = trpc.callerIds.delete.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); toast.success("Caller ID removed"); } });
  const bulkDeleteMut = trpc.callerIds.bulkDelete.useMutation({ onSuccess: () => { utils.callerIds.list.invalidate(); setSelected(new Set()); toast.success("Selected caller IDs removed"); } });

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
      // Skip header if it contains non-numeric first field
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Caller IDs (DIDs)</h1>
            <p className="text-muted-foreground">Manage your outbound caller ID rotation pool</p>
          </div>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button variant="destructive" size="sm" onClick={() => bulkDeleteMut.mutate({ ids: Array.from(selected) })}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete {selected.size}
              </Button>
            )}
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
                  <DialogDescription>Enter one caller ID per line. Format: phone_number, label (optional)</DialogDescription>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <CardDescription>Inactive</CardDescription>
              <CardTitle className="text-3xl text-muted-foreground">{callerIds.length - activeCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

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
                    <th className="p-3 text-left">Calls Made</th>
                    <th className="p-3 text-left">Last Used</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : callerIds.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No caller IDs yet. Add DIDs to enable caller ID rotation.
                    </td></tr>
                  ) : callerIds.map(cid => (
                    <tr key={cid.id} className="border-b hover:bg-muted/30">
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
                      <td className="p-3">{cid.callCount}</td>
                      <td className="p-3 text-muted-foreground">
                        {cid.lastUsedAt ? new Date(cid.lastUsedAt).toLocaleString() : "Never"}
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: cid.id })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
