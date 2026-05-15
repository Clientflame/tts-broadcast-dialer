import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock db module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db") as any;
  return {
    ...actual,
    getApiKeys: vi.fn().mockResolvedValue([]),
    createApiKey: vi.fn().mockResolvedValue({ id: 1, key: "tbd_test123", prefix: "tbd_test1" }),
    validateApiKey: vi.fn().mockResolvedValue({ valid: true, keyId: 1, permissions: {} }),
    revokeApiKey: vi.fn().mockResolvedValue(undefined),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
    getApiRequestLogs: vi.fn().mockResolvedValue([]),
    logApiRequest: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    getCallQueueStats: vi.fn().mockResolvedValue({ pending: 5, claimed: 2, dialing: 1, completed: 100, failed: 3 }),
    getQueueThroughput: vi.fn().mockResolvedValue({ callsPerMinute: 12.5, avgWaitTimeMs: 3200, avgCallDurationSec: 45 }),
    getQueueDepthHistory: vi.fn().mockResolvedValue([
      { hour: "2026-05-14 10:00", pending: 10, claimed: 3, completed: 50, failed: 2 },
      { hour: "2026-05-14 11:00", pending: 8, claimed: 4, completed: 60, failed: 1 },
    ]),
    getDeadLetterQueue: vi.fn().mockResolvedValue([
      { id: 1, phoneNumber: "5551234567", status: "failed", result: "congestion" },
    ]),
    requeueDeadLetterItems: vi.fn().mockResolvedValue(2),
    getBestTimeToCallHeatmap: vi.fn().mockResolvedValue([
      { dayOfWeek: 1, hourOfDay: 10, totalCalls: 50, answeredCalls: 30, answerRate: 60 },
      { dayOfWeek: 2, hourOfDay: 14, totalCalls: 80, answeredCalls: 55, answerRate: 68.75 },
    ]),
    getCallVolumeByHour: vi.fn().mockResolvedValue([
      { hour: 9, totalCalls: 100, answeredCalls: 60 },
      { hour: 10, totalCalls: 120, answeredCalls: 80 },
    ]),
    getIntelligentRetryCandidates: vi.fn().mockResolvedValue({
      candidates: [
        { phoneNumber: "5551234567", contactName: "John Doe", attempts: 2, lastAttemptAt: Date.now() - 3600000, score: 75, bestHour: 14, bestDid: "5559876543", reason: "High answer rate at 2 PM" },
      ],
      summary: { totalCandidates: 1, avgScore: 75, recommendation: "1 contact ready for retry" },
    }),
    flagDisconnectedNumber: vi.fn().mockResolvedValue({ id: 1 }),
    getDisconnectedNumbers: vi.fn().mockResolvedValue([
      { id: 1, phoneNumber: "5551112222", detectedAt: Date.now(), source: "call_result", failureReason: "UNALLOCATED_NUMBER" },
    ]),
    getDisconnectedCount: vi.fn().mockResolvedValue(5),
    isNumberDisconnected: vi.fn().mockResolvedValue(false),
    removeDisconnectedNumber: vi.fn().mockResolvedValue(undefined),
    getDncStats: vi.fn().mockResolvedValue({ total: 100, bySource: { manual: 30, import: 50, "opt-out": 10, complaint: 5, disconnected: 5 }, last7Days: 12, last30Days: 45 }),
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

describe("v2.4.0 - API Keys Management", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("lists API keys", async () => {
    const result = await caller.apiKeys.list();
    expect(Array.isArray(result)).toBe(true);
    expect(db.getApiKeys).toHaveBeenCalled();
  });

  it("creates a new API key with permissions", async () => {
    const result = await caller.apiKeys.create({
      name: "Test CRM Integration",
      permissions: {
        campaigns: { read: true, write: false, launch: false },
        contacts: { read: true, write: true, import: true },
        callLogs: { read: true },
        reports: { read: true },
        dnc: { read: true, write: false },
      },
      rateLimit: 120,
      expiresInDays: 90,
    });

    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("prefix");
    expect(result.key).toContain("tbd_");
    expect(db.createApiKey).toHaveBeenCalledWith(expect.objectContaining({
      name: "Test CRM Integration",
      rateLimit: 120,
      createdBy: 1,
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "apiKey.create",
    }));
  });

  it("revokes an API key", async () => {
    const result = await caller.apiKeys.revoke({ id: 1 });
    expect(result).toEqual({ success: true });
    expect(db.revokeApiKey).toHaveBeenCalledWith(1);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "apiKey.revoke",
    }));
  });

  it("deletes an API key", async () => {
    const result = await caller.apiKeys.delete({ id: 1 });
    expect(result).toEqual({ success: true });
    expect(db.deleteApiKey).toHaveBeenCalledWith(1);
  });

  it("fetches API request logs", async () => {
    const result = await caller.apiKeys.logs({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
    expect(db.getApiRequestLogs).toHaveBeenCalledWith(undefined, 50);
  });
});

