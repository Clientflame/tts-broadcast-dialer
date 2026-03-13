import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { validatePassword } from "../shared/passwordValidation";

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
      cookie: () => {},
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
      cookie: () => {},
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
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

// ─── Password Validation Tests ──────────────────────────────────────────────

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const result = validatePassword("Ab1!xyz");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Must be at least 8 characters");
  });

  it("rejects passwords without uppercase letters", () => {
    const result = validatePassword("abcdefg1!");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Must contain at least one uppercase letter");
  });

  it("rejects passwords without lowercase letters", () => {
    const result = validatePassword("ABCDEFG1!");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Must contain at least one lowercase letter");
  });

  it("rejects passwords without numbers", () => {
    const result = validatePassword("Abcdefgh!");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Must contain at least one number");
  });

  it("rejects passwords without special characters", () => {
    const result = validatePassword("Abcdefg1");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Must contain at least one special character (!@#$%^&*...)");
  });

  it("accepts valid strong passwords", () => {
    const result = validatePassword("MyStr0ng!Pass");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.strength).toBe("strong");
  });

  it("returns multiple errors for very weak passwords", () => {
    const result = validatePassword("abc");
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.strength).toBe("weak");
  });

  it("calculates strength correctly for fair passwords", () => {
    const result = validatePassword("Abcdefg1!");
    expect(result.isValid).toBe(true);
    expect(["fair", "strong"]).toContain(result.strength);
  });
});

// ─── Backend Password Validation Tests ──────────────────────────────────────

describe("setup procedure - password strength", () => {
  it("rejects weak passwords during setup", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.setup({ name: "Admin", email: "admin@test.com", password: "weakpass" })
    ).rejects.toThrow(); // Should fail either zod or password validation
  });

  it("rejects password without special characters during setup", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.setup({ name: "Admin", email: "admin@test.com", password: "Abcdefg1" })
    ).rejects.toThrow("Password too weak");
  });
});

describe("createWithPassword - password strength", () => {
  it("rejects weak passwords when creating users", async () => {
    const { ctx } = createAdminContext(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.createWithPassword({
        name: "New User",
        email: "newuser@test.com",
        password: "weakpass",
        role: "user",
      })
    ).rejects.toThrow(); // Zod or password validation
  });

  it("rejects passwords without special characters", async () => {
    const { ctx } = createAdminContext(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.createWithPassword({
        name: "New User",
        email: "newuser@test.com",
        password: "Abcdefg1",
        role: "user",
      })
    ).rejects.toThrow("Password too weak");
  });
});

describe("adminResetPassword - password strength", () => {
  it("rejects weak passwords for admin reset", async () => {
    const { ctx } = createAdminContext(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.userManagement.adminResetPassword({ userId: 2, newPassword: "Abcdefg1" })
    ).rejects.toThrow("Password too weak");
  });
});

describe("changePassword - password strength", () => {
  it("rejects weak new passwords", async () => {
    const { ctx } = createUserContext(2);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.changePassword({ currentPassword: "OldPass1!", newPassword: "Abcdefg1" })
    ).rejects.toThrow("Password too weak");
  });
});

describe("resetPassword - password strength", () => {
  it("rejects weak new passwords during reset", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.resetPassword({ token: "fake-token", newPassword: "Abcdefg1" })
    ).rejects.toThrow("Password too weak");
  });
});

// ─── Email Verification Tests ──────────────────────────────────────────────

describe("localAuth.verifyEmail", () => {
  it("rejects invalid verification tokens", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.verifyEmail({ token: "invalid-token-12345" })
    ).rejects.toThrow("Invalid or expired verification token");
  });

  it("rejects empty tokens", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.verifyEmail({ token: "" })
    ).rejects.toThrow(); // Zod validation
  });
});

describe("localAuth.resendVerification", () => {
  it("rejects non-admin users", async () => {
    const { ctx } = createUserContext(2);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.localAuth.resendVerification({ userId: 3, origin: "https://example.com" })
    ).rejects.toThrow(); // FORBIDDEN
  });
});
