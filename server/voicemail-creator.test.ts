import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the TTS service functions to avoid real API calls
vi.mock("./services/tts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getOpenAIApiKey: vi.fn().mockResolvedValue("test-openai-key"),
    getGoogleTTSApiKey: vi.fn().mockResolvedValue("test-google-key"),
  };
});

// Mock storagePut to avoid real S3 uploads
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    url: "https://cdn.example.com/test-audio.mp3",
    key: "voicemail-audio/test-audio.mp3",
  }),
  storageGet: vi.fn(),
  resolveStorageUrl: vi.fn((url: string) => url),
}));

// Mock fetch for TTS API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("voicemailCreator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listVoices", () => {
    it("returns both OpenAI and Google voices", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.listVoices();

      expect(result.voices).toBeDefined();
      expect(Array.isArray(result.voices)).toBe(true);
      expect(result.voices.length).toBeGreaterThan(0);

      // Should have both providers
      const providers = new Set(result.voices.map((v) => v.provider));
      expect(providers.has("openai")).toBe(true);
      expect(providers.has("google")).toBe(true);
    });

    it("each voice has required fields", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.listVoices();

      for (const voice of result.voices) {
        expect(voice.id).toBeTruthy();
        expect(voice.name).toBeTruthy();
        expect(voice.description).toBeTruthy();
        expect(voice.gender).toBeTruthy();
        expect(voice.tone).toBeTruthy();
        expect(voice.bestFor).toBeTruthy();
        expect(["openai", "google"]).toContain(voice.provider);
        expect(voice.tier).toBeTruthy();
      }
    });

    it("includes Google Journey voices (recommended)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.listVoices();

      const journeyVoices = result.voices.filter(
        (v) => v.provider === "google" && v.tier === "Journey"
      );
      expect(journeyVoices.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("generate", () => {
    it("generates MP3 with OpenAI voice", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Mock OpenAI TTS response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer),
      });

      const result = await caller.voicemailCreator.generate({
        text: "Hello, this is a test voicemail.",
        voice: "nova",
        speed: 1.0,
        format: "mp3",
        fileName: "test-voicemail",
      });

      expect(result.url).toBeTruthy();
      expect(result.fileName).toBe("test-voicemail.mp3");
      expect(result.format).toBe("mp3");
      expect(result.provider).toBe("openai");
      expect(result.voice).toBe("nova");
      expect(result.fileSize).toBeGreaterThan(0);
    });

    it("generates WAV with OpenAI voice", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Mock OpenAI TTS response (WAV format)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer),
      });

      const result = await caller.voicemailCreator.generate({
        text: "Hello, this is a test voicemail.",
        voice: "alloy",
        speed: 1.0,
        format: "wav",
        fileName: "test-voicemail",
      });

      expect(result.url).toBeTruthy();
      expect(result.fileName).toBe("test-voicemail.wav");
      expect(result.format).toBe("wav");
      expect(result.provider).toBe("openai");
    });

    it("generates MP3 with Google voice", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Mock Google TTS response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            audioContent: Buffer.from([0xff, 0xfb, 0x90, 0x00]).toString("base64"),
          }),
      });

      const result = await caller.voicemailCreator.generate({
        text: "Hello, this is a test voicemail.",
        voice: "en-US-Journey-D",
        speed: 1.0,
        format: "mp3",
        fileName: "google-voicemail",
      });

      expect(result.url).toBeTruthy();
      expect(result.fileName).toBe("google-voicemail.mp3");
      expect(result.format).toBe("mp3");
      expect(result.provider).toBe("google");
      expect(result.voice).toBe("en-US-Journey-D");
    });

    it("generates WAV with Google voice (LINEAR16 + WAV header)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Mock Google TTS response with LINEAR16 PCM data
      const pcmData = new Uint8Array(100);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            audioContent: Buffer.from(pcmData).toString("base64"),
          }),
      });

      const result = await caller.voicemailCreator.generate({
        text: "Hello, this is a test voicemail.",
        voice: "en-US-Journey-F",
        speed: 1.0,
        format: "wav",
        fileName: "google-voicemail-wav",
      });

      expect(result.url).toBeTruthy();
      expect(result.fileName).toBe("google-voicemail-wav.wav");
      expect(result.format).toBe("wav");
      expect(result.provider).toBe("google");
      // WAV file should be larger than raw PCM due to 44-byte header
      expect(result.fileSize).toBeGreaterThanOrEqual(144);
    });

    it("rejects empty text", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.voicemailCreator.generate({
          text: "",
          voice: "nova",
          speed: 1.0,
          format: "mp3",
        })
      ).rejects.toThrow();
    });

    it("rejects text over 5000 characters", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const longText = "a".repeat(5001);
      await expect(
        caller.voicemailCreator.generate({
          text: longText,
          voice: "nova",
          speed: 1.0,
          format: "mp3",
        })
      ).rejects.toThrow();
    });

    it("handles TTS API failure gracefully", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(
        caller.voicemailCreator.generate({
          text: "Test message",
          voice: "nova",
          speed: 1.0,
          format: "mp3",
        })
      ).rejects.toThrow(/TTS failed/);
    });

    it("sanitizes file name", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
      });

      const result = await caller.voicemailCreator.generate({
        text: "Test message",
        voice: "echo",
        speed: 1.0,
        format: "mp3",
        fileName: "my voicemail (final).mp3",
      });

      // File name should be sanitized - no spaces or special chars
      expect(result.fileName).not.toContain(" ");
      expect(result.fileName).not.toContain("(");
      expect(result.fileName).toMatch(/\.mp3$/);
    });

    it("respects speed parameter", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
      });

      await caller.voicemailCreator.generate({
        text: "Test message",
        voice: "shimmer",
        speed: 1.5,
        format: "mp3",
      });

      // Verify fetch was called with the speed parameter
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.speed).toBe(1.5);
    });
  });

  describe("preview", () => {
    it("generates a preview audio URL", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
      });

      const result = await caller.voicemailCreator.preview({
        text: "Quick preview test",
        voice: "nova",
        speed: 1.0,
      });

      expect(result.url).toBeTruthy();
    });

    it("rejects preview text over 500 characters", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const longText = "a".repeat(501);
      await expect(
        caller.voicemailCreator.preview({
          text: longText,
          voice: "nova",
          speed: 1.0,
        })
      ).rejects.toThrow();
    });

    it("works with Google voice for preview", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            audioContent: Buffer.from([0xff, 0xfb]).toString("base64"),
          }),
      });

      const result = await caller.voicemailCreator.preview({
        text: "Google voice preview",
        voice: "en-US-Journey-D",
        speed: 1.0,
      });

      expect(result.url).toBeTruthy();
    });
  });
});
