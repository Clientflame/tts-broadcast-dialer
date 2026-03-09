import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Ban, Plus, Upload, Trash2, Search, Download, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function DncList() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newSource, setNewSource] = useState<"manual" | "import" | "opt-out" | "complaint">("manual");

  const dncQuery = trpc.dnc.list.useQuery({ search: search || undefined });
  const dncCountQuery = trpc.dnc.count.useQuery();
  const addMutation = trpc.dnc.add.useMutation();
  const bulkAddMutation = trpc.dnc.bulkAdd.useMutation();
  const removeMutation = trpc.dnc.remove.useMutation();
  const bulkRemoveMutation = trpc.dnc.bulkRemove.useMutation();
  const utils = trpc.useUtils();

  const entries = dncQuery.data || [];

  const handleAdd = async () => {
    if (!newPhone.trim()) return;
    try {
      const result = await addMutation.mutateAsync({
        phoneNumber: newPhone.trim(),
        reason: newReason || undefined,
        source: newSource,
      });
      if (result.duplicate) {
        toast.info("Number already on DNC list");
      } else {
        toast.success("Number added to DNC list");
      }
      setNewPhone("");
      setNewReason("");
      setShowAddDialog(false);
      utils.dnc.invalidate();
    } catch (err) {
      toast.error("Failed to add number");
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await removeMutation.mutateAsync({ id });
      toast.success("Number removed from DNC list");
      utils.dnc.invalidate();
    } catch {
      toast.error("Failed to remove number");
    }
  };

  const handleBulkRemove = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkRemoveMutation.mutateAsync({ ids: selectedIds });
      toast.success(`Removed ${selectedIds.length} numbers from DNC list`);
      setSelectedIds([]);
      utils.dnc.invalidate();
    } catch {
      toast.error("Failed to remove numbers");
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      toast.error("CSV file must have a header row and at least one data row");
      return;
    }

    const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
    const phoneIdx = header.findIndex(h => h.includes("phone") || h.includes("number"));
    const reasonIdx = header.findIndex(h => h.includes("reason"));

    if (phoneIdx === -1) {
      toast.error("CSV must have a 'phone' or 'number' column");
      return;
    }

    const entries = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      return {
        phoneNumber: cols[phoneIdx] || "",
        reason: reasonIdx >= 0 ? cols[reasonIdx] : undefined,
        source: "import" as const,
      };
    }).filter(e => e.phoneNumber.length > 0);

    if (entries.length === 0) {
      toast.error("No valid phone numbers found in CSV");
      return;
    }

    try {
      const result = await bulkAddMutation.mutateAsync({ entries });
      toast.success(`Added ${result.added} numbers to DNC list (${result.duplicates} duplicates skipped)`);
      setShowImportDialog(false);
      utils.dnc.invalidate();
    } catch {
      toast.error("Failed to import DNC list");
    }
  };

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error("No DNC entries to export");
      return;
    }
    const csv = ["Phone Number,Reason,Source,Added By,Date Added"];
    for (const entry of entries) {
      csv.push(`"${entry.phoneNumber}","${entry.reason || ""}","${entry.source}","${entry.addedBy || ""}","${new Date(entry.createdAt).toLocaleDateString()}"`);
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dnc_list_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === entries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(entries.map(e => e.id));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Do Not Call List</h1>
            <p className="text-muted-foreground mt-1">
              Manage numbers that should never be dialed. DNC numbers are automatically filtered from all campaigns.
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Ban className="mr-2 h-4 w-4" />
            {dncCountQuery.data?.count ?? 0} numbers
          </Badge>
        </div>

        {/* Warning Banner */}
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-500">Compliance Notice</p>
              <p className="text-muted-foreground mt-1">
                Numbers on this list will be automatically excluded from all broadcast campaigns before dialing begins.
                Ensure compliance with TCPA, FCC regulations, and your state's telemarketing laws.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search phone numbers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Number</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to DNC List</DialogTitle>
                <DialogDescription>Add a phone number to the Do Not Call list.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Phone Number</Label>
                  <Input
                    placeholder="e.g. 4075551234"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Reason (optional)</Label>
                  <Input
                    placeholder="e.g. Customer requested removal"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Source</Label>
                  <Select value={newSource} onValueChange={(v) => setNewSource(v as typeof newSource)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                      <SelectItem value="opt-out">Opt-Out Request</SelectItem>
                      <SelectItem value="complaint">Complaint</SelectItem>
                      <SelectItem value="import">Import</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={addMutation.isPending || !newPhone.trim()}>
                  {addMutation.isPending ? "Adding..." : "Add to DNC"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="mr-2 h-4 w-4" />Import CSV</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import DNC Numbers</DialogTitle>
                <DialogDescription>
                  Upload a CSV file with a "phone" or "number" column. Optionally include a "reason" column.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  disabled={bulkAddMutation.isPending}
                />
                {bulkAddMutation.isPending && (
                  <p className="text-sm text-muted-foreground">Importing numbers...</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={handleExport} disabled={entries.length === 0}>
            <Download className="mr-2 h-4 w-4" />Export
          </Button>

          {selectedIds.length > 0 && (
            <Button variant="destructive" onClick={handleBulkRemove}>
              <Trash2 className="mr-2 h-4 w-4" />Remove {selectedIds.length} Selected
            </Button>
          )}
        </div>

        {/* DNC Table */}
        <Card>
          <CardHeader>
            <CardTitle>DNC Entries</CardTitle>
            <CardDescription>
              {entries.length} number{entries.length !== 1 ? "s" : ""} shown
              {search ? ` matching "${search}"` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No DNC entries</p>
                <p className="text-sm mt-1">
                  {search ? "No numbers match your search" : "Add phone numbers to prevent them from being dialed"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 pr-4 w-10">
                        <Checkbox
                          checked={selectedIds.length === entries.length && entries.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="pb-3 pr-4">Phone Number</th>
                      <th className="pb-3 pr-4">Reason</th>
                      <th className="pb-3 pr-4">Source</th>
                      <th className="pb-3 pr-4">Added By</th>
                      <th className="pb-3 pr-4">Date Added</th>
                      <th className="pb-3 w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <Checkbox
                            checked={selectedIds.includes(entry.id)}
                            onCheckedChange={() => toggleSelect(entry.id)}
                          />
                        </td>
                        <td className="py-3 pr-4 font-mono font-medium">{entry.phoneNumber}</td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">{entry.reason || "—"}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={
                            entry.source === "complaint" ? "destructive" :
                            entry.source === "opt-out" ? "secondary" :
                            "outline"
                          }>
                            {entry.source}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-sm">{entry.addedBy || "—"}</td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(entry.id)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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
      </div>
    </DashboardLayout>
  );
}
