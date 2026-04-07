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
    transferAudioToFreePBX: vi.fn().mockResolvedValue({
      remotePath: "/var/lib/asterisk/sounds/custom/broadcast/test_voicemail.mp3",
    }),
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

// Mock db functions for library tests
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createVoicemailLibraryEntry: vi.fn().mockResolvedValue({ id: 1 }),
    getVoicemailLibrary: vi.fn().mockResolvedValue([
      {
        id: 1,
        userId: 1,
        name: "Test Voicemail",
        text: "Hello world",
        voice: "en-US-Journey-D",
        provider: "google",
        speed: "1.0",
        format: "mp3",
        s3Url: "https://cdn.example.com/test.mp3",
        s3Key: "voicemail-audio/test.mp3",
        fileSize: 1024,
        duration: 5,
        pbxUploaded: 0,
        pbxPath: null,
        createdAt: new Date(),
      },
    ]),
    getVoicemailLibraryEntry: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test Voicemail",
      text: "Hello world",
      voice: "en-US-Journey-D",
      provider: "google",
      speed: "1.0",
      format: "mp3",
      s3Url: "https://cdn.example.com/test.mp3",
      s3Key: "voicemail-audio/test.mp3",
      fileSize: 1024,
      duration: 5,
      pbxUploaded: 0,
      pbxPath: null,
      createdAt: new Date(),
    }),
    updateVoicemailLibraryEntry: vi.fn().mockResolvedValue(undefined),
    deleteVoicemailLibraryEntry: vi.fn().mockResolvedValue(undefined),
  };
});

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
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it("generates WAV with Google voice (LINEAR16 + WAV header)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

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
      expect(result.fileSize).toBeGreaterThanOrEqual(144);
    });

    it("auto-saves to library when saveToLibrary is true", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const { createVoicemailLibraryEntry } = await import("./db");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
      });

      const result = await caller.voicemailCreator.generate({
        text: "Test message for library",
        voice: "nova",
        speed: 1.0,
        format: "mp3",
        fileName: "library-test",
        saveToLibrary: true,
      });

      expect(result.libraryId).toBe(1);
      expect(createVoicemailLibraryEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          voice: "nova",
          provider: "openai",
          format: "mp3",
        })
      );
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

      expect(result.fileName).not.toContain(" ");
      expect(result.fileName).not.toContain("(");
      expect(result.fileName).toMatch(/\.mp3$/);
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

  describe("batchGenerate", () => {
    it("generates audio for multiple voices", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Mock two OpenAI TTS responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
        });

      const result = await caller.voicemailCreator.batchGenerate({
        text: "Hello, batch test.",
        voices: ["nova", "echo"],
        speed: 1.0,
        format: "mp3",
      });

      expect(result.totalVoices).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe("success");
      expect(result.results[1].status).toBe("success");
    });

    it("handles partial failures in batch", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // First succeeds, second fails
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xfb]).buffer),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server Error"),
        });

      const result = await caller.voicemailCreator.batchGenerate({
        text: "Hello, batch test.",
        voices: ["nova", "echo"],
        speed: 1.0,
        format: "mp3",
      });

      expect(result.totalVoices).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.results[0].status).toBe("success");
      expect(result.results[1].status).toBe("failed");
      expect(result.results[1].error).toBeTruthy();
    });

    it("rejects fewer than 2 voices", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.voicemailCreator.batchGenerate({
          text: "Test",
          voices: ["nova"],
          speed: 1.0,
          format: "mp3",
        })
      ).rejects.toThrow();
    });

    it("rejects more than 10 voices", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.voicemailCreator.batchGenerate({
          text: "Test",
          voices: ["nova", "echo", "fable", "onyx", "alloy", "shimmer",
            "en-US-Journey-D", "en-US-Journey-F", "en-US-Journey-O",
            "en-US-Studio-O", "en-US-Studio-Q"],
          speed: 1.0,
          format: "mp3",
        })
      ).rejects.toThrow();
    });
  });

  describe("libraryList", () => {
    it("returns saved voicemails for the user", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.libraryList();

      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].name).toBe("Test Voicemail");
    });
  });

  describe("librarySave", () => {
    it("saves a voicemail to the library", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.librarySave({
        name: "My Voicemail",
        text: "Hello world",
        voice: "en-US-Journey-D",
        provider: "google",
        speed: "1.0",
        format: "mp3",
        s3Url: "https://cdn.example.com/test.mp3",
        s3Key: "voicemail-audio/test.mp3",
        fileSize: 1024,
        duration: 5,
      });

      expect(result.id).toBe(1);
    });
  });

  describe("libraryRename", () => {
    it("renames a library entry", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.libraryRename({
        id: 1,
        name: "Renamed Voicemail",
      });

      expect(result.success).toBe(true);
    });

    it("rejects rename for non-existent entry", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const { getVoicemailLibraryEntry } = await import("./db");
      (getVoicemailLibraryEntry as any).mockResolvedValueOnce(undefined);

      await expect(
        caller.voicemailCreator.libraryRename({
          id: 999,
          name: "Renamed",
        })
      ).rejects.toThrow("Voicemail not found");
    });
  });

  describe("libraryDelete", () => {
    it("deletes a library entry", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.libraryDelete({ id: 1 });

      expect(result.success).toBe(true);
    });

    it("rejects delete for wrong user", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const { getVoicemailLibraryEntry } = await import("./db");
      (getVoicemailLibraryEntry as any).mockResolvedValueOnce({
        id: 1,
        userId: 999, // different user
      });

      await expect(
        caller.voicemailCreator.libraryDelete({ id: 1 })
      ).rejects.toThrow("Voicemail not found");
    });
  });

  describe("uploadToPbx", () => {
    it("uploads a library entry to FreePBX", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.uploadToPbx({
        libraryId: 1,
        pbxFileName: "greeting_main",
      });

      expect(result.success).toBe(true);
      expect(result.remotePath).toBeTruthy();
    });

    it("uploads from S3 URL directly", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.voicemailCreator.uploadToPbx({
        s3Url: "https://cdn.example.com/test.mp3",
        pbxFileName: "direct_upload",
      });

      expect(result.success).toBe(true);
    });

    it("requires either libraryId or s3Url", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.voicemailCreator.uploadToPbx({
          pbxFileName: "test",
        })
      ).rejects.toThrow("Either libraryId or s3Url is required");
    });

    it("handles FreePBX upload failure", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const { transferAudioToFreePBX } = await import("./services/tts");
      (transferAudioToFreePBX as any).mockRejectedValueOnce(new Error("SSH connection failed"));

      const result = await caller.voicemailCreator.uploadToPbx({
        s3Url: "https://cdn.example.com/test.mp3",
        pbxFileName: "fail_test",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("SSH connection failed");
    });
  });
});
