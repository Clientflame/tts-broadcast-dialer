import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Megaphone, Users, Phone, PhoneCall, CheckCircle2,
  ListChecks, Wifi, WifiOff, RefreshCw,
} from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const stats = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user });
  const amiStatus = trpc.dashboard.amiStatus.useQuery(undefined, { enabled: !!user, refetchInterval: 15000 });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">AI TTS Broadcast Dialer Overview</p>
          </div>
          <Badge
            variant={amiStatus.data?.connected ? "default" : "destructive"}
            className="flex items-center gap-1.5 px-3 py-1"
          >
            {amiStatus.data?.connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            FreePBX {amiStatus.data?.connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

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
