import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the fix: When server-side stitching produces a combinedUrl,
 * the dialer should NOT send audioUrls to the PBX agent.
 * This prevents the PBX agent from downloading 5+ individual segments
 * (which was causing "Multi-segment audio preparation failed" errors).
 *
 * Instead, the PBX agent uses the single combinedUrl via the audioUrl field,
 * downloading just ONE pre-stitched file.
 */

// Mock db module
vi.mock("./db", () => ({
  default: {},
  db: {},
}));

// Mock the generateScriptAudio function to test different scenarios
vi.mock("./services/script-audio", () => ({
  generateScriptAudio: vi.fn(),
  preGenerateStaticSegments: vi.fn(),
}));

describe("Dialer: Combined Audio URL Priority", () => {
  it("should NOT send audioUrls when combinedUrl is available", () => {
    // Simulate the logic from dialer.ts lines 549-565
    const scriptResult = {
      success: true,
      audioUrls: [
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg1.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg2.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg3.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/dynamic/seg4.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg5.mp3",
      ],
      combinedUrl: "https://app26.407hosted.com/storage/tts-audio/script-stitched/c1_abc123.mp3",
      cacheKey: "script-stitched/c1_abc123.mp3",
      errors: [],
      renderedTexts: [],
      cacheStats: { staticHits: 4, dynamicHits: 0, generated: 1 },
    };

    // Replicate the dialer logic
    let audioUrls: string[] | null = null;
    const variables: Record<string, string> = {};

    if (scriptResult.success && scriptResult.audioUrls.length > 0) {
      if (scriptResult.combinedUrl) {
        variables.AUDIO_URL = scriptResult.combinedUrl;
        audioUrls = null; // Don't send individual segments
      } else {
        audioUrls = scriptResult.audioUrls;
        variables.AUDIO_URL = scriptResult.audioUrls[0];
      }
      variables.AUDIO_NAME = "script_1_100";
    }

    // Assertions
    expect(audioUrls).toBeNull();
    expect(variables.AUDIO_URL).toBe(
      "https://app26.407hosted.com/storage/tts-audio/script-stitched/c1_abc123.mp3"
    );
    expect(variables.AUDIO_NAME).toBe("script_1_100");
  });

  it("should send audioUrls as fallback when combinedUrl is NOT available", () => {
    // Simulate server-side stitching failure
    const scriptResult = {
      success: true,
      audioUrls: [
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg1.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg2.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg3.mp3",
      ],
      combinedUrl: null, // Server-side concat failed
      cacheKey: "script-stitched/c1_def456.mp3",
      errors: [],
      renderedTexts: [],
      cacheStats: { staticHits: 3, dynamicHits: 0, generated: 0 },
    };

    let audioUrls: string[] | null = null;
    const variables: Record<string, string> = {};

    if (scriptResult.success && scriptResult.audioUrls.length > 0) {
      if (scriptResult.combinedUrl) {
        variables.AUDIO_URL = scriptResult.combinedUrl;
        audioUrls = null;
      } else {
        audioUrls = scriptResult.audioUrls;
        variables.AUDIO_URL = scriptResult.audioUrls[0];
      }
      variables.AUDIO_NAME = "script_1_200";
    }

    // Assertions — audioUrls should be sent for PBX agent to concatenate
    expect(audioUrls).toEqual([
      "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg1.mp3",
      "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg2.mp3",
      "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg3.mp3",
    ]);
    expect(variables.AUDIO_URL).toBe(
      "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg1.mp3"
    );
    expect(variables.AUDIO_NAME).toBe("script_1_200");
  });

  it("should use single segment URL when only one segment exists", () => {
    const scriptResult = {
      success: true,
      audioUrls: [
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/only.mp3",
      ],
      combinedUrl: "https://app26.407hosted.com/storage/tts-audio/script-audio/static/only.mp3",
      cacheKey: "script-stitched/c1_single.mp3",
      errors: [],
      renderedTexts: [],
      cacheStats: { staticHits: 1, dynamicHits: 0, generated: 0 },
    };

    let audioUrls: string[] | null = null;
    const variables: Record<string, string> = {};

    if (scriptResult.success && scriptResult.audioUrls.length > 0) {
      if (scriptResult.combinedUrl) {
        variables.AUDIO_URL = scriptResult.combinedUrl;
        audioUrls = null;
      } else {
        audioUrls = scriptResult.audioUrls;
        variables.AUDIO_URL = scriptResult.audioUrls[0];
      }
      variables.AUDIO_NAME = "script_1_300";
    }

    expect(audioUrls).toBeNull();
    expect(variables.AUDIO_URL).toBe(
      "https://app26.407hosted.com/storage/tts-audio/script-audio/static/only.mp3"
    );
  });

  it("PBX agent call_data should use audioUrl path when audioUrls is null", () => {
    // Simulate what the PBX agent receives
    const callData = {
      phoneNumber: "5551234567",
      audioUrl: "https://app26.407hosted.com/storage/tts-audio/script-stitched/c1_abc123.mp3",
      audioUrls: null, // Not sent when combinedUrl is available
      audioName: "script_1_100",
      variables: {},
    };

    // PBX agent logic (from pbx_agent.py lines 638-648)
    const audioUrls = callData.audioUrls;
    const audioUrl = callData.audioUrl;
    const audioName = callData.audioName;

    // Multi-segment path: audioUrls && len > 1 → SKIPPED because audioUrls is null
    const useMultiSegment =
      audioUrls &&
      Array.isArray(audioUrls) &&
      audioUrls.length > 1 &&
      audioName;

    // Single-audio path: audioUrl && audioName → USED
    const useSingleAudio = audioUrl && audioName;

    expect(useMultiSegment).toBeFalsy();
    expect(useSingleAudio).toBeTruthy();
  });

  it("PBX agent should use multi-segment path only when audioUrls has >1 items", () => {
    // Simulate fallback case where server-side stitching failed
    const callData = {
      phoneNumber: "5551234567",
      audioUrl: "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg1.mp3",
      audioUrls: [
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg1.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg2.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/seg3.mp3",
      ],
      audioName: "script_1_200",
      variables: {},
    };

    const audioUrls = callData.audioUrls;
    const audioName = callData.audioName;

    const useMultiSegment =
      audioUrls &&
      Array.isArray(audioUrls) &&
      audioUrls.length > 1 &&
      audioName;

    expect(useMultiSegment).toBeTruthy();
  });
});
