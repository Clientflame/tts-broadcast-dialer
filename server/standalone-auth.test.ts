import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createPublicContext() {
  const setCookies: CookieCall[] = [];
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookies, clearedCookies };
}

function createAdminContext() {
  const setCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: {
      id: 1,
      openId: "local_admin_test",
      email: "admin@test.com",
      name: "Test Admin",
      loginMethod: "email",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookies };
}

describe("auth.config", () => {
  it("returns auth configuration with oauthConfigured and hasUsers flags", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const config = await caller.auth.config();

    expect(config).toHaveProperty("oauthConfigured");
    expect(config).toHaveProperty("hasUsers");
    expect(config).toHaveProperty("standaloneMode");
    expect(typeof config.oauthConfigured).toBe("boolean");
    expect(typeof config.hasUsers).toBe("boolean");
    expect(typeof config.standaloneMode).toBe("boolean");
    // standaloneMode should be the inverse of oauthConfigured
    expect(config.standaloneMode).toBe(!config.oauthConfigured);
  });

  it("reports hasUsers as true when users exist in the database", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const config = await caller.auth.config();

    // The test database should have existing users
    expect(config.hasUsers).toBe(true);
  });
});

describe("auth.setup", () => {
  it("rejects setup when users already exist", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.setup({
        name: "New Admin",
        email: "newadmin@test.com",
        password: "TestPassword123!",
      })
    ).rejects.toThrow(/Setup already completed/);
  });

  it("validates email format", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.setup({
        name: "Test",
        email: "not-an-email",
        password: "TestPassword123!",
      })
    ).rejects.toThrow();
  });

  it("validates password minimum length", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.setup({
        name: "Test",
        email: "test@example.com",
        password: "short",
      })
    ).rejects.toThrow();
  });
});

describe("localAuth.login", () => {
  it("rejects login with non-existent email", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.login({
        email: "nonexistent@test.com",
        password: "anypassword",
      })
    ).rejects.toThrow(/Invalid email or password/);
  });

  it("validates email format on login", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.login({
        email: "not-valid",
        password: "anypassword",
      })
    ).rejects.toThrow();
  });
});

describe("localAuth.changePassword", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    // changePassword is a protectedProcedure, so calling without user should fail
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.changePassword({
        currentPassword: "old",
        newPassword: "NewPassword123!",
      })
    ).rejects.toThrow();
  });
});

describe("localAuth.resetPasswordRequest", () => {
  it("always returns success even for non-existent emails (no email enumeration)", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.localAuth.resetPasswordRequest({
      email: "doesnotexist@test.com",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("localAuth.resetPassword", () => {
  it("rejects invalid reset tokens", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.resetPassword({
        token: "invalid_token_12345",
        newPassword: "NewPassword123!",
      })
    ).rejects.toThrow(/Invalid or expired reset token/);
  });

  it("validates new password minimum length", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.resetPassword({
        token: "some_token",
        newPassword: "short",
      })
    ).rejects.toThrow();
  });
});
