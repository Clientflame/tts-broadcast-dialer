import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-health-${userId}`,
    email: `health${userId}@example.com`,
    name: `Health Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("caller ID health check", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  const uid = 950;
  let callerIdId: number;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    caller = appRouter.createCaller(ctx);
    // Create a test caller ID with unique phone
    const phone = `950${Date.now().toString().slice(-7)}`;
    const result = await caller.callerIds.create({ phoneNumber: phone, label: "Health Test DID" });
    callerIdId = result.id;
  });

  it("should show new caller IDs with unknown health status", async () => {
    const list = await caller.callerIds.list();
    const cid = list.find(c => c.id === callerIdId);
    expect(cid).toBeDefined();
    expect(cid!.healthStatus).toBe("unknown");
    expect(cid!.consecutiveFailures).toBe(0);
    expect(cid!.autoDisabled).toBe(0);
  });

  it("should trigger health check and queue calls", async () => {
    const result = await caller.callerIds.triggerHealthCheck({ ids: [callerIdId] });
    expect(result.queued).toBe(1);
    expect(result.message).toContain("1 health check");
  });

  it("should return 0 queued when no IDs need checking", async () => {
    // Trigger for non-existent IDs
    const result = await caller.callerIds.triggerHealthCheck({ ids: [999999] });
    expect(result.queued).toBe(0);
  });

  it("should reset health status and re-enable caller ID", async () => {
    // First, manually update to simulate a failed state
    const { updateCallerIdHealthCheck } = await import("./db");
    await updateCallerIdHealthCheck(callerIdId, "failed", "Test failure 1");
    await updateCallerIdHealthCheck(callerIdId, "failed", "Test failure 2");
    await updateCallerIdHealthCheck(callerIdId, "failed", "Test failure 3");

    // Verify it was auto-disabled
    const listBefore = await caller.callerIds.list();
    const cidBefore = listBefore.find(c => c.id === callerIdId);
    expect(cidBefore!.healthStatus).toBe("failed");
    expect(cidBefore!.autoDisabled).toBe(1);
    expect(cidBefore!.isActive).toBe(0);

    // Reset
    await caller.callerIds.resetHealth({ id: callerIdId });

    // Verify it was reset
    const listAfter = await caller.callerIds.list();
    const cidAfter = listAfter.find(c => c.id === callerIdId);
    expect(cidAfter!.healthStatus).toBe("unknown");
    expect(cidAfter!.autoDisabled).toBe(0);
    expect(cidAfter!.isActive).toBe(1);
    expect(cidAfter!.consecutiveFailures).toBe(0);
  });
});

describe("health check result tracking", () => {
  const uid = 951;
  let callerIdId: number;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    const caller = appRouter.createCaller(ctx);
    const phone = `951${Date.now().toString().slice(-7)}`;
    const result = await caller.callerIds.create({ phoneNumber: phone, label: "Track Test DID" });
    callerIdId = result.id;
  });

  it("should update health status to healthy", async () => {
    const { updateCallerIdHealthCheck } = await import("./db");
    const result = await updateCallerIdHealthCheck(callerIdId, "healthy", "SIP 200 OK");
    expect(result.autoDisabled).toBe(false);
  });

  it("should track consecutive failures", async () => {
    const { updateCallerIdHealthCheck } = await import("./db");
    
    // First failure
    const r1 = await updateCallerIdHealthCheck(callerIdId, "failed", "SIP 503");
    expect(r1.autoDisabled).toBe(false);
    expect(r1.failCount).toBe(1);

    // Second failure
    const r2 = await updateCallerIdHealthCheck(callerIdId, "failed", "SIP 503");
    expect(r2.autoDisabled).toBe(false);
    expect(r2.failCount).toBe(2);
  });

  it("should auto-disable after 3 consecutive failures", async () => {
    const { updateCallerIdHealthCheck } = await import("./db");
    // Third failure (threshold is 3)
    const r3 = await updateCallerIdHealthCheck(callerIdId, "failed", "SIP 503");
    expect(r3.autoDisabled).toBe(true);
    expect(r3.failCount).toBe(3);
  });

  it("should reset consecutive failures on healthy result", async () => {
    const { updateCallerIdHealthCheck, resetCallerIdHealth } = await import("./db");
    
    // Create a new caller ID for this test
    const { ctx } = createAuthContext(uid);
    const caller = appRouter.createCaller(ctx);
    const phone2 = `952${Date.now().toString().slice(-7)}`;
    const result = await caller.callerIds.create({ phoneNumber: phone2, label: "Reset Test" });
    
    // Fail twice
    await updateCallerIdHealthCheck(result.id, "failed", "SIP 503");
    await updateCallerIdHealthCheck(result.id, "failed", "SIP 503");
    
    // Then succeed
    const r = await updateCallerIdHealthCheck(result.id, "healthy", "SIP 200 OK");
    expect(r.autoDisabled).toBe(false);
    // failCount should be 0 since healthy resets it
    expect(r.failCount).toBe(0);
  });
});
