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
import { Ban, Plus, Upload, Trash2, Search, Download, AlertTriangle, Undo2, ShieldOff, PhoneOff, BarChart3, TrendingUp, PieChart } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart as RechartsPie, Pie, Cell, Legend } from "recharts";

type TabType = "dnc" | "disconnected" | "analytics";

export default function DncList() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("dnc");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Do Not Call Management</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage DNC list, disconnected numbers, and view compliance analytics.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b pb-0">
          <button
            onClick={() => setActiveTab("dnc")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "dnc" ? "border-blue-500 text-blue-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Ban className="inline h-4 w-4 mr-1.5 -mt-0.5" />DNC List
          </button>
          <button
            onClick={() => setActiveTab("disconnected")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "disconnected" ? "border-orange-500 text-orange-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <PhoneOff className="inline h-4 w-4 mr-1.5 -mt-0.5" />Disconnected Numbers
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "analytics" ? "border-green-500 text-green-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <BarChart3 className="inline h-4 w-4 mr-1.5 -mt-0.5" />Analytics & Reports
          </button>
        </div>

        {activeTab === "dnc" && <DncListTab />}
        {activeTab === "disconnected" && <DisconnectedTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
      </div>
    </DashboardLayout>
  );
}

// ─── DNC List Tab ──────────────────────────────────────────────────────────────
function DncListTab() {
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
    const csv = ["Phone Number,Reason,Source,Added By,Date Added,Database Name"];
    for (const entry of entries) {
      csv.push(`"${entry.phoneNumber}","${entry.reason || ""}","${entry.source}","${entry.addedBy || ""}","${new Date(entry.createdAt).toLocaleDateString()}",""`);
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
    <div className="space-y-4">
      {/* Stats Card */}
      <div className="flex items-center gap-4">
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
                          entry.source === "disconnected" ? "outline" :
                          "outline"
                        }>
                          {entry.source === "disconnected" ? "🔌 Disconnected" : entry.source}
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
  );
}

