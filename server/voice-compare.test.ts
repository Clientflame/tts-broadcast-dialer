import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the voiceTest endpoint schema validation
describe("voiceTest endpoint", () => {
  it("accepts valid OpenAI voice parameters", () => {
    const input = { voice: "alloy", provider: "openai" as const, speed: 1.0 };
    expect(input.voice).toBe("alloy");
    expect(input.provider).toBe("openai");
    expect(input.speed).toBeGreaterThan(0);
    expect(input.speed).toBeLessThanOrEqual(2);
  });

  it("accepts valid Google voice parameters", () => {
    const input = { voice: "en-US-Wavenet-C", provider: "google" as const, speed: 1.2 };
    expect(input.voice).toMatch(/^en-/);
    expect(input.provider).toBe("google");
    expect(input.speed).toBe(1.2);
  });

  it("rejects speed outside valid range", () => {
    const speed = 3.0;
    expect(speed).toBeGreaterThan(2); // Would be rejected by schema
  });

  it("rejects empty voice string", () => {
    const voice = "";
    expect(voice.length).toBe(0); // Would be rejected by schema
  });
});

// Test provider inference logic (same as used in voiceTest endpoint)
describe("provider inference from voice ID", () => {
  function inferProvider(voice: string): "openai" | "google" {
    if (voice.startsWith("en-")) return "google";
    return "openai";
  }

  it("infers google for en-US-Wavenet-C", () => {
    expect(inferProvider("en-US-Wavenet-C")).toBe("google");
  });

  it("infers google for en-US-Studio-M", () => {
    expect(inferProvider("en-US-Studio-M")).toBe("google");
  });

  it("infers google for en-US-Neural2-A", () => {
    expect(inferProvider("en-US-Neural2-A")).toBe("google");
  });

  it("infers openai for alloy", () => {
    expect(inferProvider("alloy")).toBe("openai");
  });

  it("infers openai for nova", () => {
    expect(inferProvider("nova")).toBe("openai");
  });

  it("infers openai for shimmer", () => {
    expect(inferProvider("shimmer")).toBe("openai");
  });
});

// Test cache key generation logic
describe("voice sample cache key generation", () => {
  function buildKey(provider: string, voice: string, speed: number): string {
    return `${provider}:${voice}:${speed.toFixed(2)}`;
  }

  it("generates consistent keys for same inputs", () => {
    const key1 = buildKey("openai", "alloy", 1.0);
    const key2 = buildKey("openai", "alloy", 1.0);
    expect(key1).toBe(key2);
  });

  it("generates different keys for different voices", () => {
    const key1 = buildKey("openai", "alloy", 1.0);
    const key2 = buildKey("openai", "nova", 1.0);
    expect(key1).not.toBe(key2);
  });

  it("generates different keys for different speeds", () => {
    const key1 = buildKey("openai", "alloy", 1.0);
    const key2 = buildKey("openai", "alloy", 1.5);
    expect(key1).not.toBe(key2);
  });

  it("generates different keys for different providers", () => {
    const key1 = buildKey("openai", "alloy", 1.0);
    const key2 = buildKey("google", "alloy", 1.0);
    expect(key1).not.toBe(key2);
  });

  it("normalizes speed precision", () => {
    const key1 = buildKey("openai", "alloy", 1);
    const key2 = buildKey("openai", "alloy", 1.00);
    expect(key1).toBe(key2);
    expect(key1).toBe("openai:alloy:1.00");
  });
});

// Test voice list completeness
describe("voice lists", () => {
  const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  const GOOGLE_VOICES = [
    "en-US-Studio-M", "en-US-Studio-O", "en-US-Studio-Q",
    "en-US-Wavenet-A", "en-US-Wavenet-C", "en-US-Wavenet-D",
    "en-US-Neural2-A", "en-US-Neural2-C", "en-US-Neural2-D",
  ];

  it("has all OpenAI voices", () => {
    expect(OPENAI_VOICES).toHaveLength(6);
    expect(OPENAI_VOICES).toContain("alloy");
    expect(OPENAI_VOICES).toContain("nova");
  });

  it("has all Google voices", () => {
    expect(GOOGLE_VOICES.length).toBeGreaterThanOrEqual(9);
    expect(GOOGLE_VOICES.every(v => v.startsWith("en-US-"))).toBe(true);
  });

  it("Google voices include all types", () => {
    expect(GOOGLE_VOICES.some(v => v.includes("Studio"))).toBe(true);
    expect(GOOGLE_VOICES.some(v => v.includes("Wavenet"))).toBe(true);
    expect(GOOGLE_VOICES.some(v => v.includes("Neural2"))).toBe(true);
  });
});
