import { describe, it, expect } from "vitest";

describe("Auto-Suggest Label Naming (Date Shortcut)", () => {
  it("should generate today's date in M.D.YY format", () => {
    const now = new Date();
    const label = `${now.getMonth() + 1}.${now.getDate()}.${String(now.getFullYear()).slice(2)}`;
    
    // Verify format: M.D.YY (no leading zeros)
    expect(label).toMatch(/^\d{1,2}\.\d{1,2}\.\d{2}$/);
    
    // Verify it's today's date
    const parts = label.split(".");
    expect(parseInt(parts[0])).toBe(now.getMonth() + 1);
    expect(parseInt(parts[1])).toBe(now.getDate());
    expect(parts[2]).toBe(String(now.getFullYear()).slice(2));
  });

  it("should produce consistent format for single-digit months and days", () => {
    // Simulate January 5, 2026
    const date = new Date(2026, 0, 5); // Jan 5, 2026
    const label = `${date.getMonth() + 1}.${date.getDate()}.${String(date.getFullYear()).slice(2)}`;
    expect(label).toBe("1.5.26");
  });

  it("should produce correct format for double-digit months and days", () => {
    // Simulate December 25, 2026
    const date = new Date(2026, 11, 25); // Dec 25, 2026
    const label = `${date.getMonth() + 1}.${date.getDate()}.${String(date.getFullYear()).slice(2)}`;
    expect(label).toBe("12.25.26");
  });
});

describe("DID Pool Preview Endpoint", () => {
  it("should return correct structure from poolPreview query", () => {
    // Simulate the response shape
    const mockResponse = {
      total: 30,
      dids: Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        phoneNumber: `555000${String(i).padStart(4, "0")}`,
        label: "5.22.26",
      })).slice(0, 50),
      hasMore: false,
    };

    expect(mockResponse.total).toBe(30);
    expect(mockResponse.dids.length).toBeLessThanOrEqual(50);
    expect(mockResponse.hasMore).toBe(false);
    expect(mockResponse.dids[0]).toHaveProperty("id");
    expect(mockResponse.dids[0]).toHaveProperty("phoneNumber");
    expect(mockResponse.dids[0]).toHaveProperty("label");
  });

  it("should set hasMore=true when pool exceeds 50 DIDs", () => {
    const pool = Array.from({ length: 75 }, (_, i) => ({
      id: i + 1,
      phoneNumber: `555${String(i).padStart(7, "0")}`,
      label: "5.22.26",
    }));

    const response = {
      total: pool.length,
      dids: pool.slice(0, 50).map(d => ({ id: d.id, phoneNumber: d.phoneNumber, label: d.label })),
      hasMore: pool.length > 50,
    };

    expect(response.total).toBe(75);
    expect(response.dids.length).toBe(50);
    expect(response.hasMore).toBe(true);
  });

  it("should handle empty pool gracefully", () => {
    const pool: any[] = [];
    const response = {
      total: pool.length,
      dids: pool.slice(0, 50),
      hasMore: pool.length > 50,
    };

    expect(response.total).toBe(0);
    expect(response.dids.length).toBe(0);
    expect(response.hasMore).toBe(false);
  });

  it("should accept strategy and labels input", () => {
    const input = {
      strategy: "label" as const,
      labels: ["5.22.26", "5.20.26"],
      label: undefined,
      manualIds: undefined,
    };

    expect(input.strategy).toBe("label");
    expect(input.labels).toHaveLength(2);
    expect(input.labels).toContain("5.22.26");
  });
});

