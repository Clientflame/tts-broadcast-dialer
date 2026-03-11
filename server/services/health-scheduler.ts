import * as db from "../db";

const CHECK_INTERVAL_MS = 60_000; // Check every minute if any schedules are due
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Check if the current time is within business hours: 8am-8pm EST, Monday-Friday.
 * Uses America/New_York timezone which handles EST/EDT automatically.
 */
function isWithinBusinessHours(): boolean {
  const now = new Date();
  // Convert to Eastern Time
  const estStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const estDate = new Date(estStr);
  
  const hour = estDate.getHours();     // 0-23
  const dayOfWeek = estDate.getDay();  // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Monday (1) through Friday (5)
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  // 8am (8) through 7:59pm (19) — i.e., before 8pm (20)
  const isBusinessHour = hour >= 8 && hour < 20;
  
  return isWeekday && isBusinessHour;
}

/**
 * Runs the scheduled health check loop.
 * Every minute, checks if any user's health check schedule is due,
 * and if so, queues health checks for all their active caller IDs.
 * Only runs during business hours: 8am-8pm EST, Monday-Friday.
 */
async function runScheduledChecks() {
  try {
    // Always reactivate cooled-down DIDs regardless of business hours
    try {
      const reactivated = await db.reactivateCooledDownDids();
      if (reactivated.length > 0) {
        console.log(`[HealthScheduler] Reactivated ${reactivated.length} cooled-down DIDs: ${reactivated.map(d => d.phoneNumber).join(", ")}`);
      }
    } catch (err) {
      console.warn("[HealthScheduler] Error reactivating cooled-down DIDs:", err);
    }

    // Only run health checks during business hours (8am-8pm EST, Mon-Fri)
    if (!isWithinBusinessHours()) {
      return; // Skip health checks outside business hours
    }

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
        console.log(`[HealthScheduler] User ${schedule.userId}: queued ${queued} health checks (business hours)`);
        
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
  console.log("[HealthScheduler] Started - checking every 60s for due schedules (business hours: 8am-8pm EST, Mon-Fri)");
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

// Export for testing
export { isWithinBusinessHours };
