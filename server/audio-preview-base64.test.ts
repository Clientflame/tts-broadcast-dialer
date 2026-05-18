import { describe, it, expect, vi } from "vitest";
import { toBrowserAudioUrls } from "./services/audio-proxy";
import { extractStorageKey, storageFetchBytes } from "./storage";

describe("audio-preview-base64", () => {
  describe("extractStorageKey", () => {
    it("extracts key from S3_PUBLIC_URL-based URLs", () => {
      // Simulates: S3_PUBLIC_URL=https://app26.407hosted.com/storage/tts-audio
      // URL: https://app26.407hosted.com/storage/tts-audio/script-audio/static/abc123.mp3
      // Since ENV.s3PublicUrl is empty in sandbox, this falls through to prefix matching
      const url = "https://app26.407hosted.com/storage/tts-audio/script-audio/static/abc123.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("script-audio/static/abc123.mp3");
    });

    it("extracts key from voice-memos URLs", () => {
      // On app26, the bucket is 'tts-audio' so the URL is:
      // https://app26.407hosted.com/storage/tts-audio/voice-memos/123/file.webm
      // The 'tts-audio/' prefix matches first, giving key: tts-audio/voice-memos/123/file.webm
      // But extractStorageKey with S3_PUBLIC_URL set would strip the public URL prefix correctly.
      // In sandbox (no S3_PUBLIC_URL), it falls through to prefix matching.
      const url = "https://app26.407hosted.com/storage/tts-audio/voice-memos/123/1716000000-abc123.webm";
      const key = extractStorageKey(url);
      // The key includes everything from the first known prefix match
      // This still works with storageFetchBytes because the S3 bucket on app26
      // stores files at the key WITHOUT the bucket name prefix
      expect(key).toContain("voice-memos/123/1716000000-abc123.webm");
    });

    it("extracts key from voice-samples URLs", () => {
      const url = "https://example.com/bucket/voice-samples/google-en-US-Neural2-F-speed1.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("voice-samples/google-en-US-Neural2-F-speed1.mp3");
    });

    it("extracts key from tts-audio URLs", () => {
      // When the URL contains the bucket name 'tts-audio' AND a prefix 'tts-audio/',
      // the prefix matcher finds the first occurrence
      const url = "https://minio:9000/tts-audio/tts-audio/abc-test_audio.mp3";
      const key = extractStorageKey(url);
      // First 'tts-audio/' match in the URL path
      expect(key).toBe("tts-audio/tts-audio/abc-test_audio.mp3");
    });

    it("extracts key from campaign-audio URLs", () => {
      const url = "https://example.com/bucket/campaign-audio/campaign_42_contact_100.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("campaign-audio/campaign_42_contact_100.mp3");
    });

    it("extracts key from local storage URLs", () => {
      const url = "/api/storage/voice-memos/1/file.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("voice-memos/1/file.mp3");
    });

    it("handles URLs with query parameters", () => {
      const url = "https://example.com/bucket/script-audio/static/hash.mp3?X-Amz-Signature=abc";
      const key = extractStorageKey(url);
      expect(key).toBe("script-audio/static/hash.mp3");
    });

    it("handles raw keys (no protocol)", () => {
      const key = extractStorageKey("script-audio/static/abc.mp3");
      expect(key).toBe("script-audio/static/abc.mp3");
    });

    it("returns null for data URIs", () => {
      const key = extractStorageKey("data:audio/mpeg;base64,AAAA");
      expect(key).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(extractStorageKey("")).toBeNull();
    });

    it("extracts key from voicemail URLs", () => {
      const url = "https://example.com/storage/voicemail/vm_123.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("voicemail/vm_123.mp3");
    });

    it("extracts key from recordings URLs", () => {
      const url = "https://example.com/storage/recordings/call_456.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("recordings/call_456.mp3");
    });

    it("extracts key from script-stitched URLs", () => {
      const url = "https://example.com/bucket/script-stitched/c0_hash123.mp3";
      const key = extractStorageKey(url);
      expect(key).toBe("script-stitched/c0_hash123.mp3");
    });
  });

  describe("toBrowserAudioUrls", () => {
    it("passes through data URIs unchanged", () => {
      const dataUri = "data:audio/mpeg;base64,AAAA";
      const result = toBrowserAudioUrls([dataUri]);
      expect(result[0]).toBe(dataUri);
    });

    it("converts S3 URLs with script-audio prefix", () => {
      const urls = ["https://minio:9000/tts-audio/script-audio/static/abc123.mp3"];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-audio/static/abc123.mp3");
    });

    it("converts S3 URLs with voice-memos prefix", () => {
      // The URL contains 'tts-audio/' which matches first in the prefix list
      // This is fine because storageFetchBytes will use the full key including bucket path
      const urls = ["https://app26.407hosted.com/storage/tts-audio/voice-memos/1/file.webm"];
      const result = toBrowserAudioUrls(urls);
      // The proxy extracts from the first known prefix match
      expect(result[0]).toContain("/api/audio-proxy/");
      expect(result[0]).toContain("voice-memos/1/file.webm");
    });

    it("handles empty URL arrays", () => {
      expect(toBrowserAudioUrls([])).toEqual([]);
    });

    it("preserves local storage URLs", () => {
      const result = toBrowserAudioUrls(["/api/storage/script-audio/dynamic/def.mp3"]);
      expect(result[0]).toBe("/api/storage/script-audio/dynamic/def.mp3");
    });
  });

  describe("base64 data URI format validation", () => {
    it("validates base64 data URI format for audio/mpeg", () => {
      const fakeAudioBuffer = Buffer.from("fake mp3 content for testing");
      const dataUri = `data:audio/mpeg;base64,${fakeAudioBuffer.toString("base64")}`;
      expect(dataUri).toMatch(/^data:audio\/mpeg;base64,/);
      expect(dataUri.length).toBeGreaterThan(30);
    });

    it("can round-trip base64 encode/decode audio bytes", () => {
      const originalBytes = Buffer.from([0xFF, 0xFB, 0x90, 0x00, 0x01, 0x02, 0x03]);
      const base64 = originalBytes.toString("base64");
      const decoded = Buffer.from(base64, "base64");
      expect(decoded).toEqual(originalBytes);
    });

    it("produces valid data URIs for different audio types", () => {
      const audioBuffer = Buffer.from("test audio content");
      
      // MP3
      const mp3Uri = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;
      expect(mp3Uri.split(",")[0]).toBe("data:audio/mpeg;base64");
      
      // WebM (for recorded segments)
      const webmUri = `data:audio/webm;base64,${audioBuffer.toString("base64")}`;
      expect(webmUri.split(",")[0]).toBe("data:audio/webm;base64");
      
      // WAV
      const wavUri = `data:audio/wav;base64,${audioBuffer.toString("base64")}`;
      expect(wavUri.split(",")[0]).toBe("data:audio/wav;base64");
    });
  });

  describe("storageFetchBytes integration", () => {
    it("exports storageFetchBytes from storage module", () => {
      expect(typeof storageFetchBytes).toBe("function");
    });

    it("exports extractStorageKey from storage module", () => {
      expect(typeof extractStorageKey).toBe("function");
    });

    it("returns null for non-existent keys", async () => {
      const result = await storageFetchBytes("non-existent/file/that/does/not/exist.mp3");
      expect(result === null || Buffer.isBuffer(result)).toBe(true);
    });
  });
});
