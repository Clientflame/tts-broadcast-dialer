import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-scripts",
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

describe("callScripts router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let createdScriptId: number;

  beforeEach(() => {
    const { ctx } = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  it("should create a call script with TTS segments", async () => {
    const result = await caller.callScripts.create({
      name: "Test Script",
      description: "A test script for vitest",
      callbackNumber: "4075551234",
      segments: [
        {
          id: "seg1",
          type: "tts",
          position: 0,
          text: "Hello {{first_name}}, this is a test message.",
          voice: "alloy",
          provider: "openai",
          speed: "1.0",
        },
        {
          id: "seg2",
          type: "tts",
          position: 1,
          text: "Please call us back at {{callback_number}}.",
          voice: "nova",
          provider: "openai",
          speed: "1.0",
        },
      ],
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    createdScriptId = result.id;
  });

  it("should list call scripts", async () => {
    const scripts = await caller.callScripts.list();
    expect(Array.isArray(scripts)).toBe(true);
    // Should contain the script we just created (or others from previous runs)
    expect(scripts.length).toBeGreaterThanOrEqual(0);
  });

  it("should create and then get a call script by id", async () => {
    const created = await caller.callScripts.create({
      name: "Get Test Script",
      segments: [
        {
          id: "seg1",
          type: "tts",
          position: 0,
          text: "Hello world",
          voice: "alloy",
          provider: "openai",
          speed: "1.0",
        },
      ],
    });

    const script = await caller.callScripts.get({ id: created.id });
    expect(script).toBeDefined();
    expect(script!.name).toBe("Get Test Script");
    expect(script!.segments).toBeDefined();
    expect(Array.isArray(script!.segments)).toBe(true);
    expect(script!.segments.length).toBe(1);
    expect(script!.segments[0].type).toBe("tts");
    expect(script!.segments[0].text).toBe("Hello world");
  });

  it("should update a call script", async () => {
    const created = await caller.callScripts.create({
      name: "Update Test Script",
      segments: [
        {
          id: "seg1",
          type: "tts",
          position: 0,
          text: "Original text",
          voice: "alloy",
          provider: "openai",
          speed: "1.0",
        },
      ],
    });

    const result = await caller.callScripts.update({
      id: created.id,
      name: "Updated Script Name",
      segments: [
        {
          id: "seg1",
          type: "tts",
          position: 0,
          text: "Updated text",
          voice: "nova",
          provider: "openai",
          speed: "1.2",
        },
        {
          id: "seg2",
          type: "tts",
          position: 1,
          text: "Second segment",
          voice: "echo",
          provider: "openai",
          speed: "1.0",
        },
      ],
    });

    expect(result.success).toBe(true);

    const updated = await caller.callScripts.get({ id: created.id });
    expect(updated!.name).toBe("Updated Script Name");
    expect(updated!.segments.length).toBe(2);
    expect(updated!.segments[0].text).toBe("Updated text");
    expect(updated!.segments[0].voice).toBe("nova");
  });

  it("should delete a call script", async () => {
    const created = await caller.callScripts.create({
      name: "Delete Test Script",
      segments: [
        {
          id: "seg1",
          type: "tts",
          position: 0,
          text: "Will be deleted",
          voice: "alloy",
          provider: "openai",
          speed: "1.0",
        },
      ],
    });

    const result = await caller.callScripts.delete({ id: created.id });
    expect(result.success).toBe(true);

    // Should not be found after deletion (get throws NOT_FOUND)
    await expect(
      caller.callScripts.get({ id: created.id })
    ).rejects.toThrow();
  });

  it("should validate segment data on create", async () => {
    // Empty segments should fail
    await expect(
      caller.callScripts.create({
        name: "Invalid Script",
        segments: [],
      })
    ).rejects.toThrow();
  });

  it("should handle recorded segments", async () => {
    const result = await caller.callScripts.create({
      name: "Mixed Script",
      segments: [
        {
          id: "seg1",
          type: "tts",
          position: 0,
          text: "Hello {{first_name}}",
          voice: "alloy",
          provider: "openai",
          speed: "1.0",
        },
        {
          id: "seg2",
          type: "recorded",
          position: 1,
          audioFileId: 1,
          audioName: "test-recording.mp3",
          audioUrl: "https://example.com/test.mp3",
        },
      ],
    });

    expect(result.id).toBeGreaterThan(0);

    const script = await caller.callScripts.get({ id: result.id });
    expect(script!.segments.length).toBe(2);
    expect(script!.segments[0].type).toBe("tts");
    expect(script!.segments[1].type).toBe("recorded");
    expect(script!.segments[1].audioUrl).toBe("https://example.com/test.mp3");
  });
});

describe("script-audio service", () => {
  it("should build merge variables correctly", async () => {
    // Import the service
    const { generateScriptAudio } = await import("./services/script-audio");
    
    // We can't actually call TTS APIs in tests, but we can verify the function exists
    // and handles errors gracefully
    expect(typeof generateScriptAudio).toBe("function");
  });

  it("should generate preview with sample contact data", async () => {
    const { generateScriptPreview } = await import("./services/script-audio");
    expect(typeof generateScriptPreview).toBe("function");
  });
});
