import { generatePersonalizedTTS, generateGooglePersonalizedTTS, type GoogleTTSVoice } from "./tts";
import { generateScriptAudio } from "./script-audio";
import { notifyOwner } from "../_core/notification";
import { dispatchNotification } from "./notification-dispatcher";
import { initPacing, getCurrentConcurrent, getPacingStats, cleanupPacing, type PacingConfig } from "./pacing";
import { registerPacingConfig, unregisterPacingConfig } from "./pbx-api";
import { isContactCallable, getTimezoneForPhone } from "../../shared/area-code-tz";
import { findAvailableAgent, reserveAgent, getAvailableAgentCount } from "./live-agent-tracker";
import * as db from "../db";
import type { Campaign, CallLog, ScriptSegment } from "../../drizzle/schema";

// Hopper batch size: how many call_logs to create at a time
const HOPPER_BATCH_SIZE = 150;
// Dedup window: prevent calling the same number within this many hours
const DEDUP_HOURS = 48;

// Fisher-Yates shuffle for randomizing contact order
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface ActiveCampaign {
  campaign: Campaign;
  intervalId: ReturnType<typeof setInterval> | null;
  audioS3Url: string | null;
  audioName: string | null;
  callerIds: Array<{ id: number; phoneNumber: string; label: string | null }>;
  callerIdIndex: number;
  usePersonalizedTTS: boolean;
  pacingConfig: PacingConfig;
  // Script-based campaigns
  scriptSegments: ScriptSegment[] | null;
  callbackNumber: string | null;
  useDidCallbackNumber: boolean;
  // Hopper: remaining contacts not yet converted to call_logs
  remainingContacts: Array<{ id: number; phoneNumber: string; firstName?: string | null; lastName?: string | null; company?: string | null; state?: string | null; databaseName?: string | null }>;
  totalEligible: number;
  dedupSkipped: number;
}

const activeCampaigns = new Map<number, ActiveCampaign>();

export function getActiveCampaignIds(): number[] {
  return Array.from(activeCampaigns.keys());
}

export function isCampaignActive(campaignId: number): boolean {
  return activeCampaigns.has(campaignId);
}

