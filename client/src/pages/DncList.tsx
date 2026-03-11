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
import { Ban, Plus, Upload, Trash2, Search, Download, AlertTriangle, Undo2, ShieldOff } from "lucide-react";
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
  const totalCount = dncCountQuery.data?.count ?? 0;

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

  const handleUnDnc = async (id: number, phoneNumber: string) => {
    if (!confirm(`Remove ${phoneNumber} from DNC list? This number will be eligible for dialing again.`)) return;
    try {
      await removeMutation.mutateAsync({ id });
      toast.success(`${phoneNumber} removed from DNC list (un-DNC'd)`);
      utils.dnc.invalidate();
    } catch {
      toast.error("Failed to remove number");
    }
  };

  const handleBulkUnDnc = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Remove ${selectedIds.length} number(s) from DNC list? These numbers will be eligible for dialing again.`)) return;
    try {
      await bulkRemoveMutation.mutateAsync({ ids: selectedIds });
      toast.success(`Removed ${selectedIds.length} numbers from DNC list (un-DNC'd)`);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Do Not Call List</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage numbers that should never be dialed. DNC numbers are automatically filtered from all campaigns.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Card className="border-red-500/30 bg-red-500/5 px-5 py-3">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-500">{totalCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total DNC Numbers</p>
                </div>
              </div>
            </Card>
          </div>
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
                You can <strong>un-DNC</strong> numbers by selecting them and clicking "Un-DNC Selected" to make them eligible for dialing again.
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
            <Button variant="secondary" onClick={handleBulkUnDnc} disabled={bulkRemoveMutation.isPending}>
              <ShieldOff className="mr-2 h-4 w-4" />Un-DNC {selectedIds.length} Selected
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
              {totalCount > 0 && !search ? ` of ${totalCount.toLocaleString()} total` : ""}
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
                <table className="w-full min-w-[600px]">
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
                      <th className="pb-3 w-24">Actions</th>
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
                        <td className="py-3 pr-4 text-sm text-muted-foreground">{entry.reason || "\u2014"}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={
                            entry.source === "complaint" ? "destructive" :
                            entry.source === "opt-out" ? "secondary" :
                            "outline"
                          }>
                            {entry.source}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-sm">{entry.addedBy || "\u2014"}</td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleUnDnc(entry.id, entry.phoneNumber)}
                            disabled={removeMutation.isPending}
                            title="Remove from DNC list (un-DNC)"
                          >
                            <Undo2 className="h-3 w-3 mr-1" />
                            Un-DNC
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
