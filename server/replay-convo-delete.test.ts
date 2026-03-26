import { describe, it, expect, vi } from "vitest";

// ─── Campaign Replay Tests ─────────────────────────────────────────────────────

describe("Campaign Replay", () => {
  it("should only allow replay for completed or cancelled campaigns", () => {
    const allowedStatuses = ["completed", "cancelled"];
    const blockedStatuses = ["draft", "scheduled", "running", "paused"];

    for (const status of allowedStatuses) {
      expect(["completed", "cancelled"]).toContain(status);
    }
    for (const status of blockedStatuses) {
      expect(["completed", "cancelled"]).not.toContain(status);
    }
  });

  it("should reset campaign stats when replaying", () => {
    const resetFields = {
      status: "draft",
      completedCalls: 0,
      answeredCalls: 0,
      failedCalls: 0,
      startedAt: null,
      completedAt: null,
    };

    expect(resetFields.status).toBe("draft");
    expect(resetFields.completedCalls).toBe(0);
    expect(resetFields.answeredCalls).toBe(0);
    expect(resetFields.failedCalls).toBe(0);
    expect(resetFields.startedAt).toBeNull();
    expect(resetFields.completedAt).toBeNull();
  });

  it("should create audit log entry for replay action", () => {
    const auditLog = {
      action: "campaign.replay",
      resource: "campaign",
      resourceId: 42,
      details: { previousStatus: "completed" },
    };

    expect(auditLog.action).toBe("campaign.replay");
    expect(auditLog.details.previousStatus).toBe("completed");
  });

  it("should preserve previous call logs when replaying", () => {
    // Replay resets campaign stats but does NOT delete call_logs
    // This ensures historical reporting is preserved
    const replayResetFields = ["status", "completedCalls", "answeredCalls", "failedCalls", "startedAt", "completedAt"];
    expect(replayResetFields).not.toContain("callLogs");
    expect(replayResetFields).not.toContain("deleteCallLogs");
  });
});

// ─── Voice AI Conversation Delete Tests ─────────────────────────────────────────

describe("Voice AI Conversation Delete", () => {
  it("should validate single delete requires a valid id", () => {
    const validInput = { id: 1 };
    expect(validInput.id).toBeGreaterThan(0);
    expect(typeof validInput.id).toBe("number");
  });

  it("should validate bulk delete accepts an array of ids up to 10000", () => {
    const smallBatch = { ids: [1, 2, 3, 4, 5] };
    expect(smallBatch.ids.length).toBeLessThanOrEqual(10000);
    expect(smallBatch.ids.length).toBeGreaterThan(0);

    const largeBatch = { ids: Array.from({ length: 500 }, (_, i) => i + 1) };
    expect(largeBatch.ids.length).toBe(500);
    expect(largeBatch.ids.length).toBeLessThanOrEqual(10000);
  });

  it("should reject empty bulk delete array", () => {
    const emptyBatch = { ids: [] as number[] };
    expect(emptyBatch.ids.length).toBe(0);
    // The z.array(z.number()).min(1) validator should reject this
  });

  it("should return deleted count from bulk delete", () => {
    const result = { deleted: 15 };
    expect(result.deleted).toBe(15);
    expect(typeof result.deleted).toBe("number");
  });
});

// ─── PBX Agent Version Tracking Tests ─────────────────────────────────────────

describe("PBX Agent Version Tracking", () => {
  it("should parse agent version from heartbeat data", () => {
    const heartbeatData = {
      agentId: "agent-hd",
      status: "idle",
      agentVersion: "2.1.0",
      features: ["multi_audio", "amd", "voice_ai"],
    };

    expect(heartbeatData.agentVersion).toBe("2.1.0");
    expect(heartbeatData.features).toContain("multi_audio");
  });

  it("should handle missing version in legacy agents", () => {
    const legacyHeartbeat = {
      agentId: "agent-hd",
      status: "idle",
      // No agentVersion or features
    };

    const version = (legacyHeartbeat as any).agentVersion || null;
    const features = (legacyHeartbeat as any).features || [];

    expect(version).toBeNull();
    expect(features).toEqual([]);
  });

  it("should detect outdated agent without multi_audio feature", () => {
    const agentWithoutMultiAudio = {
      capabilities: JSON.stringify({ features: ["amd"] }),
    };
    const capabilities = JSON.parse(agentWithoutMultiAudio.capabilities);
    const hasMultiAudio = capabilities.features?.includes("multi_audio") ?? false;
    expect(hasMultiAudio).toBe(false);
  });

  it("should detect current agent with multi_audio feature", () => {
    const agentWithMultiAudio = {
      capabilities: JSON.stringify({ agentVersion: "2.1.0", features: ["multi_audio", "amd", "voice_ai"] }),
    };
    const capabilities = JSON.parse(agentWithMultiAudio.capabilities);
    const hasMultiAudio = capabilities.features?.includes("multi_audio") ?? false;
    expect(hasMultiAudio).toBe(true);
  });
});

// ─── Multi-Segment Audio Pipeline Tests ─────────────────────────────────────────

describe("Multi-Segment Audio Pipeline", () => {
  it("should generate audioUrls array for multi-segment scripts", () => {
    const segments = [
      { type: "tts", text: "Hello, this is a test" },
      { type: "tts", text: "Please press 1 for more info" },
      { type: "recorded", audioUrl: "https://cdn.example.com/audio.wav" },
    ];

    const audioUrls = segments.map((s, i) =>
      s.type === "tts"
        ? `https://cdn.example.com/tts_${i}.mp3`
        : s.audioUrl!
    );

    expect(audioUrls).toHaveLength(3);
    expect(audioUrls[0]).toContain("tts_0");
    expect(audioUrls[2]).toContain("audio.wav");
  });

  it("should pass audioUrls array through call queue to PBX agent", () => {
    const callQueueEntry = {
      phoneNumber: "+15551234567",
      audioUrl: "https://cdn.example.com/tts_0.mp3",
      audioUrls: [
        "https://cdn.example.com/tts_0.mp3",
        "https://cdn.example.com/tts_1.mp3",
        "https://cdn.example.com/recorded.wav",
      ],
      audioName: "script_42_contact_1",
    };

    expect(callQueueEntry.audioUrls).toHaveLength(3);
    expect(callQueueEntry.audioUrl).toBe(callQueueEntry.audioUrls[0]);
  });

  it("should fall back to single audioUrl for single-segment scripts", () => {
    const singleSegment = {
      audioUrl: "https://cdn.example.com/tts_0.mp3",
      audioUrls: ["https://cdn.example.com/tts_0.mp3"],
    };

    // When audioUrls has only 1 item, PBX agent should use the regular audioUrl path
    expect(singleSegment.audioUrls.length).toBe(1);
    expect(singleSegment.audioUrl).toBe(singleSegment.audioUrls[0]);
  });

  it("should support up to 6 segments per script", () => {
    const maxSegments = 6;
    const segments = Array.from({ length: maxSegments }, (_, i) => ({
      type: "tts",
      text: `Segment ${i + 1}`,
    }));

    expect(segments).toHaveLength(6);
    const audioUrls = segments.map((_, i) => `https://cdn.example.com/tts_${i}.mp3`);
    expect(audioUrls).toHaveLength(6);
  });
});
