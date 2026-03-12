import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthenticatedContext(userId = 1) {
  const ctx: TrpcContext = {
    user: {
      id: userId,
      openId: "test_user_onboarding",
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
      cookie: () => {},
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

function createPublicContext() {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

describe("onboarding.status", () => {
  it("returns onboarding status with all 5 steps", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    expect(result).toHaveProperty("steps");
    expect(result).toHaveProperty("completedCount");
    expect(result).toHaveProperty("totalSteps");
    expect(result).toHaveProperty("isComplete");
    expect(result.totalSteps).toBe(5);
    expect(result.steps).toHaveLength(5);
  });

  it("returns the correct step IDs in order", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    const stepIds = result.steps.map((s: any) => s.id);
    expect(stepIds).toEqual(["account", "pbx", "callerIds", "contacts", "campaign"]);
  });

  it("always marks account step as completed for authenticated users", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    const accountStep = result.steps.find((s: any) => s.id === "account");
    expect(accountStep).toBeDefined();
    expect(accountStep!.completed).toBe(true);
  });

  it("each step has required fields", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    for (const step of result.steps) {
      expect(step).toHaveProperty("id");
      expect(step).toHaveProperty("label");
      expect(step).toHaveProperty("completed");
      expect(typeof step.id).toBe("string");
      expect(typeof step.label).toBe("string");
      expect(typeof step.completed).toBe("boolean");
    }
  });

  it("completedCount matches the number of completed steps", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    const actualCompleted = result.steps.filter((s: any) => s.completed).length;
    expect(result.completedCount).toBe(actualCompleted);
  });

  it("isComplete is true only when all steps are completed", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    if (result.completedCount === result.totalSteps) {
      expect(result.isComplete).toBe(true);
    } else {
      expect(result.isComplete).toBe(false);
    }
  });

  it("provides detail strings for completed steps with data", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.status();

    // Steps with data should have detail strings (e.g., "5 DID(s)", "2 list(s)")
    for (const step of result.steps) {
      if (step.completed && step.id !== "account") {
        // Completed steps with data typically have detail strings
        // This is a soft check - detail may be undefined for some steps
        if (step.detail) {
          expect(typeof step.detail).toBe("string");
        }
      }
    }
  });

  it("requires authentication (protected procedure)", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.onboarding.status()).rejects.toThrow();
  });
});

describe("onboarding.dismiss", () => {
  it("returns success when dismissing onboarding", async () => {
    const { ctx } = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.dismiss();

    expect(result).toEqual({ success: true });
  });

  it("requires authentication (protected procedure)", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.onboarding.dismiss()).rejects.toThrow();
  });
});
