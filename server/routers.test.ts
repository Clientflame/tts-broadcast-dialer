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
    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBe(6);
    const voiceIds = voices.map((v: any) => v.id);
    expect(voiceIds).toContain("alloy");
    expect(voiceIds).toContain("echo");
    expect(voiceIds).toContain("fable");
    expect(voiceIds).toContain("onyx");
    expect(voiceIds).toContain("nova");
    expect(voiceIds).toContain("shimmer");
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

  it("returns AMI status for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const status = await caller.dashboard.amiStatus();
    expect(status).toBeDefined();
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("host");
    expect(status).toHaveProperty("port");
    expect(typeof status.connected).toBe("boolean");
    expect(status.host).toBe("45.77.75.198");
    expect(status.port).toBe(parseInt(process.env.FREEPBX_AMI_PORT || "25038"));
  });
});

describe("freepbx.status", () => {
  it("returns connection info", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const status = await caller.freepbx.status();
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("host");
    expect(status).toHaveProperty("port");
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

  it("rejects concurrent calls above 50", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.campaigns.create({ name: "Test", contactListId: 1, maxConcurrentCalls: 51 })).rejects.toThrow();
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
