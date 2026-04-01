import { describe, expect, it, vi, beforeEach } from "vitest";
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

function createProtectedContext(): TrpcContext {
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

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("setupWizard", () => {
  describe("isSetupNeeded", () => {
    it("returns a result with needed boolean and reason", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.isSetupNeeded();
      expect(result).toHaveProperty("needed");
      expect(result).toHaveProperty("reason");
      expect(typeof result.needed).toBe("boolean");
      expect(typeof result.reason).toBe("string");
    });
  });

  describe("getProgress", () => {
    it("returns progress object with all step flags", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.getProgress();
      expect(result).toHaveProperty("branding");
      expect(result).toHaveProperty("freepbx");
      expect(result).toHaveProperty("apiKeys");
      expect(result).toHaveProperty("smtp");
      expect(result).toHaveProperty("agent");
      expect(typeof result.branding).toBe("boolean");
      expect(typeof result.freepbx).toBe("boolean");
      expect(typeof result.apiKeys).toBe("boolean");
      expect(typeof result.smtp).toBe("boolean");
      expect(typeof result.agent).toBe("boolean");
    });
  });

  describe("saveBranding", () => {
    it("saves branding settings and returns success", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.saveBranding({
        appName: "Test Dialer",
        tagline: "Test tagline",
        primaryColor: "#16a34a",
        accentColor: "#f97316",
      });
      expect(result).toEqual({ success: true });
    });

    it("saves branding with only required appName", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.saveBranding({
        appName: "Minimal Dialer",
      });
      expect(result).toEqual({ success: true });
    });

    it("rejects empty appName", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.setupWizard.saveBranding({ appName: "" })
      ).rejects.toThrow();
    });
  });

  describe("saveApiKeys", () => {
    it("saves API keys and returns success", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.saveApiKeys({
        openaiKey: "sk-test-key-12345",
        googleTtsKey: "AIzaSy-test-key",
      });
      expect(result).toEqual({ success: true });
    });

    it("saves with only openai key", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.saveApiKeys({
        openaiKey: "sk-test-key-12345",
      });
      expect(result).toEqual({ success: true });
    });

    it("saves with no keys (both optional)", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.saveApiKeys({});
      expect(result).toEqual({ success: true });
    });
  });

  describe("markAgentDone", () => {
    it("marks agent step as done and returns success", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.markAgentDone();
      expect(result).toEqual({ success: true });
    });
  });

  describe("complete", () => {
    it("marks wizard as complete and returns success", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.complete();
      expect(result).toEqual({ success: true });
    });
  });

  describe("skip", () => {
    it("marks wizard as skipped and returns success", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.skip();
      expect(result).toEqual({ success: true });
    });
  });

  describe("healthCheck", () => {
    it("returns checks array and summary", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.healthCheck();
      expect(result).toHaveProperty("checks");
      expect(result).toHaveProperty("summary");
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      // Each check should have name, status, message
      for (const check of result.checks) {
        expect(check).toHaveProperty("name");
        expect(check).toHaveProperty("status");
        expect(check).toHaveProperty("message");
        expect(["ok", "warning", "error", "unconfigured"]).toContain(check.status);
      }
      // Summary should have counts
      expect(result.summary).toHaveProperty("ok");
      expect(result.summary).toHaveProperty("error");
      expect(result.summary).toHaveProperty("warning");
      expect(result.summary).toHaveProperty("unconfigured");
      expect(result.summary).toHaveProperty("total");
      expect(result.summary.total).toBe(result.checks.length);
    });

    it("includes Database, PBX Agent, FreePBX AMI, OpenAI, Google TTS, Email, Caller IDs checks", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.setupWizard.healthCheck();
      const checkNames = result.checks.map(c => c.name);
      expect(checkNames).toContain("Database");
      expect(checkNames).toContain("PBX Agent");
      expect(checkNames).toContain("FreePBX AMI");
      expect(checkNames).toContain("OpenAI API");
      expect(checkNames).toContain("Google TTS");
      expect(checkNames).toContain("Email (SMTP)");
      expect(checkNames).toContain("Caller IDs");
    });
  });

  describe("access control", () => {
    it("getProgress requires authentication", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.setupWizard.getProgress()).rejects.toThrow();
    });

    it("saveBranding requires admin role", async () => {
      const ctx = createProtectedContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.setupWizard.saveBranding({ appName: "Test" })
      ).rejects.toThrow();
    });

    it("complete requires admin role", async () => {
      const ctx = createProtectedContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.setupWizard.complete()).rejects.toThrow();
    });

    it("skip requires admin role", async () => {
      const ctx = createProtectedContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.setupWizard.skip()).rejects.toThrow();
    });
  });
});
