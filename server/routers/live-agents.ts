/**
 * Live Agent Router — CRUD, status management, campaign assignment, and predictive stats
 */
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { eq, and, desc, sql, count as countFn, gte, lte } from "drizzle-orm";
import {
  liveAgents,
  agentSessions,
  agentCallLog,
  campaignAgentAssignments,
  type LiveAgent,
} from "../../drizzle/schema";
import {
  getAllAgentStates,
  getCampaignAgentStates,
  getAvailableAgentCount,
  updateAgentStatus,
  initAgentTracker,
  assignAgentsToCampaign,
  type AgentState,
} from "../services/live-agent-tracker";
import { getDialerLiveStats } from "../services/dialer";

export const liveAgentRouter = router({
  /** List all live agents for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const dbInst = await getDb();
    if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const agents = await dbInst
      .select()
      .from(liveAgents)
      .where(eq(liveAgents.userId, ctx.user.id))
      .orderBy(desc(liveAgents.createdAt));

    // Merge with in-memory states for real-time status
    const memStates = getAllAgentStates();
    const stateMap = new Map<number, AgentState>();
    for (const s of memStates) {
      stateMap.set(s.id, s);
    }

    return agents.map(a => {
      const memState = stateMap.get(a.id);
      return {
        ...a,
        liveStatus: memState?.status || a.status,
        currentCallId: memState?.currentCallId || a.currentCallId,
        currentCampaignId: memState?.currentCampaignId || a.currentCampaignId,
      };
    });
  }),

  /** Get a single agent by ID */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const dbInst = await getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [agent] = await dbInst
        .select()
        .from(liveAgents)
        .where(and(eq(liveAgents.id, input.id), eq(liveAgents.userId, ctx.user.id)));

      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });

      // Get recent sessions
      const sessions = await dbInst
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.agentId, input.id))
        .orderBy(desc(agentSessions.createdAt))
        .limit(20);

      // Get recent calls
      const calls = await dbInst
        .select()
        .from(agentCallLog)
        .where(eq(agentCallLog.agentId, input.id))
        .orderBy(desc(agentCallLog.createdAt))
        .limit(20);

      return { agent, sessions, calls };
    }),

  /** Create a new live agent */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      sipExtension: z.string().min(1).max(20),
      sipPassword: z.string().optional(),
      email: z.string().email().optional(),
      skills: z.array(z.string()).optional(),
      priority: z.number().min(1).max(10).optional(),
      maxConcurrentCalls: z.number().min(1).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInst = await getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [result] = await dbInst.insert(liveAgents).values({
        userId: ctx.user.id,
        name: input.name,
        sipExtension: input.sipExtension,
        sipPassword: input.sipPassword || null,
        email: input.email || null,
        skills: input.skills || null,
        priority: input.priority || 5,
        maxConcurrentCalls: input.maxConcurrentCalls || 1,
        status: "offline",
        isActive: 1,
      });

      // Reload agent tracker to pick up new agent
      await initAgentTracker();

      return { id: result.insertId, success: true };
    }),

  /** Update an existing agent */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      sipExtension: z.string().min(1).max(20).optional(),
      sipPassword: z.string().optional(),
      email: z.string().email().optional().nullable(),
      skills: z.array(z.string()).optional(),
      priority: z.number().min(1).max(10).optional(),
      maxConcurrentCalls: z.number().min(1).max(5).optional(),
      isActive: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInst = await getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...updates } = input;
      await dbInst.update(liveAgents)
        .set(updates)
        .where(and(eq(liveAgents.id, id), eq(liveAgents.userId, ctx.user.id)));

      await initAgentTracker();
      return { success: true };
    }),

  /** Delete an agent */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const dbInst = await getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Soft delete — mark as inactive
      await dbInst.update(liveAgents)
        .set({ isActive: 0, status: "offline" })
        .where(and(eq(liveAgents.id, input.id), eq(liveAgents.userId, ctx.user.id)));

      await initAgentTracker();
      return { success: true };
    }),

  /** Set agent status (login, logout, break, available) */
  setStatus: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      status: z.enum(["offline", "available", "on_break"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateAgentStatus(input.agentId, input.status);
      return { success: true };
    }),

  /** Assign agents to a campaign */
  assignToCampaign: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      agentIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assignAgentsToCampaign(input.campaignId, input.agentIds);
      return { success: true };
    }),

  /** Get agents assigned to a campaign */
  getCampaignAgents: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ ctx, input }) => {
      const dbInst = await getDb();
      if (!dbInst) return [];

      const assignments = await dbInst
        .select({
          agentId: campaignAgentAssignments.agentId,
          agent: liveAgents,
        })
        .from(campaignAgentAssignments)
        .innerJoin(liveAgents, eq(campaignAgentAssignments.agentId, liveAgents.id))
        .where(eq(campaignAgentAssignments.campaignId, input.campaignId));

      const memStates = getCampaignAgentStates(input.campaignId);
      const stateMap = new Map<number, AgentState>();
      for (const s of memStates) {
        stateMap.set(s.id, s);
      }

      return assignments.map(a => {
        const memState = stateMap.get(a.agentId);
        return {
          ...a.agent,
          liveStatus: memState?.status || a.agent.status,
          currentCallId: memState?.currentCallId || null,
        };
      });
    }),

  /** Real-time predictive dialer dashboard stats */
  predictiveStats: protectedProcedure
    .input(z.object({ campaignId: z.number().optional() }).optional())
    .query(async ({ ctx }) => {
      const allStates = getAllAgentStates();

      // Agent summary
      const agentSummary = {
        total: allStates.length,
        available: allStates.filter(a => a.status === "available").length,
        onCall: allStates.filter(a => a.status === "on_call").length,
        ringing: allStates.filter(a => a.status === "ringing").length,
        wrapUp: allStates.filter(a => a.status === "wrap_up").length,
        onBreak: allStates.filter(a => a.status === "on_break").length,
        offline: allStates.filter(a => a.status === "offline").length,
        reserved: allStates.filter(a => a.status === "reserved").length,
      };

      // Get dialer live stats
      const dialerStats = await getDialerLiveStats(ctx.user.id);

      // Agent utilization = (onCall + wrapUp) / (total - offline - onBreak)
      const activeAgents = agentSummary.total - agentSummary.offline - agentSummary.onBreak;
      const busyAgents = agentSummary.onCall + agentSummary.wrapUp;
      const utilization = activeAgents > 0 ? Math.round((busyAgents / activeAgents) * 100) : 0;

      return {
        agentSummary,
        utilization,
        dialerStats,
        agents: allStates.map(a => ({
          id: a.id,
          name: a.name,
          sipExtension: a.sipExtension,
          status: a.status,
          currentCallId: a.currentCallId,
          currentCampaignId: a.currentCampaignId,
          statusChangedAt: a.statusChangedAt,
          callConnectedAt: a.callConnectedAt,
        })),
      };
    }),

  /** Agent performance report */
  performanceReport: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const dbInst = await getDb();
      if (!dbInst) return { agents: [] };

      // Get all agents for the user
      const agents = await dbInst
        .select()
        .from(liveAgents)
        .where(and(
          eq(liveAgents.userId, ctx.user.id),
          eq(liveAgents.isActive, 1),
          ...(input.agentId ? [eq(liveAgents.id, input.agentId)] : []),
        ));

      const report = [];
      for (const agent of agents) {
        // Get call stats from agent_call_log
        const conditions = [eq(agentCallLog.agentId, agent.id)];
        if (input.startDate) conditions.push(gte(agentCallLog.connectedAt, input.startDate));
        if (input.endDate) conditions.push(lte(agentCallLog.connectedAt, input.endDate));

        const [stats] = await dbInst
          .select({
            totalCalls: countFn(),
            totalTalkTime: sql<number>`COALESCE(SUM(${agentCallLog.talkDuration}), 0)`,
            totalWrapTime: sql<number>`COALESCE(SUM(${agentCallLog.wrapUpDuration}), 0)`,
            avgTalkTime: sql<number>`COALESCE(AVG(${agentCallLog.talkDuration}), 0)`,
          })
          .from(agentCallLog)
          .where(and(...conditions));

        // Get disposition breakdown
        const dispositions = await dbInst
          .select({
            disposition: agentCallLog.disposition,
            count: countFn(),
          })
          .from(agentCallLog)
          .where(and(...conditions))
          .groupBy(agentCallLog.disposition);

        report.push({
          agent: {
            id: agent.id,
            name: agent.name,
            sipExtension: agent.sipExtension,
          },
          stats: {
            totalCalls: Number(stats?.totalCalls || 0),
            totalTalkTime: Number(stats?.totalTalkTime || 0),
            totalWrapTime: Number(stats?.totalWrapTime || 0),
            avgTalkTime: Math.round(Number(stats?.avgTalkTime || 0)),
            avgHandleTime: agent.avgHandleTime,
          },
          dispositions: dispositions.map(d => ({
            disposition: d.disposition,
            count: Number(d.count),
          })),
        });
      }

      return { agents: report };
    }),
});
