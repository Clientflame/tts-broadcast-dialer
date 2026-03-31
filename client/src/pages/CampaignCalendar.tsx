import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw,
  Clock, Megaphone, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Play, Pause,
} from "lucide-react";
import { useLocation } from "wouter";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-800 dark:text-blue-300", dot: "bg-blue-500" },
  launched: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-800 dark:text-green-300", dot: "bg-green-500" },
  cancelled: { bg: "bg-gray-100 dark:bg-gray-900/40", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" },
  failed: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-300", dot: "bg-red-500" },
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function CampaignCalendar() {
  const [, navigate] = useLocation();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calculate date range for the visible month
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  // Extend to cover visible calendar cells (prev/next month overflow)
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  const calendarEnd = new Date(monthEnd);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));

  const schedulesQuery = trpc.campaigns.allSchedules.useQuery({
    startMs: calendarStart.getTime(),
    endMs: calendarEnd.getTime(),
  });

  const schedules = schedulesQuery.data || [];

  // Group schedules by date key (YYYY-MM-DD in EST)
  const schedulesByDate = useMemo(() => {
    const map: Record<string, typeof schedules> = {};
    for (const s of schedules) {
      const d = new Date(s.scheduledAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [schedules]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const days: { date: Date; key: string; isCurrentMonth: boolean; isToday: boolean }[] = [];
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const d = new Date(calendarStart);
    while (d <= calendarEnd) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({
        date: new Date(d),
        key,
        isCurrentMonth: d.getMonth() === month,
        isToday: key === todayKey,
      });
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [year, month]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const selectedSchedules = selectedDate ? (schedulesByDate[selectedDate] || []) : [];

  // Stats
  const pendingCount = schedules.filter(s => s.status === "pending").length;
  const launchedCount = schedules.filter(s => s.status === "launched").length;
  const failedCount = schedules.filter(s => s.status === "failed").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <CalendarIcon className="h-6 w-6" />
              Campaign Calendar
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Visual overview of scheduled and past campaign launches
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => schedulesQuery.refetch()}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${schedulesQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Launched</p>
                  <p className="text-2xl font-bold">{launchedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold">{failedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Grid */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="text-lg min-w-[180px] text-center">
                    {MONTHS[month]} {year}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={goToday}>
                  Today
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {d}
                  </div>
                ))}
              </div>
              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {calendarDays.map(day => {
                  const daySchedules = schedulesByDate[day.key] || [];
                  const isSelected = selectedDate === day.key;
                  return (
                    <button
                      key={day.key}
                      onClick={() => setSelectedDate(isSelected ? null : day.key)}
                      className={`
                        min-h-[80px] p-1.5 text-left transition-colors relative
                        ${day.isCurrentMonth ? "bg-background" : "bg-muted/30"}
                        ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                        ${day.isToday ? "bg-primary/5" : ""}
                        hover:bg-accent/50
                      `}
                    >
                      <span className={`
                        text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                        ${day.isToday ? "bg-primary text-primary-foreground" : ""}
                        ${!day.isCurrentMonth ? "text-muted-foreground/50" : ""}
                      `}>
                        {day.date.getDate()}
                      </span>
                      {daySchedules.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {daySchedules.slice(0, 3).map(s => {
                            const colors = STATUS_COLORS[s.status] || STATUS_COLORS.pending;
                            return (
                              <div
                                key={s.id}
                                className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${colors.bg} ${colors.text}`}
                                title={`${s.campaignName || "Campaign"} — ${formatTime(s.scheduledAt)}`}
                              >
                                {formatTime(s.scheduledAt)} {s.campaignName || `#${s.campaignId}`}
                              </div>
                            );
                          })}
                          {daySchedules.length > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{daySchedules.length - 3} more
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className="capitalize">{status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Detail */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                {selectedDate ? (
                  <span>
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                ) : (
                  <span>Select a Day</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Click a day on the calendar to see scheduled campaigns</p>
                </div>
              ) : selectedSchedules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No campaigns scheduled for this day</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedSchedules
                    .sort((a, b) => a.scheduledAt - b.scheduledAt)
                    .map(s => {
                      const colors = STATUS_COLORS[s.status] || STATUS_COLORS.pending;
                      return (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg border hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => navigate(`/campaigns`)}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">
                                {s.campaignName || `Campaign #${s.campaignId}`}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {formatTime(s.scheduledAt)} EST
                                </span>
                              </div>
                            </div>
                            <Badge variant="outline" className={`text-xs ${colors.text}`}>
                              {s.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                              {s.status === "launched" && <Play className="h-3 w-3 mr-1" />}
                              {s.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                              {s.status === "cancelled" && <Pause className="h-3 w-3 mr-1" />}
                              {s.status}
                            </Badge>
                          </div>
                          {s.errorMessage && (
                            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {s.errorMessage}
                            </p>
                          )}
                          {s.launchedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Launched at {formatTime(s.launchedAt)} EST
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
