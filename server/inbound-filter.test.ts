import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-filter",
    email: "filter@example.com",
    name: "Filter Test User",
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
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("inboundFilter", () => {
  describe("messages", () => {
    it("lists messages (initially empty)", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const messages = await caller.inboundFilter.messages.list();
      expect(Array.isArray(messages)).toBe(true);
    });

    it("creates a rejection message", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inboundFilter.messages.create({
        name: "Test Rejection",
        messageText: "Sorry, this number is not accepting calls.",
        voice: "en-US-Wavenet-F",
        isDefault: 1,
      });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it("updates a rejection message", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      // Create first
      const created = await caller.inboundFilter.messages.create({
        name: "Update Test",
        messageText: "Original message",
      });
      // Update
      const result = await caller.inboundFilter.messages.update({
        id: created.id,
        name: "Updated Name",
        messageText: "Updated message text",
      });
      expect(result).toEqual({ success: true });
    });

    it("deletes a rejection message", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const created = await caller.inboundFilter.messages.create({
        name: "Delete Test",
        messageText: "Will be deleted",
      });
      const result = await caller.inboundFilter.messages.delete({ id: created.id });
      expect(result).toEqual({ success: true });
    });
  });

  describe("rules", () => {
    it("lists filter rules", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const rules = await caller.inboundFilter.rules.list();
      expect(Array.isArray(rules)).toBe(true);
    });

    it("creates a filter rule", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inboundFilter.rules.create({
        callerIdId: 1,
        didNumber: "5551234567",
        enabled: 1,
        filterMode: "whitelist",
        checkInternalContacts: 1,
        checkExternalCrm: 0,
        checkManualWhitelist: 1,
      });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it("updates a filter rule", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const created = await caller.inboundFilter.rules.create({
        callerIdId: 2,
        didNumber: "5559876543",
        enabled: 1,
        filterMode: "whitelist",
      });
      const result = await caller.inboundFilter.rules.update({
        id: created.id,
        filterMode: "blacklist",
        enabled: 0,
      });
      expect(result).toEqual({ success: true });
    });

    it("bulk toggles filter rules", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const r1 = await caller.inboundFilter.rules.create({
        callerIdId: 10,
        didNumber: "5550000001",
        enabled: 1,
        filterMode: "whitelist",
      });
      const r2 = await caller.inboundFilter.rules.create({
        callerIdId: 11,
        didNumber: "5550000002",
        enabled: 1,
        filterMode: "whitelist",
      });
      const result = await caller.inboundFilter.rules.bulkToggle({
        ruleIds: [r1.id, r2.id],
        enabled: false,
      });
      expect(result).toBeDefined();
    });

    it("deletes a filter rule", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const created = await caller.inboundFilter.rules.create({
        callerIdId: 3,
        didNumber: "5551112222",
        enabled: 1,
        filterMode: "whitelist",
      });
      const result = await caller.inboundFilter.rules.delete({ id: created.id });
      expect(result).toEqual({ success: true });
    });
  });

  describe("whitelist", () => {
    it("lists whitelist entries", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const list = await caller.inboundFilter.whitelist.list();
      expect(Array.isArray(list)).toBe(true);
    });

    it("adds a phone to whitelist", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inboundFilter.whitelist.add({
        phoneNumber: "5553334444",
        name: "Test Whitelist",
        reason: "VIP customer",
      });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it("removes a phone from whitelist", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const added = await caller.inboundFilter.whitelist.add({
        phoneNumber: "5555556666",
        name: "Remove Test",
      });
      const result = await caller.inboundFilter.whitelist.remove({ id: added.id });
      expect(result).toEqual({ success: true });
    });

    it("bulk adds to whitelist", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inboundFilter.whitelist.bulkAdd({
        entries: [
          { phoneNumber: "5551110001", name: "Bulk 1" },
          { phoneNumber: "5551110002", name: "Bulk 2" },
          { phoneNumber: "5551110003", name: "Bulk 3" },
        ],
      });
      expect(result).toBeDefined();
    });
  });

  describe("blacklist", () => {
    it("lists blacklist entries", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const list = await caller.inboundFilter.blacklist.list();
      expect(Array.isArray(list)).toBe(true);
    });

    it("adds a phone to blacklist", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inboundFilter.blacklist.add({
        phoneNumber: "5557778888",
        name: "Spam Caller",
        reason: "Repeated spam",
      });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it("removes a phone from blacklist", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const added = await caller.inboundFilter.blacklist.add({
        phoneNumber: "5559990000",
        name: "Remove Test",
      });
      const result = await caller.inboundFilter.blacklist.remove({ id: added.id });
      expect(result).toEqual({ success: true });
    });
  });

  describe("logs", () => {
    it("lists filter logs", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const logs = await caller.inboundFilter.logs.list({ limit: 10 });
      expect(Array.isArray(logs)).toBe(true);
    });

    it("gets filter stats", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const stats = await caller.inboundFilter.logs.stats();
      expect(stats).toBeDefined();
    });
  });

  describe("crm", () => {
    it("lists CRM integrations", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const integrations = await caller.inboundFilter.crm.list();
      expect(Array.isArray(integrations)).toBe(true);
    });

    it("creates a CRM integration", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inboundFilter.crm.create({
        provider: "vtiger",
        name: "Test Vtiger",
        apiUrl: "https://test.vtiger.com/restapi/v1/vtiger/default",
        apiUsername: "admin@test.com",
        apiKeyField: "test_crm_key",
      });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it("deletes a CRM integration", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const created = await caller.inboundFilter.crm.create({
        provider: "vtiger",
        name: "Delete Test CRM",
        apiUrl: "https://delete.vtiger.com",
        apiKeyField: "delete_key",
      });
      const result = await caller.inboundFilter.crm.delete({ id: created.id });
      expect(result).toEqual({ success: true });
    });
  });

  describe("checkCaller (public API)", () => {
    it("rejects with invalid agent API key", async () => {
      const { ctx } = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.inboundFilter.checkCaller({
          didNumber: "5551234567",
          callerNumber: "5559876543",
          agentApiKey: "invalid-key-12345",
        })
      ).rejects.toThrow();
    });
  });
});
