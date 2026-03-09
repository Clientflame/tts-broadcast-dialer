import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus, Play, Pause, StopCircle, Trash2, Eye, Megaphone,
  Clock, Users, Volume2, Phone, BarChart3, Loader2, Settings2,
} from "lucide-react";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  running: "default",
  paused: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export default function Campaigns() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", contactListId: 0, audioFileId: 0,
    voice: "alloy", callerIdNumber: "", callerIdName: "",
    maxConcurrentCalls: 1, retryAttempts: 0, retryDelay: 300,
    timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
  });

  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const campaigns = trpc.campaigns.list.useQuery();
  const contactLists = trpc.contactLists.list.useQuery();
  const audioFiles = trpc.audio.list.useQuery();
  const campaignDetail = trpc.campaigns.get.useQuery({ id: detailId! }, { enabled: !!detailId });
  const campaignStats = trpc.campaigns.stats.useQuery({ id: detailId! }, { enabled: !!detailId, refetchInterval: detailId ? 5000 : false });

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setCreateOpen(false); resetForm(); toast.success("Campaign created"); },
    onError: (e) => toast.error(e.message),
  });

  const startCampaign = trpc.campaigns.start.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign started"); },
    onError: (e) => toast.error(e.message),
  });

  const pauseCampaign = trpc.campaigns.pause.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign paused"); },
    onError: (e) => toast.error(e.message),
  });

  const cancelCampaign = trpc.campaigns.cancel.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); utils.campaigns.get.invalidate(); toast.success("Campaign cancelled"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setDetailId(null); toast.success("Campaign deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({
    name: "", description: "", contactListId: 0, audioFileId: 0,
    voice: "alloy", callerIdNumber: "", callerIdName: "",
    maxConcurrentCalls: 1, retryAttempts: 0, retryDelay: 300,
    timezone: "America/New_York", timeWindowStart: "09:00", timeWindowEnd: "21:00",
  });

  const readyAudioFiles = useMemo(() => audioFiles.data?.filter(f => f.status === "ready") || [], [audioFiles.data]);

  const completionRate = useMemo(() => {
    if (!campaignStats.data || campaignStats.data.total === 0) return 0;
    return Math.round((campaignStats.data.completed / campaignStats.data.total) * 100);
  }, [campaignStats.data]);

  if (detailId && campaignDetail.data) {
    const c = campaignDetail.data;
    const stats = campaignStats.data;
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Button variant="ghost" size="sm" onClick={() => setDetailId(null)} className="mb-2">&larr; Back to Campaigns</Button>
              <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
              <p className="text-muted-foreground mt-1">{c.description || "No description"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_COLORS[c.status] || "outline"} className="text-sm px-3 py-1">{c.status}</Badge>
              {c.status === "draft" && (
                <Button onClick={() => startCampaign.mutate({ id: c.id })} disabled={startCampaign.isPending}>
                  <Play className="h-4 w-4 mr-2" />{startCampaign.isPending ? "Starting..." : "Start"}
                </Button>
              )}
              {c.status === "running" && (
                <>
                  <Button variant="outline" onClick={() => pauseCampaign.mutate({ id: c.id })} disabled={pauseCampaign.isPending}>
                    <Pause className="h-4 w-4 mr-2" />Pause
                  </Button>
                  <Button variant="destructive" onClick={() => cancelCampaign.mutate({ id: c.id })} disabled={cancelCampaign.isPending}>
                    <StopCircle className="h-4 w-4 mr-2" />Stop
                  </Button>
                </>
              )}
              {c.status === "paused" && (
                <Button onClick={() => startCampaign.mutate({ id: c.id })} disabled={startCampaign.isPending}>
                  <Play className="h-4 w-4 mr-2" />Resume
                </Button>
              )}
              {(c.status === "draft" || c.status === "completed" || c.status === "cancelled") && (
                <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this campaign?")) deleteCampaign.mutate({ id: c.id }); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress */}
          {stats && (
            <Card>
              <CardHeader><CardTitle className="text-base">Campaign Progress</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span>{stats.completed} / {stats.total} calls completed</span>
                  <span className="font-bold">{completionRate}%</span>
                </div>
                <Progress value={completionRate} className="h-3" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <div className="text-2xl font-bold text-green-600">{stats.answered}</div>
                    <div className="text-xs text-muted-foreground">Answered</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                    <div className="text-2xl font-bold text-yellow-600">{stats.busy}</div>
                    <div className="text-xs text-muted-foreground">Busy</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                    <div className="text-2xl font-bold text-orange-600">{stats.noAnswer}</div>
                    <div className="text-xs text-muted-foreground">No Answer</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </div>
                {stats.active > 0 && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {stats.active} active call{stats.active > 1 ? "s" : ""} in progress
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Campaign Settings */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Voice</span><span className="capitalize">{c.voice || "alloy"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Concurrent Calls</span><span>{c.maxConcurrentCalls}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Retry Attempts</span><span>{c.retryAttempts}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Retry Delay</span><span>{c.retryDelay}s</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Caller ID</span><span>{c.callerIdNumber || "Default"}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Timezone</span><span>{c.timezone}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Time Window</span><span>{c.timeWindowStart} - {c.timeWindowEnd}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span>{c.startedAt ? new Date(c.startedAt).toLocaleString() : "Not started"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{c.completedAt ? new Date(c.completedAt).toLocaleString() : "—"}</span></div>
              </CardContent>
            </Card>
          </div>

          <Button variant="outline" onClick={() => setLocation(`/call-logs?campaign=${c.id}`)}>
            <BarChart3 className="h-4 w-4 mr-2" />View Call Logs
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground mt-1">Create and manage broadcast calling campaigns</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="dialing">Dialing</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                </TabsList>
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div><Label>Campaign Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. March Promo Blast" /></div>
                  <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Campaign description..." /></div>
                  <div>
                    <Label>Contact List *</Label>
                    <Select value={form.contactListId ? String(form.contactListId) : ""} onValueChange={v => setForm(p => ({ ...p, contactListId: parseInt(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Select a contact list" /></SelectTrigger>
                      <SelectContent>
                        {contactLists.data?.map(l => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.contactCount} contacts)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Audio File</Label>
                    <Select value={form.audioFileId ? String(form.audioFileId) : ""} onValueChange={v => setForm(p => ({ ...p, audioFileId: parseInt(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Select an audio file" /></SelectTrigger>
                      <SelectContent>
                        {readyAudioFiles.map(f => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.name} ({f.voice})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Generate audio in the Audio/TTS section first</p>
                  </div>
                  <div>
                    <Label>Voice</Label>
                    <Select value={form.voice} onValueChange={v => setForm(p => ({ ...p, voice: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["alloy","echo","fable","onyx","nova","shimmer"].map(v => (
                          <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
                <TabsContent value="dialing" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Caller ID Number</Label><Input value={form.callerIdNumber} onChange={e => setForm(p => ({ ...p, callerIdNumber: e.target.value }))} placeholder="e.g. +15551234567" /></div>
                    <div><Label>Caller ID Name</Label><Input value={form.callerIdName} onChange={e => setForm(p => ({ ...p, callerIdName: e.target.value }))} placeholder="e.g. My Company" /></div>
                  </div>
                  <div>
                    <Label>Max Concurrent Calls</Label>
                    <Input type="number" min={1} max={10} value={form.maxConcurrentCalls} onChange={e => setForm(p => ({ ...p, maxConcurrentCalls: parseInt(e.target.value) || 1 }))} />
                    <p className="text-xs text-muted-foreground mt-1">Number of simultaneous outbound calls (1-10)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Retry Attempts</Label>
                      <Input type="number" min={0} max={5} value={form.retryAttempts} onChange={e => setForm(p => ({ ...p, retryAttempts: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <Label>Retry Delay (seconds)</Label>
                      <Input type="number" min={60} max={3600} value={form.retryDelay} onChange={e => setForm(p => ({ ...p, retryDelay: parseInt(e.target.value) || 300 }))} />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="schedule" className="space-y-4 mt-4">
                  <div>
                    <Label>Timezone</Label>
                    <Select value={form.timezone} onValueChange={v => setForm(p => ({ ...p, timezone: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","UTC"].map(tz => (
                          <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Window Start</Label><Input type="time" value={form.timeWindowStart} onChange={e => setForm(p => ({ ...p, timeWindowStart: e.target.value }))} /></div>
                    <div><Label>Window End</Label><Input type="time" value={form.timeWindowEnd} onChange={e => setForm(p => ({ ...p, timeWindowEnd: e.target.value }))} /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Calls will only be placed within this time window in the selected timezone.</p>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button
                  onClick={() => createCampaign.mutate({
                    name: form.name,
                    description: form.description || undefined,
                    contactListId: form.contactListId,
                    audioFileId: form.audioFileId || undefined,
                    voice: form.voice as any,
                    callerIdNumber: form.callerIdNumber || undefined,
                    callerIdName: form.callerIdName || undefined,
                    maxConcurrentCalls: form.maxConcurrentCalls,
                    retryAttempts: form.retryAttempts,
                    retryDelay: form.retryDelay,
                    timezone: form.timezone,
                    timeWindowStart: form.timeWindowStart,
                    timeWindowEnd: form.timeWindowEnd,
                  })}
                  disabled={!form.name || !form.contactListId || createCampaign.isPending}
                >
                  {createCampaign.isPending ? "Creating..." : "Create Campaign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!campaigns.data?.length ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first broadcast campaign to get started.</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.data.map(campaign => (
              <Card key={campaign.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailId(campaign.id)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate">{campaign.name}</CardTitle>
                    <Badge variant={STATUS_COLORS[campaign.status] || "outline"}>{campaign.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">{campaign.description || "No description"}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{campaign.totalContacts}</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{campaign.completedCalls}/{campaign.totalContacts}</span>
                    <span className="flex items-center gap-1"><Volume2 className="h-3 w-3 capitalize" />{campaign.voice}</span>
                  </div>
                  {campaign.status === "running" && campaign.totalContacts > 0 && (
                    <Progress value={(campaign.completedCalls / campaign.totalContacts) * 100} className="h-1.5 mt-2" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
