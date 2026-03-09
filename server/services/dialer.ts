import { getAMIClient } from "./ami";
import { generatePersonalizedTTS } from "./tts";
import { initPacing, getCurrentConcurrent, recordCallResult, getPacingStats, cleanupPacing, type PacingConfig } from "./pacing";
import * as db from "../db";
import type { Campaign, CallLog, Contact } from "../../drizzle/schema";

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

    const stats = await db.getCampaignStats(campaignId);
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

  // Get audio file - PBX-side approach: just store the S3 URL, FreePBX will download it
  let audioS3Url: string | null = null;
  let audioName: string | null = null;
  if (campaign.audioFileId) {
    const audioFile = await db.getAudioFile(campaign.audioFileId, userId);
    if (!audioFile || !audioFile.s3Url) throw new Error("Audio file not ready");
    audioS3Url = audioFile.s3Url;
    audioName = `campaign_${campaignId}_${audioFile.id}`;
    console.log(`[Dialer] Audio ready for PBX-side fetch: ${audioName}`);
  }

  // Get contacts and filter out DNC numbers
  const allContacts = await db.getActiveContactsForCampaign(campaign.contactListId);
  if (allContacts.length === 0) throw new Error("No active contacts in the list");

  // Filter out DNC numbers
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

  // Update campaign
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
    } else {
      console.log(`[Dialer] DID rotation enabled but no active caller IDs found, using campaign caller ID`);
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

  // Initialize pacing engine
  initPacing(campaignId, pacingConfig);

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

  // Start the dialing loop
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
    // Check if all calls are done
    const stats = await db.getCampaignStats(campaignId);
    if (stats.active === 0) {
      await completeCampaign(campaignId, userId);
    }
    return;
  }

  // Dial next batch
  const slotsAvailable = maxConcurrent - activeCount;
  const callsToDial = pendingCalls.slice(0, slotsAvailable);

  for (const callLog of callsToDial) {
    try {
      await dialContact(callLog, active, userId);
    } catch (err) {
      console.error(`[Dialer] Failed to dial ${callLog.phoneNumber}:`, err);
      await db.updateCallLog(callLog.id, {
        status: "failed",
        errorMessage: (err as Error).message,
        endedAt: Date.now(),
      });
      await updateCampaignCounts(campaignId, userId);
    }
  }
}

