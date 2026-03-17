/**
 * Recordings & Wallboard Router
 * tRPC procedures for call recordings management and real-time wallboard data
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listRecordings,
  getRecording,
  deleteRecording,
  getRecordingStats,
  applyRetentionPolicy,
} from "../services/call-recording";
import { getDb } from "../db";
import {
  campaigns,
  callQueue,
  callLogs,
  liveAgents,
  agentSessions,
  agentCallLog,
  callRecordings,
} from "../../drizzle/schema";
import { eq, and, sql, desc, gte, count } from "drizzle-orm";

// ─── Recordings Router ──────────────────────────────────────────────────────

export const recordingsRouter = router({
  // List recordings with filters
  list: protectedProcedure
    .input(
      z.object({
        campaignId: z.number().optional(),
        agentId: z.number().optional(),
        phoneNumber: z.string().optional(),
        recordingType: z.string().optional(),
        status: z.string().optional(),
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      return listRecordings({
        userId: ctx.user.id,
        ...input,
      });
    }),

  // Get single recording
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const recording = await getRecording(input.id);
      if (!recording || recording.userId !== ctx.user.id) {
        return null;
      }
      return recording;
    }),

  // Delete recording (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const recording = await getRecording(input.id);
      if (!recording || recording.userId !== ctx.user.id) {
        throw new Error("Recording not found");
      }
      await deleteRecording(input.id);
      return { success: true };
    }),

  // Get recording stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    return getRecordingStats(ctx.user.id);
  }),

  // Apply retention policy
  applyRetention: protectedProcedure.mutation(async ({ ctx }) => {
    return applyRetentionPolicy(ctx.user.id);
  }),
});

// ─── Wallboard Router ───────────────────────────────────────────────────────

export const wallboardRouter = router({
  // Real-time wallboard data — all stats in one query for efficiency
  liveStats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const userId = ctx.user.id;
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const fiveMinAgo = now - 300000;

    // 1. Active campaigns
    const activeCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        totalContacts: campaigns.totalContacts,
        completedCalls: campaigns.completedCalls,
        answeredCalls: campaigns.answeredCalls,
        failedCalls: campaigns.failedCalls,
        maxConcurrentCalls: campaigns.maxConcurrentCalls,
        pacingMode: campaigns.pacingMode,
        routingMode: campaigns.routingMode,
        recordingEnabled: campaigns.recordingEnabled,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.userId, userId),
          eq(campaigns.status, "running")
        )
      );

    // 2. Queue stats
    const [queueStats] = await db
      .select({
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)`,
        claimed: sql<number>`sum(case when status = 'claimed' then 1 else 0 end)`,
        completed: sql<number>`sum(case when status = 'completed' then 1 else 0 end)`,
        failed: sql<number>`sum(case when status = 'failed' then 1 else 0 end)`,
      })
      .from(callQueue)
      .where(eq(callQueue.userId, userId));

    // 3. Live agents status
    const agents = await db
      .select({
        id: liveAgents.id,
        name: liveAgents.name,
        sipExtension: liveAgents.sipExtension,
        status: liveAgents.status,
        currentCallId: liveAgents.currentCallId,
        currentCampaignId: liveAgents.currentCampaignId,
        statusChangedAt: liveAgents.statusChangedAt,
        totalCallsHandled: liveAgents.totalCallsHandled,
        totalTalkTime: liveAgents.totalTalkTime,
        avgHandleTime: liveAgents.avgHandleTime,
      })
      .from(liveAgents)
      .where(
        and(
          eq(liveAgents.userId, userId),
          eq(liveAgents.isActive, 1)
        )
      );

    // 4. Calls per minute (last 5 min)
    const [recentCallRate] = await db
      .select({
        callCount: sql<number>`count(*)`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.startedAt, fiveMinAgo)
        )
      );

    // 5. Answer rate (last hour)
    const [hourlyStats] = await db
      .select({
        total: sql<number>`count(*)`,
        answered: sql<number>`sum(case when result = 'answered' then 1 else 0 end)`,
        noAnswer: sql<number>`sum(case when result = 'no-answer' then 1 else 0 end)`,
        busy: sql<number>`sum(case when result = 'busy' then 1 else 0 end)`,
        failed: sql<number>`sum(case when result = 'failed' then 1 else 0 end)`,
        voicemail: sql<number>`sum(case when result = 'voicemail' then 1 else 0 end)`,
        avgDuration: sql<number>`coalesce(avg(duration), 0)`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.startedAt, oneHourAgo)
        )
      );

    // 6. Agent utilization summary
    const agentSummary = {
      total: agents.length,
      available: agents.filter((a) => a.status === "available").length,
      onCall: agents.filter((a) => a.status === "on_call").length,
      ringing: agents.filter((a) => a.status === "ringing").length,
      wrapUp: agents.filter((a) => a.status === "wrap_up").length,
      onBreak: agents.filter((a) => a.status === "on_break").length,
      offline: agents.filter((a) => a.status === "offline").length,
    };

    // 7. Calls per second (last 5 min window)
    const callsPerMinute = Math.round(
      Number(recentCallRate?.callCount || 0) / 5
    );
    const callsPerSecond = +(callsPerMinute / 60).toFixed(2);

    // 8. Answer rate
    const totalHourly = Number(hourlyStats?.total || 0);
    const answeredHourly = Number(hourlyStats?.answered || 0);
    const answerRate = totalHourly > 0
      ? Math.round((answeredHourly / totalHourly) * 100)
      : 0;

    // 9. Recording stats (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [recordingStats] = await db
      .select({
        total: sql<number>`count(*)`,
        ready: sql<number>`sum(case when status = 'ready' then 1 else 0 end)`,
        recording: sql<number>`sum(case when status = 'recording' then 1 else 0 end)`,
        totalDuration: sql<number>`coalesce(sum(duration), 0)`,
      })
      .from(callRecordings)
      .where(
        and(
          eq(callRecordings.userId, userId),
          gte(callRecordings.recordingStartedAt, todayStart.getTime())
        )
      );

    return {
      timestamp: now,
      campaigns: activeCampaigns,
      queue: {
        pending: Number(queueStats?.pending || 0),
        claimed: Number(queueStats?.claimed || 0),
        completed: Number(queueStats?.completed || 0),
        failed: Number(queueStats?.failed || 0),
      },
      agents: agents,
      agentSummary,
      callRate: {
        callsPerMinute,
        callsPerSecond,
        totalLastHour: totalHourly,
      },
      hourlyStats: {
        total: totalHourly,
        answered: answeredHourly,
        noAnswer: Number(hourlyStats?.noAnswer || 0),
        busy: Number(hourlyStats?.busy || 0),
        failed: Number(hourlyStats?.failed || 0),
        voicemail: Number(hourlyStats?.voicemail || 0),
        avgDuration: Math.round(Number(hourlyStats?.avgDuration || 0)),
        answerRate,
      },
      recordings: {
        todayTotal: Number(recordingStats?.total || 0),
        todayReady: Number(recordingStats?.ready || 0),
        currentlyRecording: Number(recordingStats?.recording || 0),
        todayDuration: Number(recordingStats?.totalDuration || 0),
      },
    };
  }),

  // Historical stats for charts (last 24 hours, hourly buckets)
  historicalStats: protectedProcedure
    .input(
      z.object({
        hours: z.number().min(1).max(168).default(24),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const userId = ctx.user.id;
      const cutoff = Date.now() - input.hours * 3600000;

      // Get hourly call counts
      const hourlyData = await db
        .select({
          hour: sql<string>`DATE_FORMAT(FROM_UNIXTIME(${callLogs.startedAt} / 1000), '%Y-%m-%d %H:00')`,
          total: sql<number>`count(*)`,
          answered: sql<number>`sum(case when result = 'answered' then 1 else 0 end)`,
          failed: sql<number>`sum(case when result != 'answered' then 1 else 0 end)`,
          avgDuration: sql<number>`coalesce(avg(duration), 0)`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.startedAt, cutoff)
          )
        )
        .groupBy(sql`DATE_FORMAT(FROM_UNIXTIME(${callLogs.startedAt} / 1000), '%Y-%m-%d %H:00')`)
        .orderBy(sql`DATE_FORMAT(FROM_UNIXTIME(${callLogs.startedAt} / 1000), '%Y-%m-%d %H:00')`);

      return {
        hourly: hourlyData.map((h) => ({
          hour: h.hour,
          total: Number(h.total),
          answered: Number(h.answered),
          failed: Number(h.failed),
          avgDuration: Math.round(Number(h.avgDuration)),
          answerRate:
            Number(h.total) > 0
              ? Math.round((Number(h.answered) / Number(h.total)) * 100)
              : 0,
        })),
      };
    }),
});
