/**
 * Bridge Health Check Scheduler
 * Proactively pings the PBX agent and Voice AI bridge every 5 minutes via SSH
 * and logs results to bridge_health_checks table.
 */

import { Client as SSHClient } from "ssh2";
import * as db from "../db";
import { dispatchNotification } from "./notification-dispatcher";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastBridgeStatus: "healthy" | "offline" | null = null;

async function runHealthCheck() {
  const host = process.env.FREEPBX_HOST;
  const sshUser = process.env.FREEPBX_SSH_USER;
  const sshPass = process.env.FREEPBX_SSH_PASSWORD;

  if (!host || !sshUser || !sshPass) {
    console.warn("[BridgeHealthCheck] SSH credentials not configured, skipping");
    return;
  }

  const startTime = Date.now();

  try {
    const result = await new Promise<{ agentRunning: boolean; bridgeRunning: boolean; output: string }>((resolve, reject) => {
      const conn = new SSHClient();
      let output = "";

      conn.on("ready", () => {
        // Check both pbx-agent and voice-ai-bridge services
        const cmd = `systemctl is-active pbx-agent 2>/dev/null; echo "---"; systemctl is-active voice-ai-bridge 2>/dev/null; echo "---"; curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000"`;
        conn.exec(cmd, (err, stream) => {
          if (err) { conn.end(); reject(err); return; }
          stream.on("data", (data: Buffer) => { output += data.toString(); });
          stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
          stream.on("close", () => {
            conn.end();
            const parts = output.trim().split("---").map(s => s.trim());
            const agentRunning = parts[0] === "active";
            const bridgeHealth = parts[2] || "000";
            const bridgeRunning = bridgeHealth === "200" || parts[1] === "active";
            resolve({ agentRunning, bridgeRunning, output: output.trim() });
          });
        });
      });

      conn.on("error", (err) => reject(err));

      conn.connect({
        host,
        port: 22,
        username: sshUser,
        password: sshPass,
        readyTimeout: 10000,
      });

      setTimeout(() => { conn.end(); reject(new Error("SSH timeout")); }, 15000);
    });

    const responseTime = Date.now() - startTime;
    const status = result.agentRunning && result.bridgeRunning ? "healthy" : "offline";
    const details: Record<string, any> = {
      agentRunning: result.agentRunning,
      bridgeRunning: result.bridgeRunning,
    };

    await db.createBridgeHealthCheck({
      agentId: host,
      status,
      responseTimeMs: responseTime,
      details: JSON.stringify(details),
      checkedAt: Date.now(),
    });

    // Detect status transitions
    if (lastBridgeStatus !== null && lastBridgeStatus !== status) {
      if (status === "offline") {
        dispatchNotification({
          title: "Bridge Health Check: OFFLINE",
          content: `Proactive health check detected bridge/agent offline on ${host}. Agent: ${result.agentRunning ? "running" : "stopped"}, Bridge: ${result.bridgeRunning ? "running" : "stopped"}`,
        }).catch(() => {});
      } else if (status === "healthy") {
        dispatchNotification({
          title: "Bridge Health Check: RECOVERED",
          content: `Bridge and agent on ${host} are back online. Response time: ${responseTime}ms`,
        }).catch(() => {});
      }
    }

    lastBridgeStatus = status;
    console.log(`[BridgeHealthCheck] ${host}: ${status} (${responseTime}ms) agent=${result.agentRunning} bridge=${result.bridgeRunning}`);

  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    console.error(`[BridgeHealthCheck] Error checking ${host}:`, err.message);

    await db.createBridgeHealthCheck({
      agentId: host || "unknown",
      status: "error",
      responseTimeMs: responseTime,
      errorMessage: err.message,
      checkedAt: Date.now(),
    });

    if (lastBridgeStatus === "healthy") {
      dispatchNotification({
        title: "Bridge Health Check: ERROR",
        content: `Failed to reach PBX server ${host}: ${err.message}`,
      }).catch(() => {});
    }
    lastBridgeStatus = "offline";
  }
}

export function startBridgeHealthScheduler() {
  if (intervalHandle) return;
  console.log("[BridgeHealthCheck] Started - checking every 5 minutes");
  intervalHandle = setInterval(runHealthCheck, CHECK_INTERVAL_MS);
  // Run first check after 30s
  setTimeout(runHealthCheck, 30_000);
}

export function stopBridgeHealthScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[BridgeHealthCheck] Stopped");
  }
}
