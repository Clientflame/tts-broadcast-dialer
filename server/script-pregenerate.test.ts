import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock TTS service
vi.mock("./services/tts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/static.mp3", s3Key: "audio/static.mp3", fileSize: 12345 }),
    generateGoogleTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/google-static.mp3", s3Key: "audio/google-static.mp3", fileSize: 54321 }),
    getOpenAIApiKey: vi.fn().mockResolvedValue("test-openai-key"),
    getGoogleTTSApiKey: vi.fn().mockResolvedValue("test-google-key"),
  };
});

// Mock db module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getCallScript: vi.fn(),
    updateCallScript: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    createCampaign: vi.fn().mockResolvedValue({ id: 1 }),
    getCampaign: vi.fn(),
    updateCampaign: vi.fn().mockResolvedValue(undefined),
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

describe("callScripts.preGenerate", () => {
  const caller = appRouter.createCaller(createAuthContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pre-generate static TTS segments (no merge fields)", async () => {
    const mockScript = {
      id: 1,
      userId: 1,
      name: "Test Script",
      segments: [
        { id: "seg1", type: "tts", position: 0, text: "Hello, this is a test message.", voice: "alloy", provider: "openai", speed: "1.0" },
        { id: "seg2", type: "tts", position: 1, text: "Thank you for your time.", voice: "alloy", provider: "openai", speed: "1.0" },
      ],
    };
    vi.mocked(db.getCallScript).mockResolvedValue(mockScript as any);

    const result = await caller.callScripts.preGenerate({ id: 1 });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(db.updateCallScript).toHaveBeenCalledWith(1, expect.objectContaining({
      segments: expect.arrayContaining([
        expect.objectContaining({ id: "seg1", isDynamic: false, preGeneratedUrl: expect.any(String) }),
        expect.objectContaining({ id: "seg2", isDynamic: false, preGeneratedUrl: expect.any(String) }),
      ]),
    }));
  });

  it("should mark segments with merge fields as dynamic", async () => {
    const mockScript = {
      id: 2,
      userId: 1,
      name: "Dynamic Script",
      segments: [
        { id: "seg1", type: "tts", position: 0, text: "Hello {{first_name}}, this is a reminder.", voice: "alloy", provider: "openai" },
        { id: "seg2", type: "tts", position: 1, text: "Please call us back at your convenience.", voice: "alloy", provider: "openai" },
      ],
    };
    vi.mocked(db.getCallScript).mockResolvedValue(mockScript as any);

    const result = await caller.callScripts.preGenerate({ id: 2 });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(1); // only seg2 is static
    expect(result.skipped).toBe(1); // seg1 has merge fields
    expect(db.updateCallScript).toHaveBeenCalledWith(2, expect.objectContaining({
      segments: expect.arrayContaining([
        expect.objectContaining({ id: "seg1", isDynamic: true }),
        expect.objectContaining({ id: "seg2", isDynamic: false, preGeneratedUrl: expect.any(String) }),
      ]),
    }));
  });

  it("should skip recorded segments", async () => {
    const mockScript = {
      id: 3,
      userId: 1,
      name: "Mixed Script",
      segments: [
        { id: "seg1", type: "recorded", position: 0, audioFileId: 5, audioName: "Intro", audioUrl: "https://cdn.example.com/intro.mp3" },
        { id: "seg2", type: "tts", position: 1, text: "Static message here.", voice: "alloy", provider: "openai" },
      ],
    };
    vi.mocked(db.getCallScript).mockResolvedValue(mockScript as any);

    const result = await caller.callScripts.preGenerate({ id: 3 });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(1); // recorded segment skipped
  });

  it("should throw NOT_FOUND for non-existent script", async () => {
    vi.mocked(db.getCallScript).mockResolvedValue(null as any);

    await expect(caller.callScripts.preGenerate({ id: 999 })).rejects.toThrow();
  });
});

describe("campaign amdAction field", () => {
  const caller = appRouter.createCaller(createAuthContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should accept amdAction in campaign create", async () => {
    vi.mocked(db.createCampaign).mockResolvedValue({ id: 1 } as any);

    const result = await caller.campaigns.create({
      name: "Test Campaign",
      description: "Test",
      contactListId: 1,
      voice: "alloy",
      routingMode: "broadcast",
      amdEnabled: 1,
      amdAction: "skip",
    });

    expect(result).toBeDefined();
    expect(db.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      amdAction: "skip",
    }));
  });

  it("should accept amdAction 'hangup' in campaign update", async () => {
    vi.mocked(db.getCampaign).mockResolvedValue({ id: 1, status: "draft", userId: 1 } as any);
    vi.mocked(db.updateCampaign).mockResolvedValue(undefined as any);

    const result = await caller.campaigns.update({
      id: 1,
      amdEnabled: 1,
      amdAction: "hangup",
    });

    expect(result.success).toBe(true);
    expect(db.updateCampaign).toHaveBeenCalledWith(1, expect.objectContaining({
      amdAction: "hangup",
    }));
  });
});
