/**
 * Script Audio Service — v2.0 (Hybrid Static + Dynamic Stitching)
 * 
 * Key improvements over v1:
 * 
 * Phase 1 - Static/Dynamic Segment Splitting:
 *   - Segments WITHOUT merge fields ({{...}}) are treated as "static"
 *   - Static segments are generated ONCE and cached globally (not per-contact)
 *   - Only segments WITH merge fields generate per-contact audio
 *   - This dramatically reduces TTS API calls (e.g., 3-segment script with 1 dynamic field
 *     = 1 API call per contact instead of 3)
 * 
 * Phase 3 - Smart Caching by Rendered Text:
 *   - Dynamic segments are cached by the RENDERED text, not by contactId
 *   - If 50 contacts are named "David", TTS generates "David" only ONCE
 *   - Cache is stored in the tts_audio_cache DB table for persistence across restarts
 *   - Cache hits increment a counter for analytics
 * 
 * The PBX agent handles final stitching (ffmpeg concat) on the FreePBX server,
 * or we do server-side MP3 concatenation as fallback.
 */

import { storagePut, resolveStorageUrl } from "../storage";
import { nanoid } from "nanoid";
import type { ScriptSegment } from "../../drizzle/schema";
import {
  renderMessageTemplate,
  type TTSVoice,
  type GoogleTTSVoice,
  getOpenAIApiKey,
  getGoogleTTSApiKey,
  sanitizeTTSError,
} from "./tts";

export interface ContactData {
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string;
  company?: string | null;
  state?: string | null;
  databaseName?: string | null;
}

export interface ScriptAudioResult {
  /** Ordered list of audio URLs for the PBX agent to concatenate */
  audioUrls: string[];
  /** Single combined audio URL (all segments concatenated server-side) */
  combinedUrl: string | null;
  /** Cache key for the stitched result */
  cacheKey: string;
  /** Whether all segments were generated successfully */
  success: boolean;
  /** Error details for any failed segments */
  errors: string[];
  /** The rendered text for each TTS segment (for logging/debugging) */
  renderedTexts: string[];
  /** Stats about cache usage */
  cacheStats: {
    staticHits: number;   // segments that used global static cache
    dynamicHits: number;  // segments that hit the rendered-text cache
    generated: number;    // segments that required fresh TTS generation
  };
}

// ─── In-memory cache for static segment URLs ─────────────────────────────────
// Key: MD5 hash of (text + voice + speed + provider), Value: S3 URL
const staticSegmentCache = new Map<string, string>();

// ─── In-memory cache for dynamic rendered text URLs ──────────────────────────
// Key: MD5 hash of (renderedText + voice + speed + provider), Value: S3 URL
const dynamicTextCache = new Map<string, string>();

/**
 * Format a phone number as spoken words for TTS
 * e.g., "4075551234" -> "four zero seven, five five five, one two three four"
 */
function phoneNumberToWords(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return phone;
  
  const digitWords: Record<string, string> = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  };
  
  // Format as area code, prefix, line number with pauses
  const areaCode = digits.slice(-10, -7).split("").map(d => digitWords[d]).join(" ");
  const prefix = digits.slice(-7, -4).split("").map(d => digitWords[d]).join(" ");
  const line = digits.slice(-4).split("").map(d => digitWords[d]).join(" ");
  
  return `${areaCode}, ${prefix}, ${line}`;
}

/**
 * Build the merge variables map for a contact
 */
function buildVariables(
  contactData: ContactData,
  callbackNumber?: string | null,
): Record<string, string> {
  const variables: Record<string, string> = {
    first_name: contactData.firstName || "Valued Customer",
    last_name: contactData.lastName || "",
    full_name: [contactData.firstName, contactData.lastName].filter(Boolean).join(" ") || "Valued Customer",
    phone: contactData.phoneNumber,
    company: contactData.company || "",
    state: contactData.state || "",
    database_name: contactData.databaseName || "",
    callback_number: "",
  };

  // Format callback number for TTS (spoken digits)
  if (callbackNumber) {
    variables.callback_number = phoneNumberToWords(callbackNumber);
  }

  return variables;
}

/**
 * Check if a segment text contains merge fields ({{...}})
 */
function hasMergeFields(text: string): boolean {
  return /\{\{[^}]+\}\}/.test(text);
}

/**
 * Compute MD5 hash for cache key
 */
async function computeHash(input: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("md5").update(input).digest("hex");
}

/**
 * Look up a cached TTS audio entry in the database by text hash
 */
