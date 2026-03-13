import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "email",
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
      get: () => "localhost:3000",
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createUserContext(userId = 2): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "email",
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
      get: () => "localhost:3000",
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
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
      get: () => "localhost:3000",
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("userManagement.deleteUser", () => {
  it("prevents admin from deleting themselves", async () => {
    const { ctx } = createAdminContext(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.deleteUser({ userId: 1 })
    ).rejects.toThrow("You cannot delete your own account");
  });

  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext(2);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.deleteUser({ userId: 3 })
    ).rejects.toThrow(); // Should throw FORBIDDEN
  });
});

describe("userManagement.adminResetPassword", () => {
  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext(2);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.adminResetPassword({ userId: 3, newPassword: "newpassword123" })
    ).rejects.toThrow(); // Should throw FORBIDDEN
  });

  it("validates minimum password length", async () => {
    const { ctx } = createAdminContext(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.adminResetPassword({ userId: 2, newPassword: "short" })
    ).rejects.toThrow(); // Zod validation should fail
  });
});

describe("localAuth.resetPasswordRequest", () => {
  it("returns success even for non-existent emails (no information leakage)", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.localAuth.resetPasswordRequest({
      email: "nonexistent@example.com",
      origin: "https://example.com",
    });

    expect(result).toEqual({ success: true });
  });

  it("accepts valid email format", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw for valid email
    const result = await caller.localAuth.resetPasswordRequest({
      email: "valid@test.com",
      origin: "https://example.com",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.resetPasswordRequest({
        email: "not-an-email",
        origin: "https://example.com",
      })
    ).rejects.toThrow();
  });
});

describe("appSettings.smtpStatus", () => {
  it("returns SMTP status for authenticated users", async () => {
    const { ctx } = createUserContext(2);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.appSettings.smtpStatus();

    expect(result).toHaveProperty("configured");
    expect(typeof result.configured).toBe("boolean");
  });
});

describe("appSettings.testSmtp", () => {
  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext(2);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.appSettings.testSmtp()
    ).rejects.toThrow(); // Should throw FORBIDDEN
  });
});
