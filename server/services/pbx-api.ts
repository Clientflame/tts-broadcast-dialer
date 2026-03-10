import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db";
import { generatePersonalizedTTS } from "./tts";
import { recordCallResult, getCurrentConcurrent, getPacingStats, initPacing, cleanupPacing, type PacingConfig } from "./pacing";
import { notifyOwner } from "../_core/notification";
import { recordCarrierError, attemptRampUp, isCarrierError, getThrottleStatus } from "./auto-throttle";

const pbxRouter = Router();

// ─── API Key Authentication Middleware ───────────────────────────────────────
async function authenticateAgent(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const apiKey = authHeader.substring(7);
  const agent = await db.getPbxAgentByApiKey(apiKey);
  if (!agent) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  // Attach agent info to request
  (req as any).pbxAgent = agent;
  next();
}

pbxRouter.use(authenticateAgent);

// ─── Poll for pending calls ─────────────────────────────────────────────────
// PBX agent calls this every 2-3 seconds to get work
// Uses weighted load balancing: each agent gets calls proportional to its available capacity
pbxRouter.post("/poll", async (req: Request, res: Response) => {
  try {
    const agent = (req as any).pbxAgent;
    // Use effectiveMaxCalls (throttled) if set, otherwise maxCalls
    const agentMax = agent.effectiveMaxCalls ?? agent.maxCalls ?? 10;
    // Per-campaign speed cap: if the request includes a campaignMaxCalls, cap the limit
    const campaignMax = req.body.campaignMaxCalls || agentMax;
    const effectiveLimit = Math.min(agentMax, campaignMax);

    // Load balancing: calculate this agent's fair share based on capacity
    const activeCalls = req.body.activeCalls || 0;
    const availableSlots = Math.max(0, effectiveLimit - activeCalls);

    // Get all online agents to calculate proportional share
    let limit = availableSlots;
    try {
      const allAgents = await db.getPbxAgents();
      const onlineAgents = allAgents.filter((a: any) => {
        if (a.agentId === agent.agentId) return true; // Always include self
        if (!a.lastHeartbeat) return false;
        const lastSeen = new Date(a.lastHeartbeat).getTime();
        return Date.now() - lastSeen < 30000; // Online if heartbeat within 30s
      });

      if (onlineAgents.length > 1) {
        // Weighted distribution: agent gets share proportional to its max capacity
        const totalCapacity = onlineAgents.reduce((sum: number, a: any) => {
          const aMax = a.effectiveMaxCalls ?? a.maxCalls ?? 10;
          return sum + aMax;
        }, 0);
        const agentWeight = effectiveLimit / totalCapacity;
        // Get total pending calls to distribute
        const pendingCount = await db.getPendingCallQueueCount();
        const fairShare = Math.ceil(pendingCount * agentWeight);
        // Limit to available slots but at least 1 if there's capacity
        limit = Math.min(availableSlots, Math.max(fairShare, availableSlots > 0 ? 1 : 0));
      }
    } catch (lbErr) {
      // Fallback to simple available slots on error
      console.warn("[PBX-API] Load balance calc failed, using simple limit:", lbErr);
    }

    limit = Math.max(0, Math.min(limit, effectiveLimit));

    // Release stale claims first (agent crashed without reporting)
    await db.releaseStaleClaimedCalls(120000);

    // Claim pending calls
    const calls = await db.claimPendingCalls(agent.agentId, limit);

    // Update agent heartbeat
    await db.updatePbxAgentHeartbeat(agent.agentId, req.body.activeCalls || 0);

    res.json({
      calls: calls.map(c => ({
        id: c.id,
        phoneNumber: c.phoneNumber,
        channel: c.channel,
        context: c.context,
        callerIdStr: c.callerIdStr,
        audioUrl: c.audioUrl,
        audioUrls: c.audioUrls || null, // ordered list of audio URLs for multi-segment scripts
        audioName: c.audioName,
        variables: c.variables || {},
        priority: c.priority,
        campaignId: c.campaignId,
        callLogId: c.callLogId,
      })),
    });
  } catch (err) {
    console.error("[PBX-API] Poll error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Report call result ─────────────────────────────────────────────────────
// PBX agent reports back after a call completes
pbxRouter.post("/report", async (req: Request, res: Response) => {
  try {
    const { queueId, result, details } = req.body;
    if (!queueId || !result) {
      res.status(400).json({ error: "Missing queueId or result" });
      return;
    }

    const queueItem = await db.getCallQueueItem(queueId);
    if (!queueItem) {
      res.status(404).json({ error: "Queue item not found" });
      return;
    }

    // Update queue item
    const queueUpdate: any = {
      status: result === "answered" || result === "completed" ? "completed" : "failed",
      result,
      resultDetails: details || {},
    };
    // Store call duration on the queue item for the activity feed
    if (details?.duration && typeof details.duration === "number" && details.duration > 0) {
      queueUpdate.callDuration = Math.round(details.duration);
    }
    await db.updateCallQueueItem(queueId, queueUpdate);

    // Update the corresponding call log if this was a campaign call
    if (queueItem.callLogId) {
      const statusMap: Record<string, string> = {
        answered: "answered",
        completed: "completed",
        busy: "busy",
        "no-answer": "no-answer",
        failed: "failed",
        congestion: "failed",
      };
      const callLogStatus = statusMap[result] || "failed";

      const updateData: any = {
        status: callLogStatus,
        endedAt: Date.now(),
      };

      if (details?.duration) updateData.duration = details.duration;
      if (details?.answeredAt) updateData.answeredAt = details.answeredAt;
      if (details?.asteriskChannel) updateData.asteriskChannel = details.asteriskChannel;
      if (details?.dtmfResponse) updateData.dtmfResponse = details.dtmfResponse;
      if (result === "failed" && details?.error) updateData.errorMessage = details.error;

      await db.updateCallLog(queueItem.callLogId, updateData);

      // Update campaign counts
      if (queueItem.campaignId) {
        const stats = await db.getCampaignStats(queueItem.campaignId);
        // Find the userId from the queue item
        await db.updateCampaign(queueItem.campaignId, queueItem.userId, {
          completedCalls: stats.completed,
          answeredCalls: stats.answered,
          failedCalls: stats.failed + stats.busy + stats.noAnswer,
        });

        // Feed pacing engine
        const pacingConfig = activePacingConfigs.get(queueItem.campaignId);
        if (pacingConfig) {
          recordCallResult(
            queueItem.campaignId,
            pacingConfig,
            result as any,
            details?.duration,
            details?.ringTime
          );
        }

        // Feed auto-throttle engine with carrier errors
        if (isCarrierError(result)) {
          const agent = (req as any).pbxAgent;
          await recordCarrierError(agent.agentId, result);
        }

        // Check if campaign is complete
        const pending = await db.getPendingCallLogs(queueItem.campaignId);
        const activeCount = await db.getActiveCallCount(queueItem.campaignId);
        const queueStats = await getQueueStatsForCampaign(queueItem.campaignId);
        if (pending.length === 0 && activeCount === 0 && queueStats.pending === 0 && queueStats.claimed === 0) {
          // Campaign complete
          const campaign = await db.getCampaign(queueItem.campaignId, queueItem.userId);
          if (campaign && campaign.status === "running") {
            await db.updateCampaign(queueItem.campaignId, queueItem.userId, {
              status: "completed",
              completedAt: Date.now(),
            });
            cleanupPacing(queueItem.campaignId);
            activePacingConfigs.delete(queueItem.campaignId);
            console.log(`[PBX-API] Campaign ${queueItem.campaignId} completed`);
            // Notify owner
            const finalStats = await db.getCampaignStats(queueItem.campaignId);
            notifyOwner({
              title: `Campaign Completed: ${campaign.name}`,
              content: `Campaign "${campaign.name}" has finished.\n\nResults:\n- Total: ${finalStats.total}\n- Answered: ${finalStats.answered}\n- Failed: ${finalStats.failed}\n- Busy: ${finalStats.busy}\n- No Answer: ${finalStats.noAnswer}\n\nAnswer Rate: ${finalStats.total > 0 ? Math.round((finalStats.answered / finalStats.total) * 100) : 0}%`,
            }).catch(err => console.warn("[PBX-API] Failed to send completion notification:", err));
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[PBX-API] Report error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Heartbeat ──────────────────────────────────────────────────────────────────
pbxRouter.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    const agent = (req as any).pbxAgent;
    await db.updatePbxAgentHeartbeat(agent.agentId, req.body.activeCalls || 0);
    // Attempt auto-throttle ramp-up on each heartbeat
    await attemptRampUp(agent.agentId);
    const agentMax = agent.effectiveMaxCalls ?? agent.maxCalls ?? 10;
    res.json({ status: "ok", serverTime: Date.now(), effectiveMaxCalls: agentMax });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Get dialplan config ────────────────────────────────────────────────────
// PBX agent fetches this on startup to configure the Asterisk dialplan
pbxRouter.get("/config", async (req: Request, res: Response) => {
  try {
    res.json({
      dialplanContext: "tts-broadcast",
      trunkName: "vitel-outbound",
      audioDir: "/var/lib/asterisk/sounds/custom/broadcast",
      defaultTimeout: 30000,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Queue stats ────────────────────────────────────────────────────────────
pbxRouter.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await db.getCallQueueStats();
    const agents = await db.getPbxAgents();
    res.json({ queue: stats, agents });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Internal: Track active pacing configs for campaigns ────────────────────
const activePacingConfigs = new Map<number, PacingConfig>();

export function registerPacingConfig(campaignId: number, config: PacingConfig) {
  activePacingConfigs.set(campaignId, config);
}

export function unregisterPacingConfig(campaignId: number) {
  activePacingConfigs.delete(campaignId);
}

// Helper to get queue stats for a specific campaign
async function getQueueStatsForCampaign(campaignId: number) {
  const dbInst = await db.getDb();
  if (!dbInst) return { pending: 0, claimed: 0 };
  const { callQueue: cq } = await import("../../drizzle/schema");
  const { eq, and, count } = await import("drizzle-orm");
  const result = await dbInst.select({
    status: cq.status,
    count: count(),
  }).from(cq).where(eq(cq.campaignId, campaignId)).groupBy(cq.status);
  const stats: Record<string, number> = {};
  for (const row of result) {
    stats[row.status] = row.count;
  }
  return { pending: stats["pending"] || 0, claimed: stats["claimed"] || 0 };
}

// ─── Health Check Result Report ────────────────────────────────────────────
// PBX agent reports DID health check results
pbxRouter.post("/health-check-result", async (req: Request, res: Response) => {
  try {
    const { callerIdId, result, details } = req.body;
    if (!callerIdId || !result) {
      res.status(400).json({ error: "Missing callerIdId or result" });
      return;
    }

    const validResults = ["healthy", "degraded", "failed"];
    if (!validResults.includes(result)) {
      res.status(400).json({ error: `Invalid result. Must be one of: ${validResults.join(", ")}` });
      return;
    }

    const updateResult = await db.updateCallerIdHealthCheck(callerIdId, result, details);

    if (updateResult.autoDisabled) {
      // Notify owner that a DID was auto-disabled
      notifyOwner({
        title: `Caller ID Auto-Disabled: ${updateResult.phoneNumber}`,
        content: `Caller ID ${updateResult.phoneNumber} has been automatically disabled after ${updateResult.failCount} consecutive health check failures.\n\nLast check result: ${details || result}\n\nYou can re-enable it from the Caller IDs page after verifying the number is working.`,
      }).catch(err => console.warn("[PBX-API] Failed to send auto-disable notification:", err));
      console.log(`[PBX-API] Caller ID ${updateResult.phoneNumber} auto-disabled after ${updateResult.failCount} failures`);
    }

    res.json({ success: true, autoDisabled: updateResult.autoDisabled });
  } catch (err) {
    console.error("[PBX-API] Health check result error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Agent Offline Detection ───────────────────────────────────────────────
// Periodically check for agents that haven't sent a heartbeat in 2+ minutes
let offlineCheckInterval: ReturnType<typeof setInterval> | null = null;
const notifiedOfflineAgents = new Set<string>();

function startAgentOfflineMonitor() {
  if (offlineCheckInterval) return;
  offlineCheckInterval = setInterval(async () => {
    try {
      const agents = await db.getPbxAgents();
      const now = Date.now();
      for (const agent of agents) {
        const lastSeen = agent.lastHeartbeat ? new Date(agent.lastHeartbeat).getTime() : 0;
        const offlineThreshold = 120000; // 2 minutes
        if (now - lastSeen > offlineThreshold && agent.status === "online") {
          if (!notifiedOfflineAgents.has(agent.agentId)) {
            notifiedOfflineAgents.add(agent.agentId);
            notifyOwner({
              title: `PBX Agent Offline: ${agent.name}`,
              content: `PBX agent "${agent.name}" (${agent.agentId}) has not sent a heartbeat in over 2 minutes.\n\nLast seen: ${agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toISOString() : "never"}\n\nPlease check the agent service on your FreePBX server.`,
            }).catch(err => console.warn("[PBX-API] Failed to send offline notification:", err));
            console.log(`[PBX-API] Agent ${agent.name} (${agent.agentId}) appears offline — notification sent`);
          }
        } else if (now - lastSeen <= offlineThreshold) {
          // Agent is back online — clear the notification flag
          notifiedOfflineAgents.delete(agent.agentId);
        }
      }
    } catch (err) {
      console.error("[PBX-API] Agent offline check error:", err);
    }
  }, 60000); // Check every 60 seconds
}

// Start the monitor when the module loads
startAgentOfflineMonitor();

export { pbxRouter };
