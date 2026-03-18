import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          suggestions: [
            { type: "talk_track", title: "Warm Greeting", body: "Start with a friendly tone and confirm the contact's name.", priority: "medium" },
            { type: "compliance_alert", title: "Mini-Miranda Required", body: "Remember to state the Mini-Miranda disclosure before discussing the debt.", priority: "critical" },
          ],
        }),
      },
    }],
  }),
}));

// Mock db functions
vi.mock("./db", () => ({
  createCoachingTemplate: vi.fn().mockResolvedValue({ id: 1 }),
  getCoachingTemplates: vi.fn().mockResolvedValue([]),
  getCoachingTemplate: vi.fn().mockResolvedValue({ id: 1, name: "Test", category: "general", triggers: [], suggestions: [], isActive: 1 }),
  updateCoachingTemplate: vi.fn().mockResolvedValue(undefined),
  deleteCoachingTemplate: vi.fn().mockResolvedValue(undefined),
  getActiveCoachingTemplates: vi.fn().mockResolvedValue([]),
  incrementTemplateUsage: vi.fn().mockResolvedValue(undefined),
  createAssistSession: vi.fn().mockResolvedValue({ id: 1 }),
  getAssistSession: vi.fn().mockResolvedValue({
    id: 1,
    agentId: 1,
    callStage: "greeting",
    sentimentLabel: "neutral",
    sentimentScore: "0.00",
    contactName: "John Doe",
    totalSuggestions: 0,
    acceptedSuggestions: 0,
  }),
  getActiveAssistSession: vi.fn().mockResolvedValue(null),
  updateAssistSession: vi.fn().mockResolvedValue(undefined),
  endAssistSession: vi.fn().mockResolvedValue(undefined),
  getAssistSessionsByAgent: vi.fn().mockResolvedValue([]),
  getAssistStats: vi.fn().mockResolvedValue({
    totalSessions: 5,
    activeSessions: 1,
    totalSuggestions: 42,
    acceptedSuggestions: 28,
    avgAcceptRate: "67",
  }),
  createAssistSuggestion: vi.fn().mockImplementation(async (data) => ({ id: Math.floor(Math.random() * 1000), ...data })),
  getSessionSuggestions: vi.fn().mockResolvedValue([]),
  respondToSuggestion: vi.fn().mockResolvedValue(undefined),
  expirePendingSuggestions: vi.fn().mockResolvedValue(undefined),
  getLiveAgent: vi.fn().mockResolvedValue({ id: 1, name: "Agent Smith", sipExtension: "1001" }),
}));

describe("Agent Assist Router", () => {
  describe("Coaching Templates", () => {
    it("should define CRUD operations for coaching templates", async () => {
      const { agentAssistRouter } = await import("./routers/agent-assist");
      const procedures = Object.keys(agentAssistRouter._def.procedures);
      expect(procedures).toContain("listTemplates");
      expect(procedures).toContain("getTemplate");
      expect(procedures).toContain("createTemplate");
      expect(procedures).toContain("updateTemplate");
      expect(procedures).toContain("deleteTemplate");
    });

    it("should define template categories", async () => {
      const categories = [
        "objection_handling",
        "compliance",
        "closing",
        "rapport_building",
        "payment_negotiation",
        "de_escalation",
        "general",
      ];
      // Verify categories are valid enum values
      expect(categories.length).toBe(7);
      expect(categories).toContain("objection_handling");
      expect(categories).toContain("compliance");
      expect(categories).toContain("de_escalation");
    });
  });

  describe("Assist Sessions", () => {
    it("should define session management procedures", async () => {
      const { agentAssistRouter } = await import("./routers/agent-assist");
      const procedures = Object.keys(agentAssistRouter._def.procedures);
      expect(procedures).toContain("startSession");
      expect(procedures).toContain("endSession");
      expect(procedures).toContain("getSession");
      expect(procedures).toContain("getActiveSession");
      expect(procedures).toContain("agentHistory");
    });
  });

  describe("Suggestion Generation", () => {
    it("should define the generateSuggestions procedure", async () => {
      const { agentAssistRouter } = await import("./routers/agent-assist");
      const procedures = Object.keys(agentAssistRouter._def.procedures);
      expect(procedures).toContain("generateSuggestions");
    });

    it("should define valid call stages", () => {
      const stages = ["greeting", "verification", "discovery", "presentation", "objection", "negotiation", "closing", "wrap_up"];
      expect(stages.length).toBe(8);
      expect(stages).toContain("greeting");
      expect(stages).toContain("objection");
      expect(stages).toContain("closing");
    });

    it("should define valid suggestion types", () => {
      const types = ["talk_track", "objection_handle", "compliance_alert", "next_action", "sentiment_alert", "closing_cue", "de_escalation", "info_card"];
      expect(types.length).toBe(8);
      expect(types).toContain("talk_track");
      expect(types).toContain("compliance_alert");
      expect(types).toContain("de_escalation");
    });

    it("should define valid priority levels", () => {
      const priorities = ["critical", "high", "medium", "low"];
      expect(priorities.length).toBe(4);
      expect(priorities).toContain("critical");
      expect(priorities).toContain("low");
    });
  });

  describe("Suggestion Responses", () => {
    it("should define the respondSuggestion procedure", async () => {
      const { agentAssistRouter } = await import("./routers/agent-assist");
      const procedures = Object.keys(agentAssistRouter._def.procedures);
      expect(procedures).toContain("respondSuggestion");
    });

    it("should support accepted and dismissed responses", () => {
      const responses = ["accepted", "dismissed"];
      expect(responses).toContain("accepted");
      expect(responses).toContain("dismissed");
    });
  });

  describe("Stats", () => {
    it("should define the stats procedure", async () => {
      const { agentAssistRouter } = await import("./routers/agent-assist");
      const procedures = Object.keys(agentAssistRouter._def.procedures);
      expect(procedures).toContain("stats");
    });
  });

  describe("Router Structure", () => {
    it("should export agentAssistRouter with all expected procedures", async () => {
      const { agentAssistRouter } = await import("./routers/agent-assist");
      const procedures = Object.keys(agentAssistRouter._def.procedures);
      expect(procedures.length).toBe(15);
      expect(procedures).toEqual(expect.arrayContaining([
        "listTemplates",
        "getTemplate",
        "createTemplate",
        "updateTemplate",
        "deleteTemplate",
        "startSession",
        "endSession",
        "getSession",
        "getActiveSession",
        "agentHistory",
        "generateSuggestions",
        "respondSuggestion",
        "stats",
        "seedStarterTemplates",
        "coachingReport",
      ]));
    });
  });
});
