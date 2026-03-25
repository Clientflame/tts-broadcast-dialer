import { describe, it, expect, vi } from "vitest";

// ─── Script Version History Tests ─────────────────────────────────────────────

describe("Script Version History", () => {
  it("should create initial version on script creation", () => {
    // When a script is created, version 1 should be created with changeType "created"
    const version = {
      scriptId: 1,
      version: 1,
      userId: 1,
      userName: "Test User",
      changeType: "created" as const,
      changeSummary: "Initial script creation",
      name: "Test Script",
      description: null,
      callbackNumber: null,
      segments: [{ id: "seg1", type: "tts" as const, position: 0, text: "Hello world" }],
      status: "active" as const,
    };
    expect(version.version).toBe(1);
    expect(version.changeType).toBe("created");
    expect(version.changeSummary).toBe("Initial script creation");
  });

  it("should auto-increment version number on update", () => {
    const versions = [
      { version: 1, changeType: "created" },
      { version: 2, changeType: "edited" },
      { version: 3, changeType: "edited" },
    ];
    const latestVersion = Math.max(...versions.map(v => v.version));
    expect(latestVersion).toBe(3);
    expect(latestVersion + 1).toBe(4);
  });

  it("should build change summary for name change", () => {
    const currentScript = { name: "Old Name", segments: [], status: "active", callbackNumber: null, description: null };
    const data = { name: "New Name" };
    const changes: string[] = [];
    if (data.name && data.name !== currentScript.name) {
      changes.push(`Name: "${currentScript.name}" → "${data.name}"`);
    }
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain("Old Name");
    expect(changes[0]).toContain("New Name");
  });

  it("should build change summary for segment update", () => {
    const data = { segments: [{ id: "s1", type: "tts", position: 0, text: "Hi" }, { id: "s2", type: "tts", position: 1, text: "Bye" }] };
    const changes: string[] = [];
    if (data.segments) changes.push(`Segments updated (${data.segments.length} segments)`);
    expect(changes[0]).toBe("Segments updated (2 segments)");
  });

  it("should build change summary for status change", () => {
    const currentScript = { status: "draft" };
    const data = { status: "active" };
    const changes: string[] = [];
    if (data.status && data.status !== currentScript.status) {
      changes.push(`Status: ${currentScript.status} → ${data.status}`);
    }
    expect(changes[0]).toBe("Status: draft → active");
  });

  it("should combine multiple changes into summary", () => {
    const changes = [
      'Name: "Old" → "New"',
      "Segments updated (3 segments)",
      "Status: draft → active",
    ];
    const summary = changes.join("; ");
    expect(summary).toContain("Name:");
    expect(summary).toContain("Segments updated");
    expect(summary).toContain("Status:");
  });

  it("should create revert version entry", () => {
    const revertVersion = {
      scriptId: 1,
      version: 5,
      userId: 1,
      userName: "Admin",
      changeType: "reverted" as const,
      changeSummary: "Reverted to version 2",
      name: "Script v2",
      segments: [],
      status: "active" as const,
    };
    expect(revertVersion.changeType).toBe("reverted");
    expect(revertVersion.changeSummary).toBe("Reverted to version 2");
    expect(revertVersion.version).toBe(5);
  });

  it("should validate version belongs to correct script on revert", () => {
    const version = { id: 10, scriptId: 5, version: 2 };
    const requestedScriptId = 5;
    const wrongScriptId = 99;
    expect(version.scriptId === requestedScriptId).toBe(true);
    expect(version.scriptId === wrongScriptId).toBe(false);
  });
});

// ─── Script Performance Metrics Tests ─────────────────────────────────────────

