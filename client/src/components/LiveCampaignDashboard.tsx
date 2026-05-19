import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Phone, PhoneOff, Clock, TrendingUp, Activity, Zap,
  CheckCircle2, XCircle, AlertCircle, Timer, BarChart3, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LiveCampaignDashboardProps {
  campaignId: number;
  open: boolean;
  onClose: () => void;
}

export function LiveCampaignDashboard({ campaignId, open, onClose }: LiveCampaignDashboardProps) {
  const liveStats = trpc.campaigns.liveStats.useQuery(
    { id: campaignId },
    { refetchInterval: open ? 3000 : false, enabled: open }
  );

  const d = liveStats.data;

  if (!open) return null;

  const progressPct = d ? (d.contactListTotal > 0 ? Math.round(((d.dialed + (d.active || 0)) / d.contactListTotal) * 100) : 0) : 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Activity className="h-5 w-5 text-green-500 animate-pulse" />
                Live Campaign Dashboard
              </DialogTitle>
              {d && (
                <p className="text-sm text-muted-foreground mt-1">
                  {d.campaignName} — {d.isActive ? (
                    <Badge variant="default" className="bg-green-600 text-xs">LIVE</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">{d.campaignStatus}</Badge>
                  )}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {!d ? (
          <div className="flex items-center justify-center py-12">
            <Activity className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4 mt-4">
            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium">Campaign Progress</span>
                <span className="tabular-nums font-semibold">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{d.dialed} dialed of {d.contactListTotal}</span>
                <span>{d.remaining} remaining</span>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-muted-foreground">Answered</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-400">{d.answered}</p>
                  <p className="text-xs text-green-600 font-medium">{d.answerRate}% rate</p>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="text-xs text-muted-foreground">Active Now</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{d.active || 0}</p>
                  <p className="text-xs text-blue-600 font-medium">
                    {(d.dialing > 0 || d.ringing > 0 || d.playingAudio > 0) ? (
                      [d.dialing > 0 && `${d.dialing} dial`, d.ringing > 0 && `${d.ringing} ring`, d.playingAudio > 0 && `${d.playingAudio} play`].filter(Boolean).join(" / ")
                    ) : "in progress"}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-purple-600" />
                    <span className="text-xs text-muted-foreground">Speed</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-400">{d.callsPerMinute}</p>
                  <p className="text-xs text-purple-600 font-medium">calls/min</p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Timer className="h-4 w-4 text-orange-600" />
                    <span className="text-xs text-muted-foreground">ETA</span>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-400">
                    {d.etaMinutes !== null ? (
                      d.etaMinutes >= 60 ? `${Math.floor(d.etaMinutes / 60)}h ${d.etaMinutes % 60}m` : `${d.etaMinutes}m`
                    ) : "—"}
                  </p>
                  <p className="text-xs text-orange-600 font-medium">remaining</p>
                </CardContent>
              </Card>
            </div>

            {/* Disposition Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Call Disposition Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { label: "Answered", value: d.answered || 0, color: "bg-green-500", total: d.dialed },
                    { label: "No Answer", value: d.noAnswer || 0, color: "bg-yellow-500", total: d.dialed },
                    { label: "Busy", value: d.busy || 0, color: "bg-orange-500", total: d.dialed },
                    { label: "Failed", value: d.failed || 0, color: "bg-red-500", total: d.dialed },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-xs w-20 text-muted-foreground">{item.label}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums w-12 text-right">{item.value}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {item.total > 0 ? Math.round((item.value / item.total) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Answer Rate Trend */}
            {d.answerRateTrend.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Answer Rate Trend (Last 10 min)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-24">
                    {d.answerRateTrend.map((point, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] tabular-nums text-muted-foreground">{point.rate}%</span>
                        <div
                          className="w-full bg-primary/80 rounded-t transition-all duration-300"
                          style={{ height: `${Math.max(point.rate, 2)}%` }}
                          title={`${point.minute}: ${point.answered}/${point.total} (${point.rate}%)`}
                        />
                        <span className="text-[8px] text-muted-foreground">{point.minute}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Queue Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Queue Pending</p>
                <p className="text-lg font-bold tabular-nums">{d.queuePending}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Queue Claimed</p>
                <p className="text-lg font-bold tabular-nums">{d.queueClaimed}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Total Dialed</p>
                <p className="text-lg font-bold tabular-nums">{d.dialed}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Cancelled</p>
                <p className="text-lg font-bold tabular-nums">{d.cancelled || 0}</p>
              </div>
            </div>

            {/* Auto-refresh indicator */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3 w-3 animate-pulse text-green-500" />
              Auto-refreshing every 3 seconds
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
