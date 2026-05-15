import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock TTS service to avoid real API calls
vi.mock("./services/tts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/regen.mp3", s3Key: "audio/regen.mp3", fileSize: 12345 }),
    generateGoogleTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/google-regen.mp3", s3Key: "audio/google-regen.mp3", fileSize: 54321 }),
    getOpenAIApiKey: vi.fn().mockResolvedValue("test-openai-key"),
    getGoogleTTSApiKey: vi.fn().mockResolvedValue("test-google-key"),
  };
});

// Mock db module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getAudioFile: vi.fn(),
    getAudioFiles: vi.fn().mockResolvedValue([]),
    updateAudioFile: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as any,
  };
}

const mockAudioFile = {
  id: 1,
  userId: 1,
  name: "Test Audio",
  text: "Hello, this is a test message.",
  voice: "alloy",
  s3Url: "https://cdn.example.com/test.mp3",
  s3Key: "audio/test.mp3",
  duration: 5,
  fileSize: 10000,
  status: "ready" as const,
  createdAt: new Date(),
};

const mockGeneratingFile = {
  ...mockAudioFile,
  id: 2,
  name: "Generating Audio",
  status: "generating" as const,
  s3Url: null,
  s3Key: null,
};

const mockFailedFile = {
  ...mockAudioFile,
  id: 3,
  name: "Failed Audio",
  status: "failed" as const,
  s3Url: null,
  s3Key: null,
};

describe("Audio Edit/Update", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates audio file name only (no regeneration)", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile);
    const result = await caller.audio.update({
      id: 1,
      name: "Renamed Audio",
    });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { name: "Renamed Audio" });
    expect(db.createAuditLog).toHaveBeenCalled();
  });

  it("updates audio file text only (no regeneration)", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile);
    const result = await caller.audio.update({
      id: 1,
      text: "Updated message text.",
    });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { text: "Updated message text." });
  });

  it("updates audio file with regeneration", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile);
    const result = await caller.audio.update({
      id: 1,
      text: "New text for regeneration",
      voice: "nova",
      speed: 1.2,
      ttsProvider: "openai",
      regenerate: true,
    });
    expect(result.success).toBe(true);
    // Should update text first
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { text: "New text for regeneration", voice: "nova" });
    // Should set status to generating for regeneration
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
  });

  it("throws NOT_FOUND for non-existent audio file", async () => {
    (db.getAudioFile as any).mockResolvedValue(undefined);
    await expect(caller.audio.update({ id: 999, name: "New Name" }))
      .rejects.toThrow("Audio file not found");
  });
});

describe("Audio Cancel Generating", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels a generating file (sets status to failed)", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockGeneratingFile);
    const result = await caller.audio.cancelGenerating({ id: 2 });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(2, { status: "failed" });
    expect(db.createAuditLog).toHaveBeenCalled();
  });

  it("throws NOT_FOUND for non-existent file", async () => {
    (db.getAudioFile as any).mockResolvedValue(undefined);
    await expect(caller.audio.cancelGenerating({ id: 999 }))
      .rejects.toThrow("Audio file not found");
  });

  it("throws BAD_REQUEST if file is not in generating state", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile); // status: "ready"
    await expect(caller.audio.cancelGenerating({ id: 1 }))
      .rejects.toThrow("File is not in generating state");
  });
});

describe("Audio Regenerate", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("regenerates a failed audio file", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockFailedFile);
    const result = await caller.audio.regenerate({ id: 3 });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(3, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
    expect(db.createAuditLog).toHaveBeenCalled();
  });

  it("regenerates with custom speed and provider", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockFailedFile);
    const result = await caller.audio.regenerate({
      id: 3,
      speed: 1.5,
      ttsProvider: "google",
    });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(3, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
  });

  it("throws NOT_FOUND for non-existent file", async () => {
    (db.getAudioFile as any).mockResolvedValue(undefined);
    await expect(caller.audio.regenerate({ id: 999 }))
      .rejects.toThrow("Audio file not found");
  });

  it("regenerates a ready file (re-generate existing)", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile);
    const result = await caller.audio.regenerate({ id: 1 });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { status: "generating", s3Url: null, s3Key: null, fileSize: null });
  });
});

describe("Audio Bulk Regenerate", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bulk regenerates multiple files", async () => {
    (db.getAudioFile as any)
      .mockResolvedValueOnce(mockFailedFile)
      .mockResolvedValueOnce({ ...mockFailedFile, id: 4 });
    const result = await caller.audio.bulkRegenerate({ ids: [3, 4] });
    expect(result.success).toBe(true);
    expect(result.queued).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("skips non-existent files in bulk", async () => {
    (db.getAudioFile as any)
      .mockResolvedValueOnce(mockFailedFile)
      .mockResolvedValueOnce(undefined);
    const result = await caller.audio.bulkRegenerate({ ids: [3, 999] });
    expect(result.queued).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

describe("Audio Tags", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets a tag on an audio file", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile);
    const result = await caller.audio.setTag({ id: 1, tag: "Campaign A" });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { tag: "Campaign A" });
  });

  it("removes a tag from an audio file", async () => {
    (db.getAudioFile as any).mockResolvedValue({ ...mockAudioFile, tag: "Old Tag" });
    const result = await caller.audio.setTag({ id: 1, tag: null });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { tag: null });
  });

  it("throws NOT_FOUND for setTag on non-existent file", async () => {
    (db.getAudioFile as any).mockResolvedValue(undefined);
    await expect(caller.audio.setTag({ id: 999, tag: "Test" }))
      .rejects.toThrow("Audio file not found");
  });

  it("returns unique tags from audio files", async () => {
    (db.getAudioFiles as any).mockResolvedValue([
      { ...mockAudioFile, tag: "Campaign A" },
      { ...mockAudioFile, id: 2, tag: "Voicemail" },
      { ...mockAudioFile, id: 3, tag: "Campaign A" },
      { ...mockAudioFile, id: 4, tag: null },
    ]);
    const tags = await caller.audio.tags();
    expect(tags).toEqual(["Campaign A", "Voicemail"]);
  });

  it("bulk sets tags on multiple files", async () => {
    const result = await caller.audio.bulkSetTag({ ids: [1, 2, 3], tag: "Batch Tag" });
    expect(result.success).toBe(true);
    expect(result.updated).toBe(3);
    expect(db.updateAudioFile).toHaveBeenCalledTimes(3);
  });
});

describe("Audio Update with Tag", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates audio file with tag field", async () => {
    (db.getAudioFile as any).mockResolvedValue(mockAudioFile);
    const result = await caller.audio.update({
      id: 1,
      name: "Tagged Audio",
      tag: "Campaign B",
    });
    expect(result.success).toBe(true);
    expect(db.updateAudioFile).toHaveBeenCalledWith(1, { name: "Tagged Audio", tag: "Campaign B" });
  });
});
