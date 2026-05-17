import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, TrendingUp, MapPin, Zap, BarChart3, Loader2 } from "lucide-react";

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function BestTimeToCall() {
  const [days, setDays] = useState(30);
  const data = trpc.analytics.bestTimeToCall.useQuery({ days });

  if (data.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = data.data;
  if (!d) return null;

  const maxTotal = Math.max(...(d.byHour.map(h => h.total) || [1]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Best Time to Call
          </h3>
          <p className="text-sm text-muted-foreground">AI-powered analysis of your historical call data to optimize answer rates</p>
        </div>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
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
      </div>

      {/* Top Recommendations */}
      {d.topHours && d.topHours.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Top Performing Hours</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {d.topHours.map((h, i) => (
                <div key={h.hour} className="flex items-center gap-3 p-3 rounded-lg bg-background border">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                    i === 1 ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" :
                    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                  }`}>
                    #{i + 1}
                  </div>
                  <div>
                    <p className="font-semibold">{formatHour(h.hour)}</p>
                    <p className="text-xs text-muted-foreground">{h.answerRate}% answer rate ({h.total} calls)</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hourly Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Answer Rate by Hour of Day
          </CardTitle>
          <CardDescription>Higher bars = more calls, greener = higher answer rate</CardDescription>
        </CardHeader>
        <CardContent>
          {d.byHour.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No call data available for the selected period</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-0.5 h-40 min-w-[600px]">
                {Array.from({ length: 24 }, (_, hour) => {
                  const data = d.byHour.find(h => h.hour === hour);
                  const total = data?.total || 0;
                  const rate = data?.answerRate || 0;
                  const heightPct = maxTotal > 0 ? Math.max((total / maxTotal) * 100, 3) : 3;
                  const bgColor = rate >= 50 ? "bg-green-500" :
                    rate >= 35 ? "bg-green-400" :
                    rate >= 25 ? "bg-yellow-400" :
                    rate >= 15 ? "bg-orange-400" :
                    total > 0 ? "bg-red-400" : "bg-muted";
                  return (
                    <div key={hour} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] tabular-nums text-muted-foreground">{rate > 0 ? `${rate}%` : ""}</span>
                      <div
                        className={`w-full ${bgColor} rounded-t transition-all duration-300 relative group cursor-default`}
                        style={{ height: `${heightPct}%` }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-[10px] p-1.5 rounded shadow-lg border whitespace-nowrap z-10">
                          <div className="font-semibold">{formatHour(hour)}</div>
                          <div>{total} calls, {rate}% answered</div>
                          {data?.avgDuration ? <div>Avg: {data.avgDuration}s</div> : null}
                        </div>
                      </div>
                      <span className="text-[8px] text-muted-foreground">{hour % 3 === 0 ? formatHour(hour) : ""}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-green-500" /> 50%+</span>
                <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-green-400" /> 35-49%</span>
                <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-yellow-400" /> 25-34%</span>
                <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-orange-400" /> 15-24%</span>
                <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-red-400" /> &lt;15%</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Area Code Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Top Area Codes by Answer Rate
          </CardTitle>
          <CardDescription>Area codes with at least 5 calls in the period</CardDescription>
        </CardHeader>
        <CardContent>
          {d.byAreaCode.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Not enough data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area Code</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Answer Rate</TableHead>
                    <TableHead className="text-right">Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.byAreaCode.map(ac => (
                    <TableRow key={ac.areaCode}>
                      <TableCell className="font-mono font-semibold">({ac.areaCode})</TableCell>
                      <TableCell className="text-right tabular-nums">{ac.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{ac.answered}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={ac.answerRate >= 40 ? "default" : ac.answerRate >= 20 ? "secondary" : "destructive"} className="tabular-nums">
                          {ac.answerRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ac.avgDuration}s</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Area-Code Best Hour Recommendations */}
      {d.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Optimal Call Time by Area Code
            </CardTitle>
            <CardDescription>Best performing hour for each area code based on historical data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {d.recommendations.map(rec => (
                <div key={rec.areaCode} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">({rec.areaCode})</span>
                    <span className="text-xs text-muted-foreground">{rec.sampleSize} calls</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium">{formatHour(rec.bestHour)}</span>
                    <Badge variant="outline" className="text-[10px] tabular-nums">{rec.answerRate}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
