import { describe, expect, it } from "vitest";

/**
 * Tests for the update button fix:
 * 1. /api/version endpoint returns startupId and commitSha
 * 2. startupId changes on each server restart (simulated by checking it's non-empty and unique-looking)
 */

describe("Update button: /api/version endpoint", () => {
  it("version endpoint returns startupId and commitSha fields", async () => {
    // Import the server module to check the endpoint exists
    // We can't easily test the Express route directly, but we can verify
    // the endpoint contract by checking the response shape
    const response = await fetch("http://localhost:3000/api/version", {
      signal: AbortSignal.timeout(5000),
    });
    expect(response.ok).toBe(true);

    const data = await response.json();

    // Must have startupId (unique per process start)
    expect(data).toHaveProperty("startupId");
    expect(typeof data.startupId).toBe("string");
    expect(data.startupId.length).toBeGreaterThan(5);

    // Must have commitSha
    expect(data).toHaveProperty("commitSha");
    expect(typeof data.commitSha).toBe("string");

    // Must have version
    expect(data).toHaveProperty("version");
    expect(typeof data.version).toBe("string");

    // Must have uptime (proves it's a running server, not cached)
    expect(data).toHaveProperty("uptime");
    expect(typeof data.uptime).toBe("number");
    expect(data.uptime).toBeGreaterThan(0);
  });

  it("startupId remains consistent across multiple calls to the same process", async () => {
    const res1 = await fetch("http://localhost:3000/api/version", {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const data1 = await res1.json();

    const res2 = await fetch("http://localhost:3000/api/version", {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const data2 = await res2.json();

    // Same process → same startupId
    expect(data1.startupId).toBe(data2.startupId);
  });

  it("startupId has timestamp-random format for uniqueness", async () => {
    const res = await fetch("http://localhost:3000/api/version", {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();

    // Format: "{timestamp}-{random6chars}"
    expect(data.startupId).toMatch(/^\d+-[a-z0-9]+$/);
  });
});