async function lookupDbCache(textHash: string): Promise<string | null> {
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return null;
    const { ttsAudioCache } = await import("../../drizzle/schema");
    const { eq, sql } = await import("drizzle-orm");
    
    const rows = await db.select().from(ttsAudioCache).where(eq(ttsAudioCache.textHash, textHash)).limit(1);
    if (rows.length > 0) {
      // Increment hit count and update lastUsedAt
      await db.update(ttsAudioCache)
        .set({ hitCount: sql`${ttsAudioCache.hitCount} + 1`, lastUsedAt: new Date() })
        .where(eq(ttsAudioCache.id, rows[0].id));
      
      // If the stored URL is a stale local-mode URL ("/api/storage/..."),
      // reconstruct a proper URL using the s3Key and current storage config
      let url = rows[0].s3Url;
      if (url.startsWith('/api/storage/') && rows[0].s3Key) {
        const { storageGet } = await import("../storage");
        const result = await storageGet(rows[0].s3Key);
        url = result.url;
        // Update the stale URL in the database
        await db.update(ttsAudioCache)
          .set({ s3Url: url })
          .where(eq(ttsAudioCache.id, rows[0].id));
      }
      return url;
    }
    return null;
  } catch (err) {
    // If DB lookup fails, just skip cache
    console.warn(`[ScriptAudio] DB cache lookup failed:`, err);
    return null;
  }
}

/**
 * Store a generated TTS audio entry in the database cache
 */
async function storeDbCache(params: {
  textHash: string;
  renderedText: string;
  voice: string;
  provider: string;
  speed: string;
  s3Key: string;
  s3Url: string;
}): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return;
    const { ttsAudioCache } = await import("../../drizzle/schema");
    
    await db.insert(ttsAudioCache).values({
      textHash: params.textHash,
      renderedText: params.renderedText.substring(0, 5000), // Truncate for storage
      voice: params.voice,
      provider: params.provider,
      speed: params.speed,
      s3Key: params.s3Key,
      s3Url: params.s3Url,
      hitCount: 0,
    });
  } catch (err: any) {
    // Duplicate key is fine (race condition), other errors just log
    if (!err.message?.includes("Duplicate")) {
      console.warn(`[ScriptAudio] DB cache store failed:`, err.message);
    }
  }
}

/**
 * Generate a single TTS segment audio and upload to S3
 */
