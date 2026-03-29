import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import type { Request } from "express";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    protocol: "http",
    headers: {},
    hostname: "localhost",
    ...overrides,
  } as unknown as Request;
}

describe("getSessionCookieOptions", () => {
  it("returns sameSite lax + secure false for plain HTTP requests", () => {
    const opts = getSessionCookieOptions(mockReq({ protocol: "http" }));
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
  });

  it("returns sameSite none + secure true for HTTPS requests", () => {
    const opts = getSessionCookieOptions(mockReq({ protocol: "https" }));
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
  });

  it("detects HTTPS from X-Forwarded-Proto header (reverse proxy)", () => {
    const opts = getSessionCookieOptions(
      mockReq({
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
      })
    );
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
  });

  it("handles comma-separated X-Forwarded-Proto (multiple proxies)", () => {
    const opts = getSessionCookieOptions(
      mockReq({
        protocol: "http",
        headers: { "x-forwarded-proto": "https, http" },
      })
    );
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
  });

  it("returns lax for HTTP with X-Forwarded-Proto http", () => {
    const opts = getSessionCookieOptions(
      mockReq({
        protocol: "http",
        headers: { "x-forwarded-proto": "http" },
      })
    );
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(false);
  });

  it("returns lax for IP-based HTTP access (self-hosted without SSL)", () => {
    const opts = getSessionCookieOptions(
      mockReq({
        protocol: "http",
        hostname: "187.124.94.97",
      })
    );
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(false);
  });

  it("returns none+secure for Caddy reverse proxy with SSL", () => {
    const opts = getSessionCookieOptions(
      mockReq({
        protocol: "http",
        hostname: "app.407hosted.com",
        headers: { "x-forwarded-proto": "https" },
      })
    );
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
  });
});
