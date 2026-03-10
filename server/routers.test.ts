import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

type CookieCall = { name: string; options: Record<string, unknown> };

function createAuthContext(user?: AuthenticatedUser): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: user || createMockUser(),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user data for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.openId).toBe("test-user-123");
    expect(result?.name).toBe("Test User");
  });
});

describe("audio.voices", () => {
  it("returns the list of available TTS voices", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const voices = await caller.audio.voices();
    expect(voices).toBeDefined();
    expect(voices.openai).toBeDefined();
    expect(voices.google).toBeDefined();
    expect(Array.isArray(voices.openai)).toBe(true);
    expect(voices.openai.length).toBe(6);
    const openaiIds = voices.openai.map((v: any) => v.id);
    expect(openaiIds).toContain("alloy");
    expect(openaiIds).toContain("echo");
    expect(openaiIds).toContain("shimmer");
    expect(voices.google.length).toBeGreaterThan(0);
  });
});

describe("dashboard.stats", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.stats()).rejects.toThrow();
  });
});

describe("dashboard.amiStatus", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.amiStatus()).rejects.toThrow();
  });

  it("returns PBX agent status for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const status = await caller.dashboard.amiStatus();
    expect(status).toBeDefined();
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("agents");
    expect(status).toHaveProperty("onlineAgents");
    expect(status).toHaveProperty("message");
    expect(typeof status.connected).toBe("boolean");
  });
});

describe("freepbx.status", () => {
  it("returns connection info", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const status = await caller.freepbx.status();
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("agents");
    expect(status).toHaveProperty("onlineAgents");
    expect(status).toHaveProperty("message");
  });
});

describe("contactLists - input validation", () => {
  it("rejects empty name on create", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contactLists.create({ name: "" })).rejects.toThrow();
  });

  it("rejects name over 255 chars", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contactLists.create({ name: "x".repeat(256) })).rejects.toThrow();
  });
});

describe("contacts - input validation", () => {
  it("rejects empty phone number", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contacts.create({ listId: 1, phoneNumber: "" })).rejects.toThrow();
  });

  it("rejects invalid email format", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contacts.create({ listId: 1, phoneNumber: "+1234567890", email: "not-an-email" })).rejects.toThrow();
  });

  it("rejects import with empty contacts array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contacts.import({ listId: 1, contacts: [] })).rejects.toThrow();
  });
});

describe("campaigns - input validation", () => {
  it("rejects empty campaign name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.create({ name: "", contactListId: 1 })).rejects.toThrow();
  });

  it("rejects concurrent calls above 100", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.create({ name: "Test", contactListId: 1, maxConcurrentCalls: 101 })).rejects.toThrow();
  });

  it("rejects retry attempts above 5", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.create({ name: "Test", contactListId: 1, retryAttempts: 6 })).rejects.toThrow();
  });

  it("rejects retry delay below 60", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.create({ name: "Test", contactListId: 1, retryDelay: 30 })).rejects.toThrow();
  });
});

describe("audio - input validation", () => {
  it("rejects empty audio name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.audio.generate({ name: "", text: "Hello", voice: "alloy" })).rejects.toThrow();
  });

  it("rejects empty text", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.audio.generate({ name: "Test", text: "", voice: "alloy" })).rejects.toThrow();
  });

  it("rejects invalid voice", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.audio.generate({ name: "Test", text: "Hello", voice: "invalid" as any })).rejects.toThrow();
  });

  it("rejects text over 5000 chars", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.audio.generate({ name: "Test", text: "x".repeat(5001), voice: "alloy" })).rejects.toThrow();
  });
});

describe("protected routes require auth", () => {
  const publicCtx = createPublicContext();

  it("contactLists.list requires auth", async () => {
    const caller = appRouter.createCaller(publicCtx);
    await expect(caller.contactLists.list()).rejects.toThrow();
  });

  it("campaigns.list requires auth", async () => {
    const caller = appRouter.createCaller(publicCtx);
    await expect(caller.campaigns.list()).rejects.toThrow();
  });

  it("audio.list requires auth", async () => {
    const caller = appRouter.createCaller(publicCtx);
    await expect(caller.audio.list()).rejects.toThrow();
  });

  it("auditLogs.list requires auth", async () => {
    const caller = appRouter.createCaller(publicCtx);
    await expect(caller.auditLogs.list({})).rejects.toThrow();
  });
});

describe("dnc - input validation", () => {
  it("rejects empty phone number on add", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.add({ phoneNumber: "" })).rejects.toThrow();
  });

  it("rejects phone number over 20 chars on add", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.add({ phoneNumber: "1".repeat(21) })).rejects.toThrow();
  });

  it("rejects invalid source on add", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.add({ phoneNumber: "4075551234", source: "invalid" as any })).rejects.toThrow();
  });

  it("rejects empty entries array on bulkAdd", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.bulkAdd({ entries: [] })).rejects.toThrow();
  });

  it("rejects empty ids array on bulkRemove", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.bulkRemove({ ids: [] })).rejects.toThrow();
  });

  it("requires auth for dnc.list", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.list({})).rejects.toThrow();
  });

  it("requires auth for dnc.count", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.count()).rejects.toThrow();
  });

  it("requires auth for dnc.check", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dnc.check({ phoneNumber: "4075551234" })).rejects.toThrow();
  });

  it("accepts valid source values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // These should not throw on input validation (may fail on DB, but that's expected)
    for (const source of ["manual", "import", "opt-out", "complaint"] as const) {
      try {
        await caller.dnc.add({ phoneNumber: "4075551234", source });
      } catch (e: any) {
        // DB errors are fine - we're testing input validation
        expect(e.code).not.toBe("BAD_REQUEST");
      }
    }
  });
});

