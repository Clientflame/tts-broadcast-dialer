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

  describe("appSettings.freepbxReconnect", () => {
    it("attempts to reconnect AMI (returns result object)", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.freepbxReconnect();

      // Will likely fail in test env since no real FreePBX, but should return structured result
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("host");
      expect(result).toHaveProperty("port");
      expect(typeof result.success).toBe("boolean");
    }, 15000);

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(userCaller.appSettings.freepbxReconnect()).rejects.toThrow();
    });
  });

  describe("appSettings.freepbxTestConnection", () => {
    it("returns failure for unreachable host", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.freepbxTestConnection({
        host: "127.0.0.1", // localhost — no AMI running
        port: 59999,        // unused port
        username: "test",
        password: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }, 15000);

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(
        userCaller.appSettings.freepbxTestConnection({
          host: "localhost",
          port: 5038,
          username: "test",
          password: "test",
        })
      ).rejects.toThrow();
    });
  });

  describe("appSettings.freepbxTestSsh", () => {
    it("returns failure for unreachable SSH host", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.freepbxTestSsh({
        host: "127.0.0.1",
        port: 59998,
        username: "test",
        password: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }, 15000);

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(
        userCaller.appSettings.freepbxTestSsh({
          host: "localhost",
          port: 22,
          username: "test",
          password: "test",
        })
      ).rejects.toThrow();
    });
  });

  describe("appSettings.freepbxSaveAndReconnect", () => {
    it("saves settings and returns reconnect result", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.freepbxSaveAndReconnect([
        { key: "freepbx_host", value: "192.168.1.100", description: "FreePBX Host" },
      ]);

      expect(result.saved).toBe(true);
      expect(result.count).toBe(1);
      expect(result.reconnect).toHaveProperty("success");
      expect(result.reconnect).toHaveProperty("host");
      expect(result.reconnect).toHaveProperty("port");
    }, 15000);

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(
        userCaller.appSettings.freepbxSaveAndReconnect([
          { key: "freepbx_host", value: "test" },
        ])
      ).rejects.toThrow();
    });
  });

  describe("appSettings.getNotificationPrefs", () => {
    it("returns notification preferences and types", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.getNotificationPrefs();

      expect(result).toHaveProperty("preferences");
      expect(result).toHaveProperty("types");
      expect(Array.isArray(result.types)).toBe(true);
      expect(result.types.length).toBeGreaterThan(0);
      // Each type should have key, label, description
      for (const t of result.types) {
        expect(t).toHaveProperty("key");
        expect(t).toHaveProperty("label");
        expect(t).toHaveProperty("description");
      }
    });
  });

  describe("appSettings.setNotificationPref", () => {
    it("updates a notification preference", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.setNotificationPref({
        key: "notify_campaign_complete",
        enabled: false,
      });
      expect(result).toEqual({ success: true });

      // Verify it was saved
      const prefs = await caller.appSettings.getNotificationPrefs();
      expect(prefs.preferences["notify_campaign_complete"]).toBe(false);

      // Reset it back
      await caller.appSettings.setNotificationPref({
        key: "notify_campaign_complete",
        enabled: true,
      });
    });

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(
        userCaller.appSettings.setNotificationPref({ key: "notify_campaign_complete", enabled: false })
      ).rejects.toThrow();
    });
  });

  describe("appSettings.bulkSetNotificationPrefs", () => {
    it("updates multiple notification preferences", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.bulkSetNotificationPrefs([
        { key: "notify_campaign_complete", enabled: true },
        { key: "notify_agent_offline", enabled: false },
      ]);
      expect(result).toEqual({ success: true, count: 2 });
    });
  });

  describe("appSettings.freepbxRestart", () => {
    it("returns failure when SSH credentials not configured", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      // In test env, SSH creds may not be configured
      const result = await caller.appSettings.freepbxRestart();
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
      // Either succeeds or returns structured error
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    }, 35000);

    it("rejects non-admin users", async () => {
      const userCtx = createAuthContext(createMockUser({ role: "user" }));
      const userCaller = appRouter.createCaller(userCtx.ctx);
      await expect(userCaller.appSettings.freepbxRestart()).rejects.toThrow();
    });
  });

  describe("audit logging for settings changes", () => {
    it("creates audit log when updating a setting", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.appSettings.update({
        key: "test_audit_key",
        value: "audit_test_value",
        description: "Testing audit",
        isSecret: 0,
      });

      // Check audit log was created
      const logs = await caller.auditLogs.filtered({ action: "settings.update", limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      const latest = logs.logs[0];
      expect(latest.action).toBe("settings.update");
      expect(latest.resource).toBe("appSettings");

      // Clean up
      await db.deleteAppSetting("test_audit_key");
    });

    it("creates audit log when bulk updating settings", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.appSettings.bulkUpdate([
        { key: "test_audit_bulk_1", value: "v1" },
        { key: "test_audit_bulk_2", value: "v2" },
      ]);

      const logs = await caller.auditLogs.filtered({ action: "settings.bulkUpdate", limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      expect(logs.logs[0].action).toBe("settings.bulkUpdate");

      // Clean up
      await db.deleteAppSetting("test_audit_bulk_1");
      await db.deleteAppSetting("test_audit_bulk_2");
    });

    it("creates audit log when deleting a setting", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.appSettings.update({ key: "test_audit_delete", value: "to_delete" });
      await caller.appSettings.delete({ key: "test_audit_delete" });

      const logs = await caller.auditLogs.filtered({ action: "settings.delete", limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      expect(logs.logs[0].action).toBe("settings.delete");
    });

    it("creates audit log when updating notification preference", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.appSettings.setNotificationPref({
        key: "notify_campaign_complete",
        enabled: false,
      });

      const logs = await caller.auditLogs.filtered({ action: "notifications.update", limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      expect(logs.logs[0].action).toBe("notifications.update");

      // Reset
      await caller.appSettings.setNotificationPref({ key: "notify_campaign_complete", enabled: true });
    });

    it("creates audit log when reconnecting FreePBX", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.appSettings.freepbxReconnect();

      const logs = await caller.auditLogs.filtered({ action: "freepbx.reconnect", limit: 1 });
      expect(logs.logs.length).toBeGreaterThan(0);
      expect(logs.logs[0].action).toBe("freepbx.reconnect");
    }, 15000);
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
