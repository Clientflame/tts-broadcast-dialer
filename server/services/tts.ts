import { storagePut } from "../storage";
import { nanoid } from "nanoid";

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export const TTS_VOICES: { id: TTSVoice; name: string; description: string }[] = [
  { id: "alloy", name: "Alloy", description: "Neutral and balanced" },
  { id: "echo", name: "Echo", description: "Warm and confident" },
  { id: "fable", name: "Fable", description: "Expressive and dynamic" },
  { id: "onyx", name: "Onyx", description: "Deep and authoritative" },
  { id: "nova", name: "Nova", description: "Friendly and upbeat" },
  { id: "shimmer", name: "Shimmer", description: "Clear and pleasant" },
];

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

// Generate a short voice sample for preview
export async function generateVoiceSample(voice: TTSVoice, speed: number = 1.0): Promise<{ url: string; key: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const sampleText = "Hello, this is a sample of my voice. I can help you deliver clear and professional broadcast messages to your audience.";
  const clampedSpeed = Math.max(0.25, Math.min(4.0, speed));

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
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
  const fileKey = `voice-samples/${voice}-speed${clampedSpeed}.mp3`;
  const { url, key } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
  return { url, key };
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
