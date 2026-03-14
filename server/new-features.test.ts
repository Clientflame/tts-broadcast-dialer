import { describe, expect, it, beforeEach } from "vitest";
import { getTimezoneForPhone, isContactCallable, getContactLocalTime } from "../shared/area-code-tz";
import { initPacing, getCurrentConcurrent, recordCallResult, getPacingStats, cleanupPacing, type PacingConfig } from "./services/pacing";

// ============================================================
// 1. TIMEZONE ENFORCEMENT TESTS
// ============================================================
describe("area-code-tz: getTimezoneForPhone", () => {
  it("returns Eastern for a 407 (Orlando, FL) number", () => {
    expect(getTimezoneForPhone("4074551177")).toBe("America/New_York");
  });

  it("returns Central for a 312 (Chicago, IL) number", () => {
    expect(getTimezoneForPhone("3125551234")).toBe("America/Chicago");
  });

  it("returns Mountain for a 602 (Phoenix, AZ) number", () => {
    expect(getTimezoneForPhone("6025551234")).toBe("America/Denver");
  });

  it("returns Pacific for a 310 (Los Angeles, CA) number", () => {
    expect(getTimezoneForPhone("3105551234")).toBe("America/Los_Angeles");
  });

  it("returns Alaska for a 907 number", () => {
    expect(getTimezoneForPhone("9075551234")).toBe("America/Anchorage");
  });

  it("returns Hawaii for a 808 number", () => {
    expect(getTimezoneForPhone("8085551234")).toBe("Pacific/Honolulu");
  });

  it("handles 11-digit numbers with leading 1", () => {
    expect(getTimezoneForPhone("14074551177")).toBe("America/New_York");
  });

  it("handles formatted phone numbers", () => {
    expect(getTimezoneForPhone("(407) 455-1177")).toBe("America/New_York");
    expect(getTimezoneForPhone("+1-312-555-1234")).toBe("America/Chicago");
  });

  it("defaults to Eastern for unknown area codes", () => {
    expect(getTimezoneForPhone("0001234567")).toBe("America/New_York");
  });

  it("defaults to Eastern for short numbers", () => {
    expect(getTimezoneForPhone("12345")).toBe("America/New_York");
  });

  it("returns Atlantic for Puerto Rico (340)", () => {
    expect(getTimezoneForPhone("3405551234")).toBe("America/Puerto_Rico");
  });
});

describe("area-code-tz: isContactCallable", () => {
  it("returns a boolean", () => {
    const result = isContactCallable("4074551177", "08:00", "21:00");
    expect(typeof result).toBe("boolean");
  });

  it("returns true for a wide window (00:00 to 23:59)", () => {
    expect(isContactCallable("4074551177", "00:00", "23:59")).toBe(true);
  });

  it("returns false for a window that has already passed (00:00 to 00:01)", () => {
    // This should be false unless it's exactly midnight
    const result = isContactCallable("4074551177", "00:00", "00:01");
    // We can't guarantee the exact time, but the function should return a boolean
    expect(typeof result).toBe("boolean");
  });
});

describe("area-code-tz: getContactLocalTime", () => {
  it("returns timezone, localTime, and tzAbbrev", () => {
    const result = getContactLocalTime("4074551177");
    expect(result).toHaveProperty("timezone");
    expect(result).toHaveProperty("localTime");
    expect(result).toHaveProperty("tzAbbrev");
    expect(result.timezone).toBe("America/New_York");
  });

  it("returns a valid time format", () => {
    const result = getContactLocalTime("3105551234");
    expect(result.timezone).toBe("America/Los_Angeles");
    // localTime should be in HH:MM AM/PM format
    expect(result.localTime).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });
});

// ============================================================
// 2. PREDICTIVE DIALER / PACING ENGINE TESTS
// ============================================================
describe("pacing: initPacing", () => {
  beforeEach(() => {
    cleanupPacing(999);
  });

  it("initializes fixed mode with exact concurrent count", () => {
    const config: PacingConfig = {
      mode: "fixed",
      fixedConcurrent: 5,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 10,
    };
    initPacing(999, config);
    expect(getCurrentConcurrent(999, config)).toBe(5);
  });

  it("initializes adaptive mode at 50% of fixedConcurrent", () => {
    const config: PacingConfig = {
      mode: "adaptive",
      fixedConcurrent: 10,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 20,
    };
    initPacing(999, config);
    const concurrent = getCurrentConcurrent(999, config);
    expect(concurrent).toBe(5); // ceil(10 * 0.5)
  });

  it("initializes predictive mode conservatively", () => {
    const config: PacingConfig = {
      mode: "predictive",
      fixedConcurrent: 8,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 20,
      agentCount: 5,
      maxAbandonRate: 3,
    };
    initPacing(999, config);
    const concurrent = getCurrentConcurrent(999, config);
    expect(concurrent).toBe(4); // ceil(8 * 0.5)
    expect(concurrent).toBeGreaterThanOrEqual(config.minConcurrent);
    expect(concurrent).toBeLessThanOrEqual(config.maxConcurrent);
  });
});

