import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-deploy-user",
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

function createUserContext(): { ctx: TrpcContext } {
  return createAuthContext(createMockUser({ id: 2, role: "user", openId: "test-deploy-regular" }));
}

// Track created deployment IDs for cleanup
const createdIds: number[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    try { await db.deleteClientDeployment(id); } catch {}
  }
});

describe("deployments", () => {
  describe("deployments.list", () => {
    it("returns deployment list for admin user", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.deployments.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const { ctx } = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.deployments.list()).rejects.toThrow();
    });
  });

  describe("deployments.create", () => {
    it("creates a new deployment record", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.deployments.create({
        clientName: "Test Client Corp",
        serverIp: "10.0.0.1",
        domain: "test.example.com",
        version: "1.4.0",
        environment: "staging",
        pbxHost: "10.0.0.2",
        contactEmail: "admin@test.com",
      });
      expect(result.id).toBeGreaterThan(0);
      createdIds.push(result.id);
    });

    it("rejects non-admin users", async () => {
      const { ctx } = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.deployments.create({ clientName: "Hack", serverIp: "1.1.1.1" })
      ).rejects.toThrow();
    });
  });

  describe("deployments.get", () => {
    it("returns a deployment by ID", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      // Create one first
      const { id } = await caller.deployments.create({
        clientName: "Get Test Client",
        serverIp: "10.0.0.3",
      });
      createdIds.push(id);

      const deployment = await caller.deployments.get({ id });
      expect(deployment.clientName).toBe("Get Test Client");
      expect(deployment.serverIp).toBe("10.0.0.3");
      expect(deployment.status).toBe("provisioning");
    });

    it("throws NOT_FOUND for non-existent deployment", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.deployments.get({ id: 999999 })).rejects.toThrow("Deployment not found");
    });
  });

  describe("deployments.update", () => {
    it("updates deployment fields", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const { id } = await caller.deployments.create({
        clientName: "Update Test",
        serverIp: "10.0.0.4",
      });
      createdIds.push(id);

      await caller.deployments.update({
        id,
        status: "online",
        version: "1.5.0",
        domain: "updated.example.com",
      });

      const updated = await caller.deployments.get({ id });
      expect(updated.status).toBe("online");
      expect(updated.version).toBe("1.5.0");
      expect(updated.domain).toBe("updated.example.com");
    });
  });

  describe("deployments.delete", () => {
    it("deletes a deployment record", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const { id } = await caller.deployments.create({
        clientName: "Delete Test",
        serverIp: "10.0.0.5",
      });

      const result = await caller.deployments.delete({ id });
      expect(result.success).toBe(true);

      await expect(caller.deployments.get({ id })).rejects.toThrow("Deployment not found");
    });
  });

  describe("deployments.stats", () => {
    it("returns deployment summary statistics", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const stats = await caller.deployments.stats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("online");
      expect(stats).toHaveProperty("degraded");
      expect(stats).toHaveProperty("offline");
      expect(stats).toHaveProperty("maintenance");
      expect(stats).toHaveProperty("provisioning");
      expect(typeof stats.total).toBe("number");
    });
  });

  describe("deployments.heartbeat", () => {
    it("rejects with invalid API key", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.deployments.heartbeat({
          deploymentId: 1,
          apiKey: "invalid-key",
          status: "online",
        })
      ).rejects.toThrow("Invalid API key");
    });
  });
});

describe("branding", () => {
  describe("appSettings.getBranding", () => {
    it("returns branding settings with defaults", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.getBranding();
      expect(result).toHaveProperty("appName");
      expect(result).toHaveProperty("logoUrl");
      expect(result).toHaveProperty("primaryColor");
      expect(result).toHaveProperty("accentColor");
      expect(result).toHaveProperty("tagline");
      // Defaults
      expect(typeof result.appName).toBe("string");
      expect(typeof result.primaryColor).toBe("string");
    });

    it("is accessible without authentication (public procedure)", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: () => {} } as TrpcContext["res"],
      };
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.getBranding();
      expect(result.appName).toBeTruthy();
    });
  });

  describe("appSettings.uploadLogo", () => {
    it("rejects non-admin users", async () => {
      const { ctx } = createUserContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.appSettings.uploadLogo({
          base64: "iVBORw0KGgoAAAANSUhEUg==",
          mimeType: "image/png",
          fileName: "logo.png",
        })
      ).rejects.toThrow();
    });
  });

  describe("branding via bulkUpdate", () => {
    it("saves branding settings via bulkUpdate", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.appSettings.bulkUpdate([
        { key: "branding_app_name", value: "Test Brand Name" },
        { key: "branding_primary_color", value: "#ff0000" },
        { key: "branding_tagline", value: "Test tagline" },
      ]);
      expect(result.success).toBe(true);

      const branding = await caller.appSettings.getBranding();
      expect(branding.appName).toBe("Test Brand Name");
      expect(branding.primaryColor).toBe("#ff0000");
      expect(branding.tagline).toBe("Test tagline");

      // Clean up
      await caller.appSettings.bulkUpdate([
        { key: "branding_app_name", value: null },
        { key: "branding_primary_color", value: null },
        { key: "branding_tagline", value: null },
      ]);
    });
  });
});
