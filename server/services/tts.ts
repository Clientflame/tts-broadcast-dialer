import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { Client as SSHClient } from "ssh2";

export type TTSProvider = "openai" | "google";
export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type GoogleTTSVoice = "en-US-Journey-D" | "en-US-Journey-F" | "en-US-Journey-O" | "en-US-Studio-M" | "en-US-Studio-O" | "en-US-Studio-Q" | "en-US-Neural2-A" | "en-US-Neural2-C" | "en-US-Neural2-D" | "en-US-Neural2-F" | "en-US-Neural2-H" | "en-US-Neural2-I" | "en-US-Neural2-J" | "en-US-Wavenet-A" | "en-US-Wavenet-B" | "en-US-Wavenet-C" | "en-US-Wavenet-D" | "en-US-Wavenet-E" | "en-US-Wavenet-F";

export const TTS_VOICES: { id: TTSVoice; name: string; description: string; gender: string; tone: string; bestFor: string; provider: "openai" }[] = [
  { id: "alloy", name: "Alloy", description: "Versatile and well-rounded", gender: "Neutral", tone: "Professional, composed", bestFor: "General announcements, business communications", provider: "openai" },
  { id: "echo", name: "Echo", description: "Warm baritone with gravitas", gender: "Male", tone: "Confident, reassuring", bestFor: "Financial services, legal notices, executive messaging", provider: "openai" },
  { id: "fable", name: "Fable", description: "Expressive with natural inflection", gender: "Male", tone: "Engaging, storytelling", bestFor: "Marketing campaigns, event invitations, promotions", provider: "openai" },
  { id: "onyx", name: "Onyx", description: "Deep and commanding presence", gender: "Male", tone: "Authoritative, serious", bestFor: "Urgent notices, compliance calls, collections", provider: "openai" },
  { id: "nova", name: "Nova", description: "Bright and approachable", gender: "Female", tone: "Friendly, energetic", bestFor: "Customer outreach, appointment reminders, surveys", provider: "openai" },
  { id: "shimmer", name: "Shimmer", description: "Smooth and polished", gender: "Female", tone: "Calm, professional", bestFor: "Healthcare, insurance, customer service", provider: "openai" },
];

