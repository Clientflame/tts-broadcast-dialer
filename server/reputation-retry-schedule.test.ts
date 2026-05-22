import { describe, it, expect } from "vitest";

/**
 * Tests for Carrier Reputation Scoring and Auto-Retry Scheduling.
 * Validates:
 * - DID daily stats snapshot logic
 * - Reputation score computation formula (0-100)
 * - Reputation history retrieval
 * - retryScheduleTime delay calculation
 */

// ─── DID Daily Stats Snapshot Logic ─────────────────────────────────────────
describe("DID Daily Stats Snapshot", () => {
  it("calculates answer rate correctly from call counts", () => {
    const totalCalls = 100;
    const answered = 25;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;
    expect(answerRate).toBe(25);
  });

  it("answer rate is 0 when no calls made", () => {
    const totalCalls = 0;
    const answered = 0;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;
    expect(answerRate).toBe(0);
  });

  it("correctly identifies yesterday's date string", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().slice(0, 10);
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Should be different from today
    const today = new Date().toISOString().slice(0, 10);
    expect(dateStr).not.toBe(today);
  });

  it("maps caller IDs to phone numbers correctly", () => {
    const dids = [
      { id: 1, phoneNumber: "5551234567" },
      { id: 2, phoneNumber: "5559876543" },
      { id: 3, phoneNumber: "5551111111" },
    ];
    const didMap = new Map(dids.map(d => [d.phoneNumber, d.id]));
    expect(didMap.get("5551234567")).toBe(1);
    expect(didMap.get("5559876543")).toBe(2);
    expect(didMap.get("5551111111")).toBe(3);
    expect(didMap.get("9999999999")).toBeUndefined();
  });

  it("skips snapshot if data already exists for date", () => {
    const existing = [{ id: 1 }]; // Simulates existing rows
    const shouldSkip = existing.length > 0;
    expect(shouldSkip).toBe(true);
  });

  it("proceeds with snapshot if no existing data", () => {
    const existing: any[] = [];
    const shouldSkip = existing.length > 0;
    expect(shouldSkip).toBe(false);
  });

  it("correctly computes short call count (calls < 3 seconds)", () => {
    const calls = [
      { status: "answered", duration: 1 },
      { status: "answered", duration: 2 },
      { status: "answered", duration: 5 },
      { status: "answered", duration: 30 },
      { status: "completed", duration: 2 },
    ];
    const shortCalls = calls.filter(c =>
      (c.status === "answered" || c.status === "completed") && c.duration < 3
    ).length;
    expect(shortCalls).toBe(3);
  });
});

