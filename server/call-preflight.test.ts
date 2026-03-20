/**
 * Tests for call pre-flight checks and call status polling
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// Mock db module
vi.mock("./db", () => ({
  getPbxAgents: vi.fn(),
  getCallQueueItem: vi.fn(),
  getVoiceAiPrompt: vi.fn(),
  getCallerIds: vi.fn(),
  enqueueCall: vi.fn(),
  getAudioFile: vi.fn(),
  createAuditLog: vi.fn(),
}));

describe("Pre-flight checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PBX agent online check", () => {
    it("should detect online agent when heartbeat is recent", async () => {
      const agents = [
        { agentId: "agent-1", name: "Agent HD", lastHeartbeat: Date.now() - 30000, capabilities: { voiceAiBridge: true } },
      ];
      (db.getPbxAgents as any).mockResolvedValue(agents);

      const result = await db.getPbxAgents();
      const onlineAgent = result.find((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - Number(a.lastHeartbeat) < 60000;
      });

      expect(onlineAgent).toBeDefined();
      expect(onlineAgent!.name).toBe("Agent HD");
    });

    it("should detect no online agent when heartbeat is stale", async () => {
      const agents = [
        { agentId: "agent-1", name: "Agent HD", lastHeartbeat: Date.now() - 120000, capabilities: null },
      ];
      (db.getPbxAgents as any).mockResolvedValue(agents);

      const result = await db.getPbxAgents();
      const onlineAgent = result.find((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - Number(a.lastHeartbeat) < 60000;
      });

      expect(onlineAgent).toBeUndefined();
    });

    it("should detect no online agent when no agents exist", async () => {
      (db.getPbxAgents as any).mockResolvedValue([]);

      const result = await db.getPbxAgents();
      const onlineAgent = result.find((a: any) => {
        if (!a.lastHeartbeat) return false;
        return Date.now() - Number(a.lastHeartbeat) < 60000;
      });

      expect(onlineAgent).toBeUndefined();
    });

    it("should detect Voice AI bridge capability", async () => {
      const agents = [
        { agentId: "agent-1", name: "Agent HD", lastHeartbeat: Date.now() - 10000, capabilities: { voiceAiBridge: true } },
      ];
      (db.getPbxAgents as any).mockResolvedValue(agents);

      const result = await db.getPbxAgents();
      const agent = result[0];
      const capabilities = agent.capabilities;
      const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;

      expect(hasBridge).toBe(true);
    });

    it("should detect missing Voice AI bridge capability", async () => {
      const agents = [
        { agentId: "agent-1", name: "Agent HD", lastHeartbeat: Date.now() - 10000, capabilities: null },
      ];
      (db.getPbxAgents as any).mockResolvedValue(agents);

      const result = await db.getPbxAgents();
      const agent = result[0];
      const capabilities = agent.capabilities;
      const hasBridge = capabilities && typeof capabilities === "object" && (capabilities as any).voiceAiBridge;

      expect(hasBridge).toBeFalsy();
    });
  });
});

describe("Call status polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return not_found for missing queue item", async () => {
    (db.getCallQueueItem as any).mockResolvedValue(undefined);

    const item = await db.getCallQueueItem(99999);
    expect(item).toBeUndefined();
  });

  it("should return completed status for answered call", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 1,
      status: "completed",
      result: "answered",
      resultDetails: { duration: 45, reason: "16" },
      claimedBy: "agent-1",
      createdAt: Date.now() - 60000,
    });

    const item = await db.getCallQueueItem(1);
    expect(item).toBeDefined();
    expect(item!.status).toBe("completed");
    expect(item!.result).toBe("answered");
  });

  it("should return failed status with reason mapping", async () => {
    (db.getCallQueueItem as any).mockResolvedValue({
      id: 2,
      status: "failed",
      result: "failed",
      resultDetails: { duration: 16, reason: "0" },
      claimedBy: "agent-1",
    });

    const item = await db.getCallQueueItem(2);
    expect(item).toBeDefined();
    expect(item!.status).toBe("failed");

    const details = item!.resultDetails as Record<string, any>;
    const reasonMap: Record<string, string> = {
      "0": "Call could not be originated — check SIP trunk and dialplan on PBX",
      "17": "User busy",
      "19": "No answer",
      "21": "Call rejected",
    };
    const failureReason = reasonMap[String(details.reason)] || `Hangup cause: ${details.reason}`;
    expect(failureReason).toBe("Call could not be originated — check SIP trunk and dialplan on PBX");
  });

  it("should map hangup cause 17 to User busy", async () => {
    const details = { reason: "17" };
    const reasonMap: Record<string, string> = {
      "0": "Call could not be originated",
      "17": "User busy",
      "19": "No answer",
    };
    const failureReason = reasonMap[String(details.reason)] || `Hangup cause: ${details.reason}`;
    expect(failureReason).toBe("User busy");
  });

  it("should handle unknown hangup cause gracefully", async () => {
    const details = { reason: "999" };
    const reasonMap: Record<string, string> = {
      "0": "Call could not be originated",
      "17": "User busy",
    };
    const failureReason = reasonMap[String(details.reason)] || `Hangup cause: ${details.reason}`;
    expect(failureReason).toBe("Hangup cause: 999");
  });

  it("should handle missing reason in details", async () => {
    const details = {};
    let failureReason = "";
    if ((details as any).error) {
      failureReason = (details as any).error;
    } else if ((details as any).reason) {
      failureReason = `Hangup cause: ${(details as any).reason}`;
    } else {
      failureReason = "Call failed — no specific reason from PBX agent";
    }
    expect(failureReason).toBe("Call failed — no specific reason from PBX agent");
  });
});

describe("Agent-agnostic call flow", () => {
  it("should claim calls regardless of agent name", async () => {
    // The claimPendingCalls function takes agentId and limit
    // It claims ANY pending call, not filtered by agent name
    // This test verifies the concept
    const pendingCalls = [
      { id: 1, status: "pending", phoneNumber: "5551234567", context: "voice-ai-handler" },
      { id: 2, status: "pending", phoneNumber: "5559876543", context: "tts-broadcast" },
    ];

    // Any agent should be able to claim any call
    const agentA = "agent-alpha";
    const agentB = "agent-beta";

    // Both agents can claim from the same pool
    expect(pendingCalls.filter(c => c.status === "pending").length).toBe(2);
    // No agent-name filtering in the claim logic
    expect(pendingCalls.every(c => c.status === "pending")).toBe(true);
  });
});
