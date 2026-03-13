/**
 * Script Audio Service
 * 
 * Generates audio for call scripts by:
 * 1. Processing each segment in order
 * 2. For TTS segments: renders merge fields, generates TTS audio, uploads to S3
 * 3. For recorded segments: uses existing S3 URL
 * 4. Returns an ordered list of audio URLs that the PBX agent concatenates with ffmpeg
 * 
 * The PBX agent handles the actual stitching (ffmpeg concat) on the FreePBX server,
 * keeping the web server free of audio processing dependencies.
 */

import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import type { ScriptSegment } from "../../drizzle/schema";
import {
  renderMessageTemplate,
  type TTSVoice,
  type GoogleTTSVoice,
  getOpenAIApiKey,
  getGoogleTTSApiKey,
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
  /** Cache key for the stitched result */
  cacheKey: string;
  /** Whether all segments were generated successfully */
  success: boolean;
  /** Error details for any failed segments */
  errors: string[];
  /** The rendered text for each TTS segment (for logging/debugging) */
  renderedTexts: string[];
}

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
 * Generate a single TTS segment audio and upload to S3
 */
async function generateTTSSegment(params: {
  text: string;
  voice: string;
  provider: "openai" | "google";
  speed: number;
  cacheKey: string;
}): Promise<{ url: string }> {
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
      throw new Error(`Google TTS failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const audioBuffer = Buffer.from(data.audioContent, "base64");
    const { url } = await storagePut(params.cacheKey, audioBuffer, "audio/mpeg");
    return { url };
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
      throw new Error(`OpenAI TTS failed (${response.status}): ${errText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const { url } = await storagePut(params.cacheKey, audioBuffer, "audio/mpeg");
    return { url };
  }
}

/**
 * Generate all audio segments for a call script, personalized for a specific contact.
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

  // Sort segments by position
  const sortedSegments = [...params.segments].sort((a, b) => a.position - b.position);

  for (const segment of sortedSegments) {
    try {
      if (segment.type === "tts" && segment.text) {
        // Render merge fields
        const renderedText = renderMessageTemplate(segment.text, variables);
        renderedTexts.push(renderedText);

        const voice = segment.voice || "alloy";
        const provider = segment.provider || "openai";
        const speed = Math.max(0.25, Math.min(4.0, parseFloat(segment.speed || "1.0")));

        // Create deterministic cache key
        const hash = createHash("md5")
          .update(`${renderedText}|${voice}|${speed}|${provider}`)
          .digest("hex");
        const cacheKey = `script-audio/c${params.campaignId}_ct${params.contactId}_seg${segment.position}_${hash}.mp3`;

        const { url } = await generateTTSSegment({
          text: renderedText,
          voice,
          provider,
          speed,
          cacheKey,
        });

        audioUrls.push(url);
        console.log(`[ScriptAudio] TTS segment ${segment.position} generated: "${renderedText.substring(0, 60)}..."`);

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
  const cacheKey = `script-stitched/c${params.campaignId}_ct${params.contactId}_${fullHash}`;

  return {
    audioUrls,
    cacheKey,
    success: errors.length === 0 && audioUrls.length > 0,
    errors,
    renderedTexts,
  };
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
