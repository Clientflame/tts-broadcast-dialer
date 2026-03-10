import { describe, it, expect, beforeEach } from "vitest";
import { recordCarrierError, attemptRampUp, resetThrottle, getThrottleStatus, isCarrierError } from "./services/auto-throttle";

describe("Auto-Throttle Service", () => {
  const testAgentId = `test-agent-throttle-${Date.now()}`;

  it("should identify carrier errors correctly", () => {
    // True carrier/trunk errors
    expect(isCarrierError("congestion")).toBe(true);
    expect(isCarrierError("all-circuits-busy")).toBe(true);
    expect(isCarrierError("service-unavailable")).toBe(true);
    expect(isCarrierError("trunk-error")).toBe(true);
    // Normal call failures should NOT be carrier errors
    expect(isCarrierError("failed")).toBe(false);
    expect(isCarrierError("answered")).toBe(false);
    expect(isCarrierError("no-answer")).toBe(false);
    expect(isCarrierError("busy")).toBe(false);
    expect(isCarrierError("completed")).toBe(false);
  });

  it("should return clean status for unknown agent", () => {
    const status = getThrottleStatus("nonexistent-agent-xyz");
    expect(status.isThrottled).toBe(false);
    expect(status.recentErrors).toBe(0);
  });

  it("should track carrier errors in memory", async () => {
    // Record a carrier error
    await recordCarrierError(testAgentId, "congestion");
    const status = getThrottleStatus(testAgentId);
    expect(status.recentErrors).toBeGreaterThanOrEqual(1);
  });

  it("should reset throttle state", async () => {
    await resetThrottle(testAgentId);
    const status = getThrottleStatus(testAgentId);
    expect(status.isThrottled).toBe(false);
    expect(status.recentErrors).toBe(0);
  });
});
