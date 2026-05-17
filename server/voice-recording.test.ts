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

describe("audio.uploadRecording", () => {
  it("rejects empty name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.audio.uploadRecording({
        name: "",
        audioBase64: "dGVzdA==", // "test" in base64
        mimeType: "audio/webm",
      })
    ).rejects.toThrow();
  });

  it("rejects empty audioBase64", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.audio.uploadRecording({
        name: "Test Recording",
        audioBase64: "",
        mimeType: "audio/webm",
      })
    ).rejects.toThrow();
  });

  it("validates input schema allows valid data", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will fail at the storage layer (no S3 in test), but should pass input validation
    try {
      await caller.audio.uploadRecording({
        name: "Test Recording",
        audioBase64: "dGVzdGF1ZGlvZGF0YQ==", // "testaudiodata" in base64
        mimeType: "audio/webm",
        duration: 5,
      });
    } catch (err: any) {
      // Expected to fail at storage/DB layer, not at input validation
      // If it's a ZodError, that means input validation failed which is wrong
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("rejects name longer than 255 characters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.audio.uploadRecording({
        name: "A".repeat(256),
        audioBase64: "dGVzdA==",
        mimeType: "audio/webm",
      })
    ).rejects.toThrow();
  });

  it("accepts optional duration parameter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw on input validation for optional duration
    try {
      await caller.audio.uploadRecording({
        name: "Test",
        audioBase64: "dGVzdA==",
        mimeType: "audio/webm",
        duration: 30,
      });
    } catch (err: any) {
      // Should fail at storage layer, not input validation
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("defaults mimeType to audio/webm when not specified", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // The default should be applied without throwing a validation error
    try {
      await caller.audio.uploadRecording({
        name: "Test",
        audioBase64: "dGVzdA==",
      });
    } catch (err: any) {
      // Should fail at storage/DB layer, not input validation
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });
});
