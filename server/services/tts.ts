import { storagePut } from "../storage";
import { nanoid } from "nanoid";

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export const TTS_VOICES: { id: TTSVoice; name: string; description: string; gender: string; tone: string; bestFor: string }[] = [
  { id: "alloy", name: "Alloy", description: "Versatile and well-rounded", gender: "Neutral", tone: "Professional, composed", bestFor: "General announcements, business communications" },
  { id: "echo", name: "Echo", description: "Warm baritone with gravitas", gender: "Male", tone: "Confident, reassuring", bestFor: "Financial services, legal notices, executive messaging" },
  { id: "fable", name: "Fable", description: "Expressive with natural inflection", gender: "Male", tone: "Engaging, storytelling", bestFor: "Marketing campaigns, event invitations, promotions" },
  { id: "onyx", name: "Onyx", description: "Deep and commanding presence", gender: "Male", tone: "Authoritative, serious", bestFor: "Urgent notices, compliance calls, collections" },
  { id: "nova", name: "Nova", description: "Bright and approachable", gender: "Female", tone: "Friendly, energetic", bestFor: "Customer outreach, appointment reminders, surveys" },
  { id: "shimmer", name: "Shimmer", description: "Smooth and polished", gender: "Female", tone: "Calm, professional", bestFor: "Healthcare, insurance, customer service" },
];

// Natural, human-like sample scripts unique to each voice personality
const VOICE_SAMPLE_SCRIPTS: Record<TTSVoice, string> = {
  alloy: "Hi there. I'm reaching out today because we have an important update regarding your account. We'd love to walk you through the details and answer any questions you might have. Please give us a call back at your earliest convenience. We appreciate your time.",
  echo: "Good afternoon. This is a courtesy call to inform you that your account requires immediate attention. We understand your time is valuable, so we've made it easy to resolve this matter. Please contact our office at your earliest convenience, and we'll be happy to assist you.",
  fable: "Hey! Great news — we've got something special lined up just for you. Whether you're looking to save on your next purchase or take advantage of an exclusive offer, we didn't want you to miss out. Give us a call and let's chat about what we can do for you.",
  onyx: "This is an important notice. Our records indicate that your account has an outstanding balance that requires your prompt attention. Please contact our office immediately to discuss your options and avoid any further action. Thank you for addressing this matter.",
  nova: "Hi! Just a friendly reminder that your appointment is coming up soon. We want to make sure everything is set and you're all good to go. If you need to reschedule or have any questions, don't hesitate to reach out. We're here to help and look forward to seeing you!",
  shimmer: "Hello. Thank you for being a valued member. I'm calling to let you know about an update to your coverage that may benefit you. We want to ensure you have all the information you need to make the best decision. Please call us back when you have a moment.",
};

export async function generateTTS(params: {
  text: string;
  voice: TTSVoice;
  name: string;
  speed?: number;
}): Promise<{ s3Url: string; s3Key: string; fileSize: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const speed = Math.max(0.25, Math.min(4.0, params.speed || 1.0));

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
      speed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${errText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const fileKey = `tts-audio/${nanoid()}-${params.name.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`;

  const { url, key } = await storagePut(fileKey, audioBuffer, "audio/mpeg");

  return {
    s3Url: url,
    s3Key: key,
    fileSize: audioBuffer.length,
  };
}

// Generate a natural-sounding voice sample for preview using HD model
export async function generateVoiceSample(voice: TTSVoice, speed: number = 1.0): Promise<{ url: string; key: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const sampleText = VOICE_SAMPLE_SCRIPTS[voice];
  const clampedSpeed = Math.max(0.25, Math.min(4.0, speed));

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: sampleText,
      voice,
      response_format: "mp3",
      speed: clampedSpeed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voice sample generation failed (${response.status}): ${errText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const fileKey = `voice-samples/${voice}-hd-speed${clampedSpeed}.mp3`;
  const { url, key } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
  return { url, key };
}

// Render a message template with contact-specific merge fields
export function renderMessageTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] || match;
  });
}

