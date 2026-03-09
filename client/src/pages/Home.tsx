import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  Megaphone, Users, Phone, PhoneCall, CheckCircle2,
  ListChecks, Wifi, WifiOff, RefreshCw, Activity,
  Zap, Timer, Radio,
} from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const stats = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user });
  const amiStatus = trpc.dashboard.amiStatus.useQuery(undefined, { enabled: !!user, refetchInterval: 15000 });
  const dialerLive = trpc.dashboard.dialerLive.useQuery(undefined, { enabled: !!user, refetchInterval: 3000 });

  const isDialerActive = (dialerLive.data?.activeCampaignCount ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">AI TTS Broadcast Dialer Overview</p>
          </div>
          <div className="flex items-center gap-2">
            {isDialerActive && (
              <Badge variant="default" className="flex items-center gap-1.5 px-3 py-1 bg-green-600 animate-pulse">
                <Radio className="h-3.5 w-3.5" />
                Dialer Active
              </Badge>
            )}
            <Badge
              variant={amiStatus.data?.connected ? "default" : "destructive"}
              className="flex items-center gap-1.5 px-3 py-1"
            >
              {amiStatus.data?.connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              FreePBX {amiStatus.data?.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </div>

        {/* Live Dialer Stats - Always visible */}
        <Card className={isDialerActive ? "border-green-500/50 bg-green-500/5" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`h-5 w-5 ${isDialerActive ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
                <CardTitle className="text-lg">Live Dialer Status</CardTitle>
              </div>
              {isDialerActive && (
                <span className="text-xs text-muted-foreground">Auto-refreshing every 3s</span>
              )}
            </div>
            <CardDescription>
              {isDialerActive
                ? `${dialerLive.data?.activeCampaignCount} active campaign(s) running`
                : "No active campaigns — start a campaign to see live stats"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <PhoneCall className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Active Calls</span>
                </div>
                <div className={`text-4xl font-bold tabular-nums ${isDialerActive ? "text-green-500" : ""}`}>
                  {dialerLive.data?.activeCalls ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Currently ringing / connected</p>
              </div>

              <div className="rounded-lg border p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Leads in Hopper</span>
                </div>
                <div className={`text-4xl font-bold tabular-nums ${isDialerActive ? "text-amber-500" : ""}`}>
                  {dialerLive.data?.leadsInHopper ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Queued and waiting to be dialed</p>
              </div>

              <div className="rounded-lg border p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Concurrent Limit</span>
                </div>
                <div className="text-4xl font-bold tabular-nums">
                  {dialerLive.data?.activeCalls ?? 0}
                  <span className="text-lg text-muted-foreground font-normal"> / {dialerLive.data?.concurrentLimit ?? 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Active vs. max concurrent calls</p>
                {(dialerLive.data?.concurrentLimit ?? 0) > 0 && (
                  <Progress
                    value={((dialerLive.data?.activeCalls ?? 0) / (dialerLive.data?.concurrentLimit ?? 1)) * 100}
                    className="h-1.5 mt-2"
                  />
                )}
              </div>
            </div>

            {/* Per-campaign breakdown when active */}
            {isDialerActive && dialerLive.data?.campaigns && dialerLive.data.campaigns.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Active Campaign Breakdown</h4>
                <div className="space-y-2">
                  {dialerLive.data.campaigns.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                      <span className="font-medium">{c.name}</span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span><PhoneCall className="h-3 w-3 inline mr-1" />{c.activeCalls} calling</span>
                        <span><Timer className="h-3 w-3 inline mr-1" />{c.pending} pending</span>
                        <span><Zap className="h-3 w-3 inline mr-1" />{c.maxConcurrent} max</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Campaigns</CardTitle>
              <Megaphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.data?.totalCampaigns ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.data?.activeCampaigns ?? 0} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contact Lists</CardTitle>
              <ListChecks className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.data?.totalLists ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.data?.totalContacts ?? 0} total contacts</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.data?.totalCalls ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.data?.answeredCalls ?? 0} answered</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">FreePBX Connection</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Host</span>
                <span className="text-sm font-mono">{amiStatus.data?.host ?? "\u2014"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">AMI Port</span>
                <span className="text-sm font-mono">{amiStatus.data?.port ?? "\u2014"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={amiStatus.data?.connected ? "default" : "outline"}>
                  {amiStatus.data?.connected ? "Connected" : "Disconnected"}
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => amiStatus.refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh Status
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = "/campaigns"}>
                <Megaphone className="h-4 w-4 mr-2" />Create New Campaign
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = "/contacts"}>
                <Users className="h-4 w-4 mr-2" />Manage Contacts
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = "/audio"}>
                <PhoneCall className="h-4 w-4 mr-2" />Generate TTS Audio
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
