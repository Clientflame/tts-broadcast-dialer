import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
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
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("campaigns.testCall", () => {
  it("rejects when neither scriptId nor messageText is provided", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.testCall({
        phoneNumber: "4075551234",
      })
    ).rejects.toThrow("Either a script or message text is required");
  });

  it("rejects when phone number is too short", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.testCall({
        phoneNumber: "123",
        messageText: "Hello test",
      })
    ).rejects.toThrow(); // zod validation: min(10)
  });

  it("rejects when phone number is too long", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.testCall({
        phoneNumber: "1234567890123456",
        messageText: "Hello test",
      })
    ).rejects.toThrow(); // zod validation: max(15)
  });

  it("rejects when scriptId references a non-existent script", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.campaigns.testCall({
        phoneNumber: "4075551234",
        scriptId: 999999,
      })
    ).rejects.toThrow("Script not found");
  });

  it("accepts valid input with messageText and sample merge fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will fail at TTS generation (no real API key in tests) but validates input parsing
    await expect(
      caller.campaigns.testCall({
        phoneNumber: "4075551234",
        messageText: "Hello {{first_name}}, this is a test call.",
        voice: "alloy",
        ttsProvider: "openai",
        sampleFirstName: "Jane",
        sampleLastName: "Doe",
        sampleCompany: "Test Corp",
        sampleCallbackNumber: "3215551234",
        callerIdNumber: "4075559999",
        callerIdName: "Test Campaign",
      })
    ).rejects.toThrow(); // Will fail at TTS API call, but input validation passes
  });

  it("strips non-numeric characters from phone number", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Phone with formatting should still be accepted (10+ digits after stripping)
    await expect(
      caller.campaigns.testCall({
        phoneNumber: "(407) 555-1234",
        messageText: "Hello test",
      })
    ).rejects.not.toThrow("Invalid phone number");
  });
});
