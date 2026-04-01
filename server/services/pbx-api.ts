import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db";
import { generatePersonalizedTTS } from "./tts";
import { recordCallResult, getCurrentConcurrent, getPacingStats, initPacing, cleanupPacing, type PacingConfig } from "./pacing";
import { notifyOwner } from "../_core/notification";
import { dispatchNotification } from "./notification-dispatcher";
import { recordCarrierError, attemptRampUp, isCarrierError, getThrottleStatus } from "./auto-throttle";
import { drainCommandsForAgent, reportCommandResult } from "./call-control";

// In-memory storage for extension status from PBX agents (refreshed every heartbeat)
const extensionStatusByAgent = new Map<string, { extensions: any[]; updatedAt: number }>();

export function getExtensionStatus(): { agentId: string; extensions: any[]; updatedAt: number }[] {
  const result: { agentId: string; extensions: any[]; updatedAt: number }[] = [];
  const now = Date.now();
  for (const [agentId, data] of Array.from(extensionStatusByAgent.entries())) {
    // Only return data that's less than 60 seconds old
    if (now - data.updatedAt < 60000) {
      result.push({ agentId, ...data });
    }
  }
  return result;
}
import { createIvrPayment } from "./ivr-payment";

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

// Helper: resolve relative storage URLs to absolute URLs using the request's origin
// This is needed for self-hosted deployments where audio URLs are relative (/api/storage/...)
// but the PBX agent on a different server needs full URLs to download them
function resolveUrlForAgent(url: string | null, req: Request): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Build origin from request headers
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}${url}`;
}

// ─── Poll for pending calls ─────────────────────────────────────────────────
// PBX agent calls this every 2-3 seconds to get work
// Uses weighted load balancing: each agent gets calls proportional to its available capacity
pbxRouter.post("/poll", async (req: Request, res: Response) => {
  try {
    const agent = (req as any).pbxAgent;
    // Use effectiveMaxCalls (throttled) if set, otherwise maxCalls
    const agentMax = agent.effectiveMaxCalls ?? agent.maxCalls ?? 5;
    // Per-campaign speed cap: if the request includes a campaignMaxCalls, cap the limit
    const campaignMax = req.body.campaignMaxCalls || agentMax;
    const effectiveLimit = Math.min(agentMax, campaignMax);

    // Load balancing: calculate this agent's fair share based on capacity
    // Cross-check agent-reported activeCalls against actual claimed calls in DB
    // This prevents desync where agent reports stale active calls that no longer exist
    let activeCalls = req.body.activeCalls || 0;
    try {
      const actualClaimed = await db.getClaimedCallCountByAgent(agent.agentId);
      if (activeCalls > 0 && actualClaimed === 0) {
        // Agent thinks it has active calls but DB shows none — trust the DB
        console.log(`[PBX-API] Agent ${agent.name} reports ${activeCalls} active but DB shows ${actualClaimed} claimed — using DB count`);
        activeCalls = actualClaimed;
      }
    } catch (_) { /* fallback to agent-reported count */ }
    const availableSlots = Math.max(0, effectiveLimit - activeCalls);

    // Get all online agents to calculate proportional share
    let limit = availableSlots;
    try {
      const allAgents = await db.getPbxAgents();
      const onlineAgents = allAgents.filter((a: any) => {
        if (a.agentId === agent.agentId) return true; // Always include self
        if (!a.lastHeartbeat) return false;
        const lastSeen = new Date(a.lastHeartbeat).getTime();
        return Date.now() - lastSeen < 60000; // Online if heartbeat within 60s
      });

      if (onlineAgents.length > 1) {
        // Weighted distribution: agent gets share proportional to its max capacity
        const totalCapacity = onlineAgents.reduce((sum: number, a: any) => {
          const aMax = a.effectiveMaxCalls ?? a.maxCalls ?? 5;
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

    // Update agent heartbeat (also pass capabilities if provided)
    await db.updatePbxAgentHeartbeat(agent.agentId, req.body.activeCalls || 0, req.body.capabilities || undefined);

    // Determine CPS limit: campaign-level overrides agent-level
    const agentCps = agent.cpsLimit ?? 1;
    const agentPacingMs = (agent as any).cpsPacingMs ?? 1000;
    // Check if all calls belong to the same campaign and it has a CPS override
    let effectiveCps = agentCps;
    let effectivePacingMs = agentPacingMs;
    if (calls.length > 0) {
      try {
        const campaignId = calls[0].campaignId;
        if (campaignId) {
          const campaign = await db.getCampaignById(campaignId);
          if (campaign?.cpsLimit && campaign.cpsLimit > 0) {
            effectiveCps = Math.min(agentCps, campaign.cpsLimit);
          }
          // Campaign cpsPacingMs override (use the slower/higher value)
          if ((campaign as any)?.cpsPacingMs && (campaign as any).cpsPacingMs > 0) {
            effectivePacingMs = Math.max(agentPacingMs, (campaign as any).cpsPacingMs);
          }
        }
      } catch (_) { /* use agent settings on error */ }
    }

    // Look up campaign-level settings for AMD/payment (cached per campaign)
    const campaignSettingsCache = new Map<number, any>();
    const getCampaignSettings = async (campaignId: number | null) => {
      if (!campaignId) return null;
      if (campaignSettingsCache.has(campaignId)) return campaignSettingsCache.get(campaignId);
      try {
        const c = await db.getCampaignById(campaignId);
        campaignSettingsCache.set(campaignId, c);
        return c;
      } catch { return null; }
    };

    const callsWithSettings = await Promise.all(calls.map(async (c) => {
      const campaign = await getCampaignSettings(c.campaignId);
      return {
        id: c.id,
        phoneNumber: c.phoneNumber,
        channel: c.channel,
        context: c.context,
        callerIdStr: c.callerIdStr,
        audioUrl: resolveUrlForAgent(c.audioUrl, req),
        audioUrls: c.audioUrls ? c.audioUrls.map((u: string) => resolveUrlForAgent(u, req)!) : null,
        audioName: c.audioName,
        variables: c.variables || {},
        priority: c.priority,
        campaignId: c.campaignId,
        callLogId: c.callLogId,
        // AMD / Voicemail drop (from campaign settings)
        amdEnabled: !!(campaign as any)?.amdEnabled,
        voicemailAudioUrl: resolveUrlForAgent((campaign as any)?.voicemailAudioUrl || (c as any).voicemailAudioUrl || null, req),
        voicemailMessage: (campaign as any)?.voicemailMessage || null,
        // IVR Payment (from campaign settings)
        ivrPaymentEnabled: !!(campaign as any)?.ivrPaymentEnabled,
        ivrPaymentDigit: (campaign as any)?.ivrPaymentDigit || null,
        ivrPaymentAmount: (campaign as any)?.ivrPaymentAmount || 0,
        // Call Recording (from campaign settings)
        recordingEnabled: !!(campaign as any)?.recordingEnabled,
        // Routing mode: check queue variables first (for test calls), then campaign settings
        routingMode: (c.variables as any)?.routingMode || (campaign as any)?.routingMode || "tts_only",
        transferExtension: (c as any).transferExtension || null,
      };
    }));

    res.json({
      calls: callsWithSettings,
      cpsLimit: effectiveCps,
      cpsPacingMs: effectivePacingMs,
      maxConcurrent: effectiveLimit,
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

    // Log detailed call result for debugging
    const agent = (req as any).pbxAgent;
    if (result === "failed" || result === "congestion") {
      const reason = details?.reason || details?.error || "unknown";
      console.warn(`[PBX-API] Call ${queueId} FAILED on agent ${agent?.name || "unknown"}: result=${result}, reason=${reason}, details=${JSON.stringify(details || {})}`);
    } else {
      console.log(`[PBX-API] Call ${queueId} result: ${result} (agent: ${agent?.name || "unknown"}, duration: ${details?.duration || 0}s)`);
    }

    // Update queue item
    const queueUpdate: any = {
      status: result === "answered" || result === "completed" ? "completed" : "failed",
      result,
      resultDetails: {
        ...(details || {}),
        agentName: agent?.name || "unknown",
        reportedAt: Date.now(),
      },
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
      if (details?.amdResult) updateData.amdResult = details.amdResult;
      if (details?.voicemailDropped) updateData.voicemailDropped = 1;
      if (result === "failed" && details?.error) updateData.errorMessage = details.error;

      await db.updateCallLog(queueItem.callLogId, updateData);

      // Update campaign counts
      if (queueItem.campaignId) {
        const stats = await db.getCampaignStats(queueItem.campaignId);
        // Find the userId from the queue item
        await db.updateCampaign(queueItem.campaignId, {
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

        // Feed DID health monitoring - track per-DID failure rates
        if (queueItem.callerIdStr) {
          try {
            const didResult = await db.recordDidCallResultByNumber(queueItem.callerIdStr, result);
            if (didResult.flagged && 'phoneNumber' in didResult) {
              console.log(`[PBX-API] DID ${didResult.phoneNumber} auto-flagged: ${didResult.failureRate}% failure rate`);
              // Check notification preference before sending (dispatches to all enabled channels)
              db.isNotificationEnabled("notify_did_auto_flag").then(enabled => {
                if (enabled) {
                  dispatchNotification({
                    title: `DID Auto-Flagged: ${didResult.phoneNumber}`,
                    content: `Caller ID ${didResult.phoneNumber} has been automatically removed from rotation due to a high failure rate (${didResult.failureRate}%).\n\nThe DID will be placed on a 30-minute cooldown and then automatically re-enabled.\n\nYou can manually re-enable it from the Caller IDs page.`,
                  }).catch(err => console.warn("[PBX-API] Failed to dispatch DID flag notification:", err));
                }
              }).catch(() => {});
            }
          } catch (err) {
            console.warn("[PBX-API] DID health tracking error:", err);
          }
        }

        // Check if campaign is complete
        const pending = await db.getPendingCallLogs(queueItem.campaignId);
        const activeCount = await db.getActiveCallCount(queueItem.campaignId);
        const queueStats = await getQueueStatsForCampaign(queueItem.campaignId);
        if (pending.length === 0 && activeCount === 0 && queueStats.pending === 0 && queueStats.claimed === 0) {
          // Campaign complete
          const campaign = await db.getCampaign(queueItem.campaignId);
          if (campaign && campaign.status === "running") {
            await db.updateCampaign(queueItem.campaignId, {
              status: "completed",
              completedAt: Date.now(),
            });
            cleanupPacing(queueItem.campaignId);
            activePacingConfigs.delete(queueItem.campaignId);
            console.log(`[PBX-API] Campaign ${queueItem.campaignId} completed`);
            // Notify owner
            const finalStats = await db.getCampaignStats(queueItem.campaignId);
            db.isNotificationEnabled("notify_campaign_complete").then(enabled => {
              if (enabled) {
                dispatchNotification({
                  title: `Campaign Completed: ${campaign.name}`,
                  content: `Campaign "${campaign.name}" has finished.\n\nResults:\n- Total: ${finalStats.total}\n- Answered: ${finalStats.answered}\n- Failed: ${finalStats.failed}\n- Busy: ${finalStats.busy}\n- No Answer: ${finalStats.noAnswer}\n\nAnswer Rate: ${finalStats.total > 0 ? Math.round((finalStats.answered / finalStats.total) * 100) : 0}%`,
                }).catch(err => console.warn("[PBX-API] Failed to dispatch completion notification:", err));
              }
            }).catch(() => {});
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
    // Accept capabilities from PBX agent (e.g., voiceAiBridge: true)
    const capabilities = req.body.capabilities || undefined;
    // Store agent version and features if provided
    const agentVersion = req.body.agentVersion || null;
    const agentFeatures = req.body.features || null;
    const updatedCapabilities = {
      ...capabilities,
      ...(agentVersion ? { agentVersion } : {}),
      ...(agentFeatures ? { agentFeatures } : {}),
    };
    await db.updatePbxAgentHeartbeat(agent.agentId, req.body.activeCalls || 0, Object.keys(updatedCapabilities).length > 0 ? updatedCapabilities : capabilities);
    // Store extension status if provided by the PBX agent
    const extensions = req.body.extensions;
    if (Array.isArray(extensions) && extensions.length > 0) {
      extensionStatusByAgent.set(agent.agentId, { extensions, updatedAt: Date.now() });
    }
    // Attempt auto-throttle ramp-up on each heartbeat
    await attemptRampUp(agent.agentId);
    const agentMax = agent.effectiveMaxCalls ?? agent.maxCalls ?? 5;
    // Drain any pending call control commands for this agent
    const commands = drainCommandsForAgent(agent.agentId);
    res.json({ status: "ok", serverTime: Date.now(), effectiveMaxCalls: agentMax, requiredVersion: "1.5.0", pendingCommands: commands.length > 0 ? commands : undefined });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Get dialplan config ────────────────────────────────────────────────────
// PBX agent fetches this on startup to configure the Asterisk dialplan
pbxRouter.get("/config", async (req: Request, res: Response) => {
  try {
    const trunkName = await db.getSipTrunkName();
    res.json({
      dialplanContext: "tts-broadcast",
      trunkName,
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
      db.isNotificationEnabled("notify_did_auto_disable").then(enabled => {
        if (enabled) {
          dispatchNotification({
            title: `Caller ID Auto-Disabled: ${updateResult.phoneNumber}`,
            content: `Caller ID ${updateResult.phoneNumber} has been automatically disabled after ${updateResult.failCount} consecutive health check failures.\n\nLast check result: ${details || result}\n\nYou can re-enable it from the Caller IDs page after verifying the number is working.`,
          }).catch(err => console.warn("[PBX-API] Failed to dispatch auto-disable notification:", err));
        }
      }).catch(() => {});
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
const notifiedBridgeOfflineAgents = new Set<string>();
const knownBridgeOnlineAgents = new Set<string>();

function startAgentOfflineMonitor() {
  if (offlineCheckInterval) return;
  offlineCheckInterval = setInterval(async () => {
    try {
      const agents = await db.getPbxAgents();
      const now = Date.now();
      for (const agent of agents) {
        const lastSeen = agent.lastHeartbeat ? new Date(agent.lastHeartbeat).getTime() : 0;
        const offlineThreshold = 120000; // 2 minutes
        const isOnline = now - lastSeen <= offlineThreshold;

        // ─── PBX Agent Offline Detection ──────────────────────────────
        if (!isOnline && agent.status === "online") {
          if (!notifiedOfflineAgents.has(agent.agentId)) {
            notifiedOfflineAgents.add(agent.agentId);
            db.isNotificationEnabled("notify_agent_offline").then(enabled => {
              if (enabled) {
                dispatchNotification({
                  title: `PBX Agent Offline: ${agent.name}`,
                  content: `PBX agent "${agent.name}" (${agent.agentId}) has not sent a heartbeat in over 2 minutes.\n\nLast seen: ${agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toISOString() : "never"}\n\nPlease check the agent service on your FreePBX server.`,
                }).catch(err => console.warn("[PBX-API] Failed to dispatch offline notification:", err));
              }
            }).catch(() => {});
            console.log(`[PBX-API] Agent ${agent.name} (${agent.agentId}) appears offline — notification sent`);
            // If agent goes offline, bridge is also offline
            if (knownBridgeOnlineAgents.has(agent.agentId)) {
              knownBridgeOnlineAgents.delete(agent.agentId);
              notifiedBridgeOfflineAgents.delete(agent.agentId);
            }
          }
        } else if (isOnline) {
          // Agent is back online — clear the notification flag
          if (notifiedOfflineAgents.has(agent.agentId)) {
            notifiedOfflineAgents.delete(agent.agentId);
          }

          // ─── Voice AI Bridge Status Detection ────────────────────────
          const capabilities = (agent as any).capabilities;
          const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;

          if (hasBridge) {
            // Bridge is online
            if (!knownBridgeOnlineAgents.has(agent.agentId)) {
              knownBridgeOnlineAgents.add(agent.agentId);
              // Send "bridge online" notification if it was previously offline
              if (notifiedBridgeOfflineAgents.has(agent.agentId)) {
                notifiedBridgeOfflineAgents.delete(agent.agentId);
                db.isNotificationEnabled("notify_bridge_online").then(enabled => {
                  if (enabled) {
                    dispatchNotification({
                      title: `Voice AI Bridge Online: ${agent.name}`,
                      content: `The Voice AI bridge on PBX agent "${agent.name}" is now online and ready to handle Voice AI calls.`,
                    }).catch(err => console.warn("[PBX-API] Failed to dispatch bridge online notification:", err));
                  }
                }).catch(() => {});
                // Log bridge online event
                db.createBridgeEvent({ agentId: agent.agentId, agentName: agent.name || agent.agentId, eventType: "online", details: "Bridge came online (detected via heartbeat capabilities)" }).catch(err => console.warn("[PBX-API] Failed to log bridge online event:", err));
                console.log(`[PBX-API] Voice AI bridge on ${agent.name} is back online — notification sent`);
              }
            }
          } else {
            // Bridge is not running on this agent
            if (knownBridgeOnlineAgents.has(agent.agentId)) {
              // Bridge was previously online, now it's gone
              knownBridgeOnlineAgents.delete(agent.agentId);
              if (!notifiedBridgeOfflineAgents.has(agent.agentId)) {
                notifiedBridgeOfflineAgents.add(agent.agentId);
                db.isNotificationEnabled("notify_bridge_offline").then(enabled => {
                  if (enabled) {
                    dispatchNotification({
                      title: `Voice AI Bridge Offline: ${agent.name}`,
                      content: `The Voice AI bridge on PBX agent "${agent.name}" has gone offline.\n\nVoice AI calls will not work until the bridge is restarted.\n\nTo restart: SSH into your FreePBX server and run:\n  systemctl restart voice-ai-bridge\n\nOr use the auto-install button on the System Health dashboard.`,
                    }).catch(err => console.warn("[PBX-API] Failed to dispatch bridge offline notification:", err));
                  }
                }).catch(() => {});
                // Log bridge offline event
                db.createBridgeEvent({ agentId: agent.agentId, agentName: agent.name || agent.agentId, eventType: "offline", details: "Bridge went offline (capabilities.voiceAiBridge no longer reported)" }).catch(err => console.warn("[PBX-API] Failed to log bridge offline event:", err));
                console.log(`[PBX-API] Voice AI bridge on ${agent.name} went offline — notification sent`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[PBX-API] Agent offline check error:", err);
    }
  }, 60000); // Check every 60 seconds
}

// Start the monitor when the module loads
startAgentOfflineMonitor();

// ─── Installer Script Endpoint (no auth - uses API key in query param) ──────
// This endpoint is mounted BEFORE the auth middleware via a separate router
import { Router as InstallerRouter } from "express";
const installerRouter = InstallerRouter();

installerRouter.get("/install", async (req: any, res: any) => {
  const apiKey = req.query.key as string;
  if (!apiKey) {
    res.status(400).send("# Error: Missing API key parameter\nexit 1\n");
    return;
  }

  // Validate the API key belongs to a real agent
  const agent = await db.getPbxAgentByApiKey(apiKey);
  if (!agent) {
    res.status(403).send("# Error: Invalid API key\nexit 1\n");
    return;
  }

  // Build the API URL from the request
  // Default to "http" for self-hosted deployments without reverse proxy
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const apiUrl = `${protocol}://${host}/api/pbx`;
  const maxCalls = agent.maxCalls ?? 5;
  const cpsLimit = (agent as any).cpsLimit ?? 1;
  const cpsPacingMs = (agent as any).cpsPacingMs ?? 1000;
  const agentName = agent.name || "pbx-agent";

  // Read AMI credentials from environment secrets
  const amiUser = process.env.FREEPBX_AMI_USER || "admin";
  const amiPassword = process.env.FREEPBX_AMI_PASSWORD || "";
  const amiPort = process.env.FREEPBX_AMI_PORT || "5038";

  // Read the PBX agent Python script
  const path = await import("path");
  const fs = await import("fs");
  let agentScript: string;
  try {
    // In production, the pbx-agent dir is at the project root
    const scriptPath = path.resolve(process.cwd(), "pbx-agent", "pbx_agent.py");
    agentScript = fs.readFileSync(scriptPath, "utf-8");
  } catch {
    try {
      // Fallback: try relative to __dirname
      const scriptPath = path.resolve(__dirname, "..", "..", "pbx-agent", "pbx_agent.py");
      agentScript = fs.readFileSync(scriptPath, "utf-8");
    } catch {
      res.status(500).send("# Error: Could not read agent script\nexit 1\n");
      return;
    }
  }

  // Generate the installer script
  const script = generateInstallerScript(apiUrl, apiKey, maxCalls, cpsLimit, cpsPacingMs, agentName, agentScript, amiUser, amiPassword, amiPort);

  res.setHeader("Content-Type", "text/plain");
  res.send(script);
});

