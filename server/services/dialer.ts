import { generatePersonalizedTTS, generateGooglePersonalizedTTS, type GoogleTTSVoice } from "./tts";
import { notifyOwner } from "../_core/notification";
import { initPacing, getCurrentConcurrent, getPacingStats, cleanupPacing, type PacingConfig } from "./pacing";
import { registerPacingConfig, unregisterPacingConfig } from "./pbx-api";
import * as db from "../db";
import type { Campaign, CallLog } from "../../drizzle/schema";

interface ActiveCampaign {
  campaign: Campaign;
  intervalId: ReturnType<typeof setInterval> | null;
  audioS3Url: string | null;
  audioName: string | null;
  callerIds: Array<{ id: number; phoneNumber: string; label: string | null }>;
  callerIdIndex: number;
  usePersonalizedTTS: boolean;
  pacingConfig: PacingConfig;
}

const activeCampaigns = new Map<number, ActiveCampaign>();

export function getActiveCampaignIds(): number[] {
  return Array.from(activeCampaigns.keys());
}

export function isCampaignActive(campaignId: number): boolean {
  return activeCampaigns.has(campaignId);
}

export async function getDialerLiveStats(userId: number) {
  const activeIds = getActiveCampaignIds();
  let activeCalls = 0;
  let leadsInHopper = 0;
  let concurrentLimit = 0;
  const campaignDetails: Array<{ id: number; name: string; activeCalls: number; pending: number; maxConcurrent: number; pacing: any }> = [];

  for (const campaignId of activeIds) {
    const active = activeCampaigns.get(campaignId);
    if (!active) continue;

    const pendingCalls = await db.getPendingCallLogs(campaignId);
    const activeCallCount = await db.getActiveCallCount(campaignId);
    const effectiveConcurrent = getCurrentConcurrent(campaignId, active.pacingConfig);
    const pacingInfo = getPacingStats(campaignId, active.pacingConfig);

    activeCalls += activeCallCount;
    leadsInHopper += pendingCalls.length;
    concurrentLimit += effectiveConcurrent;

    campaignDetails.push({
      id: campaignId,
      name: active.campaign.name,
      activeCalls: activeCallCount,
      pending: pendingCalls.length,
      maxConcurrent: effectiveConcurrent,
      pacing: pacingInfo ? {
        mode: pacingInfo.mode,
        currentConcurrent: pacingInfo.currentConcurrent,
        windowAnswerRate: pacingInfo.windowAnswerRate,
        windowDropRate: pacingInfo.windowDropRate,
        windowBusyRate: pacingInfo.windowBusyRate,
        avgAnswerRate: pacingInfo.avgAnswerRate,
        avgCallDuration: pacingInfo.avgCallDuration,
        recentAdjustments: pacingInfo.recentAdjustments,
      } : null,
    });
  }

  return {
    activeCalls,
    leadsInHopper,
    concurrentLimit,
    activeCampaignCount: activeIds.length,
    campaigns: campaignDetails,
  };
}

