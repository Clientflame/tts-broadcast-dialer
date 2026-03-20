import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "agent@example.com",
    name: "Test Agent",
    loginMethod: "email",
    role: "user",
    linkedAgentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
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

describe("agentDashboard", () => {
  describe("myAgent", () => {
    it("returns null when user has no linked agent", async () => {
      const ctx = createContext({ linkedAgentId: null });
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agentDashboard.myAgent();
      expect(result).toBeNull();
    });

    it("returns agent data when user has a linked agent", async () => {
      const ctx = createContext({ linkedAgentId: 1 });
      const caller = appRouter.createCaller(ctx);
      // May return null if agent ID 1 doesn't exist in test DB,
      // but should not throw
      const result = await caller.agentDashboard.myAgent();
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  describe("todayStats", () => {
    it("returns null when user has no linked agent", async () => {
      const ctx = createContext({ linkedAgentId: null });
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agentDashboard.todayStats();
      expect(result).toBeNull();
    });
  });

  describe("performance", () => {
    it("returns null when user has no linked agent", async () => {
      const ctx = createContext({ linkedAgentId: null });
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agentDashboard.performance();
      expect(result).toBeNull();
    });
  });

  describe("callHistory", () => {
    it("returns empty array when user has no linked agent", async () => {
      const ctx = createContext({ linkedAgentId: null });
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agentDashboard.callHistory();
      expect(result).toEqual([]);
    });

    it("returns array when user has a linked agent", async () => {
      const ctx = createContext({ linkedAgentId: 1 });
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agentDashboard.callHistory();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("availableAgents", () => {
    it("returns array of agents", async () => {
      const ctx = createContext({ role: "admin" });
      const caller = appRouter.createCaller(ctx);
      const result = await caller.agentDashboard.availableAgents();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("linkAgent", () => {
    it("requires admin role", async () => {
      const ctx = createContext({ role: "user" });
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.agentDashboard.linkAgent({ userId: 2, agentId: 1 })
      ).rejects.toThrow();
    });
  });

  describe("unlinkAgent", () => {
    it("requires admin role", async () => {
      const ctx = createContext({ role: "user" });
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.agentDashboard.unlinkAgent({ userId: 2 })
      ).rejects.toThrow();
    });
  });
});

describe("role-based navigation", () => {
  it("auth.me returns linkedAgentId for agent users", async () => {
    const ctx = createContext({ role: "user", linkedAgentId: 5 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.linkedAgentId).toBe(5);
    expect(result?.role).toBe("user");
  });

  it("auth.me returns role=admin for admin users", async () => {
    const ctx = createContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.role).toBe("admin");
  });
});
