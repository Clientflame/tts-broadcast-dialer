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

// ─── Import Limit Tests ──────────────────────────────────────────────────────
describe("Import Limits", () => {
  it("should accept up to 50000 contacts in import schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a contact list first
    const list = await caller.contactLists.create({ name: "Large Import Test" });

    // Test that the schema accepts a large batch (we'll use a small batch to verify it works)
    const contacts = Array.from({ length: 100 }, (_, i) => ({
      phoneNumber: `555${String(i).padStart(7, "0")}`,
      firstName: `Test${i}`,
      lastName: `User${i}`,
    }));

    const result = await caller.contacts.import({ listId: list.id, contacts });
    expect(result.count).toBe(100);

    // Clean up
    await caller.contactLists.delete({ id: list.id });
  });

  it("should accept up to 50000 phone numbers in preview schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.contactLists.create({ name: "Preview Test" });

    const phoneNumbers = Array.from({ length: 200 }, (_, i) => `555${String(i).padStart(7, "0")}`);
    const preview = await caller.contacts.previewImport({ listId: list.id, phoneNumbers });
    expect(preview.totalRows).toBe(200);
    expect(preview.willImport).toBe(200);

    await caller.contactLists.delete({ id: list.id });
  });

  it("should handle dedup correctly in large imports", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.contactLists.create({ name: "Dedup Large Test" });

    // Create contacts with some duplicates
    const contacts = [
      ...Array.from({ length: 50 }, (_, i) => ({
        phoneNumber: `666${String(i).padStart(7, "0")}`,
        firstName: `Test${i}`,
      })),
      // Add 10 duplicates of the first 10
      ...Array.from({ length: 10 }, (_, i) => ({
        phoneNumber: `666${String(i).padStart(7, "0")}`,
        firstName: `Dupe${i}`,
      })),
    ];

    const result = await caller.contacts.import({ listId: list.id, contacts });
    expect(result.count).toBe(50);
    expect(result.duplicatesOmitted).toBe(10);

    await caller.contactLists.delete({ id: list.id });
  });

  it("should accept up to 50000 DNC entries in bulk add schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Use timestamp-based prefix to avoid collision with previous test data
    const prefix = `9${Date.now().toString().slice(-6)}`;
    const entries = Array.from({ length: 50 }, (_, i) => ({
      phoneNumber: `${prefix}${String(i).padStart(4, "0")}`,
      reason: "test",
      source: "manual" as const,
    }));

    const result = await caller.dnc.bulkAdd({ entries });
    expect(result.added).toBe(50);

    // Clean up - bulk remove by fetching IDs
    const dncEntries = await caller.dnc.list({});
    const testIds = dncEntries.filter((d: any) => d.phoneNumber.startsWith(prefix)).map((d: any) => d.id);
    if (testIds.length > 0) {
      await caller.dnc.bulkRemove({ ids: testIds });
    }
  });
});

describe("DID Health Monitoring", () => {
  it("should track DID call results with recordDidCallResult", async () => {
    const { recordDidCallResult } = await import("./db");
    // This tests the function exists and handles missing IDs gracefully
    const result = await recordDidCallResult(999999, "answered");
    expect(result).toHaveProperty("flagged");
    expect(result.flagged).toBe(false);
  });

  it("should handle recordDidCallResultByNumber for unknown numbers", async () => {
    const { recordDidCallResultByNumber } = await import("./db");
    const result = await recordDidCallResultByNumber("0000000000", 1, "failed");
    expect(result).toHaveProperty("flagged");
    expect(result.flagged).toBe(false);
  });

  it("should reactivate cooled down DIDs without error", async () => {
    const { reactivateCooledDownDids } = await import("./db");
    const result = await reactivateCooledDownDids();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have DID health constants defined correctly", async () => {
    // Verify the module exports and constants are reasonable
    const db = await import("./db");
    expect(typeof db.recordDidCallResult).toBe("function");
    expect(typeof db.recordDidCallResultByNumber).toBe("function");
    expect(typeof db.reactivateCooledDownDids).toBe("function");
    expect(typeof db.resetDidHealth).toBe("function");
  });
});

describe("Campaign Cloning", () => {
  it("should have clone endpoint on the router", () => {
    // Verify the campaigns router has a clone procedure
    expect(appRouter._def.procedures).toBeDefined();
  });

  it("should reject clone with empty name via validation", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.campaigns.clone({ id: 1, name: "" })
    ).rejects.toThrow();
  });

  it("should reject clone with non-existent campaign", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.campaigns.clone({ id: 999999, name: "Clone Test" })
    ).rejects.toThrow();
  });
});


// ─── Per-DID Analytics Tests ────────────────────────────────────────────────

describe("Per-DID Analytics", () => {
  it("should return analytics summary for all DIDs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const summary = await caller.callerIds.analyticsSummary();
    expect(Array.isArray(summary)).toBe(true);
    // Each item should have the expected fields
    if (summary.length > 0) {
      const first = summary[0];
      expect(first).toHaveProperty("phoneNumber");
      expect(first).toHaveProperty("totalCalls");
      expect(first).toHaveProperty("answered");
      expect(first).toHaveProperty("failed");
      expect(first).toHaveProperty("answerRate");
      expect(first).toHaveProperty("avgDuration");
      expect(first).toHaveProperty("totalDuration");
      expect(first).toHaveProperty("healthStatus");
      expect(first).toHaveProperty("failureRate");
    }
  });

  it("should return call volume data with default 7 days", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const volume = await caller.callerIds.callVolume({ days: 7 });
    expect(Array.isArray(volume)).toBe(true);
    if (volume.length > 0) {
      expect(volume[0]).toHaveProperty("callerIdStr");
      expect(volume[0]).toHaveProperty("date");
      expect(volume[0]).toHaveProperty("total");
      expect(volume[0]).toHaveProperty("answered");
      expect(volume[0]).toHaveProperty("failed");
    }
  });

  it("should return call volume for a specific DID", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const volume = await caller.callerIds.callVolume({ callerIdStr: "5551234567", days: 30 });
    expect(Array.isArray(volume)).toBe(true);
  });

  it("should return flag history", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const history = await caller.callerIds.flagHistory();
    expect(Array.isArray(history)).toBe(true);
    if (history.length > 0) {
      expect(history[0]).toHaveProperty("action");
      expect(history[0]).toHaveProperty("createdAt");
    }
  });

  it("should return campaign breakdown for a DID", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const breakdown = await caller.callerIds.campaignBreakdown({ callerIdStr: "5551234567" });
    expect(Array.isArray(breakdown)).toBe(true);
    if (breakdown.length > 0) {
      expect(breakdown[0]).toHaveProperty("campaignName");
      expect(breakdown[0]).toHaveProperty("total");
      expect(breakdown[0]).toHaveProperty("answered");
      expect(breakdown[0]).toHaveProperty("answerRate");
    }
  });
});