export async function getDialerLiveStats() {
  const activeIds = getActiveCampaignIds();
  let activeCalls = 0;
  let leadsInHopper = 0;
  let concurrentLimit = 0;
  const campaignDetails: Array<{ id: number; name: string; activeCalls: number; pending: number; pendingCallLogs: number; remainingContacts: number; totalEligible: number; dedupSkipped: number; maxConcurrent: number; pacing: any }> = [];

  for (const campaignId of activeIds) {
    const active = activeCampaigns.get(campaignId);
    if (!active) continue;

    const pendingCalls = await db.getPendingCallLogs(campaignId);
    const activeCallCount = await db.getActiveCallCount(campaignId);
    const effectiveConcurrent = getCurrentConcurrent(campaignId, active.pacingConfig);
    const pacingInfo = getPacingStats(campaignId, active.pacingConfig);

    const remainingInHopper = pendingCalls.length + active.remainingContacts.length;
    activeCalls += activeCallCount;
    leadsInHopper += remainingInHopper;
    concurrentLimit += effectiveConcurrent;

    campaignDetails.push({
      id: campaignId,
      name: active.campaign.name,
      activeCalls: activeCallCount,
      pending: remainingInHopper,
      pendingCallLogs: pendingCalls.length,
      remainingContacts: active.remainingContacts.length,
      totalEligible: active.totalEligible,
      dedupSkipped: active.dedupSkipped,
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
  const campaign = await db.getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "running") throw new Error("Campaign is already running");

  // Get audio file - store the S3 URL, PBX agent will download it
  let audioS3Url: string | null = null;
  let audioName: string | null = null;
  if (campaign.audioFileId) {
    const audioFile = await db.getAudioFile(campaign.audioFileId);
    if (!audioFile || !audioFile.s3Url) throw new Error("Audio file not ready");
    audioS3Url = audioFile.s3Url;
    audioName = `campaign_${campaignId}_${audioFile.id}`;
    console.log(`[Dialer] Audio ready: ${audioName}`);
  }

  // Get contacts and filter out DNC numbers + 48-hour dedup
  const allContacts = await db.getActiveContactsForCampaign(campaign.contactListId);
  if (allContacts.length === 0) throw new Error("No active contacts in the list");

  const dncNumbers = await db.getDncPhoneNumbers();
  const recentlyCalled = await db.getRecentlyCalledPhoneNumbers(DEDUP_HOURS);

  let dncFiltered = 0;
  let dedupSkipped = 0;
  const contactsList = allContacts.filter(c => {
    const normalized = c.phoneNumber.replace(/\D/g, "");
    if (dncNumbers.has(normalized)) { dncFiltered++; return false; }
    if (recentlyCalled.has(normalized)) { dedupSkipped++; return false; }
    return true;
  });

  if (contactsList.length === 0) {
    const reasons = [];
    if (dncFiltered > 0) reasons.push(`${dncFiltered} on DNC`);
    if (dedupSkipped > 0) reasons.push(`${dedupSkipped} called within ${DEDUP_HOURS}h`);
    throw new Error(`No eligible contacts (${reasons.join(", ")})`);
  }
  if (dncFiltered > 0) console.log(`[Dialer] Filtered ${dncFiltered} DNC numbers from campaign ${campaignId}`);
  if (dedupSkipped > 0) console.log(`[Dialer] Skipped ${dedupSkipped} numbers called within ${DEDUP_HOURS}h for campaign ${campaignId}`);

  // Randomize contact order to avoid sequential dialing patterns
  const shuffledContacts = shuffleArray(contactsList);
  console.log(`[Dialer] Shuffled ${shuffledContacts.length} contacts for random dialing order`);

  // Create only the first batch of call_logs (hopper approach)
  const firstBatch = shuffledContacts.slice(0, HOPPER_BATCH_SIZE);
  const remainingContacts = shuffledContacts.slice(HOPPER_BATCH_SIZE);

  const callLogData = firstBatch.map(contact => ({
    campaignId: campaign.id,
    contactId: contact.id,
    userId,
    phoneNumber: contact.phoneNumber,
    contactName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
    status: "pending" as const,
    attempt: 1,
  }));

  await db.bulkCreateCallLogs(callLogData);
  console.log(`[Dialer] Hopper: loaded ${firstBatch.length} of ${contactsList.length} eligible contacts (${remainingContacts.length} remaining)`);

  await db.updateCampaign(campaignId, {
    status: "running",
    totalContacts: contactsList.length,
    startedAt: Date.now(),
    completedCalls: 0,
    answeredCalls: 0,
    failedCalls: 0,
  });

  const updatedCampaign = await db.getCampaign(campaignId);
  if (!updatedCampaign) throw new Error("Campaign not found after update");

  // Load caller IDs for DID rotation
  let callerIdPool: Array<{ id: number; phoneNumber: string; label: string | null }> = [];
  if ((campaign as any).useDidRotation) {
    callerIdPool = await db.getActiveCallerIds();
    if (callerIdPool.length > 0) {
      console.log(`[Dialer] DID rotation enabled with ${callerIdPool.length} caller IDs`);
    }
  }

  // Build pacing config
  const pacingConfig: PacingConfig = {
    mode: (campaign.pacingMode as "fixed" | "adaptive" | "predictive") || "fixed",
    fixedConcurrent: campaign.maxConcurrentCalls || 1,
    targetDropRate: campaign.pacingTargetDropRate ?? 3,
    minConcurrent: campaign.pacingMinConcurrent ?? 1,
    maxConcurrent: campaign.pacingMaxConcurrent ?? 10,
    // Predictive dialer settings
    agentCount: (campaign as any).predictiveAgentCount ?? 1,
    targetWaitTime: (campaign as any).predictiveTargetWaitTime ?? 5,
    maxAbandonRate: (campaign as any).predictiveMaxAbandonRate ?? 3,
  };

  initPacing(campaignId, pacingConfig);
  registerPacingConfig(campaignId, pacingConfig);

  // Load call script if campaign uses one
  let scriptSegments: ScriptSegment[] | null = null;
  const callbackNumber = (campaign as any).callbackNumber || null;
  if ((campaign as any).scriptId) {
    const script = await db.getCallScriptById((campaign as any).scriptId);
    if (script && script.segments) {
      scriptSegments = script.segments;
      console.log(`[Dialer] Script loaded: "${script.name}" with ${scriptSegments.length} segments`);
    }
  }

  const active: ActiveCampaign = {
    campaign: updatedCampaign,
    intervalId: null,
    audioS3Url,
    audioName,
    callerIds: callerIdPool,
    callerIdIndex: 0,
    usePersonalizedTTS: !!(campaign as any).usePersonalizedTTS && !!(campaign as any).messageText,
    pacingConfig,
    scriptSegments,
    callbackNumber,
    useDidCallbackNumber: !!(campaign as any).useDidCallbackNumber,
    remainingContacts,
    totalEligible: contactsList.length,
    dedupSkipped,
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

  const campaign = await db.getCampaign(campaignId);
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

  // For live agent routing modes, also check agent availability
  const routingMode = (campaign as any).routingMode || "broadcast";
  if (routingMode === "live_agent" || routingMode === "hybrid") {
    const availableAgents = getAvailableAgentCount(campaignId);
    if (availableAgents === 0 && routingMode === "live_agent") {
      // No agents available — don't place calls in pure live_agent mode
      return;
    }
  }
  // voice_ai mode: no agent check needed — AI handles all calls

  // Get pending calls
  let pendingCalls = await db.getPendingCallLogs(campaignId);

  // Hopper refill: if pending call_logs are running low and we have remaining contacts, load next batch
  if (pendingCalls.length < maxConcurrent * 2 && active.remainingContacts.length > 0) {
    const nextBatch = active.remainingContacts.splice(0, HOPPER_BATCH_SIZE);
    const callLogData = nextBatch.map(contact => ({
      campaignId,
      contactId: contact.id,
      userId,
      phoneNumber: contact.phoneNumber,
      contactName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
      status: "pending" as const,
      attempt: 1,
    }));
    await db.bulkCreateCallLogs(callLogData);
    console.log(`[Dialer] Hopper refill: loaded ${nextBatch.length} more contacts (${active.remainingContacts.length} remaining)`);
    // Re-fetch pending calls after refill
    pendingCalls = await db.getPendingCallLogs(campaignId);
  }

  if (pendingCalls.length === 0) {
    // No more pending call_logs and no remaining contacts — check if all in-flight calls are also done
    if (active.remainingContacts.length > 0) {
      // Still have contacts to load, don't complete yet
      return;
    }
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
      // Per-contact timezone enforcement: skip contacts outside their local call window
      if ((active.campaign as any).enforceContactTimezone) {
        const tzStart = (active.campaign as any).contactTzWindowStart || "08:00";
        const tzEnd = (active.campaign as any).contactTzWindowEnd || "21:00";
        if (!isContactCallable(callLog.phoneNumber, tzStart, tzEnd)) {
          // Move back to pending so it gets retried later when the contact's timezone opens
          await db.updateCallLog(callLog.id, { status: "pending" });
          continue;
        }
      }
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

  // Determine caller ID — refresh from DB each call to respect disabled/flagged DIDs
  let callerIdStr: string | undefined;
  let callerIdNumber: string | undefined;
  if (active.callerIds.length > 0) {
    // Refresh the active caller ID pool from DB to pick up any disabled/flagged changes
    try {
      const freshPool = await db.getActiveCallerIds();
      if (freshPool.length > 0) {
        active.callerIds = freshPool;
      } else {
        // All DIDs disabled — log warning but continue with campaign's static caller ID if set
        console.warn(`[Dialer] All DIDs disabled for user ${userId} — falling back to campaign caller ID`);
        active.callerIds = [];
      }
    } catch (err) {
      console.warn("[Dialer] Failed to refresh caller ID pool:", err);
      // Continue with existing pool on error
    }
  }
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

  // AMD (Answering Machine Detection) settings
  if ((active.campaign as any).amdEnabled) {
    variables.AMD_ENABLED = "true";
    // If there's a voicemail-specific message, prepare it
    if ((active.campaign as any).voicemailAudioFileId || (active.campaign as any).voicemailMessageText) {
      variables.VOICEMAIL_DROP = "true";
    }
  }

  // Resolve callback number: use DID rotation number if enabled, otherwise static callbackNumber
  const effectiveCallbackNumber = active.useDidCallbackNumber && callerIdNumber
    ? callerIdNumber
    : active.callbackNumber;

  // Track multi-segment audio URLs for script-based campaigns
  let audioUrls: string[] | null = null;

  // Priority 1: Script-based campaigns (mixed TTS + recorded segments)
  if (active.scriptSegments && active.scriptSegments.length > 0) {
    try {
      const contact = await db.getContact(callLog.contactId);
      console.log(`[Dialer] Generating script audio for contact ${callLog.contactId} (${active.scriptSegments.length} segments)`);

      const scriptResult = await generateScriptAudio({
        segments: active.scriptSegments,
        contactData: {
          firstName: contact?.firstName,
          lastName: contact?.lastName,
          phoneNumber: callLog.phoneNumber,
          company: contact?.company,
          state: contact?.state,
          databaseName: contact?.databaseName,
        },
        callbackNumber: effectiveCallbackNumber,
        campaignId: callLog.campaignId,
        contactId: callLog.contactId,
      });

      if (scriptResult.success && scriptResult.audioUrls.length > 0) {
        audioUrls = scriptResult.audioUrls;
        // Use server-side combined URL as the primary audioUrl
        // This ensures ALL segments play even on old PBX agents without prepare_multi_audio
        if (scriptResult.combinedUrl) {
          variables.AUDIO_URL = scriptResult.combinedUrl;
        } else {
          // Fallback to first segment if server-side concat failed
          variables.AUDIO_URL = scriptResult.audioUrls[0];
        }
        variables.AUDIO_NAME = `script_${callLog.campaignId}_${callLog.contactId}`;
        console.log(`[Dialer] Script audio generated: ${scriptResult.audioUrls.length} segments, combinedUrl=${!!scriptResult.combinedUrl} for contact ${callLog.contactId}`);
      } else {
        console.error(`[Dialer] Script audio generation failed:`, scriptResult.errors);
        // Fall back to static audio if available
        if (active.audioS3Url && active.audioName) {
          variables.AUDIO_URL = active.audioS3Url;
          variables.AUDIO_NAME = active.audioName;
        }
      }
    } catch (err) {
      console.error(`[Dialer] Script audio failed for contact ${callLog.contactId}:`, err);
      if (active.audioS3Url && active.audioName) {
        variables.AUDIO_URL = active.audioS3Url;
        variables.AUDIO_NAME = active.audioName;
      }
    }
  }
  // Priority 2: Personalized TTS (single message template)
  else if (active.usePersonalizedTTS && active.campaign.messageText) {
    try {
      const contact = await db.getContact(callLog.contactId);
      const speed = parseFloat(active.campaign.ttsSpeed || "1.0");

      console.log(`[Dialer] Generating personalized TTS for contact ${callLog.contactId}`);

      const voice = active.campaign.voice || "alloy";
      const isGoogleVoice = voice.startsWith("en-US-");
      // Resolve callback number: DID rotation number or static campaign callback number
      const effectiveCallbackNumber = active.useDidCallbackNumber && callerIdNumber
        ? callerIdNumber
        : (active.campaign.callbackNumber || "");
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
        callbackNumber: effectiveCallbackNumber,
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
  }
  // Priority 3: Static pre-recorded audio
  else if (active.audioS3Url && active.audioName) {
    variables.AUDIO_URL = active.audioS3Url;
    variables.AUDIO_NAME = active.audioName;
  }

  // Prepare voicemail audio if AMD + voicemail drop is enabled
  if (variables.VOICEMAIL_DROP === "true") {
    const vmAudioFileId = (active.campaign as any).voicemailAudioFileId;
    if (vmAudioFileId) {
      try {
        const vmAudio = await db.getAudioFile(vmAudioFileId);
        if (vmAudio?.s3Url) {
          variables.VOICEMAIL_AUDIO_URL = vmAudio.s3Url;
          variables.VOICEMAIL_AUDIO_NAME = `vm_${callLog.campaignId}_${vmAudio.id}`;
        }
      } catch (err) {
        console.warn(`[Dialer] Failed to load voicemail audio:`, err);
      }
    } else if ((active.campaign as any).voicemailMessageText) {
      // Generate TTS for voicemail message on-the-fly
      try {
        const voice = active.campaign.voice || "alloy";
        const isGoogleVoice = voice.startsWith("en-US-");
        const vmTtsParams = {
          messageTemplate: (active.campaign as any).voicemailMessageText,
          voice: voice as any,
          speed: parseFloat(active.campaign.ttsSpeed || "1.0"),
          contactData: {
            firstName: callLog.contactName?.split(" ")[0],
            lastName: callLog.contactName?.split(" ").slice(1).join(" "),
            phoneNumber: callLog.phoneNumber,
          },
          callerIdNumber,
          callbackNumber: effectiveCallbackNumber || "",
          campaignId: callLog.campaignId,
          contactId: callLog.contactId,
        };
        const vmResult = isGoogleVoice
          ? await generateGooglePersonalizedTTS(vmTtsParams as any)
          : await generatePersonalizedTTS(vmTtsParams as any);
        variables.VOICEMAIL_AUDIO_URL = vmResult.s3Url;
        variables.VOICEMAIL_AUDIO_NAME = `vm_personalized_${callLog.campaignId}_${callLog.contactId}`;
      } catch (err) {
        console.warn(`[Dialer] Failed to generate voicemail TTS:`, err);
        // Fall back to main audio for voicemail
        if (variables.AUDIO_URL) {
          variables.VOICEMAIL_AUDIO_URL = variables.AUDIO_URL;
          variables.VOICEMAIL_AUDIO_NAME = variables.AUDIO_NAME || "";
        }
      }
    }
  }

  // Set routing mode and live agent transfer info
  const routingMode = (active.campaign as any).routingMode || "broadcast";
  if (routingMode === "live_agent" || routingMode === "hybrid") {
    variables.ROUTING_MODE = routingMode;
    variables.WRAP_UP_TIME = String((active.campaign as any).wrapUpTimeSecs || 30);
    // Try to find and reserve an agent for this call
    const agent = findAvailableAgent(callLog.campaignId);
    if (agent) {
      reserveAgent(agent.id, callLog.id, callLog.campaignId).catch(console.error);
      variables.TRANSFER_EXTENSION = agent.sipExtension;
      variables.AGENT_ID = String(agent.id);
      variables.AGENT_NAME = agent.name;
    } else if (routingMode === "live_agent") {
      // No agent available — skip this call for now
      await db.updateCallLog(callLog.id, { status: "pending" });
      return;
    }
    // hybrid mode: if no agent, fall through to broadcast TTS
  } else if (routingMode === "voice_ai") {
    variables.ROUTING_MODE = "voice_ai";
    // Voice AI bridge on FreePBX will handle the conversation
    // Pass the campaign's voice AI prompt ID so the bridge knows which prompt to use
    const voiceAiPromptId = (active.campaign as any).voiceAiPromptId;
    if (voiceAiPromptId) {
      variables.VOICE_AI_PROMPT_ID = String(voiceAiPromptId);
    }
    // Contact info for personalization
    variables.CONTACT_NAME = callLog.contactName || "";
    variables.CONTACT_PHONE = callLog.phoneNumber;
    variables.CAMPAIGN_NAME = active.campaign.name;
  }

  // Enqueue into call_queue for PBX agent to pick up
  // Voice AI calls use voice-ai-handler context so Asterisk routes to Stasis bridge
  const callContext = routingMode === "voice_ai" ? "voice-ai-handler" : "tts-broadcast";
  await db.enqueueCall({
    userId,
    campaignId: callLog.campaignId,
    callLogId: callLog.id,
    phoneNumber,
    channel,
    context: callContext,
    callerIdStr,
    audioUrl: variables.AUDIO_URL || null,
    audioUrls: audioUrls, // multi-segment audio URLs for PBX agent to concatenate
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
  await db.updateCampaign(campaignId, {
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
  const campaignInfo = await db.getCampaign(campaignId);
  const campaignName = campaignInfo?.name || `Campaign #${campaignId}`;
  db.isNotificationEnabled("notify_campaign_complete").then(enabled => {
    if (enabled) {
      dispatchNotification({
        title: `Campaign Completed: ${campaignName}`,
        content: `Campaign "${campaignName}" has finished.\n\nResults:\n- Total: ${stats.total}\n- Answered: ${stats.answered}\n- Failed: ${stats.failed}\n- Busy: ${stats.busy}\n- No Answer: ${stats.noAnswer}\n\nAnswer Rate: ${stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0}%`,
      }).catch(err => console.warn("[Dialer] Failed to dispatch completion notification:", err));
    }
  }).catch(() => {});
}

async function updateCampaignCounts(campaignId: number, userId: number): Promise<void> {
  const stats = await db.getCampaignStats(campaignId);
  await db.updateCampaign(campaignId, {
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
  await db.updateCampaign(campaignId, { status: "paused" });
  await db.createAuditLog({ userId, action: "campaign.pause", resource: "campaign", resourceId: campaignId });
}

export async function cancelCampaign(campaignId: number, userId: number): Promise<void> {
  stopCampaignInternal(campaignId);
  await db.updateCampaign(campaignId, { status: "cancelled", completedAt: Date.now() });
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
 * Resume a campaign after server restart by rebuilding the in-memory state.
 * Unlike startCampaign(), this doesn't re-filter contacts or create new call_logs —
 * it just restores the dialer loop so existing pending call_logs/queue items get processed.
 */
export async function resumeCampaignAfterRestart(campaignId: number, userId: number): Promise<void> {
  const campaign = await db.getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "running") throw new Error(`Campaign status is '${campaign.status}', expected 'running'`);

  // Already active in memory — skip
  if (activeCampaigns.has(campaignId)) {
    console.log(`[Dialer Recovery] Campaign ${campaignId} already active in memory — skipping`);
    return;
  }

  // Load audio file
  let audioS3Url: string | null = null;
  let audioName: string | null = null;
  if (campaign.audioFileId) {
    try {
      const audioFile = await db.getAudioFile(campaign.audioFileId);
      if (audioFile?.s3Url) {
        audioS3Url = audioFile.s3Url;
        audioName = `campaign_${campaignId}_${audioFile.id}`;
      }
    } catch (err) {
      console.warn(`[Dialer Recovery] Could not load audio for campaign ${campaignId}:`, err);
    }
  }

  // Load caller IDs
  let callerIdPool: Array<{ id: number; phoneNumber: string; label: string | null }> = [];
  if ((campaign as any).useDidRotation) {
    try {
      callerIdPool = await db.getActiveCallerIds();
    } catch (err) {
      console.warn(`[Dialer Recovery] Could not load caller IDs for campaign ${campaignId}:`, err);
    }
  }

  // Build pacing config
  const pacingConfig: PacingConfig = {
    mode: ((campaign as any).pacingMode as "fixed" | "adaptive" | "predictive") || "fixed",
    fixedConcurrent: campaign.maxConcurrentCalls || 1,
    targetDropRate: (campaign as any).pacingTargetDropRate ?? 3,
    minConcurrent: (campaign as any).pacingMinConcurrent ?? 1,
    maxConcurrent: (campaign as any).pacingMaxConcurrent ?? 10,
    // Predictive dialer settings
    agentCount: (campaign as any).predictiveAgentCount ?? 1,
    targetWaitTime: (campaign as any).predictiveTargetWaitTime ?? 5,
    maxAbandonRate: (campaign as any).predictiveMaxAbandonRate ?? 3,
  };

  initPacing(campaignId, pacingConfig);
  registerPacingConfig(campaignId, pacingConfig);

  // Load call script if campaign uses one
  let scriptSegments: ScriptSegment[] | null = null;
  const callbackNumber = (campaign as any).callbackNumber || null;
  if ((campaign as any).scriptId) {
    try {
      const script = await db.getCallScriptById((campaign as any).scriptId);
      if (script?.segments) {
        scriptSegments = script.segments;
        console.log(`[Dialer Recovery] Script loaded: "${script.name}" with ${scriptSegments.length} segments`);
      }
    } catch (err) {
      console.warn(`[Dialer Recovery] Could not load script for campaign ${campaignId}:`, err);
    }
  }

  const active: ActiveCampaign = {
    campaign,
    intervalId: null,
    audioS3Url,
    audioName,
    callerIds: callerIdPool,
    callerIdIndex: 0,
    usePersonalizedTTS: !!(campaign as any).usePersonalizedTTS && !!(campaign as any).messageText,
    pacingConfig,
    scriptSegments,
    callbackNumber,
    useDidCallbackNumber: !!(campaign as any).useDidCallbackNumber,
    // No remaining contacts — they were already loaded into call_logs before the restart
    remainingContacts: [],
    totalEligible: campaign.totalContacts || 0,
    dedupSkipped: 0,
  };

  activeCampaigns.set(campaignId, active);

  // Start the enqueue loop
  active.intervalId = setInterval(() => {
    processCampaignCalls(campaignId, userId).catch(err => {
      console.error(`[Dialer] Error processing campaign ${campaignId}:`, err);
    });
  }, 3000);

  // Trigger first batch immediately
  processCampaignCalls(campaignId, userId).catch(console.error);

  console.log(`[Dialer Recovery] Campaign ${campaignId} ("${campaign.name}") resumed — dialer loop started`);
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
        await db.updateCampaign(campaign.id, {
          status: "completed",
          completedAt: Date.now(),
          completedCalls: stats.completed,
          answeredCalls: stats.answered,
          failedCalls: stats.failed + stats.busy + stats.noAnswer,
        });
        console.log(`[Dialer Recovery] Campaign ${campaign.id} auto-completed (all calls finished)`);
        db.isNotificationEnabled("notify_campaign_auto_complete").then(enabled => {
          if (enabled) {
            dispatchNotification({
              title: `Campaign Auto-Completed: #${campaign.id}`,
              content: `Campaign #${campaign.id} was auto-completed after server restart.\n\nResults: ${stats.answered} answered, ${stats.failed + stats.busy + stats.noAnswer} failed out of ${stats.total} total calls.`,
            }).catch(err => console.warn("[Dialer Recovery] Failed to dispatch notification:", err));
          }
        }).catch(() => {});
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

        console.log(`[Dialer Recovery] Campaign ${campaign.id} has ${pendingLogCount} pending logs and ${pendingQueueCount} pending queue items — auto-resuming dialer`);

        // Auto-resume: re-register the campaign in the dialer so the PBX agent gets calls
        try {
          await resumeCampaignAfterRestart(campaign.id, campaign.userId);
          console.log(`[Dialer Recovery] Campaign ${campaign.id} successfully resumed`);
        } catch (resumeErr) {
          console.error(`[Dialer Recovery] Failed to resume campaign ${campaign.id}:`, resumeErr);
          // If resume fails, pause the campaign so user can manually restart
          await db.updateCampaign(campaign.id, { status: "paused" });
          console.log(`[Dialer Recovery] Campaign ${campaign.id} paused due to resume failure — user can restart manually`);
        }
      }
    }
  } catch (err) {
    console.error("[Dialer Recovery] Error during recovery:", err);
  }
}