export const GOOGLE_TTS_VOICES: { id: GoogleTTSVoice; name: string; description: string; gender: string; tone: string; bestFor: string; provider: "google"; tier: string }[] = [
  { id: "en-US-Journey-D", name: "Journey D", description: "Natural conversational male", gender: "Male", tone: "Warm, conversational", bestFor: "Customer outreach, friendly reminders", provider: "google", tier: "Journey" },
  { id: "en-US-Journey-F", name: "Journey F", description: "Natural conversational female", gender: "Female", tone: "Warm, approachable", bestFor: "Appointment reminders, customer service", provider: "google", tier: "Journey" },
  { id: "en-US-Journey-O", name: "Journey O", description: "Natural conversational female", gender: "Female", tone: "Friendly, engaging", bestFor: "Marketing campaigns, promotions", provider: "google", tier: "Journey" },
  { id: "en-US-Studio-M", name: "Studio M", description: "Professional studio male", gender: "Male", tone: "Polished, authoritative", bestFor: "Business announcements, legal notices", provider: "google", tier: "Studio" },
  { id: "en-US-Studio-O", name: "Studio O", description: "Professional studio female", gender: "Female", tone: "Clear, professional", bestFor: "Healthcare, insurance, compliance", provider: "google", tier: "Studio" },
  { id: "en-US-Studio-Q", name: "Studio Q", description: "Professional studio male", gender: "Male", tone: "Confident, commanding", bestFor: "Financial services, executive messaging", provider: "google", tier: "Studio" },
  { id: "en-US-Neural2-A", name: "Neural2 A", description: "Neural network male", gender: "Male", tone: "Natural, balanced", bestFor: "General purpose announcements", provider: "google", tier: "Neural2" },
  { id: "en-US-Neural2-C", name: "Neural2 C", description: "Neural network female", gender: "Female", tone: "Bright, clear", bestFor: "Customer outreach, surveys", provider: "google", tier: "Neural2" },
  { id: "en-US-Neural2-D", name: "Neural2 D", description: "Neural network male", gender: "Male", tone: "Deep, steady", bestFor: "Urgent notices, collections", provider: "google", tier: "Neural2" },
  { id: "en-US-Neural2-F", name: "Neural2 F", description: "Neural network female", gender: "Female", tone: "Warm, empathetic", bestFor: "Healthcare, appointment reminders", provider: "google", tier: "Neural2" },
  { id: "en-US-Wavenet-A", name: "Wavenet A", description: "WaveNet male", gender: "Male", tone: "Smooth, natural", bestFor: "General announcements", provider: "google", tier: "Wavenet" },
  { id: "en-US-Wavenet-C", name: "Wavenet C", description: "WaveNet female", gender: "Female", tone: "Pleasant, clear", bestFor: "Customer service, reminders", provider: "google", tier: "Wavenet" },
  { id: "en-US-Wavenet-D", name: "Wavenet D", description: "WaveNet male", gender: "Male", tone: "Confident, professional", bestFor: "Business communications", provider: "google", tier: "Wavenet" },
  { id: "en-US-Wavenet-F", name: "Wavenet F", description: "WaveNet female", gender: "Female", tone: "Friendly, warm", bestFor: "Marketing, promotions", provider: "google", tier: "Wavenet" },
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

  // IMPORTANT: Do NOT use storageGet() for cache checks — it returns a presigned
  // URL that expires, causing 403 errors when the PBX agent downloads later.
  // Instead, always regenerate and use storagePut() which returns a permanent public URL.
  // storagePut is idempotent (overwrites same key), so re-uploading is safe.

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

// Google Cloud TTS synthesis
export async function generateGoogleTTS(params: {
  text: string;
  voice: GoogleTTSVoice;
  name: string;
  speed?: number;
}): Promise<{ s3Url: string; s3Key: string; fileSize: number }> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("Google TTS API key not configured");

  const speakingRate = Math.max(0.25, Math.min(4.0, params.speed || 1.0));

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: params.text },
        voice: { languageCode: "en-US", name: params.voice },
        audioConfig: { audioEncoding: "MP3", speakingRate },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google TTS failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const audioBuffer = Buffer.from(data.audioContent, "base64");
  const fileKey = `tts-audio/${nanoid()}-${params.name.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`;
  const { url, key } = await storagePut(fileKey, audioBuffer, "audio/mpeg");

  return { s3Url: url, s3Key: key, fileSize: audioBuffer.length };
}

// Generate Google TTS voice sample for preview
export async function generateGoogleVoiceSample(voice: GoogleTTSVoice, speed: number = 1.0): Promise<{ url: string; key: string }> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("Google TTS API key not configured");

  const sampleText = "Hi there. I'm reaching out today because we have an important update regarding your account. We'd love to walk you through the details and answer any questions you might have. Please give us a call back at your earliest convenience.";
  const speakingRate = Math.max(0.25, Math.min(4.0, speed));

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: sampleText },
        voice: { languageCode: "en-US", name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google voice sample generation failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const audioBuffer = Buffer.from(data.audioContent, "base64");
  const fileKey = `voice-samples/google-${voice}-speed${speakingRate}.mp3`;
  const { url, key } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
  return { url, key };
}

