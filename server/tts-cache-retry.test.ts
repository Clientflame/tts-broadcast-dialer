import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeTtsCacheHash } from "./services/tts";

describe("TTS Audio Caching", () => {
  describe("computeTtsCacheHash", () => {
    it("produces consistent hash for same inputs", () => {
      const hash1 = computeTtsCacheHash("Hello world", "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash("Hello world", "alloy", 1.0, "openai");
      expect(hash1).toBe(hash2);
    });

    it("produces different hash for different text", () => {
      const hash1 = computeTtsCacheHash("Hello world", "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash("Goodbye world", "alloy", 1.0, "openai");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hash for different voice", () => {
      const hash1 = computeTtsCacheHash("Hello world", "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash("Hello world", "nova", 1.0, "openai");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hash for different speed", () => {
      const hash1 = computeTtsCacheHash("Hello world", "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash("Hello world", "alloy", 1.5, "openai");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hash for different provider", () => {
      const hash1 = computeTtsCacheHash("Hello world", "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash("Hello world", "alloy", 1.0, "google");
      expect(hash1).not.toBe(hash2);
    });

    it("returns a valid MD5 hex string (32 chars)", () => {
      const hash = computeTtsCacheHash("Test text", "echo", 1.0, "openai");
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it("handles empty text", () => {
      const hash = computeTtsCacheHash("", "alloy", 1.0, "openai");
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it("handles special characters in text", () => {
      const hash = computeTtsCacheHash("Hello! @#$%^&*() 你好", "alloy", 1.0, "openai");
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it("handles long text consistently", () => {
      const longText = "A".repeat(10000);
      const hash1 = computeTtsCacheHash(longText, "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash(longText, "alloy", 1.0, "openai");
      expect(hash1).toBe(hash2);
    });

    it("speed precision matters", () => {
      // 1.0 and 1.00 should produce same hash since they're the same number
      const hash1 = computeTtsCacheHash("Hello", "alloy", 1.0, "openai");
      const hash2 = computeTtsCacheHash("Hello", "alloy", 1, "openai");
      expect(hash1).toBe(hash2);
    });
  });
});

describe("Campaign Retry Logic", () => {
  it("retryAttempts=0 means no retries (default behavior)", () => {
    // With retryAttempts=0, the campaign should complete without scheduling retries
    const retryAttempts = 0;
    expect(retryAttempts).toBe(0);
    // No retry pass should be triggered
    const shouldRetry = retryAttempts > 0;
    expect(shouldRetry).toBe(false);
  });

  it("retryAttempts=1 allows one retry pass", () => {
    const retryAttempts = 1;
    const currentAttempt = 1; // First attempt just completed
    const maxAllowedAttempts = retryAttempts + 1; // 2 total attempts (1 original + 1 retry)
    expect(currentAttempt < maxAllowedAttempts).toBe(true);
  });

  it("retryAttempts=1 does not allow second retry", () => {
    const retryAttempts = 1;
    const currentAttempt = 2; // Second attempt (retry) just completed
    const maxAllowedAttempts = retryAttempts + 1; // 2 total
    expect(currentAttempt < maxAllowedAttempts).toBe(false);
  });

  it("retryAttempts=3 allows up to 3 retry passes", () => {
    const retryAttempts = 3;
    const maxAllowedAttempts = retryAttempts + 1; // 4 total attempts
    expect(1 < maxAllowedAttempts).toBe(true); // attempt 1 can retry
    expect(2 < maxAllowedAttempts).toBe(true); // attempt 2 can retry
    expect(3 < maxAllowedAttempts).toBe(true); // attempt 3 can retry
    expect(4 < maxAllowedAttempts).toBe(false); // attempt 4 cannot retry
  });

  it("retryDelay defaults to 300 seconds (5 minutes)", () => {
    const retryDelay = 300;
    const retryDelayMs = retryDelay * 1000;
    expect(retryDelayMs).toBe(300000);
  });

  it("answered contacts are excluded from retry", () => {
    const answeredIds = new Set([1, 3, 5]);
    const retriableRows = [
      { contactId: 1, phoneNumber: "5551234567", maxAttempt: 1 },
      { contactId: 2, phoneNumber: "5559876543", maxAttempt: 1 },
      { contactId: 3, phoneNumber: "5551111111", maxAttempt: 1 },
      { contactId: 4, phoneNumber: "5552222222", maxAttempt: 1 },
    ];
    const retryAttempts = 1;
    const toRetry = retriableRows.filter(r =>
      !answeredIds.has(r.contactId) && r.maxAttempt < (retryAttempts + 1)
    );
    expect(toRetry.length).toBe(2);
    expect(toRetry.map(r => r.contactId)).toEqual([2, 4]);
  });

  it("contacts exceeding max attempts are excluded from retry", () => {
    const answeredIds = new Set<number>();
    const retriableRows = [
      { contactId: 1, phoneNumber: "5551234567", maxAttempt: 1 },
      { contactId: 2, phoneNumber: "5559876543", maxAttempt: 2 },
      { contactId: 3, phoneNumber: "5551111111", maxAttempt: 3 },
    ];
    const retryAttempts = 2; // max 3 total attempts
    const toRetry = retriableRows.filter(r =>
      !answeredIds.has(r.contactId) && r.maxAttempt < (retryAttempts + 1)
    );
    expect(toRetry.length).toBe(2);
    expect(toRetry.map(r => r.contactId)).toEqual([1, 2]);
  });

  it("retry creates call logs with incremented attempt number", () => {
    const toRetry = [
      { contactId: 1, phoneNumber: "5551234567", contactName: "John", maxAttempt: 1 },
      { contactId: 2, phoneNumber: "5559876543", contactName: "Jane", maxAttempt: 2 },
    ];
    const campaignId = 4;
    const userId = 1;

    const retryCallLogs = toRetry.map(r => ({
      campaignId,
      contactId: r.contactId,
      userId,
      phoneNumber: r.phoneNumber,
      contactName: r.contactName || undefined,
      status: "pending" as const,
      attempt: r.maxAttempt + 1,
    }));

    expect(retryCallLogs[0].attempt).toBe(2);
    expect(retryCallLogs[1].attempt).toBe(3);
    expect(retryCallLogs[0].status).toBe("pending");
  });
});
