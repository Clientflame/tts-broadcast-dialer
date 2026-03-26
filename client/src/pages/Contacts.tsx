import { useState, useMemo, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Upload, Download, Trash2, Search, Users, FolderPlus, Edit, AlertTriangle, ShieldX, Copy, FileText, FlaskConical, Filter, GitMerge, Globe, Loader2, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type ParsedContact = {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  state?: string;
  databaseName?: string;
};

type PreviewData = {
  totalRows: number;
  intraFileDupes: number;
  sameListDupes: number;
  crossListDupes: number;
  dncMatches: number;
  willImport: number;
};

export default function Contacts() {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [selectedLists, setSelectedLists] = useState<Set<number>>(new Set());
  const [contactForm, setContactForm] = useState({ phoneNumber: "", firstName: "", lastName: "", email: "", company: "", state: "", databaseName: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [skipDupeCheck, setSkipDupeCheck] = useState(false);

  const utils = trpc.useUtils();
  const lists = trpc.contactLists.list.useQuery();
  const contacts = trpc.contacts.list.useQuery({ listId: selectedListId! }, { enabled: !!selectedListId });

  const createList = trpc.contactLists.create.useMutation({
    onSuccess: () => { utils.contactLists.list.invalidate(); setNewListOpen(false); setNewListName(""); setNewListDesc(""); toast.success("Contact list created"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteList = trpc.contactLists.delete.useMutation({
    onSuccess: () => { utils.contactLists.list.invalidate(); setSelectedListId(null); toast.success("List deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteLists = trpc.contactLists.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.contactLists.list.invalidate();
      if (selectedListId && selectedLists.has(selectedListId)) setSelectedListId(null);
      setSelectedLists(new Set());
      toast.success(`Deleted ${data.deleted} contact list${data.deleted !== 1 ? "s" : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleListSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLists(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllLists = () => {
    if (!lists.data) return;
    if (selectedLists.size === lists.data.length) {
      setSelectedLists(new Set());
    } else {
      setSelectedLists(new Set(lists.data.map(l => l.id)));
    }
  };

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: () => { utils.contacts.list.invalidate(); utils.contactLists.list.invalidate(); setAddContactOpen(false); resetContactForm(); toast.success("Contact added"); },
    onError: (e) => toast.error(e.message),
  });

  const importContacts = trpc.contacts.import.useMutation({
    onSuccess: (data: any) => {
      utils.contacts.list.invalidate(); utils.contactLists.list.invalidate(); setPreviewOpen(false); setParsedContacts([]); setPreviewData(null);
      const parts: string[] = [`Imported ${data.count} contacts`];
      if (data.duplicatesOmitted > 0) parts.push(`${data.duplicatesOmitted} duplicate${data.duplicatesOmitted > 1 ? 's' : ''} omitted`);
      if (data.dncOmitted > 0) parts.push(`${data.dncOmitted} DNC match${data.dncOmitted > 1 ? 'es' : ''} omitted`);
      toast.success(parts.join(" · "));
    },
    onError: (e) => toast.error(e.message),
  });

  const previewImport = trpc.contacts.previewImport.useMutation();

  // Segmentation, dedup, Vtiger
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [segmentBy, setSegmentBy] = useState<"timezone" | "areaCode" | "state">("state");
  const [segmentListId, setSegmentListId] = useState<number | null>(null);
  const [dedupOpen, setDedupOpen] = useState(false);
  const [dedupListIds, setDedupListIds] = useState<number[]>([]);
  const [vtigerOpen, setVtigerOpen] = useState(false);
  const [vtigerUrl, setVtigerUrl] = useState("");
  const [vtigerUsername, setVtigerUsername] = useState("");
  const [vtigerAccessKey, setVtigerAccessKey] = useState("");
  const [vtigerListName, setVtigerListName] = useState("Vtiger Import");
  const [vtigerLimit, setVtigerLimit] = useState(500);

  const segmentData = trpc.contactLists.segmentation.useQuery(
    { listId: segmentListId! },
    { enabled: !!segmentListId && segmentOpen }
  );
  const dedupLists = trpc.contactLists.removeDuplicates.useMutation({
    onSuccess: (data) => { utils.contactLists.list.invalidate(); utils.contacts.list.invalidate(); setDedupOpen(false); toast.success(`Removed ${data.removedCount} duplicate(s) from ${data.duplicateGroups} group(s)`); },
    onError: (e) => toast.error(e.message),
  });
  const vtigerImport = trpc.contactLists.vtigerImport.useMutation({
    onSuccess: (data) => { utils.contactLists.list.invalidate(); setVtigerOpen(false); toast.success(`Imported ${data.imported} contacts from Vtiger CRM`); },
    onError: (e) => toast.error(e.message),
  });

  const deleteContactsMut = trpc.contacts.delete.useMutation({
    onSuccess: () => { utils.contacts.list.invalidate(); utils.contactLists.list.invalidate(); setSelectedContacts([]); toast.success("Contacts deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const resetContactForm = () => setContactForm({ phoneNumber: "", firstName: "", lastName: "", email: "", company: "", state: "", databaseName: "" });

  const filteredContacts = useMemo(() => {
    if (!contacts.data) return [];
    if (!searchQuery) return contacts.data;
    const q = searchQuery.toLowerCase();
    return contacts.data.filter(c =>
      c.phoneNumber.toLowerCase().includes(q) ||
      (c.firstName?.toLowerCase().includes(q)) ||
      (c.lastName?.toLowerCase().includes(q)) ||
      (c.company?.toLowerCase().includes(q))
    );
  }, [contacts.data, searchQuery]);

  const handleCSVFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedListId) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { toast.error("CSV must have a header row and at least one data row"); return; }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
      const phoneIdx = headers.findIndex(h => h.includes("phone") || h === "number" || h === "tel");
      if (phoneIdx === -1) { toast.error("CSV must have a 'phone' column"); return; }
      const firstIdx = headers.findIndex(h => h.includes("first") || h === "firstname");
      const lastIdx = headers.findIndex(h => h.includes("last") || h === "lastname");
      const emailIdx = headers.findIndex(h => h.includes("email"));
      const companyIdx = headers.findIndex(h => h.includes("company") || h.includes("org"));
      const stateIdx = headers.findIndex(h => h === "state" || h.includes("state"));
      const dbNameIdx = headers.findIndex(h => h.includes("database") || h === "db" || h === "database name");

      // Build column mapping for display
      const mapping: Record<string, string> = { phone: headers[phoneIdx] };
      if (firstIdx >= 0) mapping.firstName = headers[firstIdx];
      if (lastIdx >= 0) mapping.lastName = headers[lastIdx];
      if (emailIdx >= 0) mapping.email = headers[emailIdx];
      if (companyIdx >= 0) mapping.company = headers[companyIdx];
      if (stateIdx >= 0) mapping.state = headers[stateIdx];
      if (dbNameIdx >= 0) mapping.databaseName = headers[dbNameIdx];
      setColumnMapping(mapping);

      const parsed = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim().replace(/^['"]|['"]$/g, ""));
        return {
          phoneNumber: cols[phoneIdx] || "",
          firstName: firstIdx >= 0 ? cols[firstIdx] : undefined,
          lastName: lastIdx >= 0 ? cols[lastIdx] : undefined,
          email: emailIdx >= 0 ? cols[emailIdx] : undefined,
          company: companyIdx >= 0 ? cols[companyIdx] : undefined,
          state: stateIdx >= 0 ? cols[stateIdx] : undefined,
          databaseName: dbNameIdx >= 0 ? cols[dbNameIdx] : undefined,
        };
      }).filter(c => c.phoneNumber);

      if (parsed.length === 0) { toast.error("No valid contacts found in CSV"); return; }

      setParsedContacts(parsed);
      setPreviewLoading(true);
      setPreviewOpen(true);

      try {
        const preview = await previewImport.mutateAsync({
          listId: selectedListId,
          phoneNumbers: parsed.map(c => c.phoneNumber),
          skipDupeCheck,
        });
        setPreviewData(preview);
      } catch (err: any) {
        toast.error("Preview failed: " + err.message);
      } finally {
        setPreviewLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [selectedListId, previewImport, skipDupeCheck]);

  const confirmImport = () => {
    if (!selectedListId || parsedContacts.length === 0) return;
    importContacts.mutate({ listId: selectedListId, contacts: parsedContacts, skipDupeCheck });
  };

  const handleExportCSV = useCallback(() => {
    if (!contacts.data?.length) return;
    const headers = "Database Name,First Name,Last Name,State,Phone,Email,Company,Status\n";
    const rows = contacts.data.map(c =>
      `"${(c as any).databaseName || ""}","${c.firstName || ""}","${c.lastName || ""}","${(c as any).state || ""}","${c.phoneNumber}","${c.email || ""}","${c.company || ""}","${c.status}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${selectedListId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [contacts.data, selectedListId]);

  const toggleAll = useCallback(() => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map(c => c.id));
    }
  }, [selectedContacts, filteredContacts]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage contact lists and import contacts for campaigns</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSegmentOpen(true)}><Filter className="h-4 w-4 mr-1" />Segment</Button>
            <Button variant="outline" size="sm" onClick={() => { setDedupListIds([]); setDedupOpen(true); }}><GitMerge className="h-4 w-4 mr-1" />Dedup</Button>
            <Button variant="outline" size="sm" onClick={() => setVtigerOpen(true)}><Globe className="h-4 w-4 mr-1" />Vtiger Import</Button>
          <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
            <DialogTrigger asChild>
              <Button><FolderPlus className="h-4 w-4 mr-2" />New List</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Contact List</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="e.g. Q1 Leads" /></div>
                <div><Label>Description (optional)</Label><Textarea value={newListDesc} onChange={e => setNewListDesc(e.target.value)} placeholder="Description..." /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewListOpen(false)}>Cancel</Button>
                <Button onClick={() => createList.mutate({ name: newListName, description: newListDesc || undefined })} disabled={!newListName || createList.isPending}>
                  {createList.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          <div className="md:col-span-1 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Contact Lists</h3>
              {lists.data && lists.data.length > 0 && (
                <div className="flex items-center gap-1">
                  <Checkbox
                    checked={selectedLists.size === lists.data.length && lists.data.length > 0}
                    onCheckedChange={toggleAllLists}
                    className="h-3.5 w-3.5"
                  />
                  {selectedLists.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete ${selectedLists.size} list(s) and all their contacts?`)) bulkDeleteLists.mutate({ ids: Array.from(selectedLists) }); }}
                      disabled={bulkDeleteLists.isPending}
                    >
                      <Trash2 className="h-3 w-3 mr-0.5" />{selectedLists.size}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {lists.data?.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No lists yet. Create one to get started.</p>}
            {lists.data?.map(list => (
              <Card
                key={list.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedListId === list.id ? "border-primary bg-accent/30" : ""} ${selectedLists.has(list.id) ? "ring-1 ring-destructive/50" : ""}`}
                onClick={() => { setSelectedListId(list.id); setSelectedContacts([]); setSearchQuery(""); }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedLists.has(list.id)}
                        onCheckedChange={() => {}}
                        onClick={(e) => toggleListSelect(list.id, e)}
                        className="h-3.5 w-3.5"
                      />
                      <div>
                        <p className="font-medium text-sm">{list.name}</p>
                        <p className="text-xs text-muted-foreground">{list.contactCount} contacts</p>
                      </div>
                    </div>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="md:col-span-3">
            {!selectedListId ? (
              <Card><CardContent className="p-12 text-center text-muted-foreground">Select a contact list to view contacts, or create a new one.</CardContent></Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle className="text-base truncate">{lists.data?.find(l => l.id === selectedListId)?.name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAddContactOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-3.5 w-3.5 mr-1" />Import CSV</Button>
                      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
                      <div className="flex items-center gap-1.5 ml-1 border rounded-md px-2 py-1">
                        <Switch id="skipDupe" checked={skipDupeCheck} onCheckedChange={setSkipDupeCheck} className="scale-75" />
                        <Label htmlFor="skipDupe" className="text-xs cursor-pointer whitespace-nowrap flex items-center gap-1">
                          <FlaskConical className="h-3 w-3" />Skip Dedup
                        </Label>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!contacts.data?.length}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
                      {selectedContacts.length > 0 && (
                        <Button variant="destructive" size="sm" onClick={() => deleteContactsMut.mutate({ ids: selectedContacts })}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete ({selectedContacts.length})
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete this entire list?")) deleteList.mutate({ id: selectedListId }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search contacts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><Checkbox checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0} onCheckedChange={toggleAll} /></TableHead>
                        <TableHead>Database</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContacts.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No contacts found</TableCell></TableRow>
                      ) : filteredContacts.map(contact => (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedContacts.includes(contact.id)}
                              onCheckedChange={(checked) => {
                                setSelectedContacts(prev => checked ? [...prev, contact.id] : prev.filter(id => id !== contact.id));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-sm">{(contact as any).databaseName || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{contact.phoneNumber}</TableCell>
                          <TableCell>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</TableCell>
                          <TableCell className="text-sm">{(contact as any).state || "—"}</TableCell>
                          <TableCell className="text-sm">{contact.email || "—"}</TableCell>
                          <TableCell className="text-sm">{contact.company || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={contact.status === "active" ? "default" : contact.status === "dnc" ? "destructive" : "secondary"}>
                              {contact.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Add Contact Dialog */}
        <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Phone Number *</Label><Input value={contactForm.phoneNumber} onChange={e => setContactForm(p => ({ ...p, phoneNumber: e.target.value }))} placeholder="+1234567890" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First Name</Label><Input value={contactForm.firstName} onChange={e => setContactForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                <div><Label>Last Name</Label><Input value={contactForm.lastName} onChange={e => setContactForm(p => ({ ...p, lastName: e.target.value }))} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>State</Label><Input value={contactForm.state} onChange={e => setContactForm(p => ({ ...p, state: e.target.value }))} placeholder="FL" /></div>
                <div><Label>Company</Label><Input value={contactForm.company} onChange={e => setContactForm(p => ({ ...p, company: e.target.value }))} /></div>
              </div>
              <div><Label>Database Name</Label><Input value={contactForm.databaseName} onChange={e => setContactForm(p => ({ ...p, databaseName: e.target.value }))} placeholder="Source database" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAddContactOpen(false); resetContactForm(); }}>Cancel</Button>
              <Button onClick={() => createContact.mutate({ listId: selectedListId!, phoneNumber: contactForm.phoneNumber, firstName: contactForm.firstName || undefined, lastName: contactForm.lastName || undefined, email: contactForm.email || undefined, company: contactForm.company || undefined, state: contactForm.state || undefined, databaseName: contactForm.databaseName || undefined })} disabled={!contactForm.phoneNumber || createContact.isPending}>
                {createContact.isPending ? "Adding..." : "Add Contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) { setPreviewOpen(false); setParsedContacts([]); setPreviewData(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Import Preview
              </DialogTitle>
            </DialogHeader>

            {previewLoading ? (
              <div className="py-8 text-center text-muted-foreground">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                Analyzing {parsedContacts.length.toLocaleString()} contacts for duplicates and DNC matches...
              </div>
            ) : previewData ? (
              <div className="space-y-4">
                {/* Column Mapping */}
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Column Mapping</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(columnMapping).map(([field, header]) => (
                      <Badge key={field} variant="outline" className="text-xs">
                        {field} ← {header}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{previewData.totalRows.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Rows in CSV</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-green-500/10">
                    <p className="text-2xl font-bold text-green-600">{previewData.willImport.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Will Be Imported</p>
                  </div>
                </div>

                {/* Dedup & DNC breakdown */}
                {(previewData.intraFileDupes > 0 || previewData.sameListDupes > 0 || previewData.crossListDupes > 0 || previewData.dncMatches > 0) && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Contacts to be omitted:</p>
                    {previewData.intraFileDupes > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Copy className="h-3.5 w-3.5 text-amber-500" />
                          Duplicate within CSV
                        </span>
                        <Badge variant="secondary">{previewData.intraFileDupes}</Badge>
                      </div>
                    )}
                    {previewData.sameListDupes > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Copy className="h-3.5 w-3.5 text-amber-500" />
                          Already in this list
                        </span>
                        <Badge variant="secondary">{previewData.sameListDupes}</Badge>
                      </div>
                    )}
                    {previewData.crossListDupes > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                          Exists in other lists
                        </span>
                        <Badge variant="secondary">{previewData.crossListDupes}</Badge>
                      </div>
                    )}
                    {previewData.dncMatches > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <ShieldX className="h-3.5 w-3.5 text-red-500" />
                          On DNC List
                        </span>
                        <Badge variant="destructive">{previewData.dncMatches}</Badge>
                      </div>
                    )}
                  </div>
                )}

                {skipDupeCheck && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-center text-sm text-blue-700 dark:text-blue-400 flex items-center justify-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    Duplicate checks skipped (testing mode)
                  </div>
                )}

                {previewData.willImport === 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center text-sm text-amber-700 dark:text-amber-400">
                    All contacts are duplicates or on the DNC list. Nothing to import.
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setPreviewOpen(false); setParsedContacts([]); setPreviewData(null); }}>
                Cancel
              </Button>
              <Button
                onClick={confirmImport}
                disabled={!previewData || previewData.willImport === 0 || importContacts.isPending}
              >
                {importContacts.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Importing {previewData?.willImport?.toLocaleString() ?? 0} contacts...
                  </span>
                ) : `Import ${previewData?.willImport?.toLocaleString() ?? 0} Contacts`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Segmentation Dialog */}
      <Dialog open={segmentOpen} onOpenChange={setSegmentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Smart Segmentation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Split a contact list into segments based on geographic or phone data.</p>
            <div>
              <Label>Source List</Label>
              <Select value={segmentListId?.toString() || ""} onValueChange={v => setSegmentListId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select a list" /></SelectTrigger>
                <SelectContent>{lists.data?.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.name} ({l.contactCount})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Segment By</Label>
              <Select value={segmentBy} onValueChange={v => setSegmentBy(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="state">State</SelectItem>
                  <SelectItem value="timezone">Timezone (by area code)</SelectItem>
                  <SelectItem value="areaCode">Area Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSegmentOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (segmentListId && segmentData.data) {
                const segments = segmentBy === "areaCode" ? segmentData.data.byAreaCode : segmentBy === "timezone" ? segmentData.data.byTimezone : segmentData.data.byAreaCode;
                toast.success(`Found ${Object.keys(segments || {}).length} segment(s) by ${segmentBy}`);
                setSegmentOpen(false);
              }
            }} disabled={!segmentListId || segmentData.isLoading}>
              {segmentData.isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</> : "View Segments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dedup Dialog */}
      <Dialog open={dedupOpen} onOpenChange={setDedupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cross-List Deduplication</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Detect and remove duplicate phone numbers across selected lists. The first occurrence is kept; duplicates in later lists are removed.</p>
            <div>
              <Label>Select Lists to Deduplicate</Label>
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                {lists.data?.map(l => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={dedupListIds.includes(l.id)} onCheckedChange={checked => {
                      setDedupListIds(prev => checked ? [...prev, l.id] : prev.filter(id => id !== l.id));
                    }} />
                    {l.name} ({l.contactCount} contacts)
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDedupOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (dedupListIds.length > 0) dedupLists.mutate({ listId: dedupListIds[0], keepStrategy: "first" }); }} disabled={dedupListIds.length < 1 || dedupLists.isPending}>
              {dedupLists.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Removing dupes...</> : `Deduplicate ${dedupListIds.length} List(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vtiger CRM Import Dialog */}
      <Dialog open={vtigerOpen} onOpenChange={setVtigerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import from Vtiger CRM</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Connect to your Vtiger CRM instance and import contacts directly.</p>
            <div><Label>Vtiger URL</Label><Input value={vtigerUrl} onChange={e => setVtigerUrl(e.target.value)} placeholder="https://your-instance.vtiger.com" /></div>
            <div><Label>Username</Label><Input value={vtigerUsername} onChange={e => setVtigerUsername(e.target.value)} placeholder="admin" /></div>
            <div><Label>Access Key</Label><Input type="password" value={vtigerAccessKey} onChange={e => setVtigerAccessKey(e.target.value)} placeholder="Your Vtiger access key" /></div>
            <div><Label>Import Into List Name</Label><Input value={vtigerListName} onChange={e => setVtigerListName(e.target.value)} /></div>
            <div><Label>Max Contacts</Label><Input type="number" value={vtigerLimit} onChange={e => setVtigerLimit(Number(e.target.value))} min={1} max={10000} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVtigerOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              // First create a list, then import into it
              toast.info("Vtiger import uses server-configured credentials. Contact your admin to set VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY in Settings.");
            }} disabled={!vtigerUrl || !vtigerUsername || !vtigerAccessKey || vtigerImport.isPending}>
              {vtigerImport.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing...</> : "Import from Vtiger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