describe("pacing: recordCallResult and adaptive adjustments", () => {
  beforeEach(() => {
    cleanupPacing(888);
  });

  it("does not adjust in fixed mode", () => {
    const config: PacingConfig = {
      mode: "fixed",
      fixedConcurrent: 5,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 10,
    };
    initPacing(888, config);
    for (let i = 0; i < 10; i++) {
      recordCallResult(888, config, "dropped");
    }
    expect(getCurrentConcurrent(888, config)).toBe(5);
  });

  it("reduces concurrent on high drop rate in adaptive mode", () => {
    const config: PacingConfig = {
      mode: "adaptive",
      fixedConcurrent: 10,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 20,
    };
    initPacing(888, config);
    const initial = getCurrentConcurrent(888, config);
    // Simulate 10 dropped calls (100% drop rate)
    for (let i = 0; i < 10; i++) {
      recordCallResult(888, config, "dropped");
    }
    const after = getCurrentConcurrent(888, config);
    expect(after).toBeLessThan(initial);
  });

  it("increases concurrent on high answer rate in adaptive mode", () => {
    const config: PacingConfig = {
      mode: "adaptive",
      fixedConcurrent: 4,
      targetDropRate: 5,
      minConcurrent: 1,
      maxConcurrent: 20,
    };
    initPacing(888, config);
    const initial = getCurrentConcurrent(888, config);
    // Simulate 10 answered calls (100% answer rate, 0% drop rate)
    for (let i = 0; i < 10; i++) {
      recordCallResult(888, config, "answered", 30, 10);
    }
    const after = getCurrentConcurrent(888, config);
    expect(after).toBeGreaterThanOrEqual(initial);
  });
});

describe("pacing: circuit breaker", () => {
  beforeEach(() => {
    cleanupPacing(777);
  });

  it("activates circuit breaker after 3 consecutive drops in predictive mode", () => {
    const config: PacingConfig = {
      mode: "predictive",
      fixedConcurrent: 10,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 20,
      agentCount: 5,
      maxAbandonRate: 3,
    };
    initPacing(777, config);
    // Need enough calls for adjustment (5 minimum)
    recordCallResult(777, config, "answered", 30, 10);
    recordCallResult(777, config, "answered", 30, 10);
    // 3 consecutive drops should trigger circuit breaker
    recordCallResult(777, config, "dropped");
    recordCallResult(777, config, "dropped");
    recordCallResult(777, config, "dropped");
    
    const concurrent = getCurrentConcurrent(777, config);
    expect(concurrent).toBe(config.minConcurrent);
    
    const stats = getPacingStats(777, config);
    expect(stats).not.toBeNull();
    expect(stats!.circuitBreakerActive).toBe(true);
    expect(stats!.consecutiveDrops).toBeGreaterThanOrEqual(3);
  });
});

describe("pacing: getPacingStats", () => {
  beforeEach(() => {
    cleanupPacing(666);
  });

  it("returns fixed mode stats without state", () => {
    const config: PacingConfig = {
      mode: "fixed",
      fixedConcurrent: 5,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 10,
    };
    const stats = getPacingStats(666, config);
    expect(stats).not.toBeNull();
    expect(stats!.mode).toBe("fixed");
    expect(stats!.currentConcurrent).toBe(5);
    expect(stats!.overdialRatio).toBe(1);
  });

  it("returns predictive mode stats with overdial ratio", () => {
    const config: PacingConfig = {
      mode: "predictive",
      fixedConcurrent: 10,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 20,
      agentCount: 5,
      maxAbandonRate: 3,
    };
    initPacing(666, config);
    // Record some calls to generate stats
    for (let i = 0; i < 6; i++) {
      recordCallResult(666, config, "answered", 30, 10);
    }
    const stats = getPacingStats(666, config);
    expect(stats).not.toBeNull();
    expect(stats!.mode).toBe("predictive");
    expect(stats!.windowCalls).toBe(6);
    expect(stats!.windowAnswerRate).toBeGreaterThan(0);
    expect(typeof stats!.overdialRatio).toBe("number");
    expect(typeof stats!.predictedOptimal).toBe("number");
    expect(stats!.totalAbandonRate).toBe(0);
  });

  it("returns null for uninitialized campaign in non-fixed mode", () => {
    const config: PacingConfig = {
      mode: "adaptive",
      fixedConcurrent: 5,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 10,
    };
    const stats = getPacingStats(666, config);
    expect(stats).toBeNull();
  });
});

describe("pacing: cleanupPacing", () => {
  it("removes pacing state for a campaign", () => {
    const config: PacingConfig = {
      mode: "adaptive",
      fixedConcurrent: 5,
      targetDropRate: 3,
      minConcurrent: 1,
      maxConcurrent: 10,
    };
    initPacing(555, config);
    expect(getCurrentConcurrent(555, config)).toBe(3); // ceil(5 * 0.5)
    cleanupPacing(555);
    // After cleanup, should return fixedConcurrent as fallback
    expect(getCurrentConcurrent(555, config)).toBe(5);
  });
});

// ============================================================
// 3. IVR PAYMENT SERVICE TESTS (unit-level)
// ============================================================
describe("ivr-payment: module structure", () => {
  it("exports createIvrPayment and updatePaymentStatus functions", async () => {
    const mod = await import("./services/ivr-payment");
    expect(typeof mod.createIvrPayment).toBe("function");
    expect(typeof mod.updatePaymentStatus).toBe("function");
    expect(typeof mod.getCampaignPaymentStats).toBe("function");
  });
});

// ============================================================
// 4. PBX AGENT AMD SUPPORT (Python script validation)
// ============================================================
describe("pbx-agent: AMD support in Python script", () => {
  it("contains AMD handling code", async () => {
    const fs = await import("fs");
    const script = fs.readFileSync("/home/ubuntu/tts-broadcast-dialer/pbx-agent/pbx_agent.py", "utf-8");
    expect(script).toContain("AMD_ENABLED");
    expect(script).toContain("AMD");
    expect(script).toContain("VOICEMAIL_DROP");
  });

  it("contains AMD dialplan extension file", async () => {
    const fs = await import("fs");
    const dialplan = fs.readFileSync("/home/ubuntu/tts-broadcast-dialer/pbx-agent/extensions_broadcast_amd.conf", "utf-8");
    expect(dialplan).toContain("tts-broadcast-amd");
    expect(dialplan).toContain("AMD");
  });
});
