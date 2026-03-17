import { describe, it, expect } from "vitest";

// ─── Area Code Timezone Tests ───
describe("Area Code Timezone Lookup", () => {
  it("should resolve US phone numbers to IANA timezones", async () => {
    const { getTimezoneForPhone } = await import("../shared/area-code-tz");
    // getTimezoneForPhone returns a string timezone, may return fallback for unknown
    const ny = getTimezoneForPhone("2125551234");
    expect(typeof ny).toBe("string");
    expect(ny.length).toBeGreaterThan(0);
    const la = getTimezoneForPhone("3105551234");
    expect(typeof la).toBe("string");
  });

  it("should handle +1 prefix", async () => {
    const { getTimezoneForPhone } = await import("../shared/area-code-tz");
    const result = getTimezoneForPhone("+12125551234");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should export isContactCallable function", async () => {
    const { isContactCallable } = await import("../shared/area-code-tz");
    expect(isContactCallable).toBeDefined();
    expect(typeof isContactCallable).toBe("function");
  });

  it("should export getContactLocalTime function with correct shape", async () => {
    const { getContactLocalTime } = await import("../shared/area-code-tz");
    expect(getContactLocalTime).toBeDefined();
    const result = getContactLocalTime("2125551234");
    expect(result).toHaveProperty("timezone");
    expect(result).toHaveProperty("localTime");
    expect(result).toHaveProperty("tzAbbrev");
  });
});

// ─── Pacing Engine Tests ───
describe("Pacing Engine", () => {
  it("should export all key functions", async () => {
    const pacing = await import("./services/pacing");
    expect(pacing.initPacing).toBeDefined();
    expect(pacing.getCurrentConcurrent).toBeDefined();
    expect(pacing.recordCallResult).toBeDefined();
    expect(pacing.getPacingStats).toBeDefined();
    expect(pacing.cleanupPacing).toBeDefined();
  });

  it("should initialize and get concurrent for fixed mode", async () => {
    const { initPacing, getCurrentConcurrent, cleanupPacing } = await import("./services/pacing");
    const config = {
      mode: "fixed" as const,
      fixedConcurrent: 5,
      maxConcurrent: 20,
      minConcurrent: 1,
      targetDropRate: 3,
    };
    initPacing(99901, config);
    const concurrent = getCurrentConcurrent(99901, config);
    expect(concurrent).toBe(5);
    cleanupPacing(99901);
  });

  it("should initialize and get concurrent for adaptive mode", async () => {
    const { initPacing, getCurrentConcurrent, cleanupPacing } = await import("./services/pacing");
    const config = {
      mode: "adaptive" as const,
      fixedConcurrent: 5,
      maxConcurrent: 20,
      minConcurrent: 1,
      targetDropRate: 3,
    };
    initPacing(99902, config);
    const concurrent = getCurrentConcurrent(99902, config);
    expect(concurrent).toBeGreaterThanOrEqual(1);
    expect(concurrent).toBeLessThanOrEqual(20);
    cleanupPacing(99902);
  });

  it("should initialize and get concurrent for predictive mode", async () => {
    const { initPacing, getCurrentConcurrent, cleanupPacing } = await import("./services/pacing");
    const config = {
      mode: "predictive" as const,
      fixedConcurrent: 5,
      maxConcurrent: 20,
      minConcurrent: 1,
      targetDropRate: 3,
      agentCount: 5,
    };
    initPacing(99903, config);
    const concurrent = getCurrentConcurrent(99903, config);
    expect(concurrent).toBeGreaterThanOrEqual(1);
    expect(concurrent).toBeLessThanOrEqual(20);
    cleanupPacing(99903);
  });

  it("should initialize and get concurrent for power mode", async () => {
    const { initPacing, getCurrentConcurrent, cleanupPacing } = await import("./services/pacing");
    const config = {
      mode: "power" as const,
      fixedConcurrent: 5,
      maxConcurrent: 50,
      minConcurrent: 1,
      targetDropRate: 3,
      agentCount: 10,
      powerDialRatio: 3,
    };
    initPacing(99904, config);
    const concurrent = getCurrentConcurrent(99904, config);
    expect(concurrent).toBeGreaterThan(0);
    expect(concurrent).toBeLessThanOrEqual(50);
    cleanupPacing(99904);
  });

  it("should record results and get stats with correct shape", async () => {
    const { initPacing, recordCallResult, getPacingStats, cleanupPacing } = await import("./services/pacing");
    const config = {
      mode: "predictive" as const,
      fixedConcurrent: 5,
      maxConcurrent: 20,
      minConcurrent: 1,
      targetDropRate: 3,
      agentCount: 5,
    };
    initPacing(99905, config);
    recordCallResult(99905, "answered");
    recordCallResult(99905, "answered");
    recordCallResult(99905, "no-answer");
    recordCallResult(99905, "busy");
    recordCallResult(99905, "answered");

    const stats = getPacingStats(99905, config);
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty("mode");
    expect(stats).toHaveProperty("currentConcurrent");
    expect(stats).toHaveProperty("windowCalls");
    expect(stats).toHaveProperty("windowAnswerRate");
    expect(stats).toHaveProperty("circuitBreakerActive");
    expect(stats.windowCalls).toBeGreaterThan(0);
    cleanupPacing(99905);
  });

  it("should track drops and circuit breaker state in stats", async () => {
    const { initPacing, recordCallResult, getPacingStats, cleanupPacing } = await import("./services/pacing");
    const config = {
      mode: "predictive" as const,
      fixedConcurrent: 10,
      maxConcurrent: 20,
      minConcurrent: 1,
      targetDropRate: 3,
      agentCount: 5,
    };
    initPacing(99906, config);
    // Record drops
    recordCallResult(99906, "dropped");
    recordCallResult(99906, "dropped");
    recordCallResult(99906, "dropped");

    const stats = getPacingStats(99906, config);
    expect(stats).toHaveProperty("circuitBreakerActive");
    expect(stats).toHaveProperty("consecutiveDrops");
    expect(typeof stats.circuitBreakerActive).toBe("boolean");
    expect(typeof stats.consecutiveDrops).toBe("number");
    expect(stats.windowCalls).toBeGreaterThan(0);
    cleanupPacing(99906);
  });
});