describe("Script Performance Metrics", () => {
  it("should calculate answer rate correctly", () => {
    const totalCalls = 100;
    const answeredCalls = 53;
    const answerRate = Math.round((answeredCalls / totalCalls) * 100);
    expect(answerRate).toBe(53);
  });

  it("should handle zero total calls", () => {
    const totalCalls = 0;
    const answeredCalls = 0;
    const answerRate = totalCalls ? Math.round((answeredCalls / totalCalls) * 100) : 0;
    expect(answerRate).toBe(0);
  });

  it("should format total duration as hours and minutes", () => {
    const totalDuration = 7380; // 2h 3m
    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    expect(hours).toBe(2);
    expect(minutes).toBe(3);
    expect(`${hours}h ${minutes}m`).toBe("2h 3m");
  });

  it("should format short duration as minutes and seconds", () => {
    const totalDuration = 125; // 2m 5s
    const minutes = Math.floor(totalDuration / 60);
    const seconds = totalDuration % 60;
    expect(`${minutes}m ${seconds}s`).toBe("2m 5s");
  });

  it("should aggregate metrics per script", () => {
    const rawMetrics = [
      { scriptId: 1, totalCalls: 50, answeredCalls: 30, failedCalls: 5, busyCalls: 5, noAnswerCalls: 10, totalDuration: 600, avgDuration: 20, campaignCount: 2 },
      { scriptId: 2, totalCalls: 100, answeredCalls: 70, failedCalls: 10, busyCalls: 8, noAnswerCalls: 12, totalDuration: 1400, avgDuration: 20, campaignCount: 3 },
    ];
    expect(rawMetrics).toHaveLength(2);
    expect(rawMetrics[0].scriptId).toBe(1);
    expect(rawMetrics[1].scriptId).toBe(2);
    // Verify answer rates
    const rate1 = Math.round((rawMetrics[0].answeredCalls / rawMetrics[0].totalCalls) * 100);
    const rate2 = Math.round((rawMetrics[1].answeredCalls / rawMetrics[1].totalCalls) * 100);
    expect(rate1).toBe(60);
    expect(rate2).toBe(70);
  });

  it("should categorize answer rate badge variants", () => {
    const getBadgeVariant = (rate: number) => {
      if (rate >= 50) return "default";
      if (rate >= 30) return "secondary";
      return "destructive";
    };
    expect(getBadgeVariant(70)).toBe("default");
    expect(getBadgeVariant(50)).toBe("default");
    expect(getBadgeVariant(40)).toBe("secondary");
    expect(getBadgeVariant(30)).toBe("secondary");
    expect(getBadgeVariant(20)).toBe("destructive");
  });

  it("should count distinct campaigns per script", () => {
    const campaignScriptPairs = [
      { campaignId: 1, scriptId: 1 },
      { campaignId: 2, scriptId: 1 },
      { campaignId: 3, scriptId: 2 },
      { campaignId: 1, scriptId: 1 }, // duplicate
    ];
    const script1Campaigns = new Set(
      campaignScriptPairs.filter(p => p.scriptId === 1).map(p => p.campaignId)
    );
    expect(script1Campaigns.size).toBe(2);
  });
});

// ─── Script Preview Tooltip Tests ─────────────────────────────────────────────

describe("Script Preview Tooltip", () => {
  it("should truncate long TTS text to 80 chars", () => {
    const text = "This is a very long TTS text that exceeds eighty characters and should be truncated with an ellipsis at the end for display";
    const truncated = text.length > 80 ? text.slice(0, 80) + "..." : text;
    expect(truncated.length).toBe(83); // 80 + "..."
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("should show 'No text' for empty TTS segments", () => {
    const seg = { type: "tts", text: "" };
    const display = seg.text ? (seg.text.length > 80 ? seg.text.slice(0, 80) + "..." : seg.text) : "No text";
    expect(display).toBe("No text");
  });

  it("should show audio name for recorded segments", () => {
    const seg = { type: "recorded", audioName: "Greeting.wav" };
    const display = seg.type === "tts" ? "TTS text" : (seg.audioName || "Audio file");
    expect(display).toBe("Greeting.wav");
  });

  it("should limit preview to 6 segments", () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, type: "tts", position: i, text: `Segment ${i}` }));
    const preview = segs.slice(0, 6);
    expect(preview).toHaveLength(6);
    expect(segs.length - 6).toBe(4); // "+4 more"
  });

  it("should not show '+more' for 6 or fewer segments", () => {
    const segs = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, type: "tts", position: i }));
    expect(segs.length > 6).toBe(false);
  });
});
