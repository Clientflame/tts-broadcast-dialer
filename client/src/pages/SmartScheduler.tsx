import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Clock, Calendar, TrendingUp, Zap } from "lucide-react";
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function getHeatColor(rate: number, totalCalls: number): string {
  if (totalCalls === 0) return "bg-muted/30";
  if (rate >= 40) return "bg-green-500/80";
  if (rate >= 30) return "bg-green-500/50";
  if (rate >= 20) return "bg-yellow-500/50";
  if (rate >= 10) return "bg-orange-500/40";
  if (rate >= 5) return "bg-red-500/30";
  return "bg-red-500/15";
}

export default function SmartScheduler() {
  const heatmapQuery = trpc.scheduler.heatmap.useQuery();
  const volumeQuery = trpc.scheduler.volumeByHour.useQuery();

  const heatmapData = heatmapQuery.data;
  const volumeData = volumeQuery.data || [];

  // Filter to business hours (8 AM - 9 PM)
  const businessHours = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => i + 8); // 8 to 21
  }, []);

  const volumeChartData = useMemo(() => {
    return volumeData
      .filter(v => v.hour >= 8 && v.hour <= 21)
      .map(v => ({
        hour: formatHour(v.hour),
        total: v.total,
        answered: v.answered,
        rate: v.total > 0 ? Math.round((v.answered / v.total) * 100) : 0,
      }));
  }, [volumeData]);

  if (heatmapQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-muted-foreground">Loading scheduler data...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Smart Campaign Scheduler</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Analyze historical call data to find the best times to reach contacts. Use this data to schedule campaigns for maximum answer rates.
            </p>
          </div>
        </div>

        {/* Best Time Summary Cards */}
        {heatmapData && heatmapData.bestWindows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Clock className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Best Hour</p>
                    <p className="text-xl font-bold text-green-500">{formatHour(heatmapData.overallBestHour)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Calendar className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Best Day</p>
                    <p className="text-xl font-bold text-blue-500">{heatmapData.overallBestDay}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <TrendingUp className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Peak Answer Rate</p>
                    <p className="text-xl font-bold text-purple-500">{heatmapData.bestWindows[0]?.avgAnswerRate ?? 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Answer Rate Heatmap
            </CardTitle>
            <CardDescription>
              Answer rate by hour and day of week. Darker green = higher answer rate. Based on all historical call data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {heatmapData && heatmapData.heatmap.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Header row - hours */}
                  <div className="flex items-center gap-0.5 mb-1">
                    <div className="w-12 shrink-0" />
                    {businessHours.map(h => (
                      <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
                        {h % 2 === 0 ? formatHour(h).replace(" AM", "a").replace(" PM", "p") : ""}
                      </div>
                    ))}
                  </div>
                  {/* Day rows */}
                  {Array.from({ length: 7 }, (_, d) => (
                    <div key={d} className="flex items-center gap-0.5 mb-0.5">
                      <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium">{DAY_NAMES[d]}</div>
                      {businessHours.map(h => {
                        const cell = heatmapData.heatmap.find(c => c.day === d && c.hour === h);
                        const rate = cell?.answerRate ?? 0;
                        const total = cell?.totalCalls ?? 0;
                        return (
                          <div
                            key={h}
                            className={`flex-1 aspect-square rounded-sm ${getHeatColor(rate, total)} relative group cursor-default`}
                            title={`${FULL_DAY_NAMES[d]} ${formatHour(h)}: ${rate}% answer rate (${total} calls)`}
                          >
                            {total > 0 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                {rate}%
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <span>Low</span>
                    <div className="flex gap-0.5">
                      <div className="w-4 h-4 rounded-sm bg-red-500/15" />
                      <div className="w-4 h-4 rounded-sm bg-red-500/30" />
                      <div className="w-4 h-4 rounded-sm bg-orange-500/40" />
                      <div className="w-4 h-4 rounded-sm bg-yellow-500/50" />
                      <div className="w-4 h-4 rounded-sm bg-green-500/50" />
                      <div className="w-4 h-4 rounded-sm bg-green-500/80" />
                    </div>
                    <span>High</span>
                    <span className="ml-4">
                      <span className="inline-block w-4 h-4 rounded-sm bg-muted/30 align-middle mr-1" />
                      No data
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No call data yet</p>
                <p className="text-sm mt-1">Run some campaigns to generate best-time-to-call insights</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call Volume by Hour */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call Volume & Answer Rate by Hour</CardTitle>
            <CardDescription>Total calls and answered calls across all campaigns, grouped by hour of day</CardDescription>
          </CardHeader>
          <CardContent>
            {volumeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={volumeChartData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover text-popover-foreground border rounded-lg p-2 text-xs shadow-lg">
                          <p className="font-medium">{d.hour}</p>
                          <p>Total: {d.total}</p>
                          <p>Answered: {d.answered}</p>
                          <p>Rate: {d.rate}%</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" opacity={0.3} radius={[2, 2, 0, 0]} name="Total Calls" />
                  <Bar dataKey="answered" fill="#10b981" radius={[2, 2, 0, 0]} name="Answered" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Best Windows Table */}
        {heatmapData && heatmapData.bestWindows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommended Launch Windows</CardTitle>
              <CardDescription>Best 2-hour windows per day based on historical answer rates (minimum 5 calls in window)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 pr-4">Day</th>
                      <th className="pb-3 pr-4">Best Window</th>
                      <th className="pb-3 pr-4">Answer Rate</th>
                      <th className="pb-3">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.bestWindows.map((window, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{window.day}</td>
                        <td className="py-3 pr-4 font-mono text-sm">
                          {formatHour(window.startHour)} – {formatHour(window.endHour)}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge className={
                            window.avgAnswerRate >= 30 ? "bg-green-500/20 text-green-500 border-green-500/50" :
                            window.avgAnswerRate >= 20 ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/50" :
                            "bg-orange-500/20 text-orange-500 border-orange-500/50"
                          }>
                            {window.avgAnswerRate}%
                          </Badge>
                        </td>
                        <td className="py-3">
                          {i === 0 ? (
                            <Badge className="bg-green-500/20 text-green-500">Highly Recommended</Badge>
                          ) : i < 3 ? (
                            <Badge variant="outline" className="text-blue-500 border-blue-500/50">Good</Badge>
                          ) : (
                            <Badge variant="outline">Average</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