function generateInstallerScript(apiUrl: string, apiKey: string, maxCalls: number, cpsLimit: number, cpsPacingMs: number, agentName: string, agentScript: string, amiUser: string, amiPassword: string, amiPort: string): string {
  // Escape backticks and dollar signs in the Python script for safe embedding in heredoc
  // Using a quoted heredoc ('AGENT_SCRIPT_EOF') prevents shell expansion
  const parts: string[] = [];
  parts.push(`#!/bin/bash
# ============================================================================
# PBX Agent Installer for AI TTS Broadcast Dialer
# Auto-generated installer - run on your FreePBX/Asterisk server
# ============================================================================
set -e

echo ""
echo "========================================"
echo "  PBX Agent Installer"
echo "  Agent: ${agentName}"
echo "========================================"
echo ""

# Check if running as root
if [ "\$(id -u)" -ne 0 ]; then
  echo "ERROR: This installer must be run as root"
  echo "  Try: sudo bash or run as root user"
  exit 1
fi

# Check for Python 3
if ! command -v python3 &> /dev/null; then
  echo "ERROR: Python 3 is required but not installed"
  echo "  Install it with: yum install python3  (CentOS/RHEL)"
  echo "                   apt install python3  (Debian/Ubuntu)"
  exit 1
fi

PYTHON_VERSION=\$(python3 --version 2>&1)
echo "[OK] Found \$PYTHON_VERSION"

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "WARNING: ffmpeg not found - attempting to install..."
  if command -v yum &> /dev/null; then
    yum install -y ffmpeg 2>/dev/null || echo "  Could not install ffmpeg via yum. Audio conversion may fail."
  elif command -v apt-get &> /dev/null; then
    apt-get install -y ffmpeg 2>/dev/null || echo "  Could not install ffmpeg via apt. Audio conversion may fail."
  fi
fi

if command -v ffmpeg &> /dev/null; then
  echo "[OK] ffmpeg found"
else
  echo "[WARN] ffmpeg not found - audio conversion may fail"
fi

# Check for Asterisk
if command -v asterisk &> /dev/null; then
  echo "[OK] Asterisk found"
else
  echo "[WARN] Asterisk not detected - AMI connection may fail"
fi

# Stop existing service if running
if systemctl is-active --quiet pbx-agent 2>/dev/null; then
  echo "Stopping existing PBX agent..."
  systemctl stop pbx-agent
fi

# Create installation directory
INSTALL_DIR="/opt/pbx-agent"
mkdir -p "\$INSTALL_DIR"
echo ""
echo "Installing to \$INSTALL_DIR ..."

# Write the PBX agent script
cat > "\$INSTALL_DIR/pbx_agent.py" << 'AGENT_SCRIPT_EOF'`);
  parts.push(agentScript);
  parts.push(`AGENT_SCRIPT_EOF

chmod +x "\$INSTALL_DIR/pbx_agent.py"
echo "[OK] Agent script installed"

# Create audio directory
mkdir -p /var/lib/asterisk/sounds/custom/broadcast
if id asterisk &>/dev/null; then
  chown asterisk:asterisk /var/lib/asterisk/sounds/custom/broadcast
fi
echo "[OK] Audio directory created"

# ============================================================================
# Deploy Asterisk Dialplan (tts-broadcast + tts-broadcast-amd + voice-ai-handler)
# ============================================================================
echo ""
echo "Configuring Asterisk dialplan..."

# Use Python to safely manage extensions_custom.conf — remove old contexts, then append fresh ones
# This avoids duplicating contexts on re-install
python3 << 'DIALPLAN_DEPLOY_SCRIPT'
import re, os

conf_path = "/etc/asterisk/extensions_custom.conf"

# Read existing content (or start fresh)
if os.path.exists(conf_path):
    with open(conf_path) as f:
        content = f.read()
else:
    content = ""

# Remove any existing tts-broadcast, tts-broadcast-amd, and voice-ai-handler contexts
# Each context block runs from [context-name] to the next [context-name] or end of file
for ctx in ["tts-broadcast-amd", "tts-broadcast", "voice-ai-handler"]:
    pattern = rf"\\n*\\[{re.escape(ctx)}\\][\\s\\S]*?(?=\\n\\[|\\Z)"
    content = re.sub(pattern, "", content)

# Clean up excessive blank lines
content = re.sub(r"\\n{3,}", "\\n\\n", content).strip()

# Append all three dialplan contexts
dialplan = '''

; ─── TTS Broadcast Dialplan (auto-deployed by PBX Agent Installer) ────────────
[tts-broadcast]
exten => s,1,NoOp(TTS Broadcast - Call answered)
 same => n,Set(CALLID=\${CALLID})
 same => n,Wait(0.5)
 same => n,GotoIf($[\${EXISTS(\${AUDIOFILE})}]?play:no_audio)
 same => n(play),Playback(\${AUDIOFILE})
 same => n,WaitExten(10)
 same => n(no_audio),NoOp(No audio file)
 same => n,Hangup()

; ─── TTS Broadcast AMD Dialplan ───────────────────────────────────────────────
[tts-broadcast-amd]
exten => s,1,NoOp(TTS Broadcast AMD - Call answered)
 same => n,Set(CALLID=\${CALLID})
 same => n,NoOp(AMD Enabled - Running answering machine detection)
 same => n,AMD()
 same => n,NoOp(AMD Result: \${AMDSTATUS} / Cause: \${AMDCAUSE})
 same => n,GotoIf($["\${AMDSTATUS}" = "MACHINE"]?machine:human)
 same => n(human),NoOp(Human detected - playing main message)
 same => n,Set(CDR(amdResult)=HUMAN)
 same => n,Wait(0.5)
 same => n,GotoIf($[\${EXISTS(\${AUDIOFILE})}]?play_main:no_audio)
 same => n(play_main),Playback(\${AUDIOFILE})
 same => n,Goto(check_ivr)
 same => n(machine),NoOp(Machine detected - voicemail drop)
 same => n,Set(CDR(amdResult)=MACHINE)
 same => n,Wait(1)
 same => n,GotoIf($[\${EXISTS(\${VOICEMAIL_AUDIOFILE})}]?play_vm:play_main_vm)
 same => n(play_vm),Playback(\${VOICEMAIL_AUDIOFILE})
 same => n,Set(CDR(voicemailDropped)=1)
 same => n,Goto(done)
 same => n(play_main_vm),GotoIf($[\${EXISTS(\${AUDIOFILE})}]?play_main_as_vm:done)
 same => n(play_main_as_vm),Playback(\${AUDIOFILE})
 same => n,Set(CDR(voicemailDropped)=1)
 same => n,Goto(done)
 same => n(no_audio),NoOp(No audio file - hanging up)
 same => n,Goto(done)
 same => n(check_ivr),NoOp(Checking for IVR options)
 same => n,WaitExten(10)
 same => n(done),NoOp(Call complete)
 same => n,Hangup()

; ─── Voice AI Handler Dialplan ────────────────────────────────────────────────
[voice-ai-handler]
exten => s,1,NoOp(Voice AI Bridge - Prompt: \${VOICE_AI_PROMPT_ID})
 same => n,Answer()
 same => n,Wait(0.5)
 same => n,Stasis(voice-ai-bridge,\${VOICE_AI_PROMPT_ID},\${CONTACT_NAME},\${CONTACT_PHONE},\${CAMPAIGN_NAME})
 same => n,Hangup()
exten => failed,1,NoOp(Voice AI call failed)
 same => n,Hangup()
exten => h,1,NoOp(Voice AI call hangup handler)
'''

with open(conf_path, 'w') as f:
    f.write(content + dialplan)

print("Dialplan contexts deployed successfully")
DIALPLAN_DEPLOY_SCRIPT

echo "[OK] Dialplan deployed (tts-broadcast, tts-broadcast-amd, voice-ai-handler)"

# ============================================================================
# Enable ARI (Asterisk REST Interface) for Voice AI Bridge
# ============================================================================
echo ""
echo "Configuring ARI..."

# FreePBX uses ari_general_additional.conf (auto-generated, may have enabled=no)
# We override via ari_general_custom.conf which takes precedence
if [ -d /etc/asterisk ]; then
  # Create/overwrite ari_general_custom.conf to ensure ARI is enabled
  cat > /etc/asterisk/ari_general_custom.conf << 'ARI_GENERAL_EOF'
[general]
enabled=yes
ARI_GENERAL_EOF
  echo "[OK] ARI enabled via ari_general_custom.conf"

  # Ensure HTTP is enabled (required for ARI)
  if [ -f /etc/asterisk/http.conf ]; then
    if ! grep -q "^enabled=yes" /etc/asterisk/http.conf 2>/dev/null; then
      sed -i 's/^enabled=no/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
      sed -i 's/^;enabled=yes/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
      echo "[OK] HTTP enabled in http.conf"
    else
      echo "[OK] HTTP already enabled"
    fi
  fi

  # Load ARI modules
  asterisk -rx 'module load res_ari' 2>/dev/null || true
  asterisk -rx 'module load res_stasis' 2>/dev/null || true
  asterisk -rx 'module load res_ari_channels' 2>/dev/null || true
  asterisk -rx 'module load res_ari_bridges' 2>/dev/null || true
  echo "[OK] ARI modules loaded"
else
  echo "[WARN] /etc/asterisk not found - skipping ARI configuration"
fi

# Reload Asterisk to apply dialplan and ARI changes
asterisk -rx 'core reload' 2>&1 || echo "[WARN] Could not reload Asterisk"
echo "[OK] Asterisk configuration reloaded"

# Create systemd service with pre-configured credentials
cat > /etc/systemd/system/pbx-agent.service << SERVICE_EOF
[Unit]
Description=PBX Agent for AI TTS Broadcast Dialer
After=network.target asterisk.service
Wants=asterisk.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pbx-agent
ExecStart=/usr/bin/python3 /opt/pbx-agent/pbx_agent.py
Restart=always
RestartSec=5
Environment=PBX_AGENT_API_URL=${apiUrl}
Environment=PBX_AGENT_API_KEY=${apiKey}
Environment=AMI_HOST=127.0.0.1
Environment=AMI_PORT=${amiPort}
Environment=AMI_USER=${amiUser}
Environment=AMI_SECRET=${amiPassword}
Environment=POLL_INTERVAL=3
Environment=MAX_CONCURRENT=${maxCalls}
Environment=CPS_LIMIT=${cpsLimit}
Environment=CPS_PACING_MS=${cpsPacingMs}

[Install]
WantedBy=multi-user.target
SERVICE_EOF

echo "[OK] Systemd service created"

# Enable and start the service
systemctl daemon-reload
systemctl enable pbx-agent
systemctl restart pbx-agent

# Wait a moment and check status
sleep 2
if systemctl is-active --quiet pbx-agent; then
  echo ""
  echo "========================================"
  echo "  Installation Complete!"
  echo "========================================"
  echo ""
  echo "  Agent Name:  ${agentName}"
  echo "  Install Dir: \$INSTALL_DIR"
  echo "  Service:     pbx-agent.service"
  echo "  Status:      RUNNING"
  echo ""
  echo "  Configured:"
  echo "    ✓ Dialplan: tts-broadcast, tts-broadcast-amd, voice-ai-handler"
  echo "    ✓ ARI: enabled via ari_general_custom.conf"
  echo "    ✓ Audio dir: /var/lib/asterisk/sounds/custom/broadcast"
  echo ""
  echo "  Useful commands:"
  echo "    systemctl status pbx-agent    # Check status"
  echo "    journalctl -u pbx-agent -f    # View live logs"
  echo "    systemctl restart pbx-agent   # Restart agent"
  echo "    systemctl stop pbx-agent      # Stop agent"
  echo ""
  echo "  The agent should appear online in your dashboard within 10 seconds."
else
  echo ""
  echo "[WARN] Service installed but may not be running."
  echo "  Check logs: journalctl -u pbx-agent -n 20"
fi
echo ""`);
  return parts.join("\n");
}

