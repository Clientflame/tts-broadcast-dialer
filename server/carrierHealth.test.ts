import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
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
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("carrierHealth", () => {
  describe("carrierHealth.failureRate", () => {
    it("returns failure rate data with correct shape", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.failureRate({ windowMinutes: 5 });

      expect(result).toHaveProperty("totalCalls");
      expect(result).toHaveProperty("failedCalls");
      expect(result).toHaveProperty("failureRate");
      expect(result).toHaveProperty("byType");
      expect(typeof result.totalCalls).toBe("number");
      expect(typeof result.failedCalls).toBe("number");
      expect(typeof result.failureRate).toBe("number");
      expect(Array.isArray(result.byType)).toBe(true);
      expect(result.failureRate).toBeGreaterThanOrEqual(0);
      expect(result.failureRate).toBeLessThanOrEqual(100);
    });
  });

  describe("carrierHealth.failureTrend", () => {
    it("returns trend data as array with correct shape", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.failureTrend({ hours: 24 });

      expect(Array.isArray(result)).toBe(true);
      // Each item should have hour, total, failed, failureRate
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("hour");
        expect(result[0]).toHaveProperty("total");
        expect(result[0]).toHaveProperty("failed");
        expect(result[0]).toHaveProperty("failureRate");
      }
    });
  });

  describe("carrierHealth.dropRate", () => {
    it("returns drop rate stats with correct shape", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.dropRate({ windowMinutes: 60 });

      expect(result).toHaveProperty("totalAnswered");
      expect(result).toHaveProperty("shortCalls");
      expect(result).toHaveProperty("falseConnects");
      expect(result).toHaveProperty("ringTimeouts");
      expect(result).toHaveProperty("dropRate");
      expect(typeof result.dropRate).toBe("number");
      expect(result.dropRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("carrierHealth.errorLog", () => {
    it("returns paginated error log with total count", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.errorLog({ limit: 10 });

      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe("number");
    });
  });

  describe("carrierHealth.failureByCampaign", () => {
    it("returns per-campaign failure breakdown", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.failureByCampaign({ windowMinutes: 60 });

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("campaignId");
        expect(result[0]).toHaveProperty("total");
        expect(result[0]).toHaveProperty("failed");
        expect(result[0]).toHaveProperty("failureRate");
      }
    });
  });

  describe("carrierHealth.getRules", () => {
    it("returns auto-response rules with all fields", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.getRules();

      expect(result).toHaveProperty("autoPauseEnabled");
      expect(result).toHaveProperty("autoPauseThreshold");
      expect(result).toHaveProperty("autoPauseWindowMinutes");
      expect(result).toHaveProperty("autoThrottleEnabled");
      expect(result).toHaveProperty("autoThrottleThreshold");
      expect(result).toHaveProperty("quarantineEnabled");
      expect(result).toHaveProperty("quarantineThreshold");
      expect(typeof result.autoPauseEnabled).toBe("boolean");
      expect(typeof result.autoPauseThreshold).toBe("number");
    });
  });

  describe("carrierHealth.updateRules", () => {
    it("updates auto-pause threshold and returns success", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.updateRules({
        autoPauseEnabled: true,
        autoPauseThreshold: 60,
      });

      expect(result).toEqual({ success: true });

      // Verify the update persisted
      const rules = await caller.carrierHealth.getRules();
      expect(rules.autoPauseEnabled).toBe(true);
      expect(rules.autoPauseThreshold).toBe(60);
    });
  });

  describe("carrierHealth.evaluate", () => {
    it("runs health evaluation and returns result", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.evaluate();

      expect(result).toHaveProperty("shouldPause");
      expect(result).toHaveProperty("shouldThrottle");
      expect(result).toHaveProperty("quarantineCandidates");
      expect(result).toHaveProperty("currentFailureRate");
      expect(typeof result.shouldPause).toBe("boolean");
      expect(typeof result.shouldThrottle).toBe("boolean");
      expect(Array.isArray(result.quarantineCandidates)).toBe(true);
    });
  });

  describe("carrierHealth.quarantined", () => {
    it("returns quarantined numbers list with pagination", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.quarantined({ limit: 50 });

      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe("number");
    });
  });

  describe("carrierHealth.unquarantine", () => {
    it("handles empty ids array gracefully", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.carrierHealth.unquarantine({ ids: [] });

      expect(result).toHaveProperty("released");
      expect(result.released).toBe(0);
    });
  });
});
