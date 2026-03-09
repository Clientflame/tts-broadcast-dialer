import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db";
import { generatePersonalizedTTS } from "./tts";
import { recordCallResult, getCurrentConcurrent, getPacingStats, initPacing, cleanupPacing, type PacingConfig } from "./pacing";

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
pbxRouter.post("/poll", async (req: Request, res: Response) => {
  try {
    const agent = (req as any).pbxAgent;
    const limit = Math.min(req.body.limit || 5, agent.maxCalls || 5);

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
    await db.updateCallQueueItem(queueId, {
      status: result === "answered" || result === "completed" ? "completed" : "failed",
      result,
      resultDetails: details || {},
    });

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

// ─── Heartbeat ──────────────────────────────────────────────────────────────
pbxRouter.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    const agent = (req as any).pbxAgent;
    await db.updatePbxAgentHeartbeat(agent.agentId, req.body.activeCalls || 0);
    res.json({ status: "ok", serverTime: Date.now() });
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

export { pbxRouter };