export async function startCampaign(campaignId: number, userId: number): Promise<void> {
  const campaign = await db.getCampaign(campaignId, userId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "running") throw new Error("Campaign is already running");

  // Get audio file - store the S3 URL, PBX agent will download it
  let audioS3Url: string | null = null;
  let audioName: string | null = null;
  if (campaign.audioFileId) {
    const audioFile = await db.getAudioFile(campaign.audioFileId, userId);
    if (!audioFile || !audioFile.s3Url) throw new Error("Audio file not ready");
    audioS3Url = audioFile.s3Url;
    audioName = `campaign_${campaignId}_${audioFile.id}`;
    console.log(`[Dialer] Audio ready: ${audioName}`);
  }

  // Get contacts and filter out DNC numbers
  const allContacts = await db.getActiveContactsForCampaign(campaign.contactListId);
  if (allContacts.length === 0) throw new Error("No active contacts in the list");

  const dncNumbers = await db.getDncPhoneNumbers(userId);
  const contactsList = allContacts.filter(c => {
    const normalized = c.phoneNumber.replace(/\D/g, "");
    return !dncNumbers.has(normalized);
  });
  const dncFiltered = allContacts.length - contactsList.length;
  if (contactsList.length === 0) throw new Error(`All ${allContacts.length} contacts are on the DNC list`);
  if (dncFiltered > 0) {
    console.log(`[Dialer] Filtered ${dncFiltered} DNC numbers from campaign ${campaignId}`);
  }

  const callLogData = contactsList.map(contact => ({
    campaignId: campaign.id,
    contactId: contact.id,
    userId,
    phoneNumber: contact.phoneNumber,
    contactName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
    status: "pending" as const,
    attempt: 1,
  }));

  await db.bulkCreateCallLogs(callLogData);

  await db.updateCampaign(campaignId, userId, {
    status: "running",
    totalContacts: contactsList.length,
    startedAt: Date.now(),
    completedCalls: 0,
    answeredCalls: 0,
    failedCalls: 0,
  });

  const updatedCampaign = await db.getCampaign(campaignId, userId);
  if (!updatedCampaign) throw new Error("Campaign not found after update");

  // Load caller IDs for DID rotation
  let callerIdPool: Array<{ id: number; phoneNumber: string; label: string | null }> = [];
  if ((campaign as any).useDidRotation) {
    callerIdPool = await db.getActiveCallerIds(userId);
    if (callerIdPool.length > 0) {
      console.log(`[Dialer] DID rotation enabled with ${callerIdPool.length} caller IDs`);
    }
  }

  // Build pacing config
  const pacingConfig: PacingConfig = {
    mode: ((campaign as any).pacingMode as "fixed" | "adaptive" | "predictive") || "fixed",
    fixedConcurrent: campaign.maxConcurrentCalls || 1,
    targetDropRate: (campaign as any).pacingTargetDropRate ?? 3,
    minConcurrent: (campaign as any).pacingMinConcurrent ?? 1,
    maxConcurrent: (campaign as any).pacingMaxConcurrent ?? 10,
  };

  initPacing(campaignId, pacingConfig);
  registerPacingConfig(campaignId, pacingConfig);

  const active: ActiveCampaign = {
    campaign: updatedCampaign,
    intervalId: null,
    audioS3Url,
    audioName,
    callerIds: callerIdPool,
    callerIdIndex: 0,
    usePersonalizedTTS: !!(campaign as any).usePersonalizedTTS && !!(campaign as any).messageText,
    pacingConfig,
  };

  activeCampaigns.set(campaignId, active);

  // Start the enqueue loop - enqueues calls into call_queue for PBX agent
  active.intervalId = setInterval(() => {
    processCampaignCalls(campaignId, userId).catch(err => {
      console.error(`[Dialer] Error processing campaign ${campaignId}:`, err);
    });
  }, 3000);

  // Trigger first batch immediately
  processCampaignCalls(campaignId, userId).catch(console.error);

  await db.createAuditLog({
    userId,
    action: "campaign.start",
    resource: "campaign",
    resourceId: campaignId,
    details: { totalContacts: contactsList.length },
  });
}