// Generate personalized TTS using Google Cloud voices
export async function generateGooglePersonalizedTTS(params: {
  messageTemplate: string;
  voice: GoogleTTSVoice;
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
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("Google TTS API key not configured");

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

  if (variables.caller_id && /^\d{10}$/.test(variables.caller_id.replace(/\D/g, ""))) {
    const digits = variables.caller_id.replace(/\D/g, "");
    variables.caller_id = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  const renderedText = renderMessageTemplate(params.messageTemplate, variables);
  const speed = Math.max(0.25, Math.min(4.0, params.speed || 1.0));

  const { createHash } = await import("crypto");
  const cacheHash = createHash("md5").update(`${renderedText}|${params.voice}|${speed}`).digest("hex");
  const cacheKey = `tts-personalized/campaign_${params.campaignId}_contact_${params.contactId}_${cacheHash}.mp3`;

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: renderedText },
        voice: { languageCode: "en-US", name: params.voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: speed },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google TTS failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const audioBuffer = Buffer.from(data.audioContent, "base64");
  const { url, key } = await storagePut(cacheKey, audioBuffer, "audio/mpeg");

  return { s3Url: url, s3Key: key, fileSize: audioBuffer.length, renderedText };
}

/**
 * Transfer audio file to FreePBX via SSH2 (native Node.js, works in production).
 * 
 * Strategy:
 * 1. Download the MP3 from S3
 * 2. SFTP upload the MP3 to FreePBX
 * 3. Use SSH exec to convert MP3 -> WAV on FreePBX (ffmpeg is installed there)
 * 4. Set proper ownership for Asterisk
 * 5. Return the Asterisk-compatible playback path (no extension)
 */
export async function transferAudioToFreePBX(params: {
  s3Url: string;
  fileName: string;
}): Promise<{ remotePath: string }> {
  const host = process.env.FREEPBX_HOST || "45.77.75.198";
  const sshUser = process.env.FREEPBX_SSH_USER || "root";
  const sshPass = process.env.FREEPBX_SSH_PASSWORD || "";
  const sshPort = 22;

  const remoteDir = "/var/lib/asterisk/sounds/custom/broadcast";
  const remoteMp3Path = `${remoteDir}/${params.fileName}`;
  const remoteWavPath = remoteMp3Path.replace(/\.mp3$/i, ".wav");

  console.log(`[TTS Transfer] Starting transfer: ${params.fileName} -> ${host}`);

  // Step 1: Download from S3
  console.log("[TTS Transfer] Downloading from S3...");
  const response = await fetch(params.s3Url);
  if (!response.ok) {
    throw new Error(`Failed to download audio from S3 (${response.status}): ${response.statusText}`);
  }
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  console.log(`[TTS Transfer] Downloaded ${audioBuffer.length} bytes from S3`);

  if (audioBuffer.length < 100) {
    throw new Error(`Audio file too small (${audioBuffer.length} bytes) - likely not a valid audio file`);
  }

  // Step 2-5: SSH/SFTP operations
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        reject(new Error("SSH transfer timeout after 60 seconds"));
      }
    }, 60000);

    conn.on("ready", () => {
      console.log("[TTS Transfer] SSH connected, starting SFTP upload...");

      // Step 2: SFTP upload the MP3
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timeout);
          resolved = true;
          conn.end();
          return reject(new Error(`SFTP session failed: ${err.message}`));
        }

        // Ensure directory exists
        sftp.mkdir(remoteDir, (mkdirErr) => {
          // Ignore EEXIST errors
          if (mkdirErr && (mkdirErr as any).code !== 4) {
            console.log("[TTS Transfer] mkdir note:", mkdirErr.message);
          }

          // Upload the MP3 file
          const writeStream = sftp.createWriteStream(remoteMp3Path);

          writeStream.on("error", (writeErr: Error) => {
            if (!resolved) {
              clearTimeout(timeout);
              resolved = true;
              conn.end();
              reject(new Error(`SFTP write failed: ${writeErr.message}`));
            }
          });

          writeStream.on("close", () => {
            console.log(`[TTS Transfer] MP3 uploaded to ${remoteMp3Path}`);
            sftp.end();

            // Step 3: Convert MP3 to WAV on FreePBX using ffmpeg
            const convertCmd = `ffmpeg -y -i "${remoteMp3Path}" -ar 8000 -ac 1 -acodec pcm_s16le "${remoteWavPath}" 2>&1 && chown asterisk:asterisk "${remoteWavPath}" && rm -f "${remoteMp3Path}" && echo "CONVERSION_OK"`;

            console.log("[TTS Transfer] Converting MP3 to WAV on FreePBX...");
            conn.exec(convertCmd, (execErr, stream) => {
              if (execErr) {
                // If ffmpeg conversion fails, try using the MP3 directly
                console.warn("[TTS Transfer] Exec failed, trying MP3 directly:", execErr.message);
                fallbackToMp3(conn, remoteMp3Path, timeout, resolved, resolve, reject);
                return;
              }

              let output = "";
              stream.on("data", (data: Buffer) => { output += data.toString(); });
              stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });

              stream.on("close", (code: number) => {
                if (!resolved) {
                  clearTimeout(timeout);
                  resolved = true;
                  conn.end();

                  if (output.includes("CONVERSION_OK")) {
                    // WAV conversion succeeded
                    const asteriskPath = remoteWavPath
                      .replace("/var/lib/asterisk/sounds/", "")
                      .replace(/\.wav$/i, "");
                    console.log(`[TTS Transfer] Success! Asterisk path: ${asteriskPath}`);
                    resolve({ remotePath: asteriskPath });
                  } else {
                    // Conversion failed, but MP3 is already uploaded
                    // Asterisk supports MP3 playback, so use that
                    console.warn(`[TTS Transfer] WAV conversion failed (code ${code}), using MP3 directly. Output: ${output.substring(0, 200)}`);
                    const asteriskPath = remoteMp3Path
                      .replace("/var/lib/asterisk/sounds/", "")
                      .replace(/\.mp3$/i, "");
                    
                    // Set ownership on the MP3
                    const chownConn = new SSHClient();
                    chownConn.on("ready", () => {
                      chownConn.exec(`chown asterisk:asterisk "${remoteMp3Path}"`, () => {
                        chownConn.end();
                      });
                    });
                    chownConn.on("error", () => { chownConn.end(); });
                    chownConn.connect({ host, port: sshPort, username: sshUser, password: sshPass });

                    resolve({ remotePath: asteriskPath });
                  }
                }
              });
            });
          });

          // Write the audio data
          writeStream.end(audioBuffer);
        });
      });
    });

    conn.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        reject(new Error(`SSH connection failed: ${err.message}`));
      }
    });

    console.log(`[TTS Transfer] Connecting to ${sshUser}@${host}:${sshPort}...`);
    conn.connect({
      host,
      port: sshPort,
      username: sshUser,
      password: sshPass,
      readyTimeout: 15000,
      algorithms: {
        kex: [
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
        ],
      },
    });
  });
}

function fallbackToMp3(
  conn: SSHClient,
  remoteMp3Path: string,
  timeout: ReturnType<typeof setTimeout>,
  resolved: boolean,
  resolve: (v: { remotePath: string }) => void,
  reject: (e: Error) => void,
) {
  if (resolved) return;
  // Set ownership and use MP3 directly
  conn.exec(`chown asterisk:asterisk "${remoteMp3Path}" && echo "CHOWN_OK"`, (err, stream) => {
    if (err) {
      clearTimeout(timeout);
      conn.end();
      reject(new Error(`Fallback chown failed: ${err.message}`));
      return;
    }

    let output = "";
    stream.on("data", (data: Buffer) => { output += data.toString(); });
    stream.on("close", () => {
      clearTimeout(timeout);
      conn.end();
      const asteriskPath = remoteMp3Path
        .replace("/var/lib/asterisk/sounds/", "")
        .replace(/\.mp3$/i, "");
      console.log(`[TTS Transfer] Fallback MP3 path: ${asteriskPath}`);
      resolve({ remotePath: asteriskPath });
    });
  });
}
