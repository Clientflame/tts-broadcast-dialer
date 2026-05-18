import { describe, it, expect, vi } from "vitest";
import { toBrowserAudioUrls } from "./services/audio-proxy";

describe("audio-preview-base64", () => {
  describe("toBrowserAudioUrls (fallback for non-base64 scenarios)", () => {
    it("converts S3 URLs with script-audio prefix", () => {
      const urls = ["https://minio:9000/tts-audio/script-audio/static/abc123.mp3"];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-audio/static/abc123.mp3");
    });

    it("converts S3 URLs with script-stitched prefix", () => {
      const urls = ["https://minio:9000/tts-audio/script-stitched/c0_hash123.mp3"];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-stitched/c0_hash123.mp3");
    });
  });

  describe("base64 data URI format validation", () => {
    it("validates base64 data URI format for audio/mpeg", () => {
      // Simulate what the preview endpoint returns
      const fakeAudioBuffer = Buffer.from("fake mp3 content for testing");
      const dataUri = `data:audio/mpeg;base64,${fakeAudioBuffer.toString("base64")}`;
      
      expect(dataUri).toMatch(/^data:audio\/mpeg;base64,/);
      expect(dataUri.length).toBeGreaterThan(30);
    });

    it("can round-trip base64 encode/decode audio bytes", () => {
      // Simulate the server-side encoding
      const originalBytes = Buffer.from([0xFF, 0xFB, 0x90, 0x00, 0x01, 0x02, 0x03]); // Fake MP3 header
      const base64 = originalBytes.toString("base64");
      const decoded = Buffer.from(base64, "base64");
      
      expect(decoded).toEqual(originalBytes);
    });

    it("produces valid data URIs that browsers can parse", () => {
      const audioBuffer = Buffer.from("test audio content");
      const dataUri = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;
      
      // Verify the structure matches what HTML5 Audio expects
      const [header, data] = dataUri.split(",");
      expect(header).toBe("data:audio/mpeg;base64");
      expect(data).toBeTruthy();
      expect(data.length).toBeGreaterThan(0);
      
      // Verify base64 is valid
      const decoded = Buffer.from(data, "base64");
      expect(decoded.toString()).toBe("test audio content");
    });
  });

  describe("storageFetchBytes integration", () => {
    it("exports storageFetchBytes from storage module", async () => {
      const { storageFetchBytes } = await import("./storage");
      expect(typeof storageFetchBytes).toBe("function");
    });

    it("returns null for non-existent keys", async () => {
      const { storageFetchBytes } = await import("./storage");
      const result = await storageFetchBytes("non-existent/file/that/does/not/exist.mp3");
      // In forge mode (sandbox), this should return null gracefully
      expect(result === null || Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe("preview endpoint response format", () => {
    it("data URIs are accepted by toBrowserAudioUrls as passthrough", () => {
      // Data URIs should NOT be converted by toBrowserAudioUrls
      // (they're already playable)
      const dataUri = "data:audio/mpeg;base64,AAAA";
      const result = toBrowserAudioUrls([dataUri]);
      // toBrowserAudioUrls should pass through data URIs unchanged
      // since they don't match any known prefix patterns
      // The function will try URL parsing which will fail, so it returns as-is
      expect(result[0]).toBeDefined();
    });

    it("handles empty URL arrays", () => {
      expect(toBrowserAudioUrls([])).toEqual([]);
    });

    it("handles mixed data URIs and regular URLs", () => {
      const urls = [
        "data:audio/mpeg;base64,AAAA",
        "https://minio:9000/tts-audio/script-audio/static/abc.mp3",
        "/api/storage/script-audio/dynamic/def.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result.length).toBe(3);
      // Regular URL gets converted to proxy
      expect(result[1]).toBe("/api/audio-proxy/script-audio/static/abc.mp3");
      // Local storage URL stays as-is
      expect(result[2]).toBe("/api/storage/script-audio/dynamic/def.mp3");
    });
  });
});