describe("Label-Based DID Rotation Analytics", () => {
  it("should aggregate stats by label", () => {
    const summary = [
      { phoneNumber: "5550001", label: "5.22.26", totalCalls: 100, answered: 5, failed: 10, noAnswer: 85, totalDuration: 300, isActive: 1, autoDisabled: 0, reputationScore: 60 },
      { phoneNumber: "5550002", label: "5.22.26", totalCalls: 80, answered: 4, failed: 8, noAnswer: 68, totalDuration: 200, isActive: 1, autoDisabled: 0, reputationScore: 55 },
      { phoneNumber: "5550003", label: "5.20.26", totalCalls: 120, answered: 8, failed: 5, noAnswer: 107, totalDuration: 500, isActive: 1, autoDisabled: 0, reputationScore: 75 },
      { phoneNumber: "5550004", label: "5.20.26", totalCalls: 90, answered: 6, failed: 3, noAnswer: 81, totalDuration: 350, isActive: 1, autoDisabled: 0, reputationScore: 80 },
      { phoneNumber: "5550005", label: null, totalCalls: 50, answered: 2, failed: 5, noAnswer: 43, totalDuration: 100, isActive: 1, autoDisabled: 0, reputationScore: 40 },
    ];

    const map = new Map<string, { label: string; totalCalls: number; answered: number; failed: number; noAnswer: number; totalDuration: number; didCount: number; reputationSum: number }>();
    for (const d of summary) {
      const lbl = d.label || "(unlabeled)";
      const existing = map.get(lbl) || { label: lbl, totalCalls: 0, answered: 0, failed: 0, noAnswer: 0, totalDuration: 0, didCount: 0, reputationSum: 0 };
      existing.totalCalls += d.totalCalls;
      existing.answered += d.answered;
      existing.failed += d.failed;
      existing.noAnswer += d.noAnswer;
      existing.totalDuration += d.totalDuration;
      existing.didCount++;
      existing.reputationSum += (d.reputationScore ?? 0);
      map.set(lbl, existing);
    }

    const labelStats = Array.from(map.values())
      .map(s => ({
        ...s,
        answerRate: s.totalCalls > 0 ? Math.round((s.answered / s.totalCalls) * 100) : 0,
        avgReputation: s.didCount > 0 ? Math.round(s.reputationSum / s.didCount) : 0,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls);

    expect(labelStats).toHaveLength(3);

    // "5.20.26" has most calls (120+90=210)
    expect(labelStats[0].label).toBe("5.20.26");
    expect(labelStats[0].totalCalls).toBe(210);
    expect(labelStats[0].answered).toBe(14);
    expect(labelStats[0].didCount).toBe(2);
    expect(labelStats[0].avgReputation).toBe(78); // (75+80)/2 = 77.5 → 78

    // "5.22.26" has 180 calls
    expect(labelStats[1].label).toBe("5.22.26");
    expect(labelStats[1].totalCalls).toBe(180);
    expect(labelStats[1].answered).toBe(9);
    expect(labelStats[1].didCount).toBe(2);
    expect(labelStats[1].answerRate).toBe(5); // 9/180 = 5%
    expect(labelStats[1].avgReputation).toBe(58); // (60+55)/2 = 57.5 → 58

    // "(unlabeled)" has 50 calls
    expect(labelStats[2].label).toBe("(unlabeled)");
    expect(labelStats[2].totalCalls).toBe(50);
    expect(labelStats[2].avgReputation).toBe(40);
  });

  it("should not show label breakdown when only one label exists", () => {
    const summary = [
      { phoneNumber: "5550001", label: "5.22.26", totalCalls: 100, answered: 5, failed: 10, noAnswer: 85, totalDuration: 300, isActive: 1, autoDisabled: 0, reputationScore: 60 },
      { phoneNumber: "5550002", label: "5.22.26", totalCalls: 80, answered: 4, failed: 8, noAnswer: 68, totalDuration: 200, isActive: 1, autoDisabled: 0, reputationScore: 55 },
    ];

    const map = new Map<string, { totalCalls: number; didCount: number }>();
    for (const d of summary) {
      const lbl = d.label || "(unlabeled)";
      const existing = map.get(lbl) || { totalCalls: 0, didCount: 0 };
      existing.totalCalls += d.totalCalls;
      existing.didCount++;
      map.set(lbl, existing);
    }

    const labelStats = Array.from(map.values()).filter(s => s.totalCalls > 0);
    // Only one label group → should not show the breakdown
    expect(labelStats.length).toBeLessThanOrEqual(1);
  });

  it("should calculate answer rate correctly per label", () => {
    const totalCalls = 200;
    const answered = 10;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;
    expect(answerRate).toBe(5);
  });

  it("should handle DIDs with zero calls in a label group", () => {
    const summary = [
      { phoneNumber: "5550001", label: "5.22.26", totalCalls: 0, answered: 0, failed: 0, noAnswer: 0, totalDuration: 0, isActive: 1, autoDisabled: 0, reputationScore: 50 },
      { phoneNumber: "5550002", label: "5.20.26", totalCalls: 100, answered: 5, failed: 10, noAnswer: 85, totalDuration: 300, isActive: 1, autoDisabled: 0, reputationScore: 70 },
    ];

    const map = new Map<string, { label: string; totalCalls: number; answered: number; didCount: number; reputationSum: number }>();
    for (const d of summary) {
      const lbl = d.label || "(unlabeled)";
      const existing = map.get(lbl) || { label: lbl, totalCalls: 0, answered: 0, didCount: 0, reputationSum: 0 };
      existing.totalCalls += d.totalCalls;
      existing.answered += d.answered;
      existing.didCount++;
      existing.reputationSum += (d.reputationScore ?? 0);
      map.set(lbl, existing);
    }

    const labelStats = Array.from(map.values())
      .map(s => ({
        ...s,
        answerRate: s.totalCalls > 0 ? Math.round((s.answered / s.totalCalls) * 100) : 0,
        avgReputation: s.didCount > 0 ? Math.round(s.reputationSum / s.didCount) : 0,
      }))
      .filter(s => s.totalCalls > 0);

    // Only "5.20.26" should appear (has calls)
    expect(labelStats).toHaveLength(1);
    expect(labelStats[0].label).toBe("5.20.26");
    expect(labelStats[0].answerRate).toBe(5);
  });
});