describe("v2.4.0 - Queue Monitoring", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("returns queue stats", async () => {
    const result = await caller.queueMonitor.stats();
    expect(result).toHaveProperty("pending", 5);
    expect(result).toHaveProperty("claimed", 2);
    expect(result).toHaveProperty("completed", 100);
    expect(result).toHaveProperty("failed", 3);
  });

  it("returns queue throughput metrics", async () => {
    const result = await caller.queueMonitor.throughput();
    expect(result).toHaveProperty("callsPerMinute", 12.5);
    expect(result).toHaveProperty("avgWaitTimeMs");
    expect(result).toHaveProperty("avgCallDurationSec");
  });

  it("returns queue depth history", async () => {
    const result = await caller.queueMonitor.depthHistory({ hours: 24 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("hour");
    expect(result[0]).toHaveProperty("pending");
  });

  it("returns dead letter queue items", async () => {
    const result = await caller.queueMonitor.deadLetter({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("phoneNumber");
    expect(result[0]).toHaveProperty("status", "failed");
  });

  it("requeues dead letter items", async () => {
    const result = await caller.queueMonitor.requeueDeadLetter({ ids: [1, 2] });
    expect(result).toEqual({ requeued: 2 });
    expect(db.requeueDeadLetterItems).toHaveBeenCalledWith([1, 2]);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "queue.requeueDeadLetter",
    }));
  });
});

describe("v2.4.0 - Smart Campaign Scheduler", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("returns best-time-to-call heatmap data", async () => {
    const result = await caller.scheduler.heatmap();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("dayOfWeek");
    expect(result[0]).toHaveProperty("hourOfDay");
    expect(result[0]).toHaveProperty("answerRate");
  });

  it("returns call volume by hour", async () => {
    const result = await caller.scheduler.volumeByHour();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("hour");
    expect(result[0]).toHaveProperty("totalCalls");
    expect(result[0]).toHaveProperty("answeredCalls");
  });

  it("returns intelligent retry candidates for a campaign", async () => {
    const result = await caller.scheduler.retryCandidates({ campaignId: 1 });
    expect(result).toHaveProperty("candidates");
    expect(result).toHaveProperty("summary");
    expect(result.candidates[0]).toHaveProperty("phoneNumber");
    expect(result.candidates[0]).toHaveProperty("score");
    expect(result.candidates[0]).toHaveProperty("bestHour");
    expect(result.summary).toHaveProperty("totalCandidates", 1);
  });
});

describe("v2.4.0 - Disconnected Number Flagging", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("returns disconnected numbers list", async () => {
    const result = await caller.dnc.disconnected.list({ search: undefined });
    expect(Array.isArray(result)).toBe(true);
    expect(db.getDisconnectedNumbers).toHaveBeenCalled();
  });

  it("returns disconnected numbers count", async () => {
    const result = await caller.dnc.disconnected.count();
    expect(result).toHaveProperty("count");
    expect(db.getDisconnectedCount).toHaveBeenCalled();
  });

  it("removes a disconnected number", async () => {
    const result = await caller.dnc.disconnected.remove({ id: 1 });
    expect(result).toEqual({ success: true });
    expect(db.removeDisconnectedNumber).toHaveBeenCalledWith(1);
  });
});

describe("v2.4.0 - DNC Analytics", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("returns DNC statistics", async () => {
    const result = await caller.dnc.stats();
    expect(result).toHaveProperty("total", 100);
    expect(result).toHaveProperty("bySource");
    expect(result.bySource).toHaveProperty("manual", 30);
    expect(result).toHaveProperty("last7Days", 12);
    expect(result).toHaveProperty("last30Days", 45);
  });
});

describe("v2.4.0 - API Key Format Validation", () => {
  it("validates API key format starts with tbd_", () => {
    const keyPattern = /^tbd_[a-f0-9]{64}$/;
    expect(keyPattern.test("tbd_" + "a".repeat(64))).toBe(true);
    expect(keyPattern.test("invalid_key")).toBe(false);
    expect(keyPattern.test("tbd_short")).toBe(false);
  });

  it("validates key prefix format", () => {
    // Prefix should be first 12 chars of key
    const key = "tbd_" + "a".repeat(64);
    const prefix = key.slice(0, 12);
    expect(prefix).toBe("tbd_aaaaaaaa");
    expect(prefix.length).toBe(12);
  });
});
