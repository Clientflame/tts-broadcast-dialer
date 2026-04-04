import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Shield, ShieldCheck, ShieldX, ShieldAlert,
  Plus, Trash2, Search, Phone, MessageSquare,
  Filter, Settings2, Activity, Globe, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Pencil,
  Upload, Download, ToggleLeft, ToggleRight, Zap
} from "lucide-react";

// ─── Filter Rules Tab ──────────────────────────────────────────────────────

function FilterRulesTab() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.inboundFilter.rules.list.useQuery();
  const { data: messages } = trpc.inboundFilter.messages.list.useQuery();
  const [selectedRules, setSelectedRules] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [bulkMessageId, setBulkMessageId] = useState<string>("");
  const [autoCreateMode, setAutoCreateMode] = useState<"whitelist" | "blacklist" | "both">("whitelist");
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(true);
  const [autoCreateMessageId, setAutoCreateMessageId] = useState<string>("");
  const [autoCreateExcludeMerchant, setAutoCreateExcludeMerchant] = useState(true);

  const updateRule = trpc.inboundFilter.rules.update.useMutation({
    onSuccess: () => { utils.inboundFilter.rules.list.invalidate(); toast.success("Rule updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.inboundFilter.rules.delete.useMutation({
    onSuccess: () => { utils.inboundFilter.rules.list.invalidate(); toast.success("Rule deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const bulkToggle = trpc.inboundFilter.rules.bulkToggle.useMutation({
    onSuccess: () => { utils.inboundFilter.rules.list.invalidate(); setSelectedRules([]); toast.success("Rules updated"); },
    onError: (e) => toast.error(e.message),
  });
  const bulkAssignMsg = trpc.inboundFilter.rules.bulkAssignMessage.useMutation({
    onSuccess: () => { utils.inboundFilter.rules.list.invalidate(); setSelectedRules([]); setBulkMessageOpen(false); toast.success("Message assigned"); },
    onError: (e) => toast.error(e.message),
  });
  const autoCreate = trpc.inboundFilter.rules.autoCreate.useMutation({
    onSuccess: (data) => { utils.inboundFilter.rules.list.invalidate(); setAutoCreateOpen(false); toast.success(`Created ${data.created} filter rules`); },
    onError: (e) => toast.error(e.message),
  });

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    if (!search) return rules;
    const s = search.toLowerCase();
    return rules.filter(r =>
      r.didNumber.includes(s) ||
      (r.didLabel && r.didLabel.toLowerCase().includes(s))
    );
  }, [rules, search]);

  const allSelected = filteredRules.length > 0 && selectedRules.length === filteredRules.length;
  const someSelected = selectedRules.length > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelectedRules([]);
    else setSelectedRules(filteredRules.map(r => r.id));
  };

  const toggleOne = (id: number) => {
    setSelectedRules(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by DID number or label..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAutoCreateOpen(true)} variant="outline" size="sm">
          <Zap className="h-4 w-4 mr-1" /> Auto-Create Rules
        </Button>
        {selectedRules.length > 0 && (
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => bulkToggle.mutate({ ruleIds: selectedRules, enabled: true })}
              disabled={bulkToggle.isPending}
            >
              <ToggleRight className="h-4 w-4 mr-1" /> Enable ({selectedRules.length})
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => bulkToggle.mutate({ ruleIds: selectedRules, enabled: false })}
              disabled={bulkToggle.isPending}
            >
              <ToggleLeft className="h-4 w-4 mr-1" /> Disable ({selectedRules.length})
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setBulkMessageOpen(true)}
            >
              <MessageSquare className="h-4 w-4 mr-1" /> Assign Message ({selectedRules.length})
            </Button>
          </>
        )}
      </div>

      {/* Rules Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No filter rules yet</p>
            <p className="text-sm mt-1">Click "Auto-Create Rules" to generate rules for all your DIDs</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>DID Number</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.map(rule => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRules.includes(rule.id)}
                      onCheckedChange={() => toggleOne(rule.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {rule.didNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {rule.didLabel || <span className="text-muted-foreground text-xs">—</span>}
                      {rule.isMerchant ? (
                        <Badge variant="secondary" className="text-xs">Merchant</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.enabled === 1}
                      onCheckedChange={(checked) =>
                        updateRule.mutate({ id: rule.id, enabled: checked ? 1 : 0 })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={rule.filterMode}
                      onValueChange={(val) =>
                        updateRule.mutate({ id: rule.id, filterMode: val as any })
                      }
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whitelist">Whitelist</SelectItem>
                        <SelectItem value="blacklist">Blacklist</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {rule.checkInternalContacts ? (
                        <Badge variant="outline" className="text-xs">DB</Badge>
                      ) : null}
                      {rule.checkExternalCrm ? (
                        <Badge variant="outline" className="text-xs">CRM</Badge>
                      ) : null}
                      {rule.checkManualWhitelist ? (
                        <Badge variant="outline" className="text-xs">Manual</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={rule.rejectionMessageId?.toString() ?? "default"}
                      onValueChange={(val) =>
                        updateRule.mutate({
                          id: rule.id,
                          rejectionMessageId: val === "default" ? null : parseInt(val),
                        })
                      }
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        {messages?.map(m => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => deleteRule.mutate({ id: rule.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Auto-Create Dialog */}
      <Dialog open={autoCreateOpen} onOpenChange={setAutoCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Create Filter Rules</DialogTitle>
            <DialogDescription>
              Create filter rules for all DIDs that don't have one yet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Filter Mode</Label>
              <Select value={autoCreateMode} onValueChange={(v) => setAutoCreateMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whitelist">Whitelist (only known callers)</SelectItem>
                  <SelectItem value="blacklist">Blacklist (block specific callers)</SelectItem>
                  <SelectItem value="both">Both (whitelist + blacklist)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={autoCreateEnabled} onCheckedChange={setAutoCreateEnabled} />
              <Label>Enable filtering immediately</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={autoCreateExcludeMerchant} onCheckedChange={setAutoCreateExcludeMerchant} />
              <Label>Exclude merchant DIDs</Label>
            </div>
            <div className="space-y-2">
              <Label>Rejection Message</Label>
              <Select value={autoCreateMessageId} onValueChange={setAutoCreateMessageId}>
                <SelectTrigger><SelectValue placeholder="Default message" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default message</SelectItem>
                  {messages?.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => autoCreate.mutate({
                filterMode: autoCreateMode,
                enabled: autoCreateEnabled,
                rejectionMessageId: autoCreateMessageId && autoCreateMessageId !== "default" ? parseInt(autoCreateMessageId) : null,
                excludeMerchant: autoCreateExcludeMerchant,
              })}
              disabled={autoCreate.isPending}
            >
              {autoCreate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
              Create Rules
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Message Dialog */}
      <Dialog open={bulkMessageOpen} onOpenChange={setBulkMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Assign Rejection Message</DialogTitle>
            <DialogDescription>
              Assign a rejection message to {selectedRules.length} selected DID(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select value={bulkMessageId} onValueChange={setBulkMessageId}>
              <SelectTrigger><SelectValue placeholder="Select a message" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default message</SelectItem>
                {messages?.map(m => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMessageOpen(false)}>Cancel</Button>
            <Button
              onClick={() => bulkAssignMsg.mutate({
                ruleIds: selectedRules,
                messageId: bulkMessageId && bulkMessageId !== "default" ? parseInt(bulkMessageId) : null,
              })}
              disabled={bulkAssignMsg.isPending}
            >
              {bulkAssignMsg.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Assign Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Rejection Messages Tab ────────────────────────────────────────────────

function MessagesTab() {
  const utils = trpc.useUtils();
  const { data: messages, isLoading } = trpc.inboundFilter.messages.list.useQuery();
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [voice, setVoice] = useState("en-US-Wavenet-F");
  const [isDefault, setIsDefault] = useState(false);

  const createMsg = trpc.inboundFilter.messages.create.useMutation({
    onSuccess: () => { utils.inboundFilter.messages.list.invalidate(); resetForm(); toast.success("Message created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMsg = trpc.inboundFilter.messages.update.useMutation({
    onSuccess: () => { utils.inboundFilter.messages.list.invalidate(); resetForm(); toast.success("Message updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMsg = trpc.inboundFilter.messages.delete.useMutation({
    onSuccess: () => { utils.inboundFilter.messages.list.invalidate(); toast.success("Message deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditOpen(false);
    setEditId(null);
    setName("");
    setMessageText("");
    setVoice("en-US-Wavenet-F");
    setIsDefault(false);
  };

  const openEdit = (msg: any) => {
    setEditId(msg.id);
    setName(msg.name);
    setMessageText(msg.messageText);
    setVoice(msg.voice || "en-US-Wavenet-F");
    setIsDefault(msg.isDefault === 1);
    setEditOpen(true);
  };

  const handleSave = () => {
    if (editId) {
      updateMsg.mutate({ id: editId, name, messageText, voice, isDefault: isDefault ? 1 : 0 });
    } else {
      createMsg.mutate({ name, messageText, voice, isDefault: isDefault ? 1 : 0 });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create custom TTS messages that play when a filtered call is rejected.
        </p>
        <Button onClick={() => { resetForm(); setEditOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Message
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !messages || messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No rejection messages</p>
            <p className="text-sm mt-1">Create a custom message to play when filtering rejects a call</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {messages.map(msg => (
            <Card key={msg.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{msg.name}</h4>
                      {msg.isDefault === 1 && <Badge variant="secondary">Default</Badge>}
                      <Badge variant="outline" className="text-xs">{msg.voice}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{msg.messageText}</p>
                  </div>
                  <div className="flex gap-1 ml-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(msg)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMsg.mutate({ id: msg.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Create"} Rejection Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Business Hours Closed" />
            </div>
            <div className="space-y-2">
              <Label>Message Text (will be spoken via TTS)</Label>
              <Textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder="We're sorry, this number is not currently accepting calls. Please try again during business hours."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US-Wavenet-F">Female (Wavenet F)</SelectItem>
                  <SelectItem value="en-US-Wavenet-D">Male (Wavenet D)</SelectItem>
                  <SelectItem value="en-US-Wavenet-A">Female (Wavenet A)</SelectItem>
                  <SelectItem value="en-US-Wavenet-B">Male (Wavenet B)</SelectItem>
                  <SelectItem value="en-US-Wavenet-C">Female (Wavenet C)</SelectItem>
                  <SelectItem value="en-US-Wavenet-E">Female (Wavenet E)</SelectItem>
                  <SelectItem value="en-US-Neural2-F">Female (Neural2 F)</SelectItem>
                  <SelectItem value="en-US-Neural2-D">Male (Neural2 D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <Label>Set as default message</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name || !messageText || createMsg.isPending || updateMsg.isPending}>
              {(createMsg.isPending || updateMsg.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Whitelist / Blacklist Tab ─────────────────────────────────────────────

function PhoneListTab({ type }: { type: "whitelist" | "blacklist" }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [reason, setReason] = useState("");
  const [bulkText, setBulkText] = useState("");

  const listQuery = type === "whitelist"
    ? trpc.inboundFilter.whitelist.list.useQuery({ search: search || undefined })
    : trpc.inboundFilter.blacklist.list.useQuery({ search: search || undefined });

  const addMutation = type === "whitelist"
    ? trpc.inboundFilter.whitelist.add.useMutation({
        onSuccess: () => { utils.inboundFilter.whitelist.list.invalidate(); setAddOpen(false); setPhone(""); setPhoneName(""); setReason(""); toast.success("Added to whitelist"); },
        onError: (e: any) => toast.error(e.message),
      })
    : trpc.inboundFilter.blacklist.add.useMutation({
        onSuccess: () => { utils.inboundFilter.blacklist.list.invalidate(); setAddOpen(false); setPhone(""); setPhoneName(""); setReason(""); toast.success("Added to blacklist"); },
        onError: (e: any) => toast.error(e.message),
      });

  const bulkAddMutation = type === "whitelist"
    ? trpc.inboundFilter.whitelist.bulkAdd.useMutation({
        onSuccess: (data: any) => { utils.inboundFilter.whitelist.list.invalidate(); setBulkOpen(false); setBulkText(""); toast.success(`Added ${data.added} numbers`); },
        onError: (e: any) => toast.error(e.message),
      })
    : trpc.inboundFilter.blacklist.bulkAdd.useMutation({
        onSuccess: (data: any) => { utils.inboundFilter.blacklist.list.invalidate(); setBulkOpen(false); setBulkText(""); toast.success(`Added ${data.added} numbers`); },
        onError: (e: any) => toast.error(e.message),
      });

  const removeMutation = type === "whitelist"
    ? trpc.inboundFilter.whitelist.remove.useMutation({
        onSuccess: () => { utils.inboundFilter.whitelist.list.invalidate(); toast.success("Removed"); },
        onError: (e: any) => toast.error(e.message),
      })
    : trpc.inboundFilter.blacklist.remove.useMutation({
        onSuccess: () => { utils.inboundFilter.blacklist.list.invalidate(); toast.success("Removed"); },
        onError: (e: any) => toast.error(e.message),
      });

  const items = (listQuery.data ?? []) as any[];

  const handleBulkAdd = () => {
    const lines = bulkText.split("\n").filter(l => l.trim());
    const entries = lines.map(line => {
      const parts = line.split(",").map(p => p.trim());
      return { phoneNumber: parts[0], name: parts[1] || undefined, reason: parts[2] || undefined };
    }).filter(e => e.phoneNumber);
    if (entries.length === 0) { toast.error("No valid entries"); return; }
    bulkAddMutation.mutate({ entries });
  };

  const icon = type === "whitelist" ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />;
  const label = type === "whitelist" ? "Whitelist" : "Blacklist";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Number
        </Button>
        <Button onClick={() => setBulkOpen(true)} variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-1" /> Bulk Import
        </Button>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {icon}
            <p className="text-lg font-medium mt-3">No {label.toLowerCase()} entries</p>
            <p className="text-sm mt-1">Add phone numbers to the {label.toLowerCase()}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Added By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">
                    {item.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                  </TableCell>
                  <TableCell>{item.name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.reason || "—"}</TableCell>
                  <TableCell className="text-sm">{item.addedBy || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => removeMutation.mutate({ id: item.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Single Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5551234567" />
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input value={phoneName} onChange={e => setPhoneName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Known customer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate({ phoneNumber: phone, name: phoneName || undefined, reason: reason || undefined })}
              disabled={!phone || addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Import to {label}</DialogTitle>
            <DialogDescription>
              One entry per line. Format: phone,name,reason (name and reason are optional)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder={"5551234567,John Doe,VIP Customer\n5559876543,Jane Smith\n5550001111"}
            rows={8}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAdd} disabled={!bulkText.trim() || bulkAddMutation.isPending}>
              {bulkAddMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── CRM Integration Tab ──────────────────────────────────────────────────

function CrmTab() {
  const utils = trpc.useUtils();
  const { data: integrations, isLoading } = trpc.inboundFilter.crm.list.useQuery();
  const [addOpen, setAddOpen] = useState(false);
  const [provider, setProvider] = useState<string>("vtiger");
  const [crmName, setCrmName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiUsername, setApiUsername] = useState("");
  const [apiKeyField, setApiKeyField] = useState("crm_api_key");
  const [testPhone, setTestPhone] = useState("");

  const createCrm = trpc.inboundFilter.crm.create.useMutation({
    onSuccess: () => { utils.inboundFilter.crm.list.invalidate(); setAddOpen(false); toast.success("CRM integration added"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCrm = trpc.inboundFilter.crm.delete.useMutation({
    onSuccess: () => { utils.inboundFilter.crm.list.invalidate(); toast.success("CRM integration removed"); },
    onError: (e) => toast.error(e.message),
  });
  const testCrm = trpc.inboundFilter.crm.test.useMutation({
    onSuccess: (data) => {
      utils.inboundFilter.crm.list.invalidate();
      if (data.found) {
        toast.success(`CRM connected! Found: ${data.contactName}`);
      } else {
        toast.info(`CRM connected but phone not found (${data.source})`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Connect your CRM to check inbound callers against your customer database.
        </p>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add CRM
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !integrations || integrations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No CRM integrations</p>
            <p className="text-sm mt-1">Connect Vtiger, Salesforce, HubSpot, or Zoho</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {integrations.map((crm: any) => (
            <Card key={crm.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{crm.name}</h4>
                      <Badge variant={crm.isActive ? "default" : "secondary"}>
                        {crm.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">{crm.provider}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{crm.apiUrl}</p>
                    {crm.lastSyncAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last tested: {new Date(crm.lastSyncAt).toLocaleString()} —{" "}
                        <span className={crm.lastSyncStatus === "connected" ? "text-green-500" : "text-red-500"}>
                          {crm.lastSyncStatus}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Test phone #"
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                        className="w-36 h-8 text-xs"
                      />
                      <Button variant="outline" size="sm"
                        onClick={() => testCrm.mutate({ id: crm.id, testPhone: testPhone || undefined })}
                        disabled={testCrm.isPending}
                      >
                        {testCrm.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => deleteCrm.mutate({ id: crm.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add CRM Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add CRM Integration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>CRM Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vtiger">Vtiger</SelectItem>
                  <SelectItem value="salesforce">Salesforce</SelectItem>
                  <SelectItem value="hubspot">HubSpot</SelectItem>
                  <SelectItem value="zoho">Zoho</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Integration Name</Label>
              <Input value={crmName} onChange={e => setCrmName(e.target.value)} placeholder="My Vtiger CRM" />
            </div>
            <div className="space-y-2">
              <Label>API URL</Label>
              <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://yourinstance.vtiger.com/restapi/v1/vtiger/default" />
            </div>
            <div className="space-y-2">
              <Label>API Username</Label>
              <Input value={apiUsername} onChange={e => setApiUsername(e.target.value)} placeholder="admin@company.com" />
            </div>
            <div className="space-y-2">
              <Label>API Key Setting Name</Label>
              <Input value={apiKeyField} onChange={e => setApiKeyField(e.target.value)} placeholder="crm_api_key" />
              <p className="text-xs text-muted-foreground">
                The API key will be stored in app settings under this name. Set it in Settings after adding.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createCrm.mutate({
                provider: provider as any,
                name: crmName,
                apiUrl,
                apiUsername: apiUsername || undefined,
                apiKeyField,
              })}
              disabled={!crmName || !apiUrl || createCrm.isPending}
            >
              {createCrm.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Filter Logs Tab ───────────────────────────────────────────────────────

function LogsTab() {
  const { data: logs, isLoading } = trpc.inboundFilter.logs.list.useQuery({ limit: 200 });
  const { data: stats } = trpc.inboundFilter.logs.stats.useQuery();

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-green-500">{stats.totalAllowed ?? 0}</p>
              <p className="text-xs text-muted-foreground">Allowed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-red-500">{stats.totalRejected ?? 0}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-yellow-500">{stats.totalBypassed ?? 0}</p>
              <p className="text-xs text-muted-foreground">Bypassed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{(stats.totalAllowed ?? 0) + (stats.totalRejected ?? 0) + (stats.totalBypassed ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Total Checked</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !logs || logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No filter activity yet</p>
            <p className="text-sm mt-1">Filter logs will appear here once inbound calls are checked</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>DID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.callerNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.didNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      log.action === "allowed" ? "default" :
                      log.action === "rejected" ? "destructive" : "secondary"
                    }>
                      {log.action === "allowed" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                       log.action === "rejected" ? <XCircle className="h-3 w-3 mr-1" /> :
                       <AlertTriangle className="h-3 w-3 mr-1" />}
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{log.reason}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.matchSource || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function InboundFilter() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> Inbound Call Filter
          </h1>
          <p className="text-muted-foreground mt-1">
            Control which inbound calls are processed by filtering callers against your contacts, CRM, and custom lists.
          </p>
        </div>

        <Tabs defaultValue="rules">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="rules" className="text-xs sm:text-sm">
              <Filter className="h-4 w-4 mr-1 hidden sm:inline" /> Rules
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs sm:text-sm">
              <MessageSquare className="h-4 w-4 mr-1 hidden sm:inline" /> Messages
            </TabsTrigger>
            <TabsTrigger value="whitelist" className="text-xs sm:text-sm">
              <ShieldCheck className="h-4 w-4 mr-1 hidden sm:inline" /> Whitelist
            </TabsTrigger>
            <TabsTrigger value="blacklist" className="text-xs sm:text-sm">
              <ShieldX className="h-4 w-4 mr-1 hidden sm:inline" /> Blacklist
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs sm:text-sm">
              <Activity className="h-4 w-4 mr-1 hidden sm:inline" /> Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            <FilterRulesTab />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <MessagesTab />
          </TabsContent>
          <TabsContent value="whitelist" className="mt-4">
            <PhoneListTab type="whitelist" />
          </TabsContent>
          <TabsContent value="blacklist" className="mt-4">
            <PhoneListTab type="blacklist" />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <LogsTab />
          </TabsContent>
        </Tabs>

        {/* CRM Integration Section */}
        <Separator />
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5" /> CRM Integration
          </h2>
          <CrmTab />
        </div>
      </div>
    </DashboardLayout>
  );
}
