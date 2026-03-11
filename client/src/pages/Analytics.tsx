import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { Phone, PhoneCall, PhoneOff, Clock, TrendingUp, Timer, DollarSign } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  answered: "#22c55e",
  completed: "#16a34a",
  busy: "#f59e0b",
  "no-answer": "#ef4444",
  failed: "#dc2626",
  pending: "#6b7280",
  dialing: "#3b82f6",
  ringing: "#8b5cf6",
  cancelled: "#9ca3af",
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatMinutes(totalSecs: number): string {
  if (totalSecs <= 0) return "0m";
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

export default function Analytics() {
  const { data: analytics, isLoading } = trpc.analytics.overview.useQuery();
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 15000 });
  const { data: costSettings } = trpc.costEstimator.getSettings.useQuery();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      </DashboardLayout>
    );
  }

  const statusData = (analytics?.statusBreakdown || []).map(s => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1).replace("-", " "),
    value: s.count,
    fill: STATUS_COLORS[s.status] || "#6b7280",
  }));

  const dailyData = (analytics?.dailyCalls || []).map(d => ({
    day: d.day,
    total: d.total,
    answered: d.answered,
  }));

  const totalCalls = statusData.reduce((sum, s) => sum + s.value, 0);
  const answeredCalls = statusData.filter(s => s.name === "Answered" || s.name === "Completed").reduce((sum, s) => sum + s.value, 0);
  const answerRate = totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(1) : "0";

  // Duration and cost calculations
  const totalDuration = analytics?.totalDuration || 0;
  const avgDuration = analytics?.avgDuration || 0;
  const costPerMin = parseFloat(costSettings?.trunkCostPerMinute || "0.01");
  const totalTrunkCost = (totalDuration / 60) * costPerMin;
  const costPerCall = answeredCalls > 0 ? totalTrunkCost / answeredCalls : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Campaign performance and call statistics</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Phone className="h-3 w-3" /> Total Calls</CardDescription>
              <CardTitle className="text-3xl">{totalCalls}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><PhoneCall className="h-3 w-3" /> Answered</CardDescription>
              <CardTitle className="text-3xl text-green-500">{answeredCalls}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Answer Rate</CardDescription>
              <CardTitle className="text-3xl">{answerRate}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Clock className="h-3 w-3" /> Avg Duration</CardDescription>
              <CardTitle className="text-3xl">{formatDuration(avgDuration)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Timer className="h-3 w-3" /> Total Talk Time</CardDescription>
              <CardTitle className="text-3xl text-purple-500">{formatMinutes(totalDuration)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Trunk Cost</CardDescription>
              <CardTitle className="text-3xl text-emerald-500">${totalTrunkCost.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">${costPerCall.toFixed(3)}/call avg</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call Status Distribution</CardTitle>
              <CardDescription>Breakdown of all call outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              {statusData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <PhoneOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No call data yet</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Call Volume</CardTitle>
              <CardDescription>Calls per day over the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No daily data yet</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip />
                    <Bar dataKey="total" fill="#6b7280" name="Total" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="answered" fill="#22c55e" name="Answered" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {dailyData.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Answer Rate Trend</CardTitle>
              <CardDescription>Daily answer rate percentage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData.map(d => ({ ...d, rate: d.total > 0 ? Math.round((d.answered / d.total) * 100) : 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                  <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} name="Answer Rate" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Campaigns</p>
                <p className="text-xl font-semibold">{stats?.totalCampaigns || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Contacts</p>
                <p className="text-xl font-semibold">{stats?.totalContacts || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Talk Time</p>
                <p className="text-xl font-semibold">{formatMinutes(totalDuration)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Avg Call Duration</p>
                <p className="text-xl font-semibold">{formatDuration(avgDuration)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Est. Total Cost</p>
                <p className="text-xl font-semibold text-emerald-600">${totalTrunkCost.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