async function processCampaignCalls(campaignId: number, userId: number): Promise<void> {
  const active = activeCampaigns.get(campaignId);
  if (!active) return;

  const campaign = await db.getCampaign(campaignId, userId);
  if (!campaign || campaign.status !== "running") {
    stopCampaignInternal(campaignId);
    return;
  }

  // Check time window
  if (!isWithinTimeWindow(campaign.timeWindowStart || "09:00", campaign.timeWindowEnd || "21:00", campaign.timezone || "America/New_York")) {
    return;
  }

  // Check concurrent call limit (pacing-aware)
  const activeCount = await db.getActiveCallCount(campaignId);
  const maxConcurrent = getCurrentConcurrent(campaignId, active.pacingConfig);

  if (activeCount >= maxConcurrent) return;

  // Get pending calls
  const pendingCalls = await db.getPendingCallLogs(campaignId);
  if (pendingCalls.length === 0) {
    // No more pending call_logs — check if all in-flight calls are also done
    const stats = await db.getCampaignStats(campaignId);
    // Also check the call_queue for any pending/claimed items
    const dbInst = await db.getDb();
    let queuePending = 0;
    let queueClaimed = 0;
    if (dbInst) {
      const { callQueue: cq } = await import("../../drizzle/schema");
      const { eq, and, count: countFn } = await import("drizzle-orm");
      const qRows = await dbInst.select({ status: cq.status, cnt: countFn() })
        .from(cq)
        .where(eq(cq.campaignId, campaignId))
        .groupBy(cq.status);
      for (const r of qRows) {
        if (r.status === "pending") queuePending = r.cnt;
        if (r.status === "claimed") queueClaimed = r.cnt;
      }
    }

    if (stats.active === 0 && queuePending === 0 && queueClaimed === 0) {
      console.log(`[Dialer] Campaign ${campaignId} all leads exhausted — completing (pending=${stats.pending}, active=${stats.active}, queue_pending=${queuePending}, queue_claimed=${queueClaimed})`);
      await completeCampaign(campaignId, userId);
    } else {
      console.log(`[Dialer] Campaign ${campaignId} waiting for in-flight calls (active=${stats.active}, queue_pending=${queuePending}, queue_claimed=${queueClaimed})`);
    }
    return;
  }

  // Enqueue next batch into call_queue for PBX agent
  const slotsAvailable = maxConcurrent - activeCount;
  const callsToDial = pendingCalls.slice(0, slotsAvailable);

  for (const callLog of callsToDial) {
    try {
      await enqueueContact(callLog, active, userId);
    } catch (err) {
      console.error(`[Dialer] Failed to enqueue ${callLog.phoneNumber}:`, err);
      await db.updateCallLog(callLog.id, {
        status: "failed",
        errorMessage: (err as Error).message,
        endedAt: Date.now(),
      });
      await updateCampaignCounts(campaignId, userId);
    }
  }
}

async function enqueueContact(callLog: CallLog, active: ActiveCampaign, userId: number): Promise<void> {
  // Update status to dialing
  await db.updateCallLog(callLog.id, {
    status: "dialing",
    startedAt: Date.now(),
  });

  const phoneNumber = callLog.phoneNumber.replace(/[^0-9+]/g, "");
  const channel = `PJSIP/${phoneNumber}@vitel-outbound`;

  // Determine caller ID
  let callerIdStr: string | undefined;
  let callerIdNumber: string | undefined;
  if (active.callerIds.length > 0) {
    const did = active.callerIds[active.callerIdIndex % active.callerIds.length];
    active.callerIdIndex++;
    callerIdStr = `"${did.label || "Broadcast"}" <${did.phoneNumber}>`;
    callerIdNumber = did.phoneNumber;
    db.incrementCallerIdUsage(did.id).catch(err => console.error("[Dialer] Failed to update DID usage:", err));
  } else if (active.campaign.callerIdNumber) {
    callerIdStr = `"${active.campaign.callerIdName || "Broadcast"}" <${active.campaign.callerIdNumber}>`;
    callerIdNumber = active.campaign.callerIdNumber;
  }

  const variables: Record<string, string> = {
    CALLID: `broadcast-${callLog.campaignId}-${callLog.id}-${Date.now()}`,
  };

  // Handle personalized TTS
  if (active.usePersonalizedTTS && active.campaign.messageText) {
    try {
      const contact = await db.getContact(callLog.contactId, userId);
      const speed = parseFloat(active.campaign.ttsSpeed || "1.0");

      console.log(`[Dialer] Generating personalized TTS for contact ${callLog.contactId}`);

      const voice = active.campaign.voice || "alloy";
      const isGoogleVoice = voice.startsWith("en-US-");
      const ttsParams = {
        messageTemplate: active.campaign.messageText,
        voice: voice as any,
        speed,
        contactData: {
          firstName: contact?.firstName,
          lastName: contact?.lastName,
          phoneNumber: callLog.phoneNumber,
          company: contact?.company,
          state: contact?.state,
          databaseName: contact?.databaseName,
        },
        callerIdNumber,
        campaignId: callLog.campaignId,
        contactId: callLog.contactId,
      };
      const personalizedResult = isGoogleVoice
        ? await generateGooglePersonalizedTTS(ttsParams as any)
        : await generatePersonalizedTTS(ttsParams as any);

      const personalizedAudioName = `personalized_${callLog.campaignId}_${callLog.contactId}`;
      variables.AUDIO_URL = personalizedResult.s3Url;
      variables.AUDIO_NAME = personalizedAudioName;
    } catch (err) {
      console.error(`[Dialer] Personalized TTS failed for contact ${callLog.contactId}:`, err);
      if (active.audioS3Url && active.audioName) {
        variables.AUDIO_URL = active.audioS3Url;
        variables.AUDIO_NAME = active.audioName;
      }
    }
  } else if (active.audioS3Url && active.audioName) {
    variables.AUDIO_URL = active.audioS3Url;
    variables.AUDIO_NAME = active.audioName;
  }

  // Enqueue into call_queue for PBX agent to pick up
  await db.enqueueCall({
    userId,
    campaignId: callLog.campaignId,
    callLogId: callLog.id,
    phoneNumber,
    channel,
    context: "tts-broadcast",
    callerIdStr,
    audioUrl: variables.AUDIO_URL || null,
    audioName: variables.AUDIO_NAME || null,
    variables,
    status: "pending",
    priority: 5, // Campaign calls = normal priority
  });

  await db.updateCallLog(callLog.id, {
    asteriskCallId: variables.CALLID,
    asteriskChannel: channel,
    callerIdUsed: callerIdNumber,
  });
}

