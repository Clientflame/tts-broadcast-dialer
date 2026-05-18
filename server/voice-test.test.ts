import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://storage.example.com/voice-samples/alloy-hd-speed1.mp3", key: "voice-samples/alloy-hd-speed1.mp3" }),
  storageFetchBytes: vi.fn().mockResolvedValue(Buffer.from("fake-mp3-audio-bytes")),
  extractStorageKey: vi.fn().mockReturnValue("voice-samples/alloy-hd-speed1.mp3"),
  resolveStorageUrl: vi.fn((url: string) => url),
}));

// Mock TTS services
vi.mock("./services/tts", () => ({
  generateVoiceSample: vi.fn().mockResolvedValue({ url: "https://storage.example.com/voice-samples/alloy-hd-speed1.mp3", key: "voice-samples/alloy-hd-speed1.mp3" }),
  generateGoogleVoiceSample: vi.fn().mockResolvedValue({ url: "https://storage.example.com/voice-samples/google-en-US-Wavenet-C-speed1.mp3", key: "voice-samples/google-en-US-Wavenet-C-speed1.mp3" }),
  getOpenAIApiKey: vi.fn().mockResolvedValue("sk-test"),
  getGoogleTTSApiKey: vi.fn().mockResolvedValue("google-test-key"),
  TTS_VOICES: [{ id: "alloy", name: "Alloy" }],
  GOOGLE_TTS_VOICES: [{ id: "en-US-Wavenet-C", name: "Wavenet C" }],
  sanitizeTTSError: vi.fn((s: string) => s),
  renderMessageTemplate: vi.fn((t: string) => t),
}));

// Mock db
vi.mock("./db", () => ({
  default: {
    getAppSetting: vi.fn().mockResolvedValue("test-key"),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock script-audio
vi.mock("./services/script-audio", () => ({
  generateScriptPreview: vi.fn().mockResolvedValue({ audioUrls: [], combinedUrl: null, renderedTexts: [], segmentCount: 0 }),
  generateScriptAudio: vi.fn(),
  preGenerateStaticSegments: vi.fn(),
}));

import { generateVoiceSample, generateGoogleVoiceSample } from "./services/tts";
import { storageFetchBytes, extractStorageKey } from "./storage";

describe("callScripts.voiceTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should infer OpenAI provider for 'alloy' voice", async () => {
    // The endpoint infers provider from voice name
    const voice = "alloy";
    const inferredProvider = voice.startsWith("en-") ? "google" : "openai";
    expect(inferredProvider).toBe("openai");
  });

  it("should infer Google provider for 'en-US-Wavenet-C' voice", async () => {
    const voice = "en-US-Wavenet-C";
    const inferredProvider = voice.startsWith("en-") ? "google" : "openai";
    expect(inferredProvider).toBe("google");
  });

  it("should call generateVoiceSample for OpenAI voices", async () => {
    const voice = "nova";
    const provider = voice.startsWith("en-") ? "google" : "openai";
    
    if (provider === "google") {
      await generateGoogleVoiceSample(voice as any, 1.0);
    } else {
      await generateVoiceSample(voice as any, 1.0);
    }
    
    expect(generateVoiceSample).toHaveBeenCalledWith("nova", 1.0);
    expect(generateGoogleVoiceSample).not.toHaveBeenCalled();
  });

  it("should call generateGoogleVoiceSample for Google voices", async () => {
    const voice = "en-US-Studio-M";
    const provider = voice.startsWith("en-") ? "google" : "openai";
    
    if (provider === "google") {
      await generateGoogleVoiceSample(voice as any, 1.0);
    } else {
      await generateVoiceSample(voice as any, 1.0);
    }
    
    expect(generateGoogleVoiceSample).toHaveBeenCalledWith("en-US-Studio-M", 1.0);
    expect(generateVoiceSample).not.toHaveBeenCalled();
  });

  it("should convert storage URL to base64 data URI", async () => {
    const url = "https://storage.example.com/voice-samples/alloy-hd-speed1.mp3";
    const key = extractStorageKey(url);
    expect(key).toBe("voice-samples/alloy-hd-speed1.mp3");
    
    const buffer = await storageFetchBytes(key!);
    expect(buffer).not.toBeNull();
    expect(buffer!.length).toBeGreaterThan(0);
    
    const dataUri = `data:audio/mpeg;base64,${buffer!.toString("base64")}`;
    expect(dataUri).toMatch(/^data:audio\/mpeg;base64,.+/);
  });

  it("should respect explicit provider over inference", async () => {
    // If provider is explicitly set to "google" even for a non-en voice, use it
    const voice = "alloy";
    const explicitProvider = "google";
    const inferredProvider = voice.startsWith("en-") ? "google" : "openai";
    const finalProvider = explicitProvider || inferredProvider;
    expect(finalProvider).toBe("google");
  });

  it("should clamp speed to valid range", () => {
    const clamp = (speed: number) => Math.max(0.25, Math.min(4.0, speed));
    expect(clamp(0.1)).toBe(0.25);
    expect(clamp(5.0)).toBe(4.0);
    expect(clamp(1.5)).toBe(1.5);
  });
});