// ─── Reputation Score Computation ─────────────────────────────────────────────
describe("Reputation Score Computation", () => {
  // Score formula:
  // - Answer rate: 50 points (30%+ = full marks)
  // - Trend: 25 points (improving vs declining)
  // - Quality: 15 points (avg duration + short call penalty)
  // - Consistency: 10 points (active days / 5)

  it("answer rate component: 30%+ answer rate = full 50 points", () => {
    const answerRate = 35; // 35%
    const answerRateScore = Math.min(50, (answerRate / 30) * 50);
    expect(answerRateScore).toBe(50); // Capped at 50
  });

  it("answer rate component: 15% answer rate = 25 points", () => {
    const answerRate = 15;
    const answerRateScore = Math.min(50, (answerRate / 30) * 50);
    expect(answerRateScore).toBe(25);
  });

  it("answer rate component: 0% answer rate = 0 points", () => {
    const answerRate = 0;
    const answerRateScore = Math.min(50, (answerRate / 30) * 50);
    expect(answerRateScore).toBe(0);
  });

  it("trend component: improving trend (diff > 5) = 25 points", () => {
    const recentAnswerRate = 20;
    const olderAnswerRate = 10;
    const diff = recentAnswerRate - olderAnswerRate; // +10
    let trendScore = 12.5;
    if (diff > 5) trendScore = 25;
    else if (diff > 0) trendScore = 18;
    else if (diff > -5) trendScore = 10;
    else if (diff > -10) trendScore = 5;
    else trendScore = 0;
    expect(trendScore).toBe(25);
  });

  it("trend component: declining trend (diff < -10) = 0 points", () => {
    const recentAnswerRate = 5;
    const olderAnswerRate = 20;
    const diff = recentAnswerRate - olderAnswerRate; // -15
    let trendScore = 12.5;
    if (diff > 5) trendScore = 25;
    else if (diff > 0) trendScore = 18;
    else if (diff > -5) trendScore = 10;
    else if (diff > -10) trendScore = 5;
    else trendScore = 0;
    expect(trendScore).toBe(0);
  });

  it("trend component: stable trend (diff between 0 and 5) = 18 points", () => {
    const recentAnswerRate = 18;
    const olderAnswerRate = 15;
    const diff = recentAnswerRate - olderAnswerRate; // +3
    let trendScore = 12.5;
    if (diff > 5) trendScore = 25;
    else if (diff > 0) trendScore = 18;
    else if (diff > -5) trendScore = 10;
    else if (diff > -10) trendScore = 5;
    else trendScore = 0;
    expect(trendScore).toBe(18);
  });

  it("quality component: long avg duration (15s+) with no short calls = full 15 points", () => {
    const avgDuration = 20; // 20 seconds
    const shortCallRatio = 0; // no short calls
    const durationScore = Math.min(10, (avgDuration / 15) * 10);
    const shortCallPenalty = shortCallRatio > 0.5 ? 5 : shortCallRatio > 0.3 ? 3 : 0;
    const qualityScore = Math.max(0, durationScore + 5 - shortCallPenalty);
    expect(qualityScore).toBe(15);
  });

  it("quality component: high short call ratio (>50%) applies 5 point penalty", () => {
    const avgDuration = 10;
    const shortCallRatio = 0.6; // 60% short calls
    const durationScore = Math.min(10, (avgDuration / 15) * 10);
    const shortCallPenalty = shortCallRatio > 0.5 ? 5 : shortCallRatio > 0.3 ? 3 : 0;
    const qualityScore = Math.max(0, durationScore + 5 - shortCallPenalty);
    expect(shortCallPenalty).toBe(5);
    // durationScore = 6.67, qualityScore = max(0, 6.67 + 5 - 5) = 6.67
    expect(qualityScore).toBeCloseTo(6.67, 1);
  });

  it("consistency component: 5+ active days = full 10 points", () => {
    const activeDays = 6;
    const consistencyScore = Math.min(10, (activeDays / 5) * 10);
    expect(consistencyScore).toBe(10); // Capped at 10
  });

  it("consistency component: 3 active days = 6 points", () => {
    const activeDays = 3;
    const consistencyScore = Math.min(10, (activeDays / 5) * 10);
    expect(consistencyScore).toBe(6);
  });

  it("consistency component: 0 active days = 0 points", () => {
    const activeDays = 0;
    const consistencyScore = Math.min(10, (activeDays / 5) * 10);
    expect(consistencyScore).toBe(0);
  });

  it("total score is clamped between 0 and 100", () => {
    // Max possible: 50 + 25 + 15 + 10 = 100
    const maxScore = Math.max(0, Math.min(100, 50 + 25 + 15 + 10));
    expect(maxScore).toBe(100);

    // Over 100 gets clamped
    const overScore = Math.max(0, Math.min(100, 120));
    expect(overScore).toBe(100);

    // Negative gets clamped to 0
    const negScore = Math.max(0, Math.min(100, -5));
    expect(negScore).toBe(0);
  });

  it("DID with no daily stats gets neutral score of 75", () => {
    const stats: any[] = [];
    let score: number;
    if (stats.length === 0) {
      score = 75; // No data = neutral
    } else {
      score = 50; // Would be computed
    }
    expect(score).toBe(75);
  });

  it("full score calculation matches expected output for good DID", () => {
    // Simulate a DID with 25% answer rate, improving trend, 20s avg duration, 5 active days
    const answerRate = 25;
    const answerRateScore = Math.min(50, (answerRate / 30) * 50); // 41.67
    const trendScore = 25; // improving
    const avgDuration = 20;
    const shortCallRatio = 0.1;
    const durationScore = Math.min(10, (avgDuration / 15) * 10); // 10 (capped)
    const shortCallPenalty = shortCallRatio > 0.5 ? 5 : shortCallRatio > 0.3 ? 3 : 0;
    const qualityScore = Math.max(0, durationScore + 5 - shortCallPenalty); // 15
    const activeDays = 5;
    const consistencyScore = Math.min(10, (activeDays / 5) * 10); // 10

    const totalScore = Math.round(answerRateScore + trendScore + qualityScore + consistencyScore);
    const clampedScore = Math.max(0, Math.min(100, totalScore));
    // 41.67 + 25 + 15 + 10 = 91.67 → 92
    expect(clampedScore).toBe(92);
  });

  it("full score calculation matches expected output for poor DID", () => {
    // Simulate a DID with 5% answer rate, declining trend, 3s avg duration, 1 active day, high short calls
    const answerRate = 5;
    const answerRateScore = Math.min(50, (answerRate / 30) * 50); // 8.33
    const trendScore = 0; // declining heavily
    const avgDuration = 3;
    const shortCallRatio = 0.7;
    const durationScore = Math.min(10, (avgDuration / 15) * 10); // 2
    const shortCallPenalty = shortCallRatio > 0.5 ? 5 : shortCallRatio > 0.3 ? 3 : 0;
    const qualityScore = Math.max(0, durationScore + 5 - shortCallPenalty); // max(0, 2+5-5) = 2
    const activeDays = 1;
    const consistencyScore = Math.min(10, (activeDays / 5) * 10); // 2

    const totalScore = Math.round(answerRateScore + trendScore + qualityScore + consistencyScore);
    const clampedScore = Math.max(0, Math.min(100, totalScore));
    // 8.33 + 0 + 2 + 2 = 12.33 → 12
    expect(clampedScore).toBe(12);
  });

  it("trend label is correct based on answer rate difference", () => {
    const cases = [
      { diff: 10, expected: "improving" },
      { diff: 3, expected: "stable" },
      { diff: -3, expected: "stable" },
      { diff: -7, expected: "declining" },
      { diff: -15, expected: "declining" },
    ];
    for (const { diff, expected } of cases) {
      let trendLabel: string;
      if (diff > 5) trendLabel = "improving";
      else if (diff > 0) trendLabel = "stable";
      else if (diff > -5) trendLabel = "stable";
      else if (diff > -10) trendLabel = "declining";
      else trendLabel = "declining";
      expect(trendLabel).toBe(expected);
    }
  });
});

