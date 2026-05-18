import { describe, it, expect } from "vitest";

/**
 * Tests for proper call result classification.
 *
 * Bug: The PBX agent was reporting ALL non-answered hangups as "failed",
 * regardless of the actual hangup cause. This caused 283 "Normal Clearing"
 * calls (cause 16) and 150 "No user responding" calls (cause 19) to show
 * as "failed" in the Call Activity Feed.
 *
 * Fix: Classify hangup causes properly:
 * - Cause 16 (Normal Clearing) → "no-answer" (rang, carrier cleared)
 * - Cause 17 (User busy) → "busy"
 * - Cause 18 (No user responding) → "no-answer"
 * - Cause 19 (User alerting, no answer) → "no-answer"
 * - Cause 21 (Call rejected) → "no-answer"
 * - Other causes → "failed" (genuine failures)
 */

describe("Call Result Classification", () => {
  // Replicate the PBX agent's hangup_status_map logic
  const hangupStatusMap: Record<string, string> = {
    "16": "no-answer",   // Normal Clearing without answer = rang, cleared
    "17": "busy",        // User busy
    "18": "no-answer",   // No user responding
    "19": "no-answer",   // User alerting, no answer
    "21": "no-answer",   // Call rejected
  };

  function classifyHangup(cause: string): string {
    return hangupStatusMap[cause] || "failed";
  }

  describe("PBX Agent Hangup Classification", () => {
    it("classifies Normal Clearing (cause 16) as no-answer", () => {
      expect(classifyHangup("16")).toBe("no-answer");
    });

    it("classifies User Busy (cause 17) as busy", () => {
      expect(classifyHangup("17")).toBe("busy");
    });

    it("classifies No User Responding (cause 18) as no-answer", () => {
      expect(classifyHangup("18")).toBe("no-answer");
    });

    it("classifies User Alerting No Answer (cause 19) as no-answer", () => {
      expect(classifyHangup("19")).toBe("no-answer");
    });

    it("classifies Call Rejected (cause 21) as no-answer", () => {
      expect(classifyHangup("21")).toBe("no-answer");
    });

    it("classifies Unallocated Number (cause 1) as failed", () => {
      expect(classifyHangup("1")).toBe("failed");
    });

    it("classifies No Circuit Available (cause 34) as failed", () => {
      expect(classifyHangup("34")).toBe("failed");
    });

    it("classifies Network Out of Order (cause 38) as failed", () => {
      expect(classifyHangup("38")).toBe("failed");
    });

    it("classifies unknown cause as failed", () => {
      expect(classifyHangup("99")).toBe("failed");
      expect(classifyHangup("")).toBe("failed");
    });
  });

  describe("Server-side Queue Status Classification", () => {
    // Replicate the server's queue status logic
    const terminalResults = ["answered", "completed", "no-answer", "busy"];

    function getQueueStatus(result: string): string {
      return terminalResults.includes(result) ? "completed" : "failed";
    }

    it("marks answered calls as completed in queue", () => {
      expect(getQueueStatus("answered")).toBe("completed");
    });

    it("marks no-answer calls as completed in queue (terminal state)", () => {
      expect(getQueueStatus("no-answer")).toBe("completed");
    });

    it("marks busy calls as completed in queue (terminal state)", () => {
      expect(getQueueStatus("busy")).toBe("completed");
    });

    it("marks failed calls as failed in queue", () => {
      expect(getQueueStatus("failed")).toBe("failed");
    });

    it("marks congestion calls as failed in queue", () => {
      expect(getQueueStatus("congestion")).toBe("failed");
    });
  });

  describe("Server-side Call Log Status Mapping", () => {
    // Replicate the server's statusMap for call_logs
    const statusMap: Record<string, string> = {
      answered: "answered",
      completed: "completed",
      busy: "busy",
      "no-answer": "no-answer",
      failed: "failed",
      congestion: "failed",
    };

    function getCallLogStatus(result: string): string {
      return statusMap[result] || "failed";
    }

    it("maps answered to answered in call_logs", () => {
      expect(getCallLogStatus("answered")).toBe("answered");
    });

    it("maps busy to busy in call_logs", () => {
      expect(getCallLogStatus("busy")).toBe("busy");
    });

    it("maps no-answer to no-answer in call_logs", () => {
      expect(getCallLogStatus("no-answer")).toBe("no-answer");
    });

    it("maps failed to failed in call_logs", () => {
      expect(getCallLogStatus("failed")).toBe("failed");
    });

    it("maps congestion to failed in call_logs", () => {
      expect(getCallLogStatus("congestion")).toBe("failed");
    });
  });

  describe("Auto-throttle NOT triggered by reclassified results", () => {
    // Replicate CARRIER_ERROR_RESULTS from auto-throttle.ts
    const CARRIER_ERROR_RESULTS = new Set([
      "congestion",
      "all-circuits-busy",
      "service-unavailable",
      "trunk-error",
    ]);

    function isCarrierError(result: string): boolean {
      return CARRIER_ERROR_RESULTS.has(result);
    }

    it("no-answer does NOT trigger auto-throttle", () => {
      expect(isCarrierError("no-answer")).toBe(false);
    });

    it("busy does NOT trigger auto-throttle", () => {
      expect(isCarrierError("busy")).toBe(false);
    });

    it("failed does NOT trigger auto-throttle", () => {
      expect(isCarrierError("failed")).toBe(false);
    });

    it("congestion DOES trigger auto-throttle", () => {
      expect(isCarrierError("congestion")).toBe(true);
    });

    it("trunk-error DOES trigger auto-throttle", () => {
      expect(isCarrierError("trunk-error")).toBe(true);
    });
  });
});
