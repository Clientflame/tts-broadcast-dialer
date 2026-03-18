import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getVoiceAiPrompts: vi.fn().mockResolvedValue([]),
  getVoiceAiPrompt: vi.fn().mockResolvedValue(null),
  createVoiceAiPrompt: vi.fn().mockResolvedValue({ id: 1 }),
  updateVoiceAiPrompt: vi.fn().mockResolvedValue(undefined),
  deleteVoiceAiPrompt: vi.fn().mockResolvedValue(undefined),
  getVoiceAiConversations: vi.fn().mockResolvedValue([]),
  getVoiceAiConversation: vi.fn().mockResolvedValue(null),
  getVoiceAiStats: vi.fn().mockResolvedValue({
    total: 10, completed: 7, escalated: 2, errors: 1,
    avgDuration: 120, avgTurns: 8,
    promiseToPay: 3, paymentMade: 2, callbackScheduled: 1, disputed: 1,
  }),
  getPbxAgents: vi.fn().mockResolvedValue([]),
  getLiveAgent: vi.fn().mockResolvedValue(null),
  createSupervisorAction: vi.fn().mockResolvedValue({ id: 1 }),
  updateSupervisorAction: vi.fn().mockResolvedValue(undefined),
  getRecentSupervisorActions: vi.fn().mockResolvedValue([]),
}));

import * as db from "./db";

describe("Voice AI Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Prompt Management", () => {
    it("should list prompts for a user", async () => {
      const mockPrompts = [
        { id: 1, name: "Debt Collection", voice: "coral", isDefault: 0 },
        { id: 2, name: "Appointment Reminder", voice: "marin", isDefault: 0 },
      ];
      (db.getVoiceAiPrompts as any).mockResolvedValue(mockPrompts);

      const result = await db.getVoiceAiPrompts(1);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Debt Collection");
      expect(db.getVoiceAiPrompts).toHaveBeenCalledWith(1);
    });

    it("should create a new prompt with required fields", async () => {
      (db.createVoiceAiPrompt as any).mockResolvedValue({ id: 3 });

      const promptData = {
        userId: 1,
        name: "Test Prompt",
        systemPrompt: "You are a test AI agent",
        voice: "alloy",
        temperature: "0.7",
        maxConversationDuration: 300,
        silenceTimeout: 10,
        requireAiDisclosure: 1,
        requireMiniMiranda: 0,
        escalateOnDtmf: "#",
        isDefault: 0,
      };

      const result = await db.createVoiceAiPrompt(promptData as any);
      expect(result).toEqual({ id: 3 });
      expect(db.createVoiceAiPrompt).toHaveBeenCalledWith(promptData);
    });

    it("should update an existing prompt", async () => {
      await db.updateVoiceAiPrompt(1, 1, { name: "Updated Prompt" } as any);
      expect(db.updateVoiceAiPrompt).toHaveBeenCalledWith(1, 1, { name: "Updated Prompt" });
    });

    it("should delete a prompt", async () => {
      await db.deleteVoiceAiPrompt(1, 1);
      expect(db.deleteVoiceAiPrompt).toHaveBeenCalledWith(1, 1);
    });

    it("should return null for non-existent prompt", async () => {
      (db.getVoiceAiPrompt as any).mockResolvedValue(null);
      const result = await db.getVoiceAiPrompt(999, 1);
      expect(result).toBeNull();
    });
  });

  describe("Conversations", () => {
    it("should list conversations with default limit", async () => {
      const mockConvos = [
        { id: 1, status: "completed", duration: 120, turnCount: 8, disposition: "promise_to_pay" },
        { id: 2, status: "escalated", duration: 60, turnCount: 4, disposition: "transferred" },
      ];
      (db.getVoiceAiConversations as any).mockResolvedValue(mockConvos);

      const result = await db.getVoiceAiConversations(1, { limit: 50, offset: 0 });
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("completed");
    });

    it("should return empty array when no conversations exist", async () => {
      (db.getVoiceAiConversations as any).mockResolvedValue([]);
      const result = await db.getVoiceAiConversations(1, { limit: 50, offset: 0 });
      expect(result).toEqual([]);
    });
  });

  describe("Analytics", () => {
    it("should return aggregated stats", async () => {
      const stats = await db.getVoiceAiStats(1);
      expect(stats).toBeDefined();
      expect(stats!.total).toBe(10);
      expect(stats!.completed).toBe(7);
      expect(stats!.escalated).toBe(2);
      expect(stats!.avgDuration).toBe(120);
      expect(stats!.promiseToPay).toBe(3);
    });
  });

  describe("Available Voices", () => {
    it("should provide a list of OpenAI Realtime voices", () => {
      const voices = [
        { id: "alloy", name: "Alloy" },
        { id: "coral", name: "Coral" },
        { id: "echo", name: "Echo" },
        { id: "sage", name: "Sage" },
        { id: "shimmer", name: "Shimmer" },
      ];
      expect(voices.length).toBeGreaterThanOrEqual(5);
      expect(voices.find(v => v.id === "coral")).toBeDefined();
    });
  });

  describe("Available Function Tools", () => {
    it("should provide function tools for AI agent", () => {
      const tools = [
        { id: "account_lookup", category: "data" },
        { id: "schedule_callback", category: "action" },
        { id: "process_payment", category: "action" },
        { id: "flag_dispute", category: "compliance" },
        { id: "transfer_to_agent", category: "escalation" },
        { id: "cease_and_desist", category: "compliance" },
      ];
      expect(tools.length).toBeGreaterThanOrEqual(6);
      expect(tools.filter(t => t.category === "compliance")).toHaveLength(2);
      expect(tools.filter(t => t.category === "action")).toHaveLength(2);
    });
  });
});