// Generate personalized TTS for a specific contact, with S3 caching
export async function generatePersonalizedTTS(params: {
  messageTemplate: string;
  voice: TTSVoice;
  speed?: number;
  contactData: {
    firstName?: string | null;
    lastName?: string | null;
    phoneNumber: string;
    company?: string | null;
    state?: string | null;
    databaseName?: string | null;
  };
  callerIdNumber?: string;
  campaignId: number;
  contactId: number;
}): Promise<{ s3Url: string; s3Key: string; fileSize: number; renderedText: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  // Build the variables map
  const variables: Record<string, string> = {
    first_name: params.contactData.firstName || "Valued Customer",
    last_name: params.contactData.lastName || "",
    full_name: [params.contactData.firstName, params.contactData.lastName].filter(Boolean).join(" ") || "Valued Customer",
    phone: params.contactData.phoneNumber,
    company: params.contactData.company || "",
    state: params.contactData.state || "",
    database_name: params.contactData.databaseName || "",
    caller_id: params.callerIdNumber || "",
  };

  // Format caller_id as phone number if it's just digits
  if (variables.caller_id && /^\d{10}$/.test(variables.caller_id.replace(/\D/g, ""))) {
    const digits = variables.caller_id.replace(/\D/g, "");
    variables.caller_id = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  const renderedText = renderMessageTemplate(params.messageTemplate, variables);
  const speed = Math.max(0.25, Math.min(4.0, params.speed || 1.0));

  // Create a cache key based on rendered text + voice + speed
  const { createHash } = await import("crypto");
  const cacheHash = createHash("md5").update(`${renderedText}|${params.voice}|${speed}`).digest("hex");
  const cacheKey = `tts-personalized/campaign_${params.campaignId}_contact_${params.contactId}_${cacheHash}.mp3`;

  // Check if already cached in S3 (by trying to get the URL)
  try {
    const { storageGet } = await import("../storage");
    const existing = await storageGet(cacheKey);
    if (existing?.url) {
      return { s3Url: existing.url, s3Key: cacheKey, fileSize: 0, renderedText };
    }
  } catch {
    // Not cached, generate fresh
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: renderedText,
      voice: params.voice,
      response_format: "mp3",
      speed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${errText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const { url, key } = await storagePut(cacheKey, audioBuffer, "audio/mpeg");

  return {
    s3Url: url,
    s3Key: key,
    fileSize: audioBuffer.length,
    renderedText,
  };
}

export async function transferAudioToFreePBX(params: {
  s3Url: string;
  fileName: string;
}): Promise<{ remotePath: string }> {
  // Download from S3 and upload to FreePBX via SSH/SCP
  // For now, we'll use the S3 URL directly with Asterisk's HTTP playback
  // or transfer via SSH when connection is available
  const remotePath = `/var/lib/asterisk/sounds/custom/broadcast/${params.fileName}`;

  try {
    // Download the audio file
    const response = await fetch(params.s3Url);
    if (!response.ok) throw new Error("Failed to download audio from S3");
    const audioData = await response.arrayBuffer();

    // Use SSH to transfer - we'll do this via a child process
    const { execSync } = await import("child_process");
    const fs = await import("fs");
    const tmpPath = `/tmp/${params.fileName}`;

    // Write to temp file
    fs.writeFileSync(tmpPath, Buffer.from(audioData));

    // Convert to WAV format for Asterisk (8kHz, mono, 16-bit)
    try {
      execSync(`which ffmpeg && ffmpeg -y -i ${tmpPath} -ar 8000 -ac 1 -acodec pcm_s16le ${tmpPath.replace('.mp3', '.wav')}`, { timeout: 30000 });
      const wavPath = tmpPath.replace('.mp3', '.wav');

      // SCP to FreePBX
      const host = process.env.FREEPBX_HOST || "45.77.75.198";
      const user = process.env.FREEPBX_SSH_USER || "root";
      const pass = process.env.FREEPBX_SSH_PASSWORD || "";
      const remoteWavPath = remotePath.replace('.mp3', '.wav');

      execSync(
        `sshpass -p '${pass}' scp -o StrictHostKeyChecking=no ${wavPath} ${user}@${host}:${remoteWavPath}`,
        { timeout: 30000 }
      );

      // Set permissions
      execSync(
        `sshpass -p '${pass}' ssh -o StrictHostKeyChecking=no ${user}@${host} "chown asterisk:asterisk ${remoteWavPath}"`,
        { timeout: 10000 }
      );

      // Cleanup
      try { fs.unlinkSync(tmpPath); fs.unlinkSync(wavPath); } catch {}

      return { remotePath: remoteWavPath.replace('/var/lib/asterisk/sounds/', '').replace('.wav', '') };
    } catch (ffmpegErr) {
      // If ffmpeg not available, try direct SCP of mp3
      const host = process.env.FREEPBX_HOST || "45.77.75.198";
      const user = process.env.FREEPBX_SSH_USER || "root";
      const pass = process.env.FREEPBX_SSH_PASSWORD || "";

      execSync(
        `sshpass -p '${pass}' scp -o StrictHostKeyChecking=no ${tmpPath} ${user}@${host}:${remotePath}`,
        { timeout: 30000 }
      );

      execSync(
        `sshpass -p '${pass}' ssh -o StrictHostKeyChecking=no ${user}@${host} "chown asterisk:asterisk ${remotePath}"`,
        { timeout: 10000 }
      );

      try { fs.unlinkSync(tmpPath); } catch {}

      return { remotePath: remotePath.replace('/var/lib/asterisk/sounds/', '').replace('.mp3', '') };
    }
  } catch (err) {
    console.error("[TTS] Failed to transfer audio to FreePBX:", err);
    throw new Error(`Failed to transfer audio to FreePBX: ${(err as Error).message}`);
  }
}