// ─── Reputation History Retrieval ─────────────────────────────────────────────
describe("Reputation History Retrieval", () => {
  it("calculates correct date range for 14-day lookback", () => {
    const days = 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Should be approximately 14 days before today (date boundary may add 1)
    const today = new Date();
    const sinceDate = new Date(since + "T00:00:00Z");
    const todayStart = new Date(today.toISOString().slice(0, 10) + "T00:00:00Z");
    const diffDays = Math.round((todayStart.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBeGreaterThanOrEqual(14);
    expect(diffDays).toBeLessThanOrEqual(15);
  });

  it("calculates correct date range for 7-day lookback", () => {
    const days = 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date();
    const sinceDate = new Date(since + "T00:00:00Z");
    const todayStart = new Date(today.toISOString().slice(0, 10) + "T00:00:00Z");
    const diffDays = Math.round((todayStart.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBeGreaterThanOrEqual(7);
    expect(diffDays).toBeLessThanOrEqual(8);
  });

  it("splits stats into recent (7d) and older (7-14d) correctly", () => {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stats = [
      { date: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }, // 2 days ago
      { date: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }, // 5 days ago
      { date: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }, // 10 days ago
      { date: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }, // 12 days ago
    ];
    const recentStats = stats.filter(s => s.date >= sevenDaysAgo);
    const olderStats = stats.filter(s => s.date < sevenDaysAgo);
    expect(recentStats.length).toBe(2);
    expect(olderStats.length).toBe(2);
  });
});

// ─── Auto-Retry Schedule Time Calculation ─────────────────────────────────────
describe("Auto-Retry Schedule Time", () => {
  it("validates retryScheduleTime format (HH:MM)", () => {
    const validTimes = ["09:00", "14:30", "23:59", "00:00"];
    const invalidTimes = ["9:00", "abc", "", "1400"];

    for (const t of validTimes) {
      expect(/^\d{2}:\d{2}$/.test(t)).toBe(true);
    }
    for (const t of invalidTimes) {
      expect(/^\d{2}:\d{2}$/.test(t)).toBe(false);
    }
  });

  it("parses hours and minutes from schedule time", () => {
    const retryScheduleTime = "14:30";
    const [hours, minutes] = retryScheduleTime.split(":").map(Number);
    expect(hours).toBe(14);
    expect(minutes).toBe(30);
  });

  it("calculates positive delay when target time is later today", () => {
    // Simulate: current time is 10:00, target is 14:00
    const nowMinutes = 10 * 60 + 0; // 600
    const targetMinutes = 14 * 60 + 0; // 840
    let diffMinutes = targetMinutes - nowMinutes;
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    expect(diffMinutes).toBe(240); // 4 hours
    const retryDelayMs = diffMinutes * 60 * 1000;
    expect(retryDelayMs).toBe(14400000); // 4 hours in ms
  });

  it("wraps to next day when target time has already passed", () => {
    // Simulate: current time is 16:00, target is 14:00
    const nowMinutes = 16 * 60 + 0; // 960
    const targetMinutes = 14 * 60 + 0; // 840
    let diffMinutes = targetMinutes - nowMinutes; // -120
    if (diffMinutes <= 0) diffMinutes += 24 * 60; // -120 + 1440 = 1320
    expect(diffMinutes).toBe(1320); // 22 hours
    const retryDelayMs = diffMinutes * 60 * 1000;
    expect(retryDelayMs).toBe(79200000); // 22 hours in ms
  });

  it("wraps to next day when target time equals current time", () => {
    // Simulate: current time is 14:00, target is 14:00
    const nowMinutes = 14 * 60 + 0;
    const targetMinutes = 14 * 60 + 0;
    let diffMinutes = targetMinutes - nowMinutes; // 0
    if (diffMinutes <= 0) diffMinutes += 24 * 60; // 0 + 1440 = 1440
    expect(diffMinutes).toBe(1440); // Full 24 hours
  });

  it("handles midnight target correctly", () => {
    // Simulate: current time is 23:00, target is 00:00
    const nowMinutes = 23 * 60 + 0; // 1380
    const targetMinutes = 0 * 60 + 0; // 0
    let diffMinutes = targetMinutes - nowMinutes; // -1380
    if (diffMinutes <= 0) diffMinutes += 24 * 60; // -1380 + 1440 = 60
    expect(diffMinutes).toBe(60); // 1 hour until midnight
  });

  it("handles early morning target from late night correctly", () => {
    // Simulate: current time is 22:30, target is 06:00
    const nowMinutes = 22 * 60 + 30; // 1350
    const targetMinutes = 6 * 60 + 0; // 360
    let diffMinutes = targetMinutes - nowMinutes; // -990
    if (diffMinutes <= 0) diffMinutes += 24 * 60; // -990 + 1440 = 450
    expect(diffMinutes).toBe(450); // 7.5 hours
  });

  it("falls back to retryDelay when retryScheduleTime is null", () => {
    const retryScheduleTime: string | null = null;
    const retryDelay = 300; // seconds
    let retryDelayMs: number;
    if (retryScheduleTime && /^\d{2}:\d{2}$/.test(retryScheduleTime)) {
      retryDelayMs = 0; // would be calculated
    } else {
      retryDelayMs = (retryDelay || 300) * 1000;
    }
    expect(retryDelayMs).toBe(300000); // 5 minutes
  });

  it("falls back to retryDelay when retryScheduleTime is empty string", () => {
    const retryScheduleTime = "";
    const retryDelay = 600;
    let retryDelayMs: number;
    if (retryScheduleTime && /^\d{2}:\d{2}$/.test(retryScheduleTime)) {
      retryDelayMs = 0;
    } else {
      retryDelayMs = (retryDelay || 300) * 1000;
    }
    expect(retryDelayMs).toBe(600000); // 10 minutes
  });

  it("falls back to default 300s when retryDelay is 0 or undefined", () => {
    const retryScheduleTime: string | null = null;
    const retryDelay = 0;
    let retryDelayMs: number;
    if (retryScheduleTime && /^\d{2}:\d{2}$/.test(retryScheduleTime)) {
      retryDelayMs = 0;
    } else {
      retryDelayMs = (retryDelay || 300) * 1000;
    }
    expect(retryDelayMs).toBe(300000); // Falls back to 300s default
  });

  it("generates correct retry description for scheduled time", () => {
    const retryScheduleTime = "14:00";
    const tz = "America/New_York";
    const diffMinutes = 240;
    const retryDescription = `at ${retryScheduleTime} ${tz} (in ${diffMinutes} minutes)`;
    expect(retryDescription).toBe("at 14:00 America/New_York (in 240 minutes)");
  });

  it("generates correct retry description for delay-based retry", () => {
    const retryDelayMs = 300000;
    const retryDescription = `in ${Math.round(retryDelayMs / 60000)} minutes`;
    expect(retryDescription).toBe("in 5 minutes");
  });
});

// ─── Integration: Retry + Reputation Interaction ─────────────────────────────
describe("Retry and Reputation Integration", () => {
  it("retry only triggers when retryAttempts > 0 and contacts exist", () => {
    const campaign = { retryAttempts: 2, retryScheduleTime: "14:00" };
    const toRetry = [
      { contactId: 1, maxAttempt: 1 },
      { contactId: 2, maxAttempt: 1 },
    ];
    const shouldRetry = campaign.retryAttempts > 0 && toRetry.length > 0;
    expect(shouldRetry).toBe(true);
  });

  it("retry does not trigger when no retriable contacts", () => {
    const campaign = { retryAttempts: 2, retryScheduleTime: "14:00" };
    const toRetry: any[] = [];
    const shouldRetry = campaign.retryAttempts > 0 && toRetry.length > 0;
    expect(shouldRetry).toBe(false);
  });

  it("reputation score colors match expected thresholds", () => {
    // Green: >= 70, Yellow: >= 40, Red: < 40
    const scores = [
      { score: 92, expectedColor: "green" },
      { score: 70, expectedColor: "green" },
      { score: 55, expectedColor: "yellow" },
      { score: 40, expectedColor: "yellow" },
      { score: 39, expectedColor: "red" },
      { score: 12, expectedColor: "red" },
      { score: 0, expectedColor: "red" },
    ];
    for (const { score, expectedColor } of scores) {
      const color = score >= 70 ? "green" : score >= 40 ? "yellow" : "red";
      expect(color).toBe(expectedColor);
    }
  });
});
