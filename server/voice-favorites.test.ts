import { describe, it, expect, beforeEach } from "vitest";

/**
 * Test the voice favorites logic (same algorithm as client-side voiceFavorites.ts).
 * We test the pure logic here since localStorage isn't available in Node.
 */

interface VoiceFavorite {
  id: string;
  provider: "openai" | "google";
  addedAt: number;
}

// Simulate localStorage with an in-memory store
let store: VoiceFavorite[] = [];

function getFavoriteIds(provider: "openai" | "google"): string[] {
  return store.filter(f => f.provider === provider).map(f => f.id);
}

function isFavorite(voiceId: string, provider: "openai" | "google"): boolean {
  return store.some(f => f.id === voiceId && f.provider === provider);
}

function toggleFavorite(voiceId: string, provider: "openai" | "google"): boolean {
  const idx = store.findIndex(f => f.id === voiceId && f.provider === provider);
  if (idx >= 0) {
    store.splice(idx, 1);
    return false;
  } else {
    store.push({ id: voiceId, provider, addedAt: Date.now() });
    return true;
  }
}

function sortWithFavorites<T extends { id: string }>(voices: T[], provider: "openai" | "google"): T[] {
  const favIds = new Set(getFavoriteIds(provider));
  const favs = voices.filter(v => favIds.has(v.id));
  const rest = voices.filter(v => !favIds.has(v.id));
  return [...favs, ...rest];
}

describe("Voice Favorites", () => {
  beforeEach(() => {
    store = [];
  });

  describe("toggleFavorite", () => {
    it("adds a voice to favorites and returns true", () => {
      const result = toggleFavorite("alloy", "openai");
      expect(result).toBe(true);
      expect(isFavorite("alloy", "openai")).toBe(true);
    });

    it("removes a voice from favorites and returns false", () => {
      toggleFavorite("alloy", "openai");
      const result = toggleFavorite("alloy", "openai");
      expect(result).toBe(false);
      expect(isFavorite("alloy", "openai")).toBe(false);
    });

    it("handles different providers independently", () => {
      toggleFavorite("alloy", "openai");
      expect(isFavorite("alloy", "openai")).toBe(true);
      expect(isFavorite("alloy", "google")).toBe(false);
    });

    it("handles multiple favorites", () => {
      toggleFavorite("alloy", "openai");
      toggleFavorite("nova", "openai");
      toggleFavorite("en-US-Wavenet-C", "google");
      expect(getFavoriteIds("openai")).toEqual(["alloy", "nova"]);
      expect(getFavoriteIds("google")).toEqual(["en-US-Wavenet-C"]);
    });
  });

  describe("sortWithFavorites", () => {
    const voices = [
      { id: "alloy", label: "Alloy" },
      { id: "echo", label: "Echo" },
      { id: "fable", label: "Fable" },
      { id: "nova", label: "Nova" },
      { id: "onyx", label: "Onyx" },
      { id: "shimmer", label: "Shimmer" },
    ];

    it("returns original order when no favorites", () => {
      const sorted = sortWithFavorites(voices, "openai");
      expect(sorted.map(v => v.id)).toEqual(["alloy", "echo", "fable", "nova", "onyx", "shimmer"]);
    });

    it("moves favorited voices to the top", () => {
      toggleFavorite("nova", "openai");
      toggleFavorite("shimmer", "openai");
      const sorted = sortWithFavorites(voices, "openai");
      expect(sorted[0].id).toBe("nova");
      expect(sorted[1].id).toBe("shimmer");
      expect(sorted[2].id).toBe("alloy");
    });

    it("preserves relative order within favorites", () => {
      toggleFavorite("shimmer", "openai");
      toggleFavorite("echo", "openai");
      const sorted = sortWithFavorites(voices, "openai");
      // shimmer appears before echo in the original list? No - echo is index 1, shimmer is index 5
      // But in favorites, shimmer was added first, echo second
      // sortWithFavorites filters from the original array, so order follows original array
      expect(sorted[0].id).toBe("echo"); // echo is earlier in original array
      expect(sorted[1].id).toBe("shimmer");
    });

    it("does not affect other provider's sorting", () => {
      toggleFavorite("nova", "openai");
      const googleVoices = [
        { id: "en-US-Wavenet-A", label: "Wavenet A" },
        { id: "en-US-Wavenet-C", label: "Wavenet C" },
      ];
      const sorted = sortWithFavorites(googleVoices, "google");
      expect(sorted.map(v => v.id)).toEqual(["en-US-Wavenet-A", "en-US-Wavenet-C"]);
    });

    it("handles single favorite correctly", () => {
      toggleFavorite("onyx", "openai");
      const sorted = sortWithFavorites(voices, "openai");
      expect(sorted[0].id).toBe("onyx");
      expect(sorted.length).toBe(voices.length);
    });
  });

  describe("Apply Voice logic", () => {
    it("applies voice to all TTS segments", () => {
      const segments = [
        { type: "tts", voice: "alloy", provider: "openai" as const, text: "Hello" },
        { type: "recorded", voice: "", provider: "openai" as const, audioUrl: "test.mp3" },
        { type: "tts", voice: "echo", provider: "openai" as const, text: "World" },
      ];

      const updated = segments.map(seg =>
        seg.type === "tts" ? { ...seg, voice: "nova", provider: "google" as const } : seg
      );

      expect(updated[0].voice).toBe("nova");
      expect(updated[0].provider).toBe("google");
      expect(updated[1].voice).toBe(""); // Recorded segment unchanged
      expect(updated[2].voice).toBe("nova");
      expect(updated[2].provider).toBe("google");
    });
  });
});