describe("freepbx.listAgents", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.listAgents()).rejects.toThrow();
  });

  it("returns an array for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const agents = await caller.freepbx.listAgents();
    expect(Array.isArray(agents)).toBe(true);
  });
});

describe("freepbx.registerAgent", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.registerAgent({ name: "test", maxCalls: 5 })).rejects.toThrow();
  });

  it("rejects empty agent name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.registerAgent({ name: "", maxCalls: 5 })).rejects.toThrow();
  });

  it("rejects maxCalls above 100", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.registerAgent({ name: "test", maxCalls: 101 })).rejects.toThrow();
  });

  it("rejects maxCalls below 10", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.registerAgent({ name: "test", maxCalls: 0 })).rejects.toThrow();
  });
});

describe("freepbx.deleteAgent", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.deleteAgent({ agentId: "agent-test" })).rejects.toThrow();
  });
});

describe("freepbx.queueStats", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.freepbx.queueStats()).rejects.toThrow();
  });

  it("returns queue statistics for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.freepbx.queueStats();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("claimed");
    expect(stats).toHaveProperty("completed");
    expect(stats).toHaveProperty("failed");
    expect(typeof stats.pending).toBe("number");
  });
});

describe("dashboard.callActivity", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.callActivity()).rejects.toThrow();
  });

  it("returns an array for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.callActivity();
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts optional limit parameter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.callActivity({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("rejects limit below 1", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.callActivity({ limit: 0 })).rejects.toThrow();
  });

  it("rejects limit above 100", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.callActivity({ limit: 101 })).rejects.toThrow();
  });

  it("returns items with expected shape", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.callActivity({ limit: 5 });
    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("phoneNumber");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("campaignName");
      expect(item).toHaveProperty("updatedAt");
    }
  });
});

describe("dashboard.stats - duration fields", () => {
  it("returns duration stats for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.stats();
    expect(result).toHaveProperty("totalDurationSecs");
    expect(result).toHaveProperty("avgDurationSecs");
    expect(typeof result.totalDurationSecs).toBe("number");
    expect(typeof result.avgDurationSecs).toBe("number");
    expect(result.totalDurationSecs).toBeGreaterThanOrEqual(0);
    expect(result.avgDurationSecs).toBeGreaterThanOrEqual(0);
  });
});

describe("dashboard.callActivity - duration field", () => {
  it("returns callDuration field in activity items", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.callActivity({ limit: 5 });
    if (result.length > 0) {
      const item = result[0];
      expect(item).toHaveProperty("callDuration");
    }
  });
});

describe("analytics.overview - duration stats", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analytics.overview()).rejects.toThrow();
  });

  it("returns duration fields in analytics overview", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.overview();
    expect(result).toHaveProperty("avgDuration");
    expect(result).toHaveProperty("totalDuration");
    expect(typeof result.avgDuration).toBe("number");
    expect(typeof result.totalDuration).toBe("number");
    expect(result.avgDuration).toBeGreaterThanOrEqual(0);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });
});

describe("costEstimator.getSettings", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.costEstimator.getSettings()).rejects.toThrow();
  });

  it("returns default cost settings", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.costEstimator.getSettings();
    expect(result).toHaveProperty("trunkCostPerMinute");
    expect(result).toHaveProperty("ttsCostPer1kChars");
    expect(result).toHaveProperty("currency");
    expect(result).toHaveProperty("avgCallDurationSecs");
  });
});


describe("freepbx.getInstallerCommand", () => {
  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.freepbx.getInstallerCommand({ agentId: "agent-test", origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND for non-existent agent", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.freepbx.getInstallerCommand({ agentId: "agent-nonexistent-xyz", origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("requires a valid URL for origin", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.freepbx.getInstallerCommand({ agentId: "agent-test", origin: "not-a-url" })
    ).rejects.toThrow();
  });

  it("returns installer command with correct structure for a registered agent", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First register an agent
    const agent = await caller.freepbx.registerAgent({ name: "installer-test-agent", maxCalls: 15 });

    // Now get the installer command
    const result = await caller.freepbx.getInstallerCommand({
      agentId: agent.agentId,
      origin: "https://test-app.manus.space",
    });

    expect(result).toHaveProperty("oneLiner");
    expect(result).toHaveProperty("apiUrl");
    expect(result).toHaveProperty("apiKey");
    expect(result).toHaveProperty("maxCalls");
    expect(result).toHaveProperty("agentName");

    // Verify the one-liner contains curl command
    expect(result.oneLiner).toContain("curl");
    expect(result.oneLiner).toContain("/api/pbx/install");

    // Verify the API URL is constructed from the origin
    expect(result.apiUrl).toBe("https://test-app.manus.space/api/pbx");

    // Verify agent name matches
    expect(result.agentName).toBe("installer-test-agent");

    // Verify maxCalls matches what was set
    expect(result.maxCalls).toBe(15);

    // Clean up
    await caller.freepbx.deleteAgent({ agentId: agent.agentId });
  });
});