async function generateTTSSegment(params: {
  text: string;
  voice: string;
  provider: "openai" | "google";
  speed: number;
  cacheKey: string;
}): Promise<{ url: string; s3Key: string }> {
  if (params.provider === "google") {
    const apiKey = await getGoogleTTSApiKey();

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: params.text },
          voice: { languageCode: "en-US", name: params.voice },
          audioConfig: { audioEncoding: "MP3", speakingRate: params.speed },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google TTS failed (${response.status}): ${sanitizeTTSError(errText)}`);
    }

    const data = await response.json();
    const audioBuffer = Buffer.from(data.audioContent, "base64");
    const { url } = await storagePut(params.cacheKey, audioBuffer, "audio/mpeg");
    return { url, s3Key: params.cacheKey };
  } else {
    // OpenAI TTS
    const apiKey = await getOpenAIApiKey();

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        input: params.text,
        voice: params.voice,
        response_format: "mp3",
        speed: params.speed,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS failed (${response.status}): ${sanitizeTTSError(errText)}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const { url } = await storagePut(params.cacheKey, audioBuffer, "audio/mpeg");
    return { url, s3Key: params.cacheKey };
  }
}

/**
 * Generate or retrieve cached audio for a TTS segment.
 * Uses a 3-tier cache: in-memory → database → generate fresh
 */
async function getOrGenerateSegmentAudio(params: {
  renderedText: string;
  voice: string;
  provider: "openai" | "google";
  speed: number;
  isStatic: boolean; // true = segment has no merge fields (global cache)
}): Promise<{ url: string; cacheHit: "memory" | "db" | "none" }> {
  const cacheInput = `${params.renderedText}|${params.voice}|${params.speed}|${params.provider}`;
  const textHash = await computeHash(cacheInput);

  // Tier 1: In-memory cache
  const memoryCache = params.isStatic ? staticSegmentCache : dynamicTextCache;
  const memCached = memoryCache.get(textHash);
  if (memCached) {
    return { url: memCached, cacheHit: "memory" };
  }

  // Tier 2: Database cache
  const dbCached = await lookupDbCache(textHash);
  if (dbCached) {
    // Promote to memory cache
    memoryCache.set(textHash, dbCached);
    return { url: dbCached, cacheHit: "db" };
  }

  // Tier 3: Generate fresh TTS
  const s3Key = params.isStatic
    ? `script-audio/static/${textHash}.mp3`
    : `script-audio/dynamic/${textHash}.mp3`;

  const { url, s3Key: finalKey } = await generateTTSSegment({
    text: params.renderedText,
    voice: params.voice,
    provider: params.provider,
    speed: params.speed,
    cacheKey: s3Key,
  });

  // Store in all cache tiers
  memoryCache.set(textHash, url);
  await storeDbCache({
    textHash,
    renderedText: params.renderedText,
    voice: params.voice,
    provider: params.provider,
    speed: String(params.speed),
    s3Key: finalKey,
    s3Url: url,
  });

  return { url, cacheHit: "none" };
}

/**
 * Generate all audio segments for a call script, personalized for a specific contact.
 * 
 * Phase 1: Static segments (no merge fields) are generated once and cached globally.
 * Phase 3: Dynamic segments are cached by rendered text, so "David" is only generated once.
 * 
 * Returns an ordered list of audio URLs that the PBX agent will concatenate.
 */
export async function generateScriptAudio(params: {
  segments: ScriptSegment[];
  contactData: ContactData;
  callbackNumber?: string | null;
  campaignId: number;
  contactId: number;
}): Promise<ScriptAudioResult> {
  const { createHash } = await import("crypto");
  const variables = buildVariables(params.contactData, params.callbackNumber);

  const audioUrls: string[] = [];
  const errors: string[] = [];
  const renderedTexts: string[] = [];
  const cacheStats = { staticHits: 0, dynamicHits: 0, generated: 0 };

  // Sort segments by position
  const sortedSegments = [...params.segments].sort((a, b) => a.position - b.position);

  for (const segment of sortedSegments) {
    try {
      if (segment.type === "tts" && segment.text) {
        const voice = segment.voice || "alloy";
        // Infer provider from voice ID if not explicitly set
        // Google voices start with "en-US-" (e.g., en-US-Wavenet-C, en-US-Neural2-A, en-US-Studio-M)
        // OpenAI voices are single words (alloy, echo, fable, onyx, nova, shimmer, ash, sage, coral)
        const inferredProvider = voice.startsWith("en-") ? "google" : "openai";
        const provider = segment.provider || inferredProvider;
        const speed = Math.max(0.25, Math.min(4.0, parseFloat(segment.speed || "1.0")));

        // Phase 1: Determine if this segment is static or dynamic
        const isStatic = !hasMergeFields(segment.text);

        // Render merge fields (for static segments, this is a no-op)
        const renderedText = renderMessageTemplate(segment.text, variables);
        renderedTexts.push(renderedText);

        // Phase 3: Get or generate audio using 3-tier cache
        const { url, cacheHit } = await getOrGenerateSegmentAudio({
          renderedText,
          voice,
          provider: provider as "openai" | "google",
          speed,
          isStatic,
        });

        audioUrls.push(url);

        // Track cache stats
        if (cacheHit === "memory" || cacheHit === "db") {
          if (isStatic) cacheStats.staticHits++;
          else cacheStats.dynamicHits++;
        } else {
          cacheStats.generated++;
        }

        const cacheLabel = cacheHit !== "none" ? ` [CACHE HIT: ${cacheHit}]` : " [GENERATED]";
        const typeLabel = isStatic ? "STATIC" : "DYNAMIC";
        console.log(`[ScriptAudio] ${typeLabel} segment ${segment.position}${cacheLabel}: "${renderedText.substring(0, 60)}..."`);

      } else if (segment.type === "recorded" && segment.audioUrl) {
        // Use the existing recorded audio URL directly
        audioUrls.push(segment.audioUrl);
        renderedTexts.push(`[Recorded: ${segment.audioName || "audio"}]`);
        console.log(`[ScriptAudio] Recorded segment ${segment.position}: ${segment.audioName}`);

      } else {
        errors.push(`Segment ${segment.position}: missing required data (type=${segment.type})`);
      }
    } catch (err: any) {
      errors.push(`Segment ${segment.position}: ${err.message}`);
      console.error(`[ScriptAudio] Error generating segment ${segment.position}:`, err.message);
    }
  }

  // Build cache key for the full stitched result
  const fullHash = createHash("md5")
    .update(audioUrls.join("|"))
    .digest("hex");
  const cacheKey = `script-stitched/c${params.campaignId}_${fullHash}.mp3`;

  // Server-side concatenation: combine all segment MP3s into a single file
  let combinedUrl: string | null = null;
  if (audioUrls.length > 1) {
    try {
      // Check if this exact combination was already stitched (memory cache)
      const stitchedCached = staticSegmentCache.get(`stitched_${fullHash}`);
      if (stitchedCached) {
        combinedUrl = stitchedCached;
        console.log(`[ScriptAudio] Stitched audio from cache: ${fullHash}`);
      } else {
        console.log(`[ScriptAudio] Concatenating ${audioUrls.length} segments server-side...`);
        const buffers: Buffer[] = [];
        for (const url of audioUrls) {
          const resp = await fetch(resolveStorageUrl(url));
          if (!resp.ok) throw new Error(`Failed to fetch segment: ${resp.status}`);
          buffers.push(Buffer.from(await resp.arrayBuffer()));
        }
        // MP3 frames are self-contained, so simple concatenation works
        const combined = Buffer.concat(buffers);
        const { url: stitchedUrl } = await storagePut(cacheKey, combined, "audio/mpeg");
        combinedUrl = stitchedUrl;
        // Cache the stitched result
        staticSegmentCache.set(`stitched_${fullHash}`, stitchedUrl);
        console.log(`[ScriptAudio] Combined audio uploaded: ${cacheKey} (${combined.length} bytes)`);
      }
    } catch (err: any) {
      console.error(`[ScriptAudio] Server-side concatenation failed: ${err.message}`);
      // Fall through — audioUrls array is still available for PBX agent concatenation
    }
  } else if (audioUrls.length === 1) {
    combinedUrl = audioUrls[0];
  }

  // Log cache efficiency
  const total = cacheStats.staticHits + cacheStats.dynamicHits + cacheStats.generated;
  if (total > 0) {
    const hitRate = ((cacheStats.staticHits + cacheStats.dynamicHits) / total * 100).toFixed(0);
    console.log(`[ScriptAudio] Contact ${params.contactId}: ${hitRate}% cache hit rate (${cacheStats.staticHits} static, ${cacheStats.dynamicHits} dynamic, ${cacheStats.generated} generated)`);
  }

  return {
    audioUrls,
    combinedUrl,
    cacheKey,
    success: errors.length === 0 && audioUrls.length > 0,
    errors,
    renderedTexts,
    cacheStats,
  };
}

/**
 * Pre-generate static segments for a script.
 * Call this when a script is saved or when a campaign starts.
 * This ensures all static segments are cached before any calls are made.
 */
export async function preGenerateStaticSegments(params: {
  segments: ScriptSegment[];
}): Promise<{ generated: number; cached: number; errors: string[] }> {
  const errors: string[] = [];
  let generated = 0;
  let cached = 0;

  const sortedSegments = [...params.segments].sort((a, b) => a.position - b.position);

  for (const segment of sortedSegments) {
    if (segment.type !== "tts" || !segment.text) continue;
        if (hasMergeFields(segment.text)) continue; // Skip dynamic segments
    const voice = segment.voice || "alloy";
    const inferredProv = voice.startsWith("en-") ? "google" : "openai";
    const provider = (segment.provider || inferredProv) as "openai" | "google";
    const speed = Math.max(0.25, Math.min(4.0, parseFloat(segment.speed || "1.0")));

    try {
      const { cacheHit } = await getOrGenerateSegmentAudio({
        renderedText: segment.text,
        voice,
        provider,
        speed,
        isStatic: true,
      });

      if (cacheHit !== "none") {
        cached++;
      } else {
        generated++;
      }
    } catch (err: any) {
      errors.push(`Segment ${segment.position}: ${err.message}`);
    }
  }

  console.log(`[ScriptAudio] Pre-generation complete: ${generated} generated, ${cached} already cached, ${errors.length} errors`);
  return { generated, cached, errors };
}

/**
 * Generate a preview of a script with sample contact data.
 * Returns audio URLs for preview playback.
 */
export async function generateScriptPreview(params: {
  segments: ScriptSegment[];
  callbackNumber?: string | null;
}): Promise<ScriptAudioResult> {
  const sampleContact: ContactData = {
    firstName: "John",
    lastName: "Smith",
    phoneNumber: "4075551234",
    company: "Acme Corp",
    state: "Florida",
  };

  return generateScriptAudio({
    segments: params.segments,
    contactData: sampleContact,
    callbackNumber: params.callbackNumber,
    campaignId: 0,
    contactId: 0,
  });
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  staticCacheSize: number;
  dynamicCacheSize: number;
} {
  return {
    staticCacheSize: staticSegmentCache.size,
    dynamicCacheSize: dynamicTextCache.size,
  };
}

/**
 * Clear in-memory caches (useful for testing or memory pressure)
 */
export function clearCaches(): void {
  staticSegmentCache.clear();
  dynamicTextCache.clear();
  console.log("[ScriptAudio] In-memory caches cleared");
}