// ─── Disconnected Numbers Tab ──────────────────────────────────────────────────
function DisconnectedTab() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const listQuery = trpc.dnc.disconnected.list.useQuery({ search: search || undefined });
  const countQuery = trpc.dnc.disconnected.count.useQuery();
  const statsQuery = trpc.dnc.disconnected.stats.useQuery();
  const removeMutation = trpc.dnc.disconnected.remove.useMutation();
  const bulkRemoveMutation = trpc.dnc.disconnected.bulkRemove.useMutation();
  const importMutation = trpc.dnc.disconnected.importCsv.useMutation();
  const utils = trpc.useUtils();

  const entries = listQuery.data || [];
  const totalCount = countQuery.data?.count ?? 0;
  const stats = statsQuery.data;

  const handleRemove = async (id: number) => {
    if (!confirm("Remove this number from the disconnected list? It will remain on the DNC list.")) return;
    try {
      await removeMutation.mutateAsync({ id });
      toast.success("Removed from disconnected list");
      utils.dnc.disconnected.invalidate();
    } catch {
      toast.error("Failed to remove");
    }
  };

  const handleBulkRemove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Remove ${selectedIds.length} number(s) from disconnected list?`)) return;
    try {
      await bulkRemoveMutation.mutateAsync({ ids: selectedIds });
      toast.success(`Removed ${selectedIds.length} numbers`);
      setSelectedIds([]);
      utils.dnc.disconnected.invalidate();
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
    const dbNameIdx = header.findIndex(h => h.includes("database") || h.includes("db_name"));

    if (phoneIdx === -1) {
      toast.error("CSV must have a 'phone' or 'number' column");
      return;
    }

    const entries = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      return {
        phoneNumber: cols[phoneIdx] || "",
        reason: reasonIdx >= 0 ? cols[reasonIdx] : undefined,
        databaseName: dbNameIdx >= 0 ? cols[dbNameIdx] : undefined,
      };
    }).filter(e => e.phoneNumber.length > 0);

    if (entries.length === 0) {
      toast.error("No valid phone numbers found in CSV");
      return;
    }

    try {
      const result = await importMutation.mutateAsync({ entries });
      toast.success(`Added ${result.added} disconnected numbers (${result.duplicates} duplicates, ${result.addedToDnc} auto-added to DNC)`);
      setShowImportDialog(false);
      utils.dnc.disconnected.invalidate();
      utils.dnc.invalidate();
    } catch {
      toast.error("Failed to import disconnected numbers");
    }
  };

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error("No disconnected numbers to export");
      return;
    }
    const csv = ["Phone Number,Reason,Campaign,Database Name,Detected At,Auto Added to DNC"];
    for (const entry of entries) {
      csv.push(`"${entry.phoneNumber}","${entry.reason}","${entry.campaignName || ""}","${entry.databaseName || ""}","${new Date(entry.detectedAt).toLocaleString()}","${entry.autoAddedToDnc ? "Yes" : "No"}"`);
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disconnected_numbers_${new Date().toISOString().split("T")[0]}.csv`;
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
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-orange-500/30 bg-orange-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <PhoneOff className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-orange-500">{totalCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Disconnected</p>
            </div>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div>
            <p className="text-2xl font-bold">{stats?.last24h ?? 0}</p>
            <p className="text-xs text-muted-foreground">Last 24 Hours</p>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div>
            <p className="text-2xl font-bold">{stats?.last7d ?? 0}</p>
            <p className="text-xs text-muted-foreground">Last 7 Days</p>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div>
            <p className="text-2xl font-bold">{stats?.last30d ?? 0}</p>
            <p className="text-xs text-muted-foreground">Last 30 Days</p>
          </div>
        </Card>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <PhoneOff className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-500">Auto-Detection Active</p>
            <p className="text-muted-foreground mt-1">
              Disconnected numbers are automatically detected during campaigns when calls return congestion, invalid-number, 
              unallocated, or out-of-service signals. These numbers are automatically added to the DNC list to prevent future dialing.
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

        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogTrigger asChild>
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" />Import CSV</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Disconnected Numbers</DialogTitle>
              <DialogDescription>
                Upload a CSV with a "phone" or "number" column. Optionally include "reason" and "database_name" columns. 
                Numbers will be auto-added to the DNC list.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                disabled={importMutation.isPending}
              />
              {importMutation.isPending && (
                <p className="text-sm text-muted-foreground">Importing numbers...</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Button variant="outline" onClick={handleExport} disabled={entries.length === 0}>
          <Download className="mr-2 h-4 w-4" />Export
        </Button>

        {selectedIds.length > 0 && (
          <Button variant="destructive" onClick={handleBulkRemove} disabled={bulkRemoveMutation.isPending}>
            <Trash2 className="mr-2 h-4 w-4" />Remove {selectedIds.length} Selected
          </Button>
        )}
      </div>

      {/* Disconnected Numbers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Disconnected Numbers</CardTitle>
          <CardDescription>
            {entries.length} number{entries.length !== 1 ? "s" : ""} shown
            {search ? ` matching "${search}"` : ""}
            {totalCount > 0 && !search ? ` of ${totalCount.toLocaleString()} total` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PhoneOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No disconnected numbers</p>
              <p className="text-sm mt-1">
                {search ? "No numbers match your search" : "Disconnected numbers will appear here as they are detected during campaigns"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 w-10">
                      <Checkbox
                        checked={selectedIds.length === entries.length && entries.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="pb-3 pr-4">Phone Number</th>
                    <th className="pb-3 pr-4">Database Name</th>
                    <th className="pb-3 pr-4">Reason</th>
                    <th className="pb-3 pr-4">Campaign</th>
                    <th className="pb-3 pr-4">Detected</th>
                    <th className="pb-3 pr-4">DNC'd</th>
                    <th className="pb-3 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry: any) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 pr-4">
                        <Checkbox
                          checked={selectedIds.includes(entry.id)}
                          onCheckedChange={() => toggleSelect(entry.id)}
                        />
                      </td>
                      <td className="py-3 pr-4 font-mono font-medium">{entry.phoneNumber}</td>
                      <td className="py-3 pr-4 text-sm">{entry.databaseName || "\u2014"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                          {entry.reason}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">{entry.campaignName || "\u2014"}</td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">
                        {new Date(entry.detectedAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4">
                        {entry.autoAddedToDnc ? (
                          <Badge className="bg-green-500/20 text-green-500 border-green-500/50">Yes</Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:text-red-600"
                          onClick={() => handleRemove(entry.id)}
                          disabled={removeMutation.isPending}
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
    </div>
  );
}

// ─── Analytics Tab ──────────────────────────────────────────────────────────────
const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4"];

function AnalyticsTab() {
  const dncStatsQuery = trpc.dnc.stats.useQuery();
  const disconnectedStatsQuery = trpc.dnc.disconnected.stats.useQuery();

  const dncStats = dncStatsQuery.data;
  const disconnectedStats = disconnectedStatsQuery.data;

  const sourceData = useMemo(() => {
    if (!dncStats?.bySource) return [];
    return Object.entries(dncStats.bySource).map(([name, value]) => ({ name, value }));
  }, [dncStats]);

  const reasonData = useMemo(() => {
    if (!disconnectedStats?.byReason) return [];
    return Object.entries(disconnectedStats.byReason).map(([name, value]) => ({ name, value }));
  }, [disconnectedStats]);

  const growthData = useMemo(() => {
    if (!dncStats?.last30dGrowth) return [];
    return dncStats.last30dGrowth.map(d => ({
      date: d.date.slice(5), // MM-DD
      additions: d.additions,
    }));
  }, [dncStats]);

  const disconnectedGrowthData = useMemo(() => {
    if (!disconnectedStats?.dailyGrowth) return [];
    return disconnectedStats.dailyGrowth.map(d => ({
      date: d.date.slice(5),
      count: d.count,
    }));
  }, [disconnectedStats]);

  if (dncStatsQuery.isLoading || disconnectedStatsQuery.isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{dncStats?.total?.toLocaleString() ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total DNC</p>
            </div>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="flex items-center gap-2">
            <PhoneOff className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{disconnectedStats?.total?.toLocaleString() ?? 0}</p>
              <p className="text-xs text-muted-foreground">Disconnected</p>
            </div>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{disconnectedStats?.last7d ?? 0}</p>
              <p className="text-xs text-muted-foreground">New This Week</p>
            </div>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{sourceData.length}</p>
              <p className="text-xs text-muted-foreground">DNC Sources</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* DNC Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DNC List Growth (30 Days)</CardTitle>
            <CardDescription>Daily additions to the DNC list</CardDescription>
          </CardHeader>
          <CardContent>
            {growthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={growthData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="additions" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Disconnected Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disconnected Numbers (30 Days)</CardTitle>
            <CardDescription>Daily disconnected number detections</CardDescription>
          </CardHeader>
          <CardContent>
            {disconnectedGrowthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={disconnectedGrowthData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source Breakdown & Reason Breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* DNC Source Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DNC by Source</CardTitle>
            <CardDescription>How numbers were added to the DNC list</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPie>
                  <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Disconnect Reason Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disconnect Reasons</CardTitle>
            <CardDescription>Why numbers were flagged as disconnected</CardDescription>
          </CardHeader>
          <CardContent>
            {reasonData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={reasonData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f97316" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Impact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Impact</CardTitle>
          <CardDescription>Which campaigns generated the most disconnected numbers</CardDescription>
        </CardHeader>
        <CardContent>
          {disconnectedStats?.byCampaign && disconnectedStats.byCampaign.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4">Campaign</th>
                    <th className="pb-3 pr-4 text-right">Disconnected Numbers</th>
                  </tr>
                </thead>
                <tbody>
                  {disconnectedStats.byCampaign.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-sm">{item.campaignName}</td>
                      <td className="py-2 pr-4 text-sm text-right font-mono">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No campaign data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