async function completeCampaign(campaignId: number, userId: number): Promise<void> {
  stopCampaignInternal(campaignId);
  const stats = await db.getCampaignStats(campaignId);
  await db.updateCampaign(campaignId, userId, {
    status: "completed",
    completedAt: Date.now(),
    completedCalls: stats.completed,
    answeredCalls: stats.answered,
    failedCalls: stats.failed + stats.busy + stats.noAnswer,
  });

  await db.createAuditLog({
    userId,
    action: "campaign.completed",
    resource: "campaign",
    resourceId: campaignId,
    details: stats,
  });

  // Notify owner
  const campaignInfo = await db.getCampaign(campaignId, userId);
  const campaignName = campaignInfo?.name || `Campaign #${campaignId}`;
  notifyOwner({
    title: `Campaign Completed: ${campaignName}`,
    content: `Campaign "${campaignName}" has finished.\n\nResults:\n- Total: ${stats.total}\n- Answered: ${stats.answered}\n- Failed: ${stats.failed}\n- Busy: ${stats.busy}\n- No Answer: ${stats.noAnswer}\n\nAnswer Rate: ${stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0}%`,
  }).catch(err => console.warn("[Dialer] Failed to send completion notification:", err));
}

async function updateCampaignCounts(campaignId: number, userId: number): Promise<void> {
  const stats = await db.getCampaignStats(campaignId);
  await db.updateCampaign(campaignId, userId, {
    completedCalls: stats.completed,
    answeredCalls: stats.answered,
    failedCalls: stats.failed + stats.busy + stats.noAnswer,
  });
}

function stopCampaignInternal(campaignId: number): void {
  const active = activeCampaigns.get(campaignId);
  if (active?.intervalId) {
    clearInterval(active.intervalId);
  }
  cleanupPacing(campaignId);
  unregisterPacingConfig(campaignId);
  activeCampaigns.delete(campaignId);
}

export async function pauseCampaign(campaignId: number, userId: number): Promise<void> {
  stopCampaignInternal(campaignId);
  await db.updateCampaign(campaignId, userId, { status: "paused" });
  await db.createAuditLog({ userId, action: "campaign.pause", resource: "campaign", resourceId: campaignId });
}

export async function cancelCampaign(campaignId: number, userId: number): Promise<void> {
  stopCampaignInternal(campaignId);
  await db.updateCampaign(campaignId, userId, { status: "cancelled", completedAt: Date.now() });
  await db.createAuditLog({ userId, action: "campaign.cancel", resource: "campaign", resourceId: campaignId });
}

