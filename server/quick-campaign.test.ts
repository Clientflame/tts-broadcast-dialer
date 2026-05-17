import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
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
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

describe("Quick Campaign Wizard - campaigns.create input validation", () => {
  it("rejects campaign with empty name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.create({
        name: "",
        contactListId: 1,
        audioFileId: 1,
      })
    ).rejects.toThrow();
  });

  it("rejects campaign with name longer than 255 characters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.create({
        name: "A".repeat(256),
        contactListId: 1,
        audioFileId: 1,
      })
    ).rejects.toThrow();
  });

  it("accepts valid quick campaign input (fails at DB layer, not validation)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This should pass input validation but fail at the DB layer
    try {
      await caller.campaigns.create({
        name: "Quick Monday Outreach",
        contactListId: 1,
        audioFileId: 1,
        useDidRotation: 1,
        maxConcurrentCalls: 5,
      });
    } catch (err: any) {
      // Should fail at DB layer, not input validation
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("accepts optional callerIdNumber in quick campaign input", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.campaigns.create({
        name: "Quick Test Campaign",
        contactListId: 1,
        audioFileId: 1,
        callerIdNumber: "8337040058",
        useDidRotation: 1,
        maxConcurrentCalls: 5,
      });
    } catch (err: any) {
      // Should fail at DB layer, not input validation
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("rejects callerIdNumber longer than 20 characters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.create({
        name: "Test Campaign",
        contactListId: 1,
        audioFileId: 1,
        callerIdNumber: "123456789012345678901", // 21 chars
      })
    ).rejects.toThrow();
  });

  it("accepts maxConcurrentCalls within valid range", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.campaigns.create({
        name: "Concurrent Test",
        contactListId: 1,
        audioFileId: 1,
        maxConcurrentCalls: 75,
      });
    } catch (err: any) {
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("rejects maxConcurrentCalls above 75", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.create({
        name: "Too Many Calls",
        contactListId: 1,
        audioFileId: 1,
        maxConcurrentCalls: 76,
      })
    ).rejects.toThrow();
  });
});

describe("Quick Campaign Wizard - campaigns.start input validation", () => {
  it("rejects start without campaign id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      // @ts-expect-error - testing missing required field
      caller.campaigns.start({})
    ).rejects.toThrow();
  });

  it("accepts valid campaign id for start (fails at DB layer)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.campaigns.start({ id: 999999 });
    } catch (err: any) {
      // Should fail at DB/logic layer, not input validation
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });
});
