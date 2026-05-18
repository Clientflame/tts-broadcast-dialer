import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-debt",
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

describe("debtCollection router", () => {
  describe("settlement tiers", () => {
    it("lists tiers (initially empty)", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.debtCollection.settlement.listTiers();
      expect(Array.isArray(result)).toBe(true);
    });

    it("creates a settlement tier", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const tier = await caller.debtCollection.settlement.createTier({
        name: "Test Tier 30%",
        discountPercent: 30,
        minBalance: 10000,
        maxBalance: 50000,
        paymentDeadlineDays: 30,
        priority: 1,
      });

      expect(tier).toBeDefined();
      expect(tier.id).toBeDefined();
      expect(typeof tier.id).toBe("number");
    });

    it("gets settlement stats", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const stats = await caller.debtCollection.settlement.stats();
      expect(stats).toBeDefined();
      // SQL count may return string or number, coerce to check
      expect(Number(stats.total)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.pending)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.accepted)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.declined)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.paid)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.expired)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("collection import", () => {
    it("lists import jobs (initially empty)", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.debtCollection.collectionImport.listJobs({
        limit: 20,
        offset: 0,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.jobs)).toBe(true);
      expect(Number(result.total)).toBeGreaterThanOrEqual(0);
    });

    it("parses CSV headers correctly", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const csvContent = "First Name,Last Name,Phone,Balance\nJohn,Doe,5551234567,1500.00";
      const base64 = Buffer.from(csvContent).toString("base64");

      const result = await caller.debtCollection.collectionImport.parseHeaders({
        fileData: base64,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.headers)).toBe(true);
      expect(result.headers).toContain("First Name");
      expect(result.headers).toContain("Last Name");
      expect(result.headers).toContain("Phone");
      expect(result.headers).toContain("Balance");
      expect(result.sampleRows.length).toBeGreaterThan(0);
    });
  });

  describe("skip tracing", () => {
    it("gets skip trace config status", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const config = await caller.debtCollection.skipTrace.getConfig();
      expect(config).toBeDefined();
      expect(typeof config.isConfigured).toBe("boolean");
    });

    it("lists skip trace history (initially empty)", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.debtCollection.skipTrace.list({
        limit: 20,
        offset: 0,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.requests)).toBe(true);
      expect(Number(result.total)).toBeGreaterThanOrEqual(0);
    });
  });
});
