import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("apiKeys.analytics", () => {
  it("returns analytics data with correct structure for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 7 });

    // Verify the response shape
    expect(result).toHaveProperty("overview");
    expect(result).toHaveProperty("hourlyVolume");
    expect(result).toHaveProperty("dailyVolume");
    expect(result).toHaveProperty("endpointBreakdown");
    expect(result).toHaveProperty("statusCodeBreakdown");
    expect(result).toHaveProperty("perKeyUsage");
    expect(result).toHaveProperty("recentErrors");
  });

  it("overview contains expected numeric fields", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 30 });
    const { overview } = result;

    expect(typeof overview.totalRequests).toBe("number");
    expect(typeof overview.successCount).toBe("number");
    expect(typeof overview.errorCount).toBe("number");
    expect(typeof overview.errorRate).toBe("number");
    expect(typeof overview.avgResponseTime).toBe("number");
    expect(typeof overview.uniqueEndpoints).toBe("number");

    // Error count should be non-negative
    expect(overview.errorCount).toBeGreaterThanOrEqual(0);
    expect(overview.totalRequests).toBeGreaterThanOrEqual(0);
    expect(overview.errorRate).toBeGreaterThanOrEqual(0);
    expect(overview.errorRate).toBeLessThanOrEqual(100);
  });

  it("hourlyVolume returns array entries with correct shape", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 7 });

    expect(Array.isArray(result.hourlyVolume)).toBe(true);
    // Each entry should have hour, requests, errors
    for (const entry of result.hourlyVolume) {
      expect(entry).toHaveProperty("hour");
      expect(typeof entry.requests).toBe("number");
      expect(typeof entry.errors).toBe("number");
    }
  });

  it("dailyVolume returns array entries with correct shape", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 14 });

    expect(Array.isArray(result.dailyVolume)).toBe(true);
    for (const entry of result.dailyVolume) {
      expect(entry).toHaveProperty("date");
      expect(typeof entry.requests).toBe("number");
      expect(typeof entry.errors).toBe("number");
      expect(typeof entry.avgResponseTime).toBe("number");
    }
  });

  it("endpointBreakdown entries have correct shape", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 30 });

    expect(Array.isArray(result.endpointBreakdown)).toBe(true);
    for (const entry of result.endpointBreakdown) {
      expect(typeof entry.endpoint).toBe("string");
      expect(typeof entry.requests).toBe("number");
      expect(typeof entry.errors).toBe("number");
      expect(typeof entry.errorRate).toBe("number");
      expect(typeof entry.avgResponseTime).toBe("number");
    }
  });

  it("statusCodeBreakdown entries have correct shape", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 30 });

    expect(Array.isArray(result.statusCodeBreakdown)).toBe(true);
    for (const entry of result.statusCodeBreakdown) {
      expect(typeof entry.statusCode).toBe("number");
      expect(typeof entry.count).toBe("number");
      expect(typeof entry.percentage).toBe("number");
    }
  });

  it("recentErrors returns array of error entries", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.analytics({ days: 30 });

    expect(Array.isArray(result.recentErrors)).toBe(true);
    for (const entry of result.recentErrors) {
      expect(typeof entry.id).toBe("number");
      expect(typeof entry.method).toBe("string");
      expect(typeof entry.endpoint).toBe("string");
      expect(typeof entry.statusCode).toBe("number");
      // All errors should be 4xx or 5xx
      expect(entry.statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  it("accepts optional apiKeyId filter", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw when filtering by a specific key ID
    const result = await caller.apiKeys.analytics({ days: 7, apiKeyId: 999 });
    expect(result).toHaveProperty("overview");
    expect(result.overview.totalRequests).toBe(0); // No data for non-existent key
  });

  it("validates days parameter range", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Valid range
    const result7 = await caller.apiKeys.analytics({ days: 7 });
    expect(result7).toHaveProperty("overview");

    const result90 = await caller.apiKeys.analytics({ days: 90 });
    expect(result90).toHaveProperty("overview");
  });

  it("rejects non-admin users", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.apiKeys.analytics({ days: 7 })).rejects.toThrow();
  });
});
