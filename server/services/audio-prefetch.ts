/**
 * Audio Prefetch Service — Lookahead Pre-Generation
 * 
 * Generates personalized TTS audio for the next batch of contacts AHEAD of the
 * dialer loop. This eliminates TTS latency at dial time since audio is already
 * cached in S3 when the dialer needs it.
 * 
 * How it works:
 * 1. When a campaign starts, this service begins pre-generating audio for contacts
 *    in the hopper that haven't been processed yet.
 * 2. It runs as a background worker with configurable concurrency (default: 3 parallel generations).
 * 3. The existing 3-tier cache (memory → DB → generate) in script-audio.ts means
 *    duplicate names/texts are only generated once.
 * 4. When the dialer's enqueueContact() runs, it hits the cache instead of waiting for TTS.
 * 
 * Integration:
 * - Called from dialer.ts startCampaign() after the campaign is initialized
 * - Automatically stops when campaign pauses/completes/cancels
 * - Respects rate limits to avoid overwhelming TTS APIs
 */

import { generateScriptAudio } from "./script-audio";
import { generatePersonalizedTTS, generateGooglePersonalizedTTS } from "./tts";
import * as db from "../db";
import type { ScriptSegment } from "../../drizzle/schema";

// Track active prefetch workers per campaign
const activePrefetchers = new Map<number, { running: boolean; generated: number; cached: number; errors: number }>();

// Concurrency control: max parallel TTS generations per campaign
const MAX_PREFETCH_CONCURRENCY = 3;
// How far ahead to pre-generate (number of contacts)
const PREFETCH_LOOKAHEAD = 50;
// Delay between batches to avoid API rate limits (ms)
const BATCH_DELAY_MS = 500;

export interface PrefetchConfig {
  campaignId: number;
  userId: number;
  usePersonalizedTTS: boolean;
  messageText?: string | null;
  voice?: string;
  speed?: number;
  scriptSegments?: ScriptSegment[] | null;
  callbackNumber?: string | null;
  useDidCallbackNumber?: boolean;
  callerIdNumber?: string;
}

/**
 * Start the prefetch worker for a campaign.
 * Generates audio for the next PREFETCH_LOOKAHEAD contacts in the pending queue.
 */
export async function startPrefetch(config: PrefetchConfig): Promise<void> {
  const { campaignId } = config;

  // Don't start if already running
  if (activePrefetchers.has(campaignId) && activePrefetchers.get(campaignId)!.running) {
    return;
  }

  const stats = { running: true, generated: 0, cached: 0, errors: 0 };
  activePrefetchers.set(campaignId, stats);

  console.log(`[AudioPrefetch] Starting lookahead pre-generation for campaign ${campaignId}`);

  // Run in background — don't block the caller
  prefetchLoop(config, stats).catch(err => {
    console.error(`[AudioPrefetch] Fatal error in campaign ${campaignId}:`, err);
    stats.running = false;
  });
}

/**
 * Stop the prefetch worker for a campaign.
 */
export function stopPrefetch(campaignId: number): void {
  const stats = activePrefetchers.get(campaignId);
  if (stats) {
    stats.running = false;
    console.log(`[AudioPrefetch] Stopped campaign ${campaignId} (generated=${stats.generated}, cached=${stats.cached}, errors=${stats.errors})`);
    activePrefetchers.delete(campaignId);
  }
}

/**
 * Get prefetch stats for a campaign.
 */
export function getPrefetchStats(campaignId: number) {
  return activePrefetchers.get(campaignId) || null;
}

/**
 * Get all active prefetch stats.
 */
export function getAllPrefetchStats() {
  const result: Record<number, { generated: number; cached: number; errors: number }> = {};
  activePrefetchers.forEach((stats, id) => {
    result[id] = { generated: stats.generated, cached: stats.cached, errors: stats.errors };
  });
  return result;
}

/**
 * The main prefetch loop — runs continuously until campaign stops.
 */
async function prefetchLoop(config: PrefetchConfig, stats: { running: boolean; generated: number; cached: number; errors: number }): Promise<void> {
  const { campaignId } = config;

  while (stats.running) {
    try {
      // Get the next batch of pending call logs that need audio
      const pendingCalls = await db.getPendingCallLogs(campaignId);
      
      if (pendingCalls.length === 0) {
        // No pending calls — wait and check again
        await sleep(5000);
        continue;
      }

      // Take the next PREFETCH_LOOKAHEAD contacts
      const batch = pendingCalls.slice(0, PREFETCH_LOOKAHEAD);

      // Process in parallel with concurrency limit
      const chunks = chunkArray(batch, MAX_PREFETCH_CONCURRENCY);

      for (const chunk of chunks) {
        if (!stats.running) break;

        await Promise.allSettled(
          chunk.map(async (callLog) => {
            if (!stats.running) return;
            try {
              await prefetchContactAudio(config, callLog, stats);
            } catch (err: any) {
              stats.errors++;
              // Don't log every error — just count them
              if (stats.errors <= 5 || stats.errors % 50 === 0) {
                console.warn(`[AudioPrefetch] Error for contact ${callLog.contactId}: ${err.message}`);
              }
            }
          })
        );

        // Small delay between chunks to avoid rate limiting
        if (stats.running) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      // After processing the batch, wait before checking for more
      await sleep(3000);

    } catch (err: any) {
      console.error(`[AudioPrefetch] Loop error for campaign ${campaignId}: ${err.message}`);
      await sleep(5000);
    }
  }
}

/**
 * Pre-generate audio for a single contact.
 * This calls the same TTS functions that enqueueContact uses,
 * so the result is cached and ready when the dialer needs it.
 */
async function prefetchContactAudio(
  config: PrefetchConfig,
  callLog: { id: number; contactId: number; phoneNumber: string; contactName?: string | null },
  stats: { generated: number; cached: number; errors: number }
): Promise<void> {
  const contact = await db.getContact(callLog.contactId);
  if (!contact) return;

  const contactData = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    phoneNumber: callLog.phoneNumber,
    company: contact.company,
    state: contact.state,
    databaseName: contact.databaseName,
  };

  // Script-based campaigns
  if (config.scriptSegments && config.scriptSegments.length > 0) {
    const result = await generateScriptAudio({
      segments: config.scriptSegments,
      contactData,
      callbackNumber: config.callbackNumber,
      campaignId: config.campaignId,
      contactId: callLog.contactId,
    });

    if (result.success) {
      // Check if it was a cache hit or fresh generation
      const totalHits = result.cacheStats.staticHits + result.cacheStats.dynamicHits;
      if (result.cacheStats.generated > 0) {
        stats.generated++;
      } else {
        stats.cached++;
      }
    } else {
      stats.errors++;
    }
    return;
  }

  // Personalized TTS (single message template)
  if (config.usePersonalizedTTS && config.messageText) {
    const voice = config.voice || "alloy";
    const speed = config.speed || 1.0;
    const isGoogleVoice = voice.startsWith("en-US-");

    const ttsParams = {
      messageTemplate: config.messageText,
      voice: voice as any,
      speed,
      contactData,
      callerIdNumber: config.callerIdNumber,
      callbackNumber: config.callbackNumber || "",
      campaignId: config.campaignId,
      contactId: callLog.contactId,
    };

    if (isGoogleVoice) {
      await generateGooglePersonalizedTTS(ttsParams as any);
    } else {
      await generatePersonalizedTTS(ttsParams as any);
    }

    stats.generated++;
    return;
  }

  // Static audio — nothing to prefetch
  stats.cached++;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
