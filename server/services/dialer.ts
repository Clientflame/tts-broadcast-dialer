import { getAMIClient } from "./ami";
import { transferAudioToFreePBX } from "./tts";
import * as db from "../db";
import type { Campaign, CallLog } from "../../drizzle/schema";

interface ActiveCampaign {
  campaign: Campaign;
  intervalId: ReturnType<typeof setInterval> | null;
  audioPath: string | null;
  callerIds: Array<{ id: number; phoneNumber: string; label: string | null }>;
  callerIdIndex: number;
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
  const campaignDetails: Array<{ id: number; name: string; activeCalls: number; pending: number; maxConcurrent: number }> = [];

  for (const campaignId of activeIds) {
    const active = activeCampaigns.get(campaignId);
    if (!active) continue;

    const stats = await db.getCampaignStats(campaignId);
    const pendingCalls = await db.getPendingCallLogs(campaignId);
    const activeCallCount = await db.getActiveCallCount(campaignId);
    const maxConcurrent = active.campaign.maxConcurrentCalls || 1;

    activeCalls += activeCallCount;
    leadsInHopper += pendingCalls.length;
    concurrentLimit += maxConcurrent;

    campaignDetails.push({
      id: campaignId,
      name: active.campaign.name,
      activeCalls: activeCallCount,
      pending: pendingCalls.length,
      maxConcurrent,
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

  // Get audio file
  let audioPath: string | null = null;
  if (campaign.audioFileId) {
    const audioFile = await db.getAudioFile(campaign.audioFileId, userId);
    if (!audioFile || !audioFile.s3Url) throw new Error("Audio file not ready");

    try {
      const result = await transferAudioToFreePBX({
        s3Url: audioFile.s3Url,
        fileName: `campaign_${campaignId}_${audioFile.id}.mp3`,
      });
      audioPath = result.remotePath;
    } catch (err) {
      console.error("[Dialer] Audio transfer failed:", err);
      throw new Error("Failed to transfer audio to FreePBX. Check SSH connectivity.");
    }
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

  const active: ActiveCampaign = {
    campaign: updatedCampaign,
    intervalId: null,
    audioPath,
    callerIds: callerIdPool,
    callerIdIndex: 0,
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

  // Check concurrent call limit
  const activeCount = await db.getActiveCallCount(campaignId);
  const maxConcurrent = campaign.maxConcurrentCalls || 1;

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

  const variables: Record<string, string> = {
    CALLID: callId,
  };

  if (active.audioPath) {
    variables.AUDIOFILE = active.audioPath;
  }

  // Determine caller ID - use DID rotation if available, otherwise campaign caller ID
  let callerIdStr: string | undefined;
  if (active.callerIds.length > 0) {
    const did = active.callerIds[active.callerIdIndex % active.callerIds.length];
    active.callerIdIndex++;
    callerIdStr = `"${did.label || "Broadcast"}" <${did.phoneNumber}>`;
    // Update the DID usage count
    db.incrementCallerIdUsage(did.id).catch(err => console.error("[Dialer] Failed to update DID usage:", err));
  } else if (active.campaign.callerIdNumber) {
    callerIdStr = `"${active.campaign.callerIdName || "Broadcast"}" <${active.campaign.callerIdNumber}>`;
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
    if (dialStatus === "ANSWER") {
      await db.updateCallLog(callLog.id, { status: "answered", answeredAt: Date.now() });
    } else if (dialStatus === "BUSY") {
      await db.updateCallLog(callLog.id, { status: "busy", endedAt: Date.now() });
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    } else if (dialStatus === "NOANSWER") {
      await db.updateCallLog(callLog.id, { status: "no-answer", endedAt: Date.now() });
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    } else if (dialStatus === "CANCEL" || dialStatus === "CONGESTION" || dialStatus === "CHANUNAVAIL") {
      await db.updateCallLog(callLog.id, { status: "failed", errorMessage: dialStatus, endedAt: Date.now() });
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
      await updateCampaignCounts(callLog.campaignId, callLog.userId);
    } else if (callLog.status === "dialing" || callLog.status === "ringing") {
      await db.updateCallLog(callLog.id, { status: "no-answer", endedAt: Date.now() });
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
