import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { Phone, PhoneCall, PhoneOff, Clock, TrendingUp, Timer, DollarSign, CreditCard, Search as SearchIcon, ArrowUpDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

const COST_TYPE_COLORS: Record<string, string> = {
  purchase: "#3b82f6",
  monthly_rental: "#8b5cf6",
  cnam_lookup: "#f59e0b",
  cnam_lidb: "#f97316",
  release: "#22c55e",
  minutes: "#ef4444",
  other: "#6b7280",
};

const COST_TYPE_LABELS: Record<string, string> = {
  purchase: "DID Purchase",
  monthly_rental: "Monthly Rental",
  cnam_lookup: "CNAM Lookup",
  cnam_lidb: "CNAM LIDB",
  release: "Release Credit",
  minutes: "Minutes",
  other: "Other",
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

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ─── DID Cost Dashboard Tab ──────────────────────────────────────────────────

function DIDCostDashboard() {
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"total" | "phone">("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: costData, isLoading } = trpc.callerIds.getCostSummary.useQuery({ days });

  const costByType = useMemo(() => {
    if (!costData?.totals) return [];
    return Object.entries(costData.totals)
      .filter(([_, v]) => v > 0)
      .map(([type, amount]) => ({
        name: COST_TYPE_LABELS[type] || type,
        value: Number(amount.toFixed(2)),
        fill: COST_TYPE_COLORS[type] || "#6b7280",
      }))
      .sort((a, b) => b.value - a.value);
  }, [costData]);

  const filteredByDid = useMemo(() => {
    if (!costData?.byDid) return [];
    let items = costData.byDid;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(d => d.phoneNumber.toLowerCase().includes(q));
    }
    items = [...items].sort((a, b) => {
      if (sortBy === "total") return sortDir === "desc" ? b.total - a.total : a.total - b.total;
      return sortDir === "desc" ? b.phoneNumber.localeCompare(a.phoneNumber) : a.phoneNumber.localeCompare(b.phoneNumber);
    });
    return items;
  }, [costData, search, sortBy, sortDir]);

  // Daily cost aggregation for line chart
  const dailyCosts = useMemo(() => {
    if (!costData?.transactions) return [];
    const byDay: Record<string, number> = {};
    for (const t of costData.transactions) {
      const day = new Date(t.transactionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      byDay[day] = (byDay[day] || 0) + (parseFloat(t.amount) || 0);
    }
    return Object.entries(byDay).map(([day, amount]) => ({
      day,
      amount: Number(amount.toFixed(2)),
    }));
  }, [costData]);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading cost data...</div>;
  }

  const grandTotal = costData?.grandTotal || 0;
  const totalTransactions = costData?.transactions?.length || 0;
  const totalDIDs = costData?.byDid?.length || 0;
  const avgCostPerDID = totalDIDs > 0 ? grandTotal / totalDIDs : 0;

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">DID Cost Tracking</h2>
          <p className="text-sm text-muted-foreground">Track purchase, CNAM, and usage costs per DID</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Total Spend</CardDescription>
            <CardTitle className="text-3xl text-blue-500">{formatCurrency(grandTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> Transactions</CardDescription>
            <CardTitle className="text-3xl">{totalTransactions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Phone className="h-3 w-3" /> DIDs with Costs</CardDescription>
            <CardTitle className="text-3xl">{totalDIDs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Avg Cost/DID</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(avgCostPerDID)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by type pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Breakdown by Type</CardTitle>
            <CardDescription>Where your DID money goes</CardDescription>
          </CardHeader>
          <CardContent>
            {costByType.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No cost data yet</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={costByType} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: $${value}`}>
                    {costByType.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Daily cost trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Cost Trend</CardTitle>
            <CardDescription>Spending over time</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyCosts.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No daily cost data yet</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyCosts}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="amount" fill="#3b82f6" name="Cost" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-DID cost table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Per-DID Cost Breakdown</CardTitle>
              <CardDescription>Individual DID costs sorted by total spend</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search DID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-48 h-9"
                />
              </div>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border"
                onClick={() => {
                  if (sortBy === "total") setSortDir(d => d === "desc" ? "asc" : "desc");
                  else { setSortBy("total"); setSortDir("desc"); }
                }}
              >
                <ArrowUpDown className="h-3 w-3" /> Sort by cost
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredByDid.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No per-DID cost data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Phone Number</th>
                    <th className="pb-2 font-medium text-right">Purchase</th>
                    <th className="pb-2 font-medium text-right">CNAM</th>
                    <th className="pb-2 font-medium text-right">Minutes</th>
                    <th className="pb-2 font-medium text-right">Other</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredByDid.slice(0, 50).map((did) => (
                    <tr key={did.phoneNumber} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2 font-mono text-xs">{did.phoneNumber}</td>
                      <td className="py-2 text-right text-xs">
                        {(did.breakdown.purchase || 0) > 0 && (
                          <Badge variant="outline" className="text-blue-600 border-blue-200">
                            ${(did.breakdown.purchase || 0).toFixed(2)}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right text-xs">
                        {((did.breakdown.cnam_lookup || 0) + (did.breakdown.cnam_lidb || 0)) > 0 && (
                          <Badge variant="outline" className="text-amber-600 border-amber-200">
                            ${((did.breakdown.cnam_lookup || 0) + (did.breakdown.cnam_lidb || 0)).toFixed(2)}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right text-xs">
                        {(did.breakdown.minutes || 0) > 0 && (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            ${(did.breakdown.minutes || 0).toFixed(2)}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right text-xs">
                        {((did.breakdown.monthly_rental || 0) + (did.breakdown.other || 0) + (did.breakdown.release || 0)) > 0 && (
                          <Badge variant="outline" className="text-gray-600 border-gray-200">
                            ${((did.breakdown.monthly_rental || 0) + (did.breakdown.other || 0) + (did.breakdown.release || 0)).toFixed(2)}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right font-semibold text-xs">
                        {formatCurrency(did.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filteredByDid.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="pt-2">Total ({filteredByDid.length} DIDs)</td>
                      <td className="pt-2 text-right text-blue-600">
                        ${filteredByDid.reduce((s, d) => s + (d.breakdown.purchase || 0), 0).toFixed(2)}
                      </td>
                      <td className="pt-2 text-right text-amber-600">
                        ${filteredByDid.reduce((s, d) => s + (d.breakdown.cnam_lookup || 0) + (d.breakdown.cnam_lidb || 0), 0).toFixed(2)}
                      </td>
                      <td className="pt-2 text-right text-red-600">
                        ${filteredByDid.reduce((s, d) => s + (d.breakdown.minutes || 0), 0).toFixed(2)}
                      </td>
                      <td className="pt-2 text-right text-gray-600">
                        ${filteredByDid.reduce((s, d) => s + (d.breakdown.monthly_rental || 0) + (d.breakdown.other || 0) + (d.breakdown.release || 0), 0).toFixed(2)}
                      </td>
                      <td className="pt-2 text-right text-lg">
                        {formatCurrency(filteredByDid.reduce((s, d) => s + d.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {filteredByDid.length > 50 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">Showing top 50 of {filteredByDid.length} DIDs</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Analytics Page ─────────────────────────────────────────────────────

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
          <p className="text-muted-foreground">Campaign performance, call statistics, and DID cost tracking</p>
        </div>

        <Tabs defaultValue="calls" className="space-y-6">
          <TabsList>
            <TabsTrigger value="calls" className="flex items-center gap-1.5">
              <PhoneCall className="h-4 w-4" /> Call Analytics
            </TabsTrigger>
            <TabsTrigger value="costs" className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> DID Costs
            </TabsTrigger>
          </TabsList>

          {/* Call Analytics Tab */}
          <TabsContent value="calls" className="space-y-6">
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
          </TabsContent>

          {/* DID Cost Tracking Tab */}
          <TabsContent value="costs">
            <DIDCostDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
