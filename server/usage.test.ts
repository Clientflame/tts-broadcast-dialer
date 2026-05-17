import { describe, it, expect, vi } from "vitest";

// Test the storage stats function
describe("Usage & Storage Analytics", () => {
  it("getStorageStats returns correct structure", async () => {
    const { getStorageStats } = await import("./storage");
    const stats = await getStorageStats();
    
    expect(stats).toHaveProperty("mode");
    expect(stats).toHaveProperty("totalFiles");
    expect(stats).toHaveProperty("totalSizeBytes");
    expect(stats).toHaveProperty("breakdown");
    expect(typeof stats.totalFiles).toBe("number");
    expect(typeof stats.totalSizeBytes).toBe("number");
    expect(Array.isArray(stats.breakdown)).toBe(true);
    expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    expect(stats.totalSizeBytes).toBeGreaterThanOrEqual(0);
  });

  it("getActiveStorageMode returns valid mode", async () => {
    const { getActiveStorageMode } = await import("./storage");
    const mode = getActiveStorageMode();
    expect(["forge", "s3", "local"]).toContain(mode);
  });

  it("storageListObjects returns array", async () => {
    const { storageListObjects } = await import("./storage");
    const objects = await storageListObjects("test-prefix/");
    expect(Array.isArray(objects)).toBe(true);
  });

  it("getAllPrefetchStats returns object", async () => {
    const { getAllPrefetchStats } = await import("./services/audio-prefetch");
    const stats = getAllPrefetchStats();
    expect(typeof stats).toBe("object");
  });
});
