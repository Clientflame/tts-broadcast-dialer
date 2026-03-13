import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-settings-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createAuthContext(user?: AuthenticatedUser): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: user || createMockUser(),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx };
}

describe("appSettings", () => {
  // Clean up test settings after all tests
  afterAll(async () => {
    try {
      await db.deleteAppSetting("test_setting_key");
      await db.deleteAppSetting("test_secret_key");
    } catch (_) {
      // ignore cleanup errors
    }
  });

  describe("appSettings.list", () => {
    it("returns settings list for admin user", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("masks secret values for non-admin users", async () => {
      // First, create a secret setting as admin
      const adminCtx = createAuthContext();
      const adminCaller = appRouter.createCaller(adminCtx.ctx);
      await adminCaller.appSettings.update({
        key: "test_secret_key",
        value: "super-secret-value",
        description: "Test secret",
        isSecret: 1,
      });

      // Now read as non-admin
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      const result = await userCaller.appSettings.list();
      const secretSetting = result.find(s => s.key === "test_secret_key");
      if (secretSetting) {
        expect(secretSetting.value).toBe("••••••••");
      }
    });
  });

  describe("appSettings.update", () => {
    it("creates a new setting", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.appSettings.update({
        key: "test_setting_key",
        value: "test_value",
        description: "A test setting",
        isSecret: 0,
      });

      expect(result).toEqual({ success: true });

      // Verify it was saved
      const getResult = await caller.appSettings.get({ key: "test_setting_key" });
      expect(getResult.value).toBe("test_value");
    });

    it("updates an existing setting", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.appSettings.update({
        key: "test_setting_key",
        value: "updated_value",
      });

      const getResult = await caller.appSettings.get({ key: "test_setting_key" });
      expect(getResult.value).toBe("updated_value");
    });

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);

      await expect(
        userCaller.appSettings.update({
          key: "test_setting_key",
          value: "hacked",
        })
      ).rejects.toThrow();
    });
  });

  describe("appSettings.bulkUpdate", () => {
    it("updates multiple settings at once", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.appSettings.bulkUpdate([
        { key: "test_setting_key", value: "bulk_1" },
        { key: "test_secret_key", value: "bulk_2", isSecret: 1 },
      ]);

      expect(result).toEqual({ success: true, count: 2 });
    });
  });

  describe("appSettings.ttsStatus", () => {
    it("returns TTS configuration status", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.ttsStatus();

      expect(result).toHaveProperty("openaiConfigured");
      expect(result).toHaveProperty("googleConfigured");
      expect(typeof result.openaiConfigured).toBe("boolean");
      expect(typeof result.googleConfigured).toBe("boolean");
    });
  });

  describe("appSettings.delete", () => {
    it("deletes a setting", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Create then delete
      await caller.appSettings.update({ key: "test_setting_key", value: "to_delete" });
      const deleteResult = await caller.appSettings.delete({ key: "test_setting_key" });
      expect(deleteResult).toEqual({ success: true });

      // Verify it's gone
      const getResult = await caller.appSettings.get({ key: "test_setting_key" });
      expect(getResult.value).toBeNull();
    });
  });

  describe("appSettings.testTtsKey", () => {
    it("rejects an invalid OpenAI key", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.testTtsKey({
        provider: "openai",
        apiKey: "sk-invalid-key-12345",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("rejects an invalid Google key", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.testTtsKey({
        provider: "google",
        apiKey: "AIza-invalid-key-12345",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(
        userCaller.appSettings.testTtsKey({ provider: "openai", apiKey: "sk-test" })
      ).rejects.toThrow();
    });
  });

  describe("appSettings.freepbxStatus", () => {
    it("returns FreePBX configuration status", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.freepbxStatus();

      expect(result).toHaveProperty("hostConfigured");
      expect(result).toHaveProperty("amiConfigured");
      expect(result).toHaveProperty("sshConfigured");
      expect(typeof result.hostConfigured).toBe("boolean");
      expect(typeof result.amiConfigured).toBe("boolean");
      expect(typeof result.sshConfigured).toBe("boolean");
    });

    it("returns host and user info", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.freepbxStatus();

      expect(result).toHaveProperty("host");
      expect(result).toHaveProperty("amiPort");
      expect(result).toHaveProperty("amiUser");
      expect(result).toHaveProperty("sshUser");
    });
  });
});
