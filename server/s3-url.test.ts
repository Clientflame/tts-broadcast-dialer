import { describe, it, expect } from "vitest";

describe("S3 Public URL Construction", () => {
  it("storagePut returns a URL without double bucket name", async () => {
    const { storagePut } = await import("./storage");
    
    // Upload a tiny test file with a key that starts with tts-audio/
    const testKey = `tts-audio/test-url-check-${Date.now()}.txt`;
    const { url } = await storagePut(testKey, "test", "text/plain");
    
    // The URL should NOT contain "tts-audio/tts-audio" (double bucket path)
    expect(url).not.toContain("tts-audio/tts-audio");
    
    // URL should be a valid HTTP URL
    expect(url).toMatch(/^https?:\/\//);
    
    // URL should contain the key path
    expect(url).toContain("tts-audio/test-url-check-");
  });

  it("storagePut URL is publicly accessible", async () => {
    const { storagePut } = await import("./storage");
    
    const testKey = `tts-audio/test-access-${Date.now()}.txt`;
    const { url } = await storagePut(testKey, "hello-audio-test", "text/plain");
    
    // Verify the URL is accessible (for forge/R2 mode in sandbox)
    const response = await fetch(url);
    expect(response.ok).toBe(true);
  });
});
