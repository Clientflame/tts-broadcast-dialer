import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Phone, Wifi, WifiOff, RefreshCw, Server, Shield, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function FreePBX() {
  const amiStatus = trpc.freepbx.status.useQuery(undefined, { refetchInterval: 10000 });
  const testConnection = trpc.freepbx.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
      amiStatus.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FreePBX Integration</h1>
          <p className="text-muted-foreground mt-1">Manage your FreePBX/Asterisk connection for outbound calling</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />Connection Status
              </CardTitle>
              <CardDescription>Asterisk Manager Interface (AMI) connection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  {amiStatus.data?.connected ? (
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                      <Wifi className="h-5 w-5 text-green-600" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                      <WifiOff className="h-5 w-5 text-red-600" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{amiStatus.data?.connected ? "Connected" : "Disconnected"}</p>
                    <p className="text-sm text-muted-foreground">AMI on {amiStatus.data?.host}:{amiStatus.data?.port}</p>
                  </div>
                </div>
                <Badge variant={amiStatus.data?.connected ? "default" : "destructive"}>
                  {amiStatus.data?.connected ? "Online" : "Offline"}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Host</span>
                  <span className="font-mono">{amiStatus.data?.host ?? "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Port</span>
                  <span className="font-mono">{amiStatus.data?.port ?? "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Protocol</span>
                  <span className="font-mono">AMI v1.0</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => testConnection.mutate()}
                  disabled={testConnection.isPending}
                >
                  {testConnection.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" />Test Connection</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />Setup Guide
              </CardTitle>
              <CardDescription>Required FreePBX configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">AMI User Created</p>
                    <p className="text-xs text-muted-foreground">User "broadcast_dialer" with originate permissions</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Custom Dialplan</p>
                    <p className="text-xs text-muted-foreground">Context "tts-broadcast" for TTS audio playback</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Trunk Configuration</p>
                    <p className="text-xs text-muted-foreground">Using existing outbound trunks for call origination</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Sound Directory</p>
                    <p className="text-xs text-muted-foreground">/var/lib/asterisk/sounds/custom/broadcast/</p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium mb-1">How it works:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                  <li>TTS audio is generated via OpenAI API and stored in S3</li>
                  <li>Audio is transferred to FreePBX sound directory via SCP</li>
                  <li>AMI originates calls using existing outbound trunks</li>
                  <li>Called party hears the TTS message upon answering</li>
                  <li>Call results are tracked and logged in real-time</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
