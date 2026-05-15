import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: { cookie: "app_session_id=test-session" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createUserContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("callerIds.getAutoRotateSettings", () => {
  it("returns auto-rotate settings with default values", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.callerIds.getAutoRotateSettings();

    expect(result).toHaveProperty("enabled");
    expect(result).toHaveProperty("threshold");
    expect(result).toHaveProperty("minCalls");
    expect(typeof result.enabled).toBe("boolean");
    expect(typeof result.threshold).toBe("number");
    expect(typeof result.minCalls).toBe("number");
    expect(result.threshold).toBeGreaterThanOrEqual(1);
    expect(result.threshold).toBeLessThanOrEqual(100);
    expect(result.minCalls).toBeGreaterThanOrEqual(10);
  });

  it("is accessible by regular users (read-only)", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.callerIds.getAutoRotateSettings();
    expect(result).toHaveProperty("enabled");
  });
});

describe("callerIds.updateAutoRotateSettings", () => {
  it("updates auto-rotate settings as admin", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.callerIds.updateAutoRotateSettings({
      enabled: true,
      threshold: 5,
      minCalls: 100,
    });

    expect(result.enabled).toBe(true);
    expect(result.threshold).toBe(5);
    expect(result.minCalls).toBe(100);
  });

  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.callerIds.updateAutoRotateSettings({
        enabled: true,
        threshold: 5,
        minCalls: 100,
      })
    ).rejects.toThrow();
  });

  it("validates threshold range (1-100)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.callerIds.updateAutoRotateSettings({ threshold: 0 })
    ).rejects.toThrow();

    await expect(
      caller.callerIds.updateAutoRotateSettings({ threshold: 101 })
    ).rejects.toThrow();
  });

  it("validates minCalls range (10-10000)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.callerIds.updateAutoRotateSettings({ minCalls: 5 })
    ).rejects.toThrow();

    await expect(
      caller.callerIds.updateAutoRotateSettings({ minCalls: 20000 })
    ).rejects.toThrow();
  });

  it("allows partial updates", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Only update threshold
    const result = await caller.callerIds.updateAutoRotateSettings({
      threshold: 7,
    });

    expect(result.threshold).toBe(7);
    // Other fields should still be present
    expect(result).toHaveProperty("enabled");
    expect(result).toHaveProperty("minCalls");
  });

  it("can disable auto-rotate", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // First enable
    await caller.callerIds.updateAutoRotateSettings({ enabled: true });
    // Then disable
    const result = await caller.callerIds.updateAutoRotateSettings({ enabled: false });
    expect(result.enabled).toBe(false);
  });
});

describe("callerIds.evaluateAutoRotate", () => {
  it("runs evaluation as admin and returns result", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Ensure auto-rotate is enabled first
    await caller.callerIds.updateAutoRotateSettings({ enabled: true, threshold: 3, minCalls: 50 });

    const result = await caller.callerIds.evaluateAutoRotate();

    expect(result).toHaveProperty("disabled");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.disabled)).toBe(true);
    expect(typeof result.count).toBe("number");
    expect(result.count).toBe(result.disabled.length);
  });

  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.callerIds.evaluateAutoRotate()).rejects.toThrow();
  });

  it("returns empty array when auto-rotate is disabled", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Disable auto-rotate
    await caller.callerIds.updateAutoRotateSettings({ enabled: false });

    const result = await caller.callerIds.evaluateAutoRotate();
    expect(result.disabled).toEqual([]);
    expect(result.count).toBe(0);
  });
});