// ─── IVR Payment Initiation ─────────────────────────────────────────────────
// PBX agent calls this when a caller presses the payment digit during IVR
pbxRouter.post("/ivr-payment", async (req: Request, res: Response) => {
  try {
    const { queueId, phoneNumber, amount, campaignId, callLogId, contactId } = req.body;
    if (!queueId || !phoneNumber || !amount) {
      res.status(400).json({ error: "Missing required fields: queueId, phoneNumber, amount" });
      return;
    }

    const queueItem = await db.getCallQueueItem(queueId);
    if (!queueItem) {
      res.status(404).json({ error: "Queue item not found" });
      return;
    }

    const result = await createIvrPayment({
      userId: queueItem.userId,
      campaignId: campaignId || queueItem.campaignId || 0,
      callLogId: callLogId || queueItem.callLogId || 0,
      contactId: contactId || 0,
      phoneNumber,
      amount: Math.round(amount), // ensure integer cents
      metadata: {
        queueId,
        agentId: (req as any).pbxAgent?.agentId,
      },
    });

    res.json(result);
  } catch (err) {
    console.error("[PBX-API] IVR payment error:", err);
    res.status(500).json({ error: "Payment processing failed" });
  }
});

// ─── Recording Upload ──────────────────────────────────────────────────────
pbxRouter.post("/recording/upload", async (req: Request, res: Response) => {
  try {
    const { queueId, phoneNumber, campaignId, filename, fileSize, fileData } = req.body;
    const agent = (req as any).pbxAgent;

    if (!queueId || !filename || !fileData) {
      res.status(400).json({ error: "Missing required fields: queueId, filename, fileData" });
      return;
    }

    // Decode base64 file data
    const fileBuffer = Buffer.from(fileData, "base64");

    // Upload to S3
    const { storagePut } = await import("../storage");
    const fileKey = `recordings/call_${queueId}_${Date.now()}.wav`;
    const { url } = await storagePut(fileKey, fileBuffer, "audio/wav");

    // Save recording metadata to database
    const { getDb } = await import("../db");
    const database = await getDb();
    const { callRecordings } = await import("../../drizzle/schema");
    await database!.insert(callRecordings).values({
      userId: agent.userId || 0,
      campaignId: campaignId || null,
      callQueueId: queueId,
      phoneNumber: phoneNumber || "",
      fileName: filename,
      s3Key: fileKey,
      s3Url: url,
      mimeType: "audio/wav",
      fileSize: fileSize || fileBuffer.length,
      status: "ready",
      recordingType: "full",
      recordingStartedAt: Date.now(),
    });

    console.log(`[PBX-API] Recording saved: ${filename} (${fileBuffer.length} bytes) -> ${url}`);
    res.json({ success: true, url });
  } catch (err) {
    console.error("[PBX-API] Recording upload error:", err);
    res.status(500).json({ error: "Recording upload failed" });
  }
});

// ─── Command Result Reporting ──────────────────────────────────────────────
// PBX agent reports back after executing a call control command
pbxRouter.post("/command-result", async (req: Request, res: Response) => {
  try {
    const { commandId, success, message } = req.body;
    if (!commandId) {
      res.status(400).json({ error: "Missing commandId" });
      return;
    }
    reportCommandResult(commandId, !!success, message || undefined);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[PBX-API] Command result error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export { pbxRouter, installerRouter };
