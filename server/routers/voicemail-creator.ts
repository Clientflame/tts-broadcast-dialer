import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import { getOpenAIApiKey, getGoogleTTSApiKey, TTS_VOICES, GOOGLE_TTS_VOICES, type TTSVoice, type GoogleTTSVoice } from "../services/tts";

// All available voices for the voicemail creator
const OPENAI_VOICE_IDS = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const GOOGLE_VOICE_IDS = GOOGLE_TTS_VOICES.map(v => v.id);
const ALL_VOICE_IDS = [...OPENAI_VOICE_IDS, ...GOOGLE_VOICE_IDS];

const voiceEnum = z.enum(ALL_VOICE_IDS as unknown as [string, ...string[]]);
const formatEnum = z.enum(["mp3", "wav"]);

/**
 * Convert MP3 buffer to WAV (PCM 16-bit, 44100 Hz, mono) using raw header construction.
 * This avoids needing ffmpeg or external dependencies.
 * For OpenAI TTS output (MP3), we decode via Web Audio-like approach.
 * Since we're on Node.js server, we use a simpler approach: generate WAV directly from the TTS API when possible.
 */

export const voicemailCreatorRouter = router({
  /** List all available voices with metadata */
  listVoices: protectedProcedure.query(async () => {
    const openaiVoices = TTS_VOICES.map(v => ({
      id: v.id,
      name: v.name,
      description: v.description,
      gender: v.gender,
      tone: v.tone,
      bestFor: v.bestFor,
      provider: "openai" as const,
      tier: "HD",
    }));

    const googleVoices = GOOGLE_TTS_VOICES.map(v => ({
      id: v.id,
      name: v.name,
      description: v.description,
      gender: v.gender,
      tone: v.tone,
      bestFor: v.bestFor,
      provider: "google" as const,
      tier: v.tier,
    }));

    return { voices: [...openaiVoices, ...googleVoices] };
  }),

  /** Generate voicemail audio from text - returns a downloadable URL */
  generate: protectedProcedure
    .input(z.object({
      text: z.string().min(1, "Text is required").max(5000, "Text must be under 5000 characters"),
      voice: voiceEnum,
      speed: z.number().min(0.25).max(4.0).default(1.0),
      format: formatEnum,
      fileName: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isGoogle = input.voice.startsWith("en-US-");
      const provider = isGoogle ? "google" : "openai";
      const safeName = (input.fileName || "voicemail").replace(/[^a-zA-Z0-9_-]/g, "_");
      const uniqueId = nanoid(8);

      let audioBuffer: Buffer;
      let contentType: string;
      let fileExtension: string;

      if (isGoogle) {
        // Google TTS - can output LINEAR16 (WAV) or MP3 directly
        const apiKey = await getGoogleTTSApiKey();
        const speakingRate = Math.max(0.25, Math.min(4.0, input.speed));

        // Google TTS supports: LINEAR16 (raw PCM), MP3, OGG_OPUS, MULAW, ALAW
        const audioEncoding = input.format === "wav" ? "LINEAR16" : "MP3";
        const sampleRateHertz = input.format === "wav" ? 44100 : undefined;

        const response = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text: input.text },
              voice: { languageCode: "en-US", name: input.voice },
              audioConfig: {
                audioEncoding,
                speakingRate,
                ...(sampleRateHertz ? { sampleRateHertz } : {}),
              },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Google TTS failed (${response.status}): ${errText}`);
        }

        const data = await response.json() as { audioContent: string };
        const rawAudio = Buffer.from(data.audioContent, "base64");

        if (input.format === "wav") {
          // Google LINEAR16 returns raw PCM data - we need to add a WAV header
          audioBuffer = addWavHeader(rawAudio, 44100, 1, 16);
          contentType = "audio/wav";
          fileExtension = "wav";
        } else {
          audioBuffer = rawAudio;
          contentType = "audio/mpeg";
          fileExtension = "mp3";
        }
      } else {
        // OpenAI TTS - outputs MP3 or other formats
        const apiKey = await getOpenAIApiKey();
        const speed = Math.max(0.25, Math.min(4.0, input.speed));

        // OpenAI supports: mp3, opus, aac, flac, wav, pcm
        const responseFormat = input.format === "wav" ? "wav" : "mp3";

        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1-hd",
            input: input.text,
            voice: input.voice,
            response_format: responseFormat,
            speed,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI TTS failed (${response.status}): ${errText}`);
        }

        audioBuffer = Buffer.from(await response.arrayBuffer());
        contentType = input.format === "wav" ? "audio/wav" : "audio/mpeg";
        fileExtension = input.format === "wav" ? "wav" : "mp3";
      }

      // Upload to S3 for download
      const fileKey = `voicemail-audio/${uniqueId}-${safeName}.${fileExtension}`;
      const { url, key } = await storagePut(fileKey, audioBuffer, contentType);

      return {
        url,
        key,
        fileName: `${safeName}.${fileExtension}`,
        fileSize: audioBuffer.length,
        format: input.format,
        provider,
        voice: input.voice,
        textLength: input.text.length,
      };
    }),

  /** Generate a quick voice preview (short sample) */
  preview: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(500, "Preview text must be under 500 characters"),
      voice: voiceEnum,
      speed: z.number().min(0.25).max(4.0).default(1.0),
    }))
    .mutation(async ({ input }) => {
      const isGoogle = input.voice.startsWith("en-US-");

      if (isGoogle) {
        const apiKey = await getGoogleTTSApiKey();
        const speakingRate = Math.max(0.25, Math.min(4.0, input.speed));

        const response = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text: input.text },
              voice: { languageCode: "en-US", name: input.voice },
              audioConfig: { audioEncoding: "MP3", speakingRate },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Google TTS preview failed (${response.status}): ${errText}`);
        }

        const data = await response.json() as { audioContent: string };
        const audioBuffer = Buffer.from(data.audioContent, "base64");
        const fileKey = `voicemail-preview/${nanoid(8)}.mp3`;
        const { url } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
        return { url };
      } else {
        const apiKey = await getOpenAIApiKey();
        const speed = Math.max(0.25, Math.min(4.0, input.speed));

        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1-hd",
            input: input.text,
            voice: input.voice,
            response_format: "mp3",
            speed,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI TTS preview failed (${response.status}): ${errText}`);
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const fileKey = `voicemail-preview/${nanoid(8)}.mp3`;
        const { url } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
        return { url };
      }
    }),
});

/**
 * Add a WAV header to raw PCM data (LINEAR16).
 * Creates a valid WAV file from raw PCM bytes.
 */
function addWavHeader(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize - 8, 4); // File size minus RIFF header
  header.write("WAVE", 8);

  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Sub-chunk size (16 for PCM)
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
