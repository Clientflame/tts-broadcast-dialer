import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock TTS services
vi.mock("./services/tts", () => ({
  generateTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/test.mp3", s3Key: "audio/test.mp3", fileSize: 12345 }),
  generateGoogleTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/google.mp3", s3Key: "audio/google.mp3", fileSize: 54321 }),
  getOpenAIApiKey: vi.fn().mockResolvedValue("test-openai-key"),
  getGoogleTTSApiKey: vi.fn().mockResolvedValue("test-google-key"),
  GOOGLE_TTS_VOICES: [{ id: "en-US-Standard-A", name: "English US A", language: "en-US" }],
}));

vi.mock("./services/google-tts", () => ({
  generateGoogleTTS: vi.fn().mockResolvedValue({ s3Url: "https://cdn.example.com/google.mp3", s3Key: "audio/google.mp3", fileSize: 54321 }),
  GOOGLE_VOICES: [],
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/test.mp3", key: "test.mp3" }),
}));

vi.mock("./services/script-audio", () => ({
  preGenerateStaticSegments: vi.fn().mockResolvedValue({ generated: 0, skipped: 0 }),
}));

// Mock db module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getSecurityEvents: vi.fn(),
    getSecurityEventStats: vi.fn(),
    getSecurityTimeline: vi.fn(),
    getBlocklist: vi.fn(),
    addToBlocklist: vi.fn(),
    removeFromBlocklist: vi.fn(),
    createSecurityEvent: vi.fn(),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

describe("Security Logs (v2.5.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminUser: AuthenticatedUser = {
    id: 1,
    openId: "admin-open-id",
    name: "Admin",
    email: "admin@test.com",
    role: "admin",
    createdAt: new Date(),
    lastSignedIn: new Date(),
    avatarUrl: null,
  };

  // ─── security.events ─────────────────────────────────────────────────

  it("should return paginated security events", async () => {
    const mockEvents = {
      events: [
        { id: 1, eventType: "login_failed", ipAddress: "192.168.1.100", email: "test@test.com", details: { reason: "wrong_password" }, createdAt: new Date() },
        { id: 2, eventType: "ip_banned", ipAddress: "10.0.0.1", email: null, details: { jail: "sshd" }, createdAt: new Date() },
      ],
      total: 2,
    };
    vi.mocked(db.getSecurityEvents).mockResolvedValue(mockEvents);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    const result = await caller.security.events({ limit: 50, offset: 0 });
    expect(result.events).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.events[0].eventType).toBe("login_failed");
    expect(db.getSecurityEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }));
  });

  it("should filter events by type", async () => {
    vi.mocked(db.getSecurityEvents).mockResolvedValue({ events: [], total: 0 });

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    await caller.security.events({ limit: 50, offset: 0, eventType: "login_failed" });
    expect(db.getSecurityEvents).toHaveBeenCalledWith(expect.objectContaining({ eventType: "login_failed" }));
  });

  it("should filter events by IP address", async () => {
    vi.mocked(db.getSecurityEvents).mockResolvedValue({ events: [], total: 0 });

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    await caller.security.events({ limit: 50, offset: 0, ipAddress: "192.168.1.100" });
    expect(db.getSecurityEvents).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: "192.168.1.100" }));
  });

  // ─── security.stats ──────────────────────────────────────────────────

  it("should return security stats for given time range", async () => {
    const mockStats = {
      totalEvents: 150,
      failedLogins: 42,
      successfulLogins: 88,
      blockedIps: 20,
      topOffenders: [
        { ipAddress: "10.0.0.1", count: 15 },
        { ipAddress: "10.0.0.2", count: 8 },
      ],
    };
    vi.mocked(db.getSecurityEventStats).mockResolvedValue(mockStats);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    const result = await caller.security.stats({ days: 30 });
    expect(result.totalEvents).toBe(150);
    expect(result.failedLogins).toBe(42);
    expect(result.blockedIps).toBe(20);
    expect(result.topOffenders).toHaveLength(2);
    expect(db.getSecurityEventStats).toHaveBeenCalledWith(30);
  });

  // ─── security.blocklist ──────────────────────────────────────────────

  it("should return active IP blocklist", async () => {
    const mockBlocklist = {
      entries: [
        { id: 1, ipAddress: "10.0.0.1", reason: "fail2ban: sshd", source: "fail2ban", failedAttempts: 5, bannedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
      ],
      total: 1,
    };
    vi.mocked(db.getBlocklist).mockResolvedValue(mockBlocklist);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    const result = await caller.security.blocklist({ limit: 50, offset: 0, activeOnly: true });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].source).toBe("fail2ban");
    expect(db.getBlocklist).toHaveBeenCalledWith(expect.objectContaining({ activeOnly: true }));
  });

  // ─── security.banIp ──────────────────────────────────────────────────

  it("should manually ban an IP address", async () => {
    vi.mocked(db.addToBlocklist).mockResolvedValue(undefined as any);
    vi.mocked(db.createSecurityEvent).mockResolvedValue(undefined as any);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    const result = await caller.security.banIp({
      ipAddress: "192.168.1.200",
      reason: "Suspicious activity",
      duration: 24,
    });

    expect(result.success).toBe(true);
    expect(db.addToBlocklist).toHaveBeenCalledWith(expect.objectContaining({
      ipAddress: "192.168.1.200",
      reason: "Suspicious activity",
      source: "manual",
    }));
    expect(db.createSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "ip_banned",
      ipAddress: "192.168.1.200",
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "security.banIp",
    }));
  });

  it("should ban an IP permanently when no duration specified", async () => {
    vi.mocked(db.addToBlocklist).mockResolvedValue(undefined as any);
    vi.mocked(db.createSecurityEvent).mockResolvedValue(undefined as any);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    await caller.security.banIp({
      ipAddress: "10.0.0.5",
      reason: "Permanent ban",
    });

    expect(db.addToBlocklist).toHaveBeenCalledWith(expect.objectContaining({
      ipAddress: "10.0.0.5",
      expiresAt: undefined,
    }));
  });

  // ─── security.unbanIp ────────────────────────────────────────────────

  it("should unban an IP address", async () => {
    vi.mocked(db.removeFromBlocklist).mockResolvedValue(undefined as any);
    vi.mocked(db.createSecurityEvent).mockResolvedValue(undefined as any);

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    const result = await caller.security.unbanIp({ ipAddress: "192.168.1.200" });

    expect(result.success).toBe(true);
    expect(db.removeFromBlocklist).toHaveBeenCalledWith("192.168.1.200");
    expect(db.createSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "ip_unbanned",
      ipAddress: "192.168.1.200",
    }));
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "security.unbanIp",
    }));
  });

  // ─── security.fail2banStatus ─────────────────────────────────────────

  it("should return fail2ban status summary", async () => {
    vi.mocked(db.getSecurityEvents).mockResolvedValue({ events: [{ id: 1 }], total: 1 } as any);
    vi.mocked(db.getBlocklist).mockResolvedValue({ entries: [], total: 47 } as any);
    vi.mocked(db.getSecurityEventStats).mockResolvedValue({
      totalEvents: 100,
      failedLogins: 30,
      successfulLogins: 50,
      blockedIps: 47,
      topOffenders: [{ ipAddress: "10.0.0.1", count: 15 }],
    });

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: adminUser, req: {} as any, res: {} as any });

    const result = await caller.security.fail2banStatus();
    expect(result.activeBans).toBe(47);
    expect(result.failedLogins).toBe(30);
    expect(result.topOffenders).toHaveLength(1);
  });
});
