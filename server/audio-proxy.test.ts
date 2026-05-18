import { describe, it, expect } from "vitest";
import { toBrowserAudioUrls, toProxyUrl } from "./services/audio-proxy";

describe("audio-proxy", () => {
  describe("toProxyUrl", () => {
    it("returns local storage URLs as-is", () => {
      const url = "/api/storage/script-audio/static/abc123.mp3";
      expect(toProxyUrl(url, "script-audio/static/abc123.mp3")).toBe(url);
    });

    it("converts absolute URLs to proxy URLs using the storage key", () => {
      const url = "https://app26.407hosted.com/storage/tts-audio/script-audio/static/abc123.mp3";
      const key = "script-audio/static/abc123.mp3";
      expect(toProxyUrl(url, key)).toBe("/api/audio-proxy/script-audio/static/abc123.mp3");
    });

    it("handles forge URLs", () => {
      const url = "https://forge-storage.example.com/v1/download?path=script-audio/dynamic/xyz.mp3";
      const key = "script-audio/dynamic/xyz.mp3";
      expect(toProxyUrl(url, key)).toBe("/api/audio-proxy/script-audio/dynamic/xyz.mp3");
    });
  });

  describe("toBrowserAudioUrls", () => {
    it("returns local storage URLs unchanged", () => {
      const urls = [
        "/api/storage/script-audio/static/abc.mp3",
        "/api/storage/script-audio/dynamic/def.mp3",
      ];
      expect(toBrowserAudioUrls(urls)).toEqual(urls);
    });

    it("returns already-proxied URLs unchanged", () => {
      const urls = ["/api/audio-proxy/script-audio/static/abc.mp3"];
      expect(toBrowserAudioUrls(urls)).toEqual(urls);
    });

    it("converts S3/MinIO URLs with known prefixes to proxy URLs", () => {
      const urls = [
        "https://app26.407hosted.com/storage/tts-audio/script-audio/static/abc123.mp3",
        "https://minio:9000/tts-audio/script-audio/dynamic/def456.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-audio/static/abc123.mp3");
      expect(result[1]).toBe("/api/audio-proxy/script-audio/dynamic/def456.mp3");
    });

    it("converts forge download URLs with path query param", () => {
      const urls = [
        "https://api.manus.im/v1/storage/downloadUrl?path=script-audio/static/hash1.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-audio/static/hash1.mp3");
    });

    it("converts S3 URLs with bucket prefix", () => {
      const urls = [
        "https://s3.us-east-1.amazonaws.com/my-bucket/script-audio/static/hash2.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-audio/static/hash2.mp3");
    });

    it("handles mixed URL types", () => {
      const urls = [
        "/api/storage/script-audio/static/local.mp3",
        "https://app26.407hosted.com/storage/tts-audio/script-audio/dynamic/remote.mp3",
        "/api/audio-proxy/script-audio/static/already-proxied.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/storage/script-audio/static/local.mp3");
      expect(result[1]).toBe("/api/audio-proxy/script-audio/dynamic/remote.mp3");
      expect(result[2]).toBe("/api/audio-proxy/script-audio/static/already-proxied.mp3");
    });

    it("strips query strings from extracted keys (presigned URLs)", () => {
      const urls = [
        "https://minio.internal:9000/tts-audio/script-audio/static/hash3.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-audio/static/hash3.mp3");
    });

    it("handles campaign-audio prefix", () => {
      const urls = [
        "https://cdn.example.com/bucket/campaign-audio/campaign_42_hash.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/campaign-audio/campaign_42_hash.mp3");
    });

    it("handles script-stitched prefix", () => {
      const urls = [
        "https://storage.example.com/bucket/script-stitched/c0_abcdef123456.mp3",
      ];
      const result = toBrowserAudioUrls(urls);
      expect(result[0]).toBe("/api/audio-proxy/script-stitched/c0_abcdef123456.mp3");
    });

    it("returns empty array for empty input", () => {
      expect(toBrowserAudioUrls([])).toEqual([]);
    });
  });
});
