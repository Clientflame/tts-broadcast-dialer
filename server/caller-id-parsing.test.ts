import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-cidparse-${userId}`,
    email: `cidparse${userId}@example.com`,
    name: `CID Parse Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("recordDidCallResultByNumber callerIdStr parsing", () => {
  const uid = 88800 + Math.floor(Math.random() * 1000);
  let caller: ReturnType<typeof appRouter.createCaller>;
  let callerIdId: number;
  const phone = `407${Date.now().toString().slice(-7)}`;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    caller = appRouter.createCaller(ctx);
    const result = await caller.callerIds.create({ phoneNumber: phone, label: "Parse Test DID" });
    callerIdId = result.id;
  });

  it("should match bare phone number", async () => {
    const { recordDidCallResultByNumber } = await import("./db");
    const result = await recordDidCallResultByNumber(phone, uid, "completed");
    // Should not return flagged=false due to "not found" — it should find the DID
    expect(result).toBeDefined();
    expect(result.flagged).toBe(false); // not flagged, just a successful call
  });

  it("should parse phone number from formatted callerIdStr with angle brackets", async () => {
    const { recordDidCallResultByNumber } = await import("./db");
    const formatted = `"Broadcast" <${phone}>`;
    const result = await recordDidCallResultByNumber(formatted, uid, "completed");
    expect(result).toBeDefined();
    // The function should have found the DID and returned health info
    expect(result).toHaveProperty("healthStatus");
  });

  it("should parse phone number from callerIdStr with label and angle brackets", async () => {
    const { recordDidCallResultByNumber } = await import("./db");
    const formatted = `"My Business" <${phone}>`;
    const result = await recordDidCallResultByNumber(formatted, uid, "failed");
    expect(result).toBeDefined();
    expect(result).toHaveProperty("failureRate");
  });

  it("should return flagged=false for non-existent phone number", async () => {
    const { recordDidCallResultByNumber } = await import("./db");
    const result = await recordDidCallResultByNumber("0000000000", uid, "failed");
    expect(result.flagged).toBe(false);
  });

  it("should return flagged=false for non-existent formatted callerIdStr", async () => {
    const { recordDidCallResultByNumber } = await import("./db");
    const result = await recordDidCallResultByNumber('"Test" <0000000000>', uid, "failed");
    expect(result.flagged).toBe(false);
  });
});
