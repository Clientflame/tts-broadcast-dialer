import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import { getOpenAIApiKey, getGoogleTTSApiKey, TTS_VOICES, GOOGLE_TTS_VOICES, type TTSVoice, type GoogleTTSVoice, transferAudioToFreePBX } from "../services/tts";
import * as db from "../db";
import { resolveStorageUrl } from "../storage";

// All available voices for the voicemail creator
const OPENAI_VOICE_IDS = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
const GOOGLE_VOICE_IDS = GOOGLE_TTS_VOICES.map(v => v.id);
const ALL_VOICE_IDS = [...OPENAI_VOICE_IDS, ...GOOGLE_VOICE_IDS];

const voiceEnum = z.enum(ALL_VOICE_IDS as unknown as [string, ...string[]]);
const formatEnum = z.enum(["mp3", "wav"]);

// ─── Shared TTS generation helper ──────────────────────────────────────────

async function generateTTSAudio(params: {
  text: string;
  voice: string;
  speed: number;
  format: "mp3" | "wav";
}): Promise<{ audioBuffer: Buffer; contentType: string; fileExtension: string; provider: "openai" | "google" }> {
  const isGoogle = params.voice.startsWith("en-US-");
  const provider = isGoogle ? "google" : "openai";

  let audioBuffer: Buffer;
  let contentType: string;
  let fileExtension: string;

  if (isGoogle) {
    const apiKey = await getGoogleTTSApiKey();
    const speakingRate = Math.max(0.25, Math.min(4.0, params.speed));
    const audioEncoding = params.format === "wav" ? "LINEAR16" : "MP3";
    const sampleRateHertz = params.format === "wav" ? 44100 : undefined;

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: params.text },
          voice: { languageCode: "en-US", name: params.voice },
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

    if (params.format === "wav") {
      audioBuffer = addWavHeader(rawAudio, 44100, 1, 16);
      contentType = "audio/wav";
      fileExtension = "wav";
    } else {
      audioBuffer = rawAudio;
      contentType = "audio/mpeg";
      fileExtension = "mp3";
    }
  } else {
    const apiKey = await getOpenAIApiKey();
    const speed = Math.max(0.25, Math.min(4.0, params.speed));
    const responseFormat = params.format === "wav" ? "wav" : "mp3";

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
        response_format: responseFormat,
        speed,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS failed (${response.status}): ${errText}`);
    }

    audioBuffer = Buffer.from(await response.arrayBuffer());
    contentType = params.format === "wav" ? "audio/wav" : "audio/mpeg";
    fileExtension = params.format === "wav" ? "wav" : "mp3";
  }

  return { audioBuffer, contentType, fileExtension, provider };
}

// ─── Router ────────────────────────────────────────────────────────────────

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
      saveToLibrary: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const safeName = (input.fileName || "voicemail").replace(/[^a-zA-Z0-9_-]/g, "_");
      const uniqueId = nanoid(8);

      const { audioBuffer, contentType, fileExtension, provider } = await generateTTSAudio({
        text: input.text,
        voice: input.voice,
        speed: input.speed,
        format: input.format,
      });

      const fileKey = `voicemail-audio/${uniqueId}-${safeName}.${fileExtension}`;
      const { url, key } = await storagePut(fileKey, audioBuffer, contentType);

      // Estimate duration: ~150 words/min at 1x speed
      const wordCount = input.text.trim().split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / (150 * input.speed) * 60);

      // Auto-save to library if requested
      let libraryId: number | undefined;
      if (input.saveToLibrary) {
        const result = await db.createVoicemailLibraryEntry({
          userId: ctx.user.id,
          name: input.fileName || "Voicemail",
          text: input.text,
          voice: input.voice,
          provider,
          speed: String(input.speed),
          format: input.format,
          s3Url: url,
          s3Key: key,
          fileSize: audioBuffer.length,
          duration: estimatedDuration,
        });
        libraryId = result.id;
      }

      return {
        url,
        key,
        fileName: `${safeName}.${fileExtension}`,
        fileSize: audioBuffer.length,
        format: input.format,
        provider,
        voice: input.voice,
        textLength: input.text.length,
        libraryId,
        estimatedDuration,
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
      const { audioBuffer } = await generateTTSAudio({
        text: input.text,
        voice: input.voice,
        speed: input.speed,
        format: "mp3",
      });

      const fileKey = `voicemail-preview/${nanoid(8)}.mp3`;
      const { url } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
      return { url };
    }),

  // ─── Batch Multi-Voice Generation ──────────────────────────────────────

  /** Generate the same text across multiple voices at once */
  batchGenerate: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(5000),
      voices: z.array(voiceEnum).min(2, "Select at least 2 voices").max(10, "Maximum 10 voices per batch"),
      speed: z.number().min(0.25).max(4.0).default(1.0),
      format: formatEnum,
      saveToLibrary: z.boolean().default(false),
      baseName: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const baseName = (input.baseName || "voicemail").replace(/[^a-zA-Z0-9_-]/g, "_");
      const wordCount = input.text.trim().split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / (150 * input.speed) * 60);

      const results: Array<{
        voice: string;
        voiceName: string;
        provider: "openai" | "google";
        url: string;
        key: string;
        fileName: string;
        fileSize: number;
        libraryId?: number;
        status: "success" | "failed";
        error?: string;
      }> = [];

      // Process voices sequentially to avoid rate limiting
      for (const voice of input.voices) {
        const voiceInfo = [...TTS_VOICES, ...GOOGLE_TTS_VOICES].find(v => v.id === voice);
        const voiceName = voiceInfo?.name || voice;

        try {
          const { audioBuffer, contentType, fileExtension, provider } = await generateTTSAudio({
            text: input.text,
            voice,
            speed: input.speed,
            format: input.format,
          });

          const uniqueId = nanoid(8);
          const safeName = `${baseName}_${voice.replace(/[^a-zA-Z0-9]/g, "_")}`;
          const fileKey = `voicemail-audio/${uniqueId}-${safeName}.${fileExtension}`;
          const { url, key } = await storagePut(fileKey, audioBuffer, contentType);

          let libraryId: number | undefined;
          if (input.saveToLibrary) {
            const result = await db.createVoicemailLibraryEntry({
              userId: ctx.user.id,
              name: `${input.baseName || "Voicemail"} (${voiceName})`,
              text: input.text,
              voice,
              provider,
              speed: String(input.speed),
              format: input.format,
              s3Url: url,
              s3Key: key,
              fileSize: audioBuffer.length,
              duration: estimatedDuration,
            });
            libraryId = result.id;
          }

          results.push({
            voice,
            voiceName,
            provider,
            url,
            key,
            fileName: `${safeName}.${fileExtension}`,
            fileSize: audioBuffer.length,
            libraryId,
            status: "success",
          });
        } catch (err: any) {
          console.error(`[VoicemailCreator] Batch generation failed for voice ${voice}:`, err.message);
          results.push({
            voice,
            voiceName,
            provider: voice.startsWith("en-US-") ? "google" : "openai",
            url: "",
            key: "",
            fileName: "",
            fileSize: 0,
            status: "failed",
            error: err.message,
          });
        }
      }

      return {
        results,
        totalVoices: input.voices.length,
        successCount: results.filter(r => r.status === "success").length,
        failedCount: results.filter(r => r.status === "failed").length,
      };
    }),

  // ─── Saved Voicemail Library ───────────────────────────────────────────

  /** List all saved voicemails for the current user */
  libraryList: protectedProcedure.query(async ({ ctx }) => {
    const entries = await db.getVoicemailLibrary(ctx.user.id);
    return { entries };
  }),

  /** Save a generated voicemail to the library */
  librarySave: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      text: z.string().min(1).max(5000),
      voice: z.string(),
      provider: z.enum(["openai", "google"]),
      speed: z.string(),
      format: z.enum(["mp3", "wav"]),
      s3Url: z.string(),
      s3Key: z.string(),
      fileSize: z.number(),
      duration: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.createVoicemailLibraryEntry({
        userId: ctx.user.id,
        name: input.name,
        text: input.text,
        voice: input.voice,
        provider: input.provider,
        speed: input.speed,
        format: input.format,
        s3Url: input.s3Url,
        s3Key: input.s3Key,
        fileSize: input.fileSize,
        duration: input.duration,
      });
      return { id: result.id };
    }),

  /** Rename a saved voicemail */
  libraryRename: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255),
    }))
    .mutation(async ({ input, ctx }) => {
      const entry = await db.getVoicemailLibraryEntry(input.id);
      if (!entry || entry.userId !== ctx.user.id) {
        throw new Error("Voicemail not found");
      }
      await db.updateVoicemailLibraryEntry(input.id, { name: input.name });
      return { success: true };
    }),

  /** Delete a saved voicemail */
  libraryDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const entry = await db.getVoicemailLibraryEntry(input.id);
      if (!entry || entry.userId !== ctx.user.id) {
        throw new Error("Voicemail not found");
      }
      await db.deleteVoicemailLibraryEntry(input.id);
      return { success: true };
    }),

  // ─── Direct FreePBX Upload ────────────────────────────────────────────

  /** Upload a voicemail audio to FreePBX as a custom sound */
  uploadToPbx: protectedProcedure
    .input(z.object({
      /** Library entry ID to upload */
      libraryId: z.number().optional(),
      /** Or provide S3 URL directly */
      s3Url: z.string().optional(),
      /** File name for the PBX (without extension) */
      pbxFileName: z.string().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      let s3Url: string;

      if (input.libraryId) {
        const entry = await db.getVoicemailLibraryEntry(input.libraryId);
        if (!entry || entry.userId !== ctx.user.id) {
          throw new Error("Voicemail not found");
        }
        s3Url = entry.s3Url;
      } else if (input.s3Url) {
        s3Url = input.s3Url;
      } else {
        throw new Error("Either libraryId or s3Url is required");
      }

      const safeName = input.pbxFileName.replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `${safeName}.mp3`;

      try {
        const result = await transferAudioToFreePBX({
          s3Url,
          fileName,
        });

        // Update library entry if it was from the library
        if (input.libraryId) {
          await db.updateVoicemailLibraryEntry(input.libraryId, {
            pbxUploaded: 1,
            pbxPath: result.remotePath,
          });
        }

        return {
          success: true,
          remotePath: result.remotePath,
          message: `Audio uploaded to FreePBX as "${safeName}". Asterisk playback path: ${result.remotePath}`,
        };
      } catch (err: any) {
        console.error("[VoicemailCreator] FreePBX upload failed:", err.message);
        return {
          success: false,
          remotePath: null,
          message: `FreePBX upload failed: ${err.message}`,
        };
      }
    }),
});

/**
 * Add a WAV header to raw PCM data (LINEAR16).
 */
function addWavHeader(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const header = Buffer.alloc(headerSize);

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize - 8, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
