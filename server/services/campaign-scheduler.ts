/**
 * Campaign Scheduler Service
 * Checks every 30 seconds for campaigns that are due to launch
 * and auto-starts them.
 */

import * as db from "../db";
import { startCampaign } from "./dialer";
import { dispatchNotification } from "./notification-dispatcher";

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function checkPendingSchedules() {
  try {
    const pending = await db.getPendingSchedules();
    
    for (const schedule of pending) {
      try {
        // Verify campaign still exists and is in draft/paused status
        const campaign = await db.getCampaign(schedule.campaignId);
        if (!campaign) {
          await db.updateCampaignSchedule(schedule.id, {
            status: "failed",
            errorMessage: "Campaign not found",
          });
          continue;
        }

        if (campaign.status !== "draft" && campaign.status !== "paused") {
          await db.updateCampaignSchedule(schedule.id, {
            status: "failed",
            errorMessage: `Campaign is in '${campaign.status}' status, expected 'draft' or 'paused'`,
          });
          continue;
        }

        // Launch the campaign
        console.log(`[CampaignScheduler] Auto-launching campaign #${schedule.campaignId} (scheduled at ${new Date(schedule.scheduledAt).toISOString()})`);
        await startCampaign(schedule.campaignId, schedule.userId);

        await db.updateCampaignSchedule(schedule.id, {
          status: "launched",
          launchedAt: Date.now(),
        });

        await db.createAuditLog({
          userId: schedule.userId,
          action: "campaign.scheduledLaunch",
          resource: "campaign",
          resourceId: schedule.campaignId,
          details: { scheduledAt: schedule.scheduledAt, launchedAt: Date.now() },
        });

        // Notify owner
        dispatchNotification({
          title: `Campaign Auto-Launched: ${campaign.name}`,
          content: `Campaign "${campaign.name}" (#${campaign.id}) was auto-launched as scheduled at ${new Date(schedule.scheduledAt).toLocaleString()}.`,
        }).catch(err => console.warn("[CampaignScheduler] Notification error:", err));

      } catch (err: any) {
        console.error(`[CampaignScheduler] Failed to launch campaign #${schedule.campaignId}:`, err);
        await db.updateCampaignSchedule(schedule.id, {
          status: "failed",
          errorMessage: err.message || "Unknown error",
        });

        dispatchNotification({
          title: `Scheduled Campaign Failed: #${schedule.campaignId}`,
          content: `Failed to auto-launch campaign #${schedule.campaignId}: ${err.message}`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[CampaignScheduler] Error checking pending schedules:", err);
  }
}

export function startCampaignScheduler() {
  if (intervalHandle) return;
  console.log("[CampaignScheduler] Started - checking every 30s for due campaign schedules");
  intervalHandle = setInterval(checkPendingSchedules, CHECK_INTERVAL_MS);
  // Run once after 10s on startup
  setTimeout(checkPendingSchedules, 10_000);
}

export function stopCampaignScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[CampaignScheduler] Stopped");
  }
}
