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
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const apiUrl = `${protocol}://${host}/api/pbx`;
  const maxCalls = agent.maxCalls ?? 10;
  const agentName = agent.name || "pbx-agent";

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
  const script = generateInstallerScript(apiUrl, apiKey, maxCalls, agentName, agentScript);

  res.setHeader("Content-Type", "text/plain");
  res.send(script);
});

function generateInstallerScript(apiUrl: string, apiKey: string, maxCalls: number, agentName: string, agentScript: string): string {
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
Environment=AMI_PORT=5038
Environment=AMI_USER=broadcast_dialer
Environment=AMI_SECRET=Br0adcast!D1aler2024
Environment=POLL_INTERVAL=3
Environment=MAX_CONCURRENT=${maxCalls}

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

export { pbxRouter, installerRouter };
