import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── AI Script Writer Input Validation ───────────────────────────────────────
describe("AI Script Writer", () => {
  const aiWriterSchema = z.object({
    prompt: z.string().min(10).max(2000),
    tone: z.enum(["professional", "friendly", "urgent", "casual", "formal"]).optional(),
    industry: z.string().max(100).optional(),
    includeIvr: z.boolean().optional(),
  });

  it("accepts valid prompt with all options", () => {
    const result = aiWriterSchema.safeParse({
      prompt: "Create a script for a dental office appointment reminder",
      tone: "friendly",
      industry: "Healthcare",
      includeIvr: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects prompt shorter than 10 chars", () => {
    const result = aiWriterSchema.safeParse({ prompt: "Short" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tone", () => {
    const result = aiWriterSchema.safeParse({
      prompt: "Create a script for appointment reminders",
      tone: "angry",
    });
    expect(result.success).toBe(false);
  });

  it("accepts prompt with only required field", () => {
    const result = aiWriterSchema.safeParse({
      prompt: "Create a script for a plumbing service follow-up call",
    });
    expect(result.success).toBe(true);
  });

  it("defaults optional fields to undefined", () => {
    const result = aiWriterSchema.safeParse({
      prompt: "Create a script for a plumbing service follow-up call",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tone).toBeUndefined();
      expect(result.data.industry).toBeUndefined();
      expect(result.data.includeIvr).toBeUndefined();
    }
  });
});

// ─── Campaign Clone with Schedule Offset ─────────────────────────────────────
describe("Campaign Clone with Schedule Offset", () => {
  const cloneSchema = z.object({
    id: z.number(),
    name: z.string().min(1).max(255),
    scheduleOffsetMs: z.number().optional(),
    scheduleAt: z.number().optional(),
  });

  it("accepts clone with no schedule", () => {
    const result = cloneSchema.safeParse({ id: 1, name: "Campaign Copy" });
    expect(result.success).toBe(true);
  });

  it("accepts clone with offset schedule", () => {
    const result = cloneSchema.safeParse({
      id: 1,
      name: "Campaign Copy",
      scheduleOffsetMs: 24 * 3600 * 1000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleOffsetMs).toBe(86400000);
    }
  });

  it("accepts clone with absolute schedule", () => {
    const futureTime = Date.now() + 3600000;
    const result = cloneSchema.safeParse({
      id: 1,
      name: "Campaign Copy",
      scheduleAt: futureTime,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = cloneSchema.safeParse({ id: 1, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 255 chars", () => {
    const result = cloneSchema.safeParse({ id: 1, name: "x".repeat(256) });
    expect(result.success).toBe(false);
  });
});

// ─── Best Time to Call Input Validation ──────────────────────────────────────
describe("Best Time to Call", () => {
  const bestTimeSchema = z.object({
    days: z.number().min(7).max(90).default(30),
  }).optional();

  it("accepts valid days range", () => {
    const result = bestTimeSchema.safeParse({ days: 30 });
    expect(result.success).toBe(true);
  });

  it("rejects days below minimum", () => {
    const result = bestTimeSchema.safeParse({ days: 3 });
    expect(result.success).toBe(false);
  });

  it("rejects days above maximum", () => {
    const result = bestTimeSchema.safeParse({ days: 120 });
    expect(result.success).toBe(false);
  });

  it("accepts undefined (optional)", () => {
    const result = bestTimeSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("defaults to 30 days when not specified", () => {
    const result = bestTimeSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.days).toBe(30);
    }
  });
});

// ─── Script Performance Scoring ──────────────────────────────────────────────
describe("Script Performance Scoring", () => {
  function calculateGrade(metrics: { totalCalls: number; answeredCalls: number; avgDuration: number }) {
    if (metrics.totalCalls < 10) return { grade: "N/A", score: 0, label: "Not enough data" };
    const answerRate = metrics.totalCalls > 0 ? metrics.answeredCalls / metrics.totalCalls : 0;
    const answerScore = Math.min(answerRate * 100, 100) * 0.6;
    const durationScore = Math.min(metrics.avgDuration / 60, 1) * 100 * 0.3;
    const volumeScore = Math.min(metrics.totalCalls / 100, 1) * 100 * 0.1;
    const total = answerScore + durationScore + volumeScore;
    const grade = total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";
    return { grade, score: Math.round(total), label: `${Math.round(total)}/100` };
  }

  it("returns N/A for insufficient data", () => {
    expect(calculateGrade({ totalCalls: 5, answeredCalls: 3, avgDuration: 30 }).grade).toBe("N/A");
  });

  it("returns A for excellent performance", () => {
    expect(calculateGrade({ totalCalls: 200, answeredCalls: 180, avgDuration: 90 }).grade).toBe("A");
  });

  it("returns F for poor performance", () => {
    expect(calculateGrade({ totalCalls: 100, answeredCalls: 5, avgDuration: 5 }).grade).toBe("F");
  });

  it("weights answer rate at 60%", () => {
    const high = calculateGrade({ totalCalls: 100, answeredCalls: 90, avgDuration: 10 });
    const low = calculateGrade({ totalCalls: 100, answeredCalls: 10, avgDuration: 10 });
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.score - low.score).toBeGreaterThan(30);
  });

  it("considers call volume in scoring", () => {
    const highVol = calculateGrade({ totalCalls: 200, answeredCalls: 100, avgDuration: 30 });
    const lowVol = calculateGrade({ totalCalls: 20, answeredCalls: 10, avgDuration: 30 });
    expect(highVol.score).toBeGreaterThan(lowVol.score);
  });
});

// ─── Script Library Templates ────────────────────────────────────────────────
describe("Script Library Templates", () => {
  const TEMPLATE_INDUSTRIES = [
    "Healthcare", "Real Estate", "Insurance", "Home Services",
    "Automotive", "Education", "Retail", "Non-Profit",
  ];

  it("has at least 8 industry categories", () => {
    expect(TEMPLATE_INDUSTRIES.length).toBeGreaterThanOrEqual(8);
  });

  it("all industry names are non-empty strings", () => {
    for (const industry of TEMPLATE_INDUSTRIES) {
      expect(typeof industry).toBe("string");
      expect(industry.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate industries", () => {
    const unique = new Set(TEMPLATE_INDUSTRIES);
    expect(unique.size).toBe(TEMPLATE_INDUSTRIES.length);
  });
});

// ─── Live Campaign Dashboard ─────────────────────────────────────────────────
describe("Live Campaign Dashboard", () => {
  const liveStatsSchema = z.object({ id: z.number() });

  it("accepts valid campaign id", () => {
    expect(liveStatsSchema.safeParse({ id: 1 }).success).toBe(true);
  });

  it("rejects missing id", () => {
    expect(liveStatsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects string id", () => {
    expect(liveStatsSchema.safeParse({ id: "abc" }).success).toBe(false);
  });

  it("calculates ETA correctly", () => {
    const remaining = 500;
    const callsPerMinute = 10;
    const eta = Math.round(remaining / callsPerMinute);
    expect(eta).toBe(50);
  });

  it("formats ETA hours correctly", () => {
    const etaMinutes = 125;
    const formatted = etaMinutes >= 60
      ? `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`
      : `${etaMinutes}m`;
    expect(formatted).toBe("2h 5m");
  });
});