function isWithinTimeWindow(start: string, end: string, timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentTime = formatter.format(now);
    return currentTime >= start && currentTime <= end;
  } catch {
    return true;
  }
}

/**
 * Recovery function: runs on server startup to handle campaigns that were
 * left in "running" state after a server restart. For each such campaign,
 * check if all calls are done (no pending call_logs and no active/claimed queue items).
 * If so, mark the campaign as completed. Otherwise, leave it in "running" for
 * manual intervention (resume or cancel).
 */
export async function recoverStaleCampaigns(): Promise<void> {
  try {
    const dbInst = await db.getDb();
    if (!dbInst) return;

    const { campaigns: campaignsTable, callLogs, callQueue } = await import("../../drizzle/schema");
    const { eq, and, inArray, count, sql } = await import("drizzle-orm");

    // Find all campaigns stuck in "running" state
    const runningCampaigns = await dbInst
      .select({ id: campaignsTable.id, userId: campaignsTable.userId })
      .from(campaignsTable)
      .where(eq(campaignsTable.status, "running"));

    if (runningCampaigns.length === 0) return;

    console.log(`[Dialer Recovery] Found ${runningCampaigns.length} campaign(s) in 'running' state after restart`);

    for (const campaign of runningCampaigns) {
      // Check if there are any pending or dialing call_logs
      const pendingLogs = await dbInst
        .select({ count: count() })
        .from(callLogs)
        .where(and(
          eq(callLogs.campaignId, campaign.id),
          inArray(callLogs.status, ["pending", "dialing"])
        ));

      // Check if there are any pending or claimed queue items
      const pendingQueue = await dbInst
        .select({ count: count() })
        .from(callQueue)
        .where(and(
          eq(callQueue.campaignId, campaign.id),
          inArray(callQueue.status, ["pending", "claimed"])
        ));

      const pendingLogCount = pendingLogs[0]?.count || 0;
      const pendingQueueCount = pendingQueue[0]?.count || 0;

      if (pendingLogCount === 0 && pendingQueueCount === 0) {
        // All calls are done — mark campaign as completed
        const stats = await db.getCampaignStats(campaign.id);
        await db.updateCampaign(campaign.id, campaign.userId, {
          status: "completed",
          completedAt: Date.now(),
          completedCalls: stats.completed,
          answeredCalls: stats.answered,
          failedCalls: stats.failed + stats.busy + stats.noAnswer,
        });
        console.log(`[Dialer Recovery] Campaign ${campaign.id} auto-completed (all calls finished)`);
        notifyOwner({
          title: `Campaign Auto-Completed: #${campaign.id}`,
          content: `Campaign #${campaign.id} was auto-completed after server restart.\n\nResults: ${stats.answered} answered, ${stats.failed + stats.busy + stats.noAnswer} failed out of ${stats.total} total calls.`,
        }).catch(err => console.warn("[Dialer Recovery] Failed to send notification:", err));
      } else {
        // There are still pending calls — mark any "dialing" call_logs as failed
        // since the server lost track of them
        await dbInst.update(callLogs).set({
          status: "failed",
          errorMessage: "Server restarted during call",
          endedAt: sql`${Date.now()}`,
        }).where(and(
          eq(callLogs.campaignId, campaign.id),
          eq(callLogs.status, "dialing")
        ));

        // Release any claimed queue items back to pending
        await dbInst.update(callQueue).set({
          status: "pending",
          claimedBy: null,
          claimedAt: null,
        }).where(and(
          eq(callQueue.campaignId, campaign.id),
          eq(callQueue.status, "claimed")
        ));

        console.log(`[Dialer Recovery] Campaign ${campaign.id} has ${pendingLogCount} pending logs and ${pendingQueueCount} pending queue items — left in 'running' for manual action`);
      }
    }
  } catch (err) {
    console.error("[Dialer Recovery] Error during recovery:", err);
  }
}