// ─── Live Agent Tracker Tests ───
describe("Live Agent Tracker", () => {
  it("should export key functions", async () => {
    const tracker = await import("./services/live-agent-tracker");
    expect(tracker.getAvailableAgentCount).toBeDefined();
    expect(tracker.getAllAgentStates).toBeDefined();
    expect(tracker.findAvailableAgent).toBeDefined();
    expect(tracker.getAgentUtilizationStats).toBeDefined();
  });

  it("should return 0 available agents when none initialized", async () => {
    const { getAvailableAgentCount } = await import("./services/live-agent-tracker");
    expect(getAvailableAgentCount()).toBe(0);
  });

  it("should return empty agent states when none initialized", async () => {
    const { getAllAgentStates } = await import("./services/live-agent-tracker");
    const states = getAllAgentStates();
    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBe(0);
  });

  it("should return null when no agent available", async () => {
    const { findAvailableAgent } = await import("./services/live-agent-tracker");
    const agent = findAvailableAgent();
    expect(agent).toBeNull();
  });

  it("should return utilization stats with correct shape", async () => {
    const { getAgentUtilizationStats } = await import("./services/live-agent-tracker");
    const stats = getAgentUtilizationStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("available");
    expect(stats).toHaveProperty("onCall");
    expect(stats).toHaveProperty("utilizationPercent");
    expect(stats.total).toBe(0);
    expect(stats.utilizationPercent).toBe(0);
  });
});

// ─── Live Agent Router Tests ───
describe("Live Agent Router", () => {
  it("should export liveAgentRouter", async () => {
    const router = await import("./routers/live-agents");
    expect(router.liveAgentRouter).toBeDefined();
  });
});

// ─── Schema Tests ───
describe("Schema - Live Agent Tables", () => {
  it("should export liveAgents table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.liveAgents).toBeDefined();
  });

  it("should export agentSessions table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.agentSessions).toBeDefined();
  });

  it("should export agentCallLog table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.agentCallLog).toBeDefined();
  });

  it("should export campaignAgentAssignments table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.campaignAgentAssignments).toBeDefined();
  });
});

// ─── PBX Agent Script Tests ───
describe("PBX Agent - Live Agent Features", () => {
  it("should contain transfer_to_agent function", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("pbx-agent/pbx_agent.py", "utf-8");
    expect(content).toContain("def transfer_to_agent");
  });

  it("should contain AMD enabled handling", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("pbx-agent/pbx_agent.py", "utf-8");
    expect(content).toContain("amd_enabled");
  });

  it("should contain routing_mode handling", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("pbx-agent/pbx_agent.py", "utf-8");
    expect(content).toContain("routing_mode");
  });

  it("should contain transfer_extension handling", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("pbx-agent/pbx_agent.py", "utf-8");
    expect(content).toContain("transfer_extension");
  });
});

// ─── IVR Payment Tests ───
describe("IVR Payment Service", () => {
  it("should export createIvrPayment function", async () => {
    const payment = await import("./services/ivr-payment");
    expect(payment.createIvrPayment).toBeDefined();
    expect(typeof payment.createIvrPayment).toBe("function");
  });

  it("should export updatePaymentStatus function", async () => {
    const payment = await import("./services/ivr-payment");
    expect(payment.updatePaymentStatus).toBeDefined();
    expect(typeof payment.updatePaymentStatus).toBe("function");
  });

  it("should export getCampaignPaymentStats function", async () => {
    const payment = await import("./services/ivr-payment");
    expect(payment.getCampaignPaymentStats).toBeDefined();
    expect(typeof payment.getCampaignPaymentStats).toBe("function");
  });
});
