import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Clock,
  Globe,
  Minus,
  RefreshCw,
  Server,
  TrendingUp,
  Zap,
} from "lucide-react";

function StatusBadge({ code }: { code: number }) {
  if (code >= 200 && code < 300) return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">{code}</Badge>;
  if (code >= 300 && code < 400) return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">{code}</Badge>;
  if (code >= 400 && code < 500) return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">{code}</Badge>;
  return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">{code}</Badge>;
}

function MiniBarChart({ data, maxHeight = 40, color = "emerald" }: { data: number[]; maxHeight?: number; color?: string }) {
  const max = Math.max(...data, 1);
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };
  return (
    <div className="flex items-end gap-[1px]" style={{ height: maxHeight }}>
      {data.map((val, i) => (
        <div
          key={i}
          className={`${colorMap[color] || colorMap.emerald} rounded-t-[1px] opacity-80 hover:opacity-100 transition-opacity`}
          style={{
            height: Math.max(1, (val / max) * maxHeight),
            width: `${100 / data.length}%`,
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}

function PercentageBar({ value, max, color = "emerald" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div
        className={`${colorMap[color] || colorMap.emerald} h-2 rounded-full transition-all`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export default function ApiUsageAnalytics() {
  const [days, setDays] = useState(30);
  const [selectedKeyId, setSelectedKeyId] = useState<number | undefined>(undefined);

  const { data: analytics, isLoading, refetch } = trpc.apiKeys.analytics.useQuery(
    { days, apiKeyId: selectedKeyId },
    { refetchInterval: 30000 }
  );
  const { data: apiKeys } = trpc.apiKeys.list.useQuery();

  const overview = analytics?.overview;
  const hourlyData = analytics?.hourlyVolume || [];
  const dailyData = analytics?.dailyVolume || [];
  const endpoints = analytics?.endpointBreakdown || [];
  const statusCodes = analytics?.statusCodeBreakdown || [];
  const perKey = analytics?.perKeyUsage || [];
  const recentErrors = analytics?.recentErrors || [];

  // Calculate trend (compare last 7 days vs previous 7 days)
  const trend = useMemo(() => {
    if (dailyData.length < 14) return { requests: 0, errors: 0 };
    const recent7 = dailyData.slice(-7).reduce((s, d) => s + d.requests, 0);
    const prev7 = dailyData.slice(-14, -7).reduce((s, d) => s + d.requests, 0);
    const recentErr = dailyData.slice(-7).reduce((s, d) => s + d.errors, 0);
    const prevErr = dailyData.slice(-14, -7).reduce((s, d) => s + d.errors, 0);
    return {
      requests: prev7 > 0 ? Math.round(((recent7 - prev7) / prev7) * 100) : 0,
      errors: prevErr > 0 ? Math.round(((recentErr - prevErr) / prevErr) * 100) : 0,
    };
  }, [dailyData]);

  const TrendIcon = ({ value }: { value: number }) => {
    if (value > 0) return <ArrowUp className="h-3 w-3 text-emerald-400" />;
    if (value < 0) return <ArrowDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-20 mb-2" />
                <div className="h-8 bg-muted rounded w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedKeyId ? String(selectedKeyId) : "all"} onValueChange={(v) => setSelectedKeyId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All API Keys" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All API Keys</SelectItem>
            {(apiKeys || []).map((k: any) => (
              <SelectItem key={k.id} value={String(k.id)}>{k.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Activity className="h-3.5 w-3.5" /> Total Requests
            </div>
            <div className="text-2xl font-bold">{(overview?.totalRequests || 0).toLocaleString()}</div>
            <div className="flex items-center gap-1 text-xs mt-1">
              <TrendIcon value={trend.requests} />
              <span className={trend.requests > 0 ? "text-emerald-400" : trend.requests < 0 ? "text-red-400" : "text-muted-foreground"}>
                {Math.abs(trend.requests)}% vs prev 7d
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" /> Success
            </div>
            <div className="text-2xl font-bold text-emerald-400">{(overview?.successCount || 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {overview && overview.totalRequests > 0 ? (100 - overview.errorRate).toFixed(1) : 0}% success rate
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Errors
            </div>
            <div className="text-2xl font-bold text-red-400">{(overview?.errorCount || 0).toLocaleString()}</div>
            <div className="flex items-center gap-1 text-xs mt-1">
              <TrendIcon value={trend.errors} />
              <span className={trend.errors > 0 ? "text-red-400" : trend.errors < 0 ? "text-emerald-400" : "text-muted-foreground"}>
                {Math.abs(trend.errors)}% vs prev 7d
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Error Rate
            </div>
            <div className={`text-2xl font-bold ${(overview?.errorRate || 0) > 5 ? "text-red-400" : (overview?.errorRate || 0) > 2 ? "text-amber-400" : "text-emerald-400"}`}>
              {(overview?.errorRate || 0).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {(overview?.errorRate || 0) <= 2 ? "Healthy" : (overview?.errorRate || 0) <= 5 ? "Elevated" : "High"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Avg Response
            </div>
            <div className="text-2xl font-bold">{overview?.avgResponseTime || 0}ms</div>
            <div className="text-xs text-muted-foreground mt-1">
              {(overview?.avgResponseTime || 0) <= 200 ? "Fast" : (overview?.avgResponseTime || 0) <= 500 ? "Normal" : "Slow"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Globe className="h-3.5 w-3.5" /> Endpoints
            </div>
            <div className="text-2xl font-bold">{overview?.uniqueEndpoints || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">unique endpoints used</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="volume" className="space-y-4">
        <TabsList>
          <TabsTrigger value="volume"><BarChart3 className="h-4 w-4 mr-1.5" /> Volume</TabsTrigger>
          <TabsTrigger value="endpoints"><Server className="h-4 w-4 mr-1.5" /> Endpoints</TabsTrigger>
          <TabsTrigger value="keys"><Zap className="h-4 w-4 mr-1.5" /> By Key</TabsTrigger>
          <TabsTrigger value="errors"><AlertTriangle className="h-4 w-4 mr-1.5" /> Errors</TabsTrigger>
        </TabsList>

        {/* Volume Tab */}
        <TabsContent value="volume" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hourly Volume */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hourly Request Volume (48h)</CardTitle>
                <CardDescription>Requests per hour over the last 48 hours</CardDescription>
              </CardHeader>
              <CardContent>
                <MiniBarChart data={hourlyData.map(h => h.requests)} maxHeight={80} color="emerald" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>48h ago</span>
                  <span>Now</span>
                </div>
              </CardContent>
            </Card>

            {/* Hourly Errors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hourly Error Volume (48h)</CardTitle>
                <CardDescription>Errors per hour over the last 48 hours</CardDescription>
              </CardHeader>
              <CardContent>
                <MiniBarChart data={hourlyData.map(h => h.errors)} maxHeight={80} color="red" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>48h ago</span>
                  <span>Now</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Volume Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Daily Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Error Rate</TableHead>
                      <TableHead className="text-right">Avg Response</TableHead>
                      <TableHead className="w-32">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyData.slice().reverse().slice(0, 14).map((day) => {
                      const errRate = day.requests > 0 ? (day.errors / day.requests * 100) : 0;
                      return (
                        <TableRow key={day.date}>
                          <TableCell className="font-mono text-sm">{day.date}</TableCell>
                          <TableCell className="text-right font-medium">{day.requests.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <span className={day.errors > 0 ? "text-red-400" : "text-muted-foreground"}>{day.errors}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={errRate > 5 ? "text-red-400" : errRate > 2 ? "text-amber-400" : "text-emerald-400"}>
                              {errRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{day.avgResponseTime}ms</TableCell>
                          <TableCell>
                            <PercentageBar
                              value={day.requests}
                              max={Math.max(...dailyData.map(d => d.requests), 1)}
                              color="emerald"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {dailyData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No API requests in this time period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Endpoints by Volume</CardTitle>
              <CardDescription>Most-used API endpoints in the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Error Rate</TableHead>
                      <TableHead className="text-right">Avg Response</TableHead>
                      <TableHead className="w-32">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpoints.map((ep) => (
                      <TableRow key={ep.endpoint}>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{ep.endpoint}</code>
                        </TableCell>
                        <TableCell className="text-right font-medium">{ep.requests.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className={ep.errors > 0 ? "text-red-400" : "text-muted-foreground"}>{ep.errors}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={ep.errorRate > 5 ? "text-red-400" : ep.errorRate > 2 ? "text-amber-400" : "text-emerald-400"}>
                            {ep.errorRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{ep.avgResponseTime}ms</TableCell>
                        <TableCell>
                          <PercentageBar
                            value={ep.requests}
                            max={endpoints[0]?.requests || 1}
                            color="blue"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {endpoints.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No endpoint data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Status Code Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Status Code Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {statusCodes.map((sc) => (
                  <div key={sc.statusCode} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <StatusBadge code={sc.statusCode} />
                    <div>
                      <div className="text-sm font-medium">{sc.count.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{sc.percentage}%</div>
                    </div>
                  </div>
                ))}
                {statusCodes.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-4">No status code data</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Key Tab */}
        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Usage by API Key</CardTitle>
              <CardDescription>Request volume and error rates per API key</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>API Key</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Error Rate</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="w-32">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perKey.map((k) => (
                      <TableRow key={k.apiKeyId}>
                        <TableCell className="font-medium">{k.keyName}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{k.keyPrefix}...</code>
                        </TableCell>
                        <TableCell className="text-right font-medium">{k.requests.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className={k.errors > 0 ? "text-red-400" : "text-muted-foreground"}>{k.errors}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={k.errorRate > 5 ? "text-red-400" : k.errorRate > 2 ? "text-amber-400" : "text-emerald-400"}>
                            {k.errorRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(k.lastUsed).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <PercentageBar
                            value={k.requests}
                            max={perKey[0]?.requests || 1}
                            color="amber"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {perKey.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No per-key usage data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Errors</CardTitle>
              <CardDescription>Last 50 failed API requests (4xx/5xx)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Response Time</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentErrors.map((err) => (
                      <TableRow key={err.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(err.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{err.method}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{err.endpoint}</code>
                        </TableCell>
                        <TableCell><StatusBadge code={err.statusCode} /></TableCell>
                        <TableCell className="text-right">{err.responseTimeMs}ms</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">{err.ipAddress || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {recentErrors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No errors in this time period — looking good!
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
