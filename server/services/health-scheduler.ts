import * as db from "../db";

const CHECK_INTERVAL_MS = 60_000; // Check every minute if any schedules are due
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Runs the scheduled health check loop.
 * Every minute, checks if any user's health check schedule is due,
 * and if so, queues health checks for all their active caller IDs.
 */
async function runScheduledChecks() {
  try {
    const dueSchedules = await db.getDueHealthCheckSchedules();
    for (const schedule of dueSchedules) {
      try {
        // Get all active (non-disabled) caller IDs for this user
        const callerIds = await db.getCallerIds(schedule.userId);
        const activeIds = callerIds.filter(c => c.isActive);
        
        if (activeIds.length === 0) {
          // No active caller IDs, just mark the run
          await db.markHealthCheckRun(schedule.userId);
          console.log(`[HealthScheduler] User ${schedule.userId}: no active caller IDs to check`);
          continue;
        }

        // Queue health checks for each active caller ID
        let queued = 0;
        for (const cid of activeIds) {
          await db.enqueueCall({
            campaignId: 0,
            phoneNumber: cid.phoneNumber,
            channel: `PJSIP/${cid.phoneNumber}@vitel-outbound`,
            callerIdStr: cid.phoneNumber,
            audioUrl: "",
            audioName: "health-check",
            variables: {
              healthCheckCallerIdId: String(cid.id),
              healthCheck: "true",
              CALLER_ID: cid.phoneNumber,
            },
            priority: 1,
            userId: schedule.userId,
          });
          queued++;
        }

        await db.markHealthCheckRun(schedule.userId);
        console.log(`[HealthScheduler] User ${schedule.userId}: queued ${queued} health checks`);
        
        await db.createAuditLog({
          userId: schedule.userId,
          action: "callerId.scheduledHealthCheck",
          resource: "callerId",
          details: { queued, intervalHours: schedule.intervalHours },
        });
      } catch (err) {
        console.error(`[HealthScheduler] Error processing schedule for user ${schedule.userId}:`, err);
      }
    }
  } catch (err) {
    console.error("[HealthScheduler] Error checking due schedules:", err);
  }
}

export function startHealthCheckScheduler() {
  if (intervalHandle) return; // Already running
  console.log("[HealthScheduler] Started - checking every 60s for due schedules");
  intervalHandle = setInterval(runScheduledChecks, CHECK_INTERVAL_MS);
  // Run once immediately on startup
  setTimeout(runScheduledChecks, 5000);
}

export function stopHealthCheckScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[HealthScheduler] Stopped");
  }
}
