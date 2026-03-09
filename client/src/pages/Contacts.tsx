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
import { Plus, Upload, Download, Trash2, Search, Users, FolderPlus, Edit } from "lucide-react";

export default function Contacts() {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [contactForm, setContactForm] = useState({ phoneNumber: "", firstName: "", lastName: "", email: "", company: "", state: "", databaseName: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: () => { utils.contacts.list.invalidate(); utils.contactLists.list.invalidate(); setAddContactOpen(false); resetContactForm(); toast.success("Contact added"); },
    onError: (e) => toast.error(e.message),
  });

  const importContacts = trpc.contacts.import.useMutation({
    onSuccess: (data: any) => {
      utils.contacts.list.invalidate(); utils.contactLists.list.invalidate(); setImportOpen(false);
      if (data.duplicatesOmitted > 0) {
        toast.success(`Imported ${data.count} contacts (${data.duplicatesOmitted} duplicate${data.duplicatesOmitted > 1 ? 's' : ''} omitted)`);
      } else {
        toast.success(`Imported ${data.count} contacts`);
      }
    },
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

  const handleCSVImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedListId) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
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
      importContacts.mutate({ listId: selectedListId, contacts: parsed });
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [selectedListId, importContacts]);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground mt-1">Manage contact lists and import contacts for campaigns</p>
          </div>
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

        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-1 space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Contact Lists</h3>
            {lists.data?.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No lists yet. Create one to get started.</p>}
            {lists.data?.map(list => (
              <Card
                key={list.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedListId === list.id ? "border-primary bg-accent/30" : ""}`}
                onClick={() => { setSelectedListId(list.id); setSelectedContacts([]); setSearchQuery(""); }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{list.name}</p>
                      <p className="text-xs text-muted-foreground">{list.contactCount} contacts</p>
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
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{lists.data?.find(l => l.id === selectedListId)?.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAddContactOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-3.5 w-3.5 mr-1" />Import CSV</Button>
                      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
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
                <CardContent className="p-0">
                  <Table>
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
      </div>
    </DashboardLayout>
  );
}
