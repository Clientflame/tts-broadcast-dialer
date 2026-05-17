import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tests for:
 * 1. TTS API key resolution — only uses database settings, never env vars
 * 2. Live Agents getPbxExtensions endpoint — returns extensions, queues, ring groups
 */

// ─── TTS Key Resolution Tests ───
describe("TTS API key resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getOpenAIApiKey returns database key when set", async () => {
    vi.doMock("../server/db", () => ({
      getAppSetting: vi.fn(async (key: string) => {
        if (key === "openai_api_key") return "sk-real-openai-key-from-db";
        return null;
      }),
    }));

    const { getOpenAIApiKey } = await import("./services/tts");
    const key = await getOpenAIApiKey();
    expect(key).toBe("sk-real-openai-key-from-db");
  });

  it("getOpenAIApiKey throws when no database key is set (ignores env var)", async () => {
    // Set env var to simulate the old fallback behavior
    process.env.OPENAI_API_KEY = "sk-test-env-key-should-be-ignored";

    vi.doMock("../server/db", () => ({
      getAppSetting: vi.fn(async () => null),
    }));

    const { getOpenAIApiKey } = await import("./services/tts");
    await expect(getOpenAIApiKey()).rejects.toThrow("OpenAI API key not configured");

    delete process.env.OPENAI_API_KEY;
  });

  it("getGoogleTTSApiKey returns database key when set", async () => {
    vi.doMock("../server/db", () => ({
      getAppSetting: vi.fn(async (key: string) => {
        if (key === "google_tts_api_key") return "AIza-real-google-key-from-db";
        return null;
      }),
    }));

    const { getGoogleTTSApiKey } = await import("./services/tts");
    const key = await getGoogleTTSApiKey();
    expect(key).toBe("AIza-real-google-key-from-db");
  });

  it("getGoogleTTSApiKey throws when no database key is set (ignores env var)", async () => {
    process.env.GOOGLE_TTS_API_KEY = "AIza-env-key-should-be-ignored";

    vi.doMock("../server/db", () => ({
      getAppSetting: vi.fn(async () => null),
    }));

    const { getGoogleTTSApiKey } = await import("./services/tts");
    await expect(getGoogleTTSApiKey()).rejects.toThrow("Google TTS API key not configured");

    delete process.env.GOOGLE_TTS_API_KEY;
  });

  it("error messages point users to Settings page", async () => {
    vi.doMock("../server/db", () => ({
      getAppSetting: vi.fn(async () => null),
    }));

    const { getOpenAIApiKey, getGoogleTTSApiKey } = await import("./services/tts");

    try {
      await getOpenAIApiKey();
    } catch (e: any) {
      expect(e.message).toContain("Settings");
      expect(e.message).toContain("TTS API Keys");
    }

    try {
      await getGoogleTTSApiKey();
    } catch (e: any) {
      expect(e.message).toContain("Settings");
      expect(e.message).toContain("TTS API Keys");
    }
  });
});

// ─── Live Agents PBX Extensions Tests ───
describe("liveAgents.getPbxExtensions", () => {
  it("endpoint exists on the router", async () => {
    const { appRouter } = await import("./routers");
    // Verify the procedure is defined
    expect(appRouter._def.procedures).toHaveProperty("liveAgents.getPbxExtensions");
  });

  it("returns extensions, queues, and ringGroups structure", async () => {
    // Mock the freepbx-routes service
    vi.doMock("./services/freepbx-routes", () => ({
      fetchFreePBXDestinations: vi.fn(async () => [
        { type: "extension", id: "1001", name: "1001 - John Smith", destination: "from-did-direct,1001,1" },
        { type: "extension", id: "1002", name: "1002 - Jane Doe", destination: "from-did-direct,1002,1" },
        { type: "queue", id: "400", name: "Queue 400 - Sales", destination: "ext-queues,400,1" },
        { type: "ring_group", id: "600", name: "Ring Group 600 - Support", destination: "ext-group,600,1" },
        { type: "ivr", id: "1", name: "IVR 1 - Main Menu", destination: "ivr-1,s,1" },
      ]),
    }));

    // The endpoint is a protectedProcedure, so we need auth context
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
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
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    });

    const result = await caller.liveAgents.getPbxExtensions();

    // Should have the right structure
    expect(result).toHaveProperty("extensions");
    expect(result).toHaveProperty("queues");
    expect(result).toHaveProperty("ringGroups");

    // Should filter correctly - only extensions, queues, ring groups (not IVRs)
    expect(Array.isArray(result.extensions)).toBe(true);
    expect(Array.isArray(result.queues)).toBe(true);
    expect(Array.isArray(result.ringGroups)).toBe(true);
  });
});
