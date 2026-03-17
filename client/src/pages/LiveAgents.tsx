import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Headset, Plus, MoreHorizontal, Pencil, Trash2, Phone, PhoneOff, Coffee, Power, Users, BarChart3, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// ─── Status helpers ───
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "bg-green-500",
    on_call: "bg-blue-500",
    ringing: "bg-yellow-500",
    wrap_up: "bg-purple-500",
    on_break: "bg-orange-500",
    offline: "bg-gray-400",
    reserved: "bg-cyan-500",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || "bg-gray-400"}`} />;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Create/Edit Agent Dialog ───
function AgentDialog({ open, onOpenChange, agent, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: any;
  onSave: (data: any) => void;
}) {
  const [name, setName] = useState(agent?.name || "");
  const [sipExtension, setSipExtension] = useState(agent?.sipExtension || "");
  const [sipPassword, setSipPassword] = useState("");
  const [email, setEmail] = useState(agent?.email || "");
  const [priority, setPriority] = useState(String(agent?.priority || 5));
  const [maxConcurrent, setMaxConcurrent] = useState(String(agent?.maxConcurrentCalls || 1));

  const handleSave = () => {
    if (!name.trim() || !sipExtension.trim()) {
      toast.error("Name and SIP Extension are required");
      return;
    }
    onSave({
      ...(agent?.id ? { id: agent.id } : {}),
      name: name.trim(),
      sipExtension: sipExtension.trim(),
      ...(sipPassword ? { sipPassword } : {}),
      email: email.trim() || undefined,
      priority: Number(priority),
      maxConcurrentCalls: Number(maxConcurrent),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Agent" : "Add Live Agent"}</DialogTitle>
          <DialogDescription>
            {agent ? "Update agent details and SIP configuration." : "Add a new live agent with their FreePBX SIP extension."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sip">SIP Extension</Label>
              <Input id="sip" value={sipExtension} onChange={e => setSipExtension(e.target.value)} placeholder="1001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sipPass">SIP Password</Label>
              <Input id="sipPass" type="password" value={sipPassword} onChange={e => setSipPassword(e.target.value)} placeholder={agent ? "Leave blank to keep" : "Optional"} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="agent@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority (1=highest)</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => (
                    <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Concurrent Calls</Label>
              <Select value={maxConcurrent} onValueChange={setMaxConcurrent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(c => (
                    <SelectItem key={c} value={String(c)}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{agent ? "Save Changes" : "Add Agent"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───
export default function LiveAgents() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: agents, isLoading } = trpc.liveAgents.list.useQuery(undefined, { refetchInterval: 5000 });
  const { data: campaigns } = trpc.campaigns.list.useQuery();
  const { data: performanceData } = trpc.liveAgents.performanceReport.useQuery({});

  const createMutation = trpc.liveAgents.create.useMutation({
    onSuccess: () => {
      toast.success("Agent added successfully");
      utils.liveAgents.list.invalidate();
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.liveAgents.update.useMutation({
    onSuccess: () => {
      toast.success("Agent updated");
      utils.liveAgents.list.invalidate();
      setDialogOpen(false);
      setEditAgent(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.liveAgents.delete.useMutation({
    onSuccess: () => {
      toast.success("Agent removed");
      utils.liveAgents.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const setStatusMutation = trpc.liveAgents.setStatus.useMutation({
    onSuccess: () => {
      utils.liveAgents.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data: any) => {
    if (data.id) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (agent: any) => {
    setEditAgent(agent);
    setDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Remove this agent? They will be marked inactive.")) {
      deleteMutation.mutate({ id });
    }
  };

  // Summary stats
  const summary = useMemo(() => {
    if (!agents) return { total: 0, online: 0, onCall: 0, available: 0, offline: 0 };
    return {
      total: agents.length,
      online: agents.filter(a => a.liveStatus !== "offline").length,
      onCall: agents.filter(a => a.liveStatus === "on_call").length,
      available: agents.filter(a => a.liveStatus === "available").length,
      offline: agents.filter(a => a.liveStatus === "offline").length,
    };
  }, [agents]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Headset className="h-6 w-6 text-primary" />
              Live Agents
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage live agents, SIP extensions, and campaign assignments for predictive dialing
            </p>
          </div>
          <Button onClick={() => { setEditAgent(null); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total Agents</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-green-600">{summary.online}</div>
              <div className="text-xs text-muted-foreground">Online</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.onCall}</div>
              <div className="text-xs text-muted-foreground">On Call</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{summary.available}</div>
              <div className="text-xs text-muted-foreground">Available</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-gray-500">{summary.offline}</div>
              <div className="text-xs text-muted-foreground">Offline</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="agents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="agents">Agent List</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          {/* Agent List Tab */}
          <TabsContent value="agents">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading agents...</div>
                ) : !agents?.length ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Headset className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No live agents yet</p>
                    <p className="text-sm mt-1">Add agents with their FreePBX SIP extensions to enable live agent dialing.</p>
                    <Button className="mt-4" onClick={() => { setEditAgent(null); setDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Agent
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>SIP Extension</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Max Calls</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map(agent => (
                        <TableRow key={agent.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <StatusDot status={agent.liveStatus} />
                              <Badge variant="outline" className="text-xs capitalize">
                                {statusLabel(agent.liveStatus)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{agent.name}</TableCell>
                          <TableCell className="font-mono">{agent.sipExtension}</TableCell>
                          <TableCell>{agent.priority}</TableCell>
                          <TableCell>{agent.maxConcurrentCalls}</TableCell>
                          <TableCell className="text-muted-foreground">{agent.email || "—"}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {agent.liveStatus === "offline" && (
                                  <DropdownMenuItem onClick={() => setStatusMutation.mutate({ agentId: agent.id, status: "available" })}>
                                    <Power className="h-4 w-4 mr-2 text-green-500" /> Set Available
                                  </DropdownMenuItem>
                                )}
                                {agent.liveStatus === "available" && (
                                  <DropdownMenuItem onClick={() => setStatusMutation.mutate({ agentId: agent.id, status: "on_break" })}>
                                    <Coffee className="h-4 w-4 mr-2 text-orange-500" /> Set On Break
                                  </DropdownMenuItem>
                                )}
                                {(agent.liveStatus === "on_break" || agent.liveStatus === "available") && (
                                  <DropdownMenuItem onClick={() => setStatusMutation.mutate({ agentId: agent.id, status: "offline" })}>
                                    <PhoneOff className="h-4 w-4 mr-2 text-gray-500" /> Set Offline
                                  </DropdownMenuItem>
                                )}
                                {agent.liveStatus === "on_break" && (
                                  <DropdownMenuItem onClick={() => setStatusMutation.mutate({ agentId: agent.id, status: "available" })}>
                                    <Phone className="h-4 w-4 mr-2 text-green-500" /> Set Available
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEdit(agent)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDelete(agent.id)} className="text-red-600">
                                  <Trash2 className="h-4 w-4 mr-2" /> Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Agent Performance
                </CardTitle>
                <CardDescription>Call handling metrics per agent</CardDescription>
              </CardHeader>
              <CardContent>
                {!performanceData?.agents?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No performance data yet. Agents need to handle calls first.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Extension</TableHead>
                        <TableHead className="text-center">Total Calls</TableHead>
                        <TableHead className="text-center">Talk Time</TableHead>
                        <TableHead className="text-center">Avg Talk</TableHead>
                        <TableHead className="text-center">Wrap Time</TableHead>
                        <TableHead className="text-center">Avg Handle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {performanceData.agents.map(row => (
                        <TableRow key={row.agent.id}>
                          <TableCell className="font-medium">{row.agent.name}</TableCell>
                          <TableCell className="font-mono">{row.agent.sipExtension}</TableCell>
                          <TableCell className="text-center">{row.stats.totalCalls}</TableCell>
                          <TableCell className="text-center">{formatDuration(row.stats.totalTalkTime)}</TableCell>
                          <TableCell className="text-center">{formatDuration(row.stats.avgTalkTime)}</TableCell>
                          <TableCell className="text-center">{formatDuration(row.stats.totalWrapTime)}</TableCell>
                          <TableCell className="text-center">{formatDuration(row.stats.avgHandleTime || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AgentDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditAgent(null); }}
        agent={editAgent}
        onSave={handleSave}
      />
    </DashboardLayout>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