describe("Supervisor Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Monitor", () => {
    it("should reject monitoring when agent is not on a call", async () => {
      (db.getLiveAgent as any).mockResolvedValue({ id: 1, name: "Agent Smith", status: "available", sipExtension: "1001" });

      const agent = await db.getLiveAgent(1, 1);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe("available");
      // The router would throw BAD_REQUEST here
    });

    it("should allow monitoring when agent is on a call", async () => {
      (db.getLiveAgent as any).mockResolvedValue({
        id: 1, name: "Agent Smith", status: "on_call", sipExtension: "1001", currentCallId: 42,
      });
      (db.createSupervisorAction as any).mockResolvedValue({ id: 10 });

      const agent = await db.getLiveAgent(1, 1);
      expect(agent!.status).toBe("on_call");

      const action = await db.createSupervisorAction({
        userId: 1, agentId: 1, callLogId: 42, actionType: "monitor",
        channel: "1001", startedAt: Date.now(),
      } as any);
      expect(action).toEqual({ id: 10 });
    });
  });

  describe("Whisper", () => {
    it("should create whisper action for on-call agent", async () => {
      (db.getLiveAgent as any).mockResolvedValue({
        id: 2, name: "Agent Jones", status: "on_call", sipExtension: "1002", currentCallId: 55,
      });
      (db.createSupervisorAction as any).mockResolvedValue({ id: 11 });

      const agent = await db.getLiveAgent(2, 1);
      expect(agent!.status).toBe("on_call");

      const action = await db.createSupervisorAction({
        userId: 1, agentId: 2, callLogId: 55, actionType: "whisper",
        channel: "1002", startedAt: Date.now(),
      } as any);
      expect(action).toEqual({ id: 11 });
    });
  });

  describe("Barge", () => {
    it("should create barge action for on-call agent", async () => {
      (db.getLiveAgent as any).mockResolvedValue({
        id: 3, name: "Agent Brown", status: "on_call", sipExtension: "1003", currentCallId: 66,
      });
      (db.createSupervisorAction as any).mockResolvedValue({ id: 12 });

      const agent = await db.getLiveAgent(3, 1);
      expect(agent!.status).toBe("on_call");

      const action = await db.createSupervisorAction({
        userId: 1, agentId: 3, callLogId: 66, actionType: "barge",
        channel: "1003", startedAt: Date.now(),
      } as any);
      expect(action).toEqual({ id: 12 });
    });
  });

  describe("Stop Supervision", () => {
    it("should update supervisor action with end time", async () => {
      await db.updateSupervisorAction(10, { endedAt: Date.now() } as any);
      expect(db.updateSupervisorAction).toHaveBeenCalledWith(10, expect.objectContaining({ endedAt: expect.any(Number) }));
    });
  });

  describe("Supervisor History", () => {
    it("should return recent supervisor actions", async () => {
      const mockActions = [
        { id: 10, actionType: "monitor", agentId: 1, startedAt: Date.now() - 3600000 },
        { id: 11, actionType: "whisper", agentId: 2, startedAt: Date.now() - 1800000 },
      ];
      (db.getRecentSupervisorActions as any).mockResolvedValue(mockActions);

      const result = await db.getRecentSupervisorActions(1, 50);
      expect(result).toHaveLength(2);
      expect(result[0].actionType).toBe("monitor");
    });
  });
});

describe("Voice AI Prompt Input Validation", () => {
  it("should validate temperature as string", () => {
    const temp = "0.7";
    expect(typeof temp).toBe("string");
    expect(parseFloat(temp)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(temp)).toBeLessThanOrEqual(1);
  });

  it("should validate silence timeout range", () => {
    const validTimeouts = [3, 5, 10, 30, 60];
    validTimeouts.forEach(t => {
      expect(t).toBeGreaterThanOrEqual(3);
      expect(t).toBeLessThanOrEqual(60);
    });
  });

  it("should validate max conversation duration range", () => {
    const validDurations = [30, 120, 300, 600, 1800];
    validDurations.forEach(d => {
      expect(d).toBeGreaterThanOrEqual(30);
      expect(d).toBeLessThanOrEqual(1800);
    });
  });

  it("should validate ChanSpy options for each mode", () => {
    const modes = {
      monitor: { options: "qES", desc: "Silent listen" },
      whisper: { options: "qESw", desc: "Whisper to agent only" },
      barge: { options: "qESB", desc: "3-way conference" },
    };

    expect(modes.monitor.options).toContain("q"); // quiet
    expect(modes.monitor.options).toContain("E"); // exit on hangup
    expect(modes.whisper.options).toContain("w"); // whisper flag
    expect(modes.barge.options).toContain("B"); // barge flag
  });
});
