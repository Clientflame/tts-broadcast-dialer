import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  Wifi, WifiOff, RefreshCw, Server, Loader2,
  CheckCircle2, Plus, Trash2, Copy, Check, Terminal, Download,
  Activity, Zap, Gauge
} from "lucide-react";

export default function FreePBX() {
  const amiStatus = trpc.freepbx.status.useQuery(undefined, { refetchInterval: 10000 });
  const testConnection = trpc.freepbx.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
      amiStatus.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // PBX Agent management
  const agents = trpc.freepbx.listAgents.useQuery();
  const queueStats = trpc.freepbx.queueStats.useQuery(undefined, { refetchInterval: 5000 });
  const registerAgent = trpc.freepbx.registerAgent.useMutation({
    onSuccess: (data: any) => {
      toast.success("PBX Agent registered! Copy the API key below.");
      setNewAgentKey(data.apiKey);
      setAgentName("");
      setMaxCalls(10);
      agents.refetch();
      amiStatus.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteAgent = trpc.freepbx.deleteAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent removed");
      agents.refetch();
      amiStatus.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [agentName, setAgentName] = useState("");
  const [maxCalls, setMaxCalls] = useState(10);
  const [newAgentKey, setNewAgentKey] = useState("");
  const [copied, setCopied] = useState(false);

  const updateMaxCalls = trpc.freepbx.updateAgentMaxCalls.useMutation({
    onSuccess: () => {
      toast.success("Agent speed updated");
      agents.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleRegister = () => {
    if (!agentName.trim()) {
      toast.error("Please enter an agent name");
      return;
    }
    registerAgent.mutate({
      name: agentName.trim(),
      maxCalls: maxCalls,
    });
  };

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for older browsers / insecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        toast.success("API key copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Failed to copy — please select and copy manually");
      }
      document.body.removeChild(textarea);
    });
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FreePBX Integration</h1>
          <p className="text-muted-foreground mt-1">Manage PBX agents and monitor call queue</p>
        </div>

        {/* Status + Queue Stats Row */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
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
                  <p className="font-medium">{amiStatus.data?.connected ? "Connected" : "No Agents Online"}</p>
                  <p className="text-xs text-muted-foreground">
                    {amiStatus.data?.onlineAgents ?? 0} of {amiStatus.data?.agents ?? 0} agent(s) online
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => { amiStatus.refetch(); agents.refetch(); queueStats.refetch(); }}
              >
                <RefreshCw className="h-3 w-3 mr-2" />Refresh
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />Call Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{queueStats.data?.pending ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{queueStats.data?.claimed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-green-600">{queueStats.data?.completed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-red-600">{queueStats.data?.failed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">PBX agent polls for calls (outbound HTTPS)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Local AMI on FreePBX (no firewall issues)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Audio downloaded & converted on PBX</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Results reported back via HTTPS</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PBX Agents Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" />PBX Agents
            </CardTitle>
            <CardDescription>
              Register PBX agents that run on your FreePBX server to process calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Register new agent */}
            <div className="flex gap-3 items-end p-4 rounded-lg border border-dashed">
              <div className="flex-1 space-y-1">
                <Label htmlFor="agentName" className="text-xs">Agent Name</Label>
                <Input
                  id="agentName"
                  placeholder="e.g., pbx-server-1"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                />
              </div>
              <div className="w-48 space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>Max Concurrent Calls</span>
                  <span className="font-bold text-primary">{maxCalls}</span>
                </Label>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={[maxCalls]}
                  onValueChange={([v]) => setMaxCalls(v)}
                  className="mt-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>10</span><span>50</span><span>100</span>
                </div>
              </div>
              <Button onClick={handleRegister} disabled={registerAgent.isPending}>
                {registerAgent.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Plus className="h-4 w-4 mr-1" />Register</>
                )}
              </Button>
            </div>

            {/* Show new API key with prominent copy button */}
            {newAgentKey && (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                  API Key Generated — Copy it now (it won't be shown again):
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2.5 bg-white dark:bg-black rounded text-xs font-mono break-all select-all border border-green-200 dark:border-green-800">
                    {newAgentKey}
                  </code>
                  <Button
                    size="sm"
                    variant={copied ? "default" : "outline"}
                    className={`shrink-0 min-w-[100px] transition-all ${
                      copied
                        ? "bg-green-600 hover:bg-green-600 text-white border-green-600"
                        : "hover:bg-green-50 dark:hover:bg-green-950 border-green-300 dark:border-green-700"
                    }`}
                    onClick={() => copyToClipboard(newAgentKey)}
                  >
                    {copied ? (
                      <><Check className="h-4 w-4 mr-1.5" />Copied!</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-1.5" />Copy Key</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                  Use this key as <code className="bg-green-100 dark:bg-green-900 px-1 rounded">PBX_AGENT_API_KEY</code> when installing the PBX agent on your FreePBX server.
                </p>
              </div>
            )}

            {/* Agent list */}
            {agents.data && agents.data.length > 0 ? (
              <div className="space-y-2">
                {agents.data.map((agent: any) => {
                  const isOnline = agent.lastHeartbeat &&
                    Date.now() - new Date(agent.lastHeartbeat).getTime() < 30000;
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">
                            ID: {agent.agentId}
                            {agent.lastHeartbeat && (
                              <> · Last seen: {new Date(agent.lastHeartbeat).toLocaleString()}</>
                            )}
                            {agent.activeCalls > 0 && (
                              <> · <span className="text-blue-600">{agent.activeCalls} active call(s)</span></>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-40">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" />Speed</span>
                            <span className="text-xs font-bold text-primary">{agent.maxCalls ?? 10}</span>
                          </div>
                          <Slider
                            min={10}
                            max={100}
                            step={5}
                            value={[agent.maxCalls ?? 10]}
                            onValueChange={([v]) => {
                              updateMaxCalls.mutate({ agentId: agent.agentId, maxCalls: v });
                            }}
                          />
                          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                            <span>10</span><span>100</span>
                          </div>
                        </div>
                        <Badge variant={isOnline ? "default" : "outline"}>
                          {isOnline ? "Online" : "Offline"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (confirm(`Remove agent "${agent.name}"?`)) {
                              deleteAgent.mutate({ agentId: agent.agentId });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No PBX agents registered</p>
                <p className="text-xs mt-1">Register an agent above, then install it on your FreePBX server</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Installation Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4" />Installation Guide
            </CardTitle>
            <CardDescription>
              One-time setup to install the PBX agent on your FreePBX server
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</div>
                <div>
                  <p className="text-sm font-medium">Register a PBX Agent</p>
                  <p className="text-xs text-muted-foreground">Use the form above to create an agent and copy the API key</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</div>
                <div>
                  <p className="text-sm font-medium">SSH into your FreePBX server</p>
                  <code className="block mt-1 p-2 bg-muted rounded text-xs font-mono">ssh root@your-freepbx-server</code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</div>
                <div>
                  <p className="text-sm font-medium">Download and run the installer</p>
                  <div className="mt-1 p-2 bg-muted rounded text-xs font-mono space-y-1">
                    <p>mkdir -p /opt/pbx-agent && cd /opt/pbx-agent</p>
                    <p># Copy pbx_agent.py and install.sh to this directory</p>
                    <p>chmod +x install.sh</p>
                    <p>PBX_AGENT_API_URL="https://your-app.manus.space/api/pbx" \</p>
                    <p>PBX_AGENT_API_KEY="your-api-key" \</p>
                    <p>./install.sh</p>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">4</div>
                <div>
                  <p className="text-sm font-medium">Verify the agent is running</p>
                  <code className="block mt-1 p-2 bg-muted rounded text-xs font-mono">systemctl status pbx-agent</code>
                  <p className="text-xs text-muted-foreground mt-1">The agent status should show "Online" above within 10 seconds</p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200">How it works:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300 text-xs mt-1">
                <li>The PBX agent runs on your FreePBX server as a systemd service</li>
                <li>It polls this web app every 3 seconds for pending calls (outbound HTTPS only)</li>
                <li>When calls are found, it downloads audio from S3 and converts it locally</li>
                <li>Calls are originated via local AMI (localhost:5038) — no firewall issues</li>
                <li>Call results are reported back to the web app via HTTPS</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