async function dialContact(callLog: CallLog, active: ActiveCampaign, userId: number): Promise<void> {
  const ami = getAMIClient();

  // Update status to dialing
  await db.updateCallLog(callLog.id, {
    status: "dialing",
    startedAt: Date.now(),
  });

  const callId = `broadcast-${callLog.campaignId}-${callLog.id}-${Date.now()}`;
  const phoneNumber = callLog.phoneNumber.replace(/[^0-9+]/g, "");

  // Build the channel - use the outbound trunk
  const channel = `PJSIP/${phoneNumber}@vitel-outbound`;

  // Determine caller ID - use DID rotation if available, otherwise campaign caller ID
  let callerIdStr: string | undefined;
  let callerIdNumber: string | undefined;
  if (active.callerIds.length > 0) {
    const did = active.callerIds[active.callerIdIndex % active.callerIds.length];
    active.callerIdIndex++;
    callerIdStr = `"${did.label || "Broadcast"}" <${did.phoneNumber}>`;
    callerIdNumber = did.phoneNumber;
    // Update the DID usage count
    db.incrementCallerIdUsage(did.id).catch(err => console.error("[Dialer] Failed to update DID usage:", err));
  } else if (active.campaign.callerIdNumber) {
    callerIdStr = `"${active.campaign.callerIdName || "Broadcast"}" <${active.campaign.callerIdNumber}>`;
    callerIdNumber = active.campaign.callerIdNumber;
  }

  const variables: Record<string, string> = {
    CALLID: callId,
  };

  // Handle personalized TTS - generate unique audio per contact
  if (active.usePersonalizedTTS && active.campaign.messageText) {
    try {
      // Fetch the contact details for merge fields
      const contact = await db.getContact(callLog.contactId, userId);
      const speed = parseFloat(active.campaign.ttsSpeed || "1.0");

      console.log(`[Dialer] Generating personalized TTS for contact ${callLog.contactId} (${callLog.phoneNumber})`);

      const personalizedResult = await generatePersonalizedTTS({
        messageTemplate: active.campaign.messageText,
        voice: (active.campaign.voice as any) || "alloy",
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
      });

      // PBX-side approach: pass S3 URL directly, FreePBX downloads & converts
      const personalizedAudioName = `personalized_${callLog.campaignId}_${callLog.contactId}`;
      variables.AUDIO_URL = personalizedResult.s3Url;
      variables.AUDIO_NAME = personalizedAudioName;
      console.log(`[Dialer] Personalized TTS ready for ${callLog.phoneNumber}: "${personalizedResult.renderedText.substring(0, 80)}..."`);
    } catch (err) {
      console.error(`[Dialer] Personalized TTS failed for contact ${callLog.contactId}:`, err);
      // Fall back to static audio if available
      if (active.audioS3Url && active.audioName) {
        variables.AUDIO_URL = active.audioS3Url;
        variables.AUDIO_NAME = active.audioName;
      }
    }
  } else if (active.audioS3Url && active.audioName) {
    // Static campaign audio - pass S3 URL for PBX-side fetch
    variables.AUDIO_URL = active.audioS3Url;
    variables.AUDIO_NAME = active.audioName;
  }

  try {
    const result = await ami.originate({
      channel,
      context: "tts-broadcast",
      exten: "s",
      priority: "1",
      callerId: callerIdStr,
      timeout: 30000,
      variables,
      async: true,
    });

    await db.updateCallLog(callLog.id, {
      asteriskCallId: callId,
      asteriskChannel: channel,
      callerIdUsed: callerIdNumber,
    });

    if (result.Response === "Error") {
      throw new Error(result.Message || "Originate failed");
    }
  } catch (err) {
    await db.updateCallLog(callLog.id, {
      status: "failed",
      errorMessage: (err as Error).message,
      endedAt: Date.now(),
    });
    await updateCampaignCounts(callLog.campaignId, userId);
  }
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

// Set up AMI event listeners for call tracking
export function setupAMIEventHandlers(): void {
  const ami = getAMIClient();

  ami.on("event:Newstate", async (event) => {
    if (event.ChannelStateDesc === "Ringing" && event.Channel?.includes("broadcast")) {
      // Find call log by channel
      const callLog = await db.getCallLogByChannel(event.Channel);
      if (callLog) {
        await db.updateCallLog(callLog.id, { status: "ringing" });
      }
    }
  });

  ami.on("event:DialEnd", async (event) => {
    if (!event.DestChannel) return;
    const callLog = await db.getCallLogByChannel(event.DestChannel);
    if (!callLog) return;

    const dialStatus = event.DialStatus;
    const active = activeCampaigns.get(callLog.campaignId);
    if (dialStatus === "ANSWER") {
      await db.updateCallLog(callLog.id, { status: "answered", answeredAt: Date.now() });
      // Record for pacing
      if (active) {
        const ringTime = callLog.startedAt ? Math.floor((Date.now() - callLog.startedAt) / 1000) : undefined;
        recordCallResult(callLog.campaignId, active.pacingConfig, "answered", undefined, ringTime);
      }
    } else if (dialStatus === "BUSY") {
      await db.updateCallLog(callLog.id, { status: "busy", endedAt: Date.now() });
      if (active) recordCallResult(callLog.campaignId, active.pacingConfig, "busy");
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    } else if (dialStatus === "NOANSWER") {
      await db.updateCallLog(callLog.id, { status: "no-answer", endedAt: Date.now() });
      if (active) recordCallResult(callLog.campaignId, active.pacingConfig, "no-answer");
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    } else if (dialStatus === "CANCEL" || dialStatus === "CONGESTION" || dialStatus === "CHANUNAVAIL") {
      await db.updateCallLog(callLog.id, { status: "failed", errorMessage: dialStatus, endedAt: Date.now() });
      if (active) recordCallResult(callLog.campaignId, active.pacingConfig, "failed");
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    }
  });

  ami.on("event:Hangup", async (event) => {
    if (!event.Channel) return;
    const callLog = await db.getCallLogByChannel(event.Channel);
    if (!callLog) return;

    if (callLog.status === "answered") {
      const duration = callLog.answeredAt ? Math.floor((Date.now() - callLog.answeredAt) / 1000) : 0;
      await db.updateCallLog(callLog.id, { status: "completed", duration, endedAt: Date.now() });
      // Record call duration for predictive pacing
      const active = activeCampaigns.get(callLog.campaignId);
      if (active && duration > 0) {
        recordCallResult(callLog.campaignId, active.pacingConfig, "answered", duration);
      }
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    } else if (callLog.status === "dialing" || callLog.status === "ringing") {
      await db.updateCallLog(callLog.id, { status: "no-answer", endedAt: Date.now() });
      const active = activeCampaigns.get(callLog.campaignId);
      if (active) recordCallResult(callLog.campaignId, active.pacingConfig, "no-answer");
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    }
  });

  ami.on("event:UserEvent", async (event) => {
    if (event.UserEvent === "BroadcastDTMF" && event.CallID) {
      const parts = event.CallID.split("-");
      const callLogId = parseInt(parts[2]);
      if (!isNaN(callLogId)) {
        await db.updateCallLog(callLogId, { dtmfResponse: event.Result });
      }
    }
  });
}
