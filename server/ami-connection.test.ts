import { describe, expect, it } from "vitest";

describe("FreePBX AMI Configuration", () => {
  it("should have AMI credentials configured", () => {
    expect(process.env.FREEPBX_HOST).toBeTruthy();
    expect(process.env.FREEPBX_AMI_USER).toBeTruthy();
    expect(process.env.FREEPBX_AMI_PASSWORD).toBeTruthy();
    expect(process.env.FREEPBX_AMI_PORT).toBeTruthy();
  });

  it("should have OpenAI API key configured", () => {
    expect(process.env.OPENAI_API_KEY).toBeTruthy();
  });

  it("should have valid AMI port number", () => {
    const port = parseInt(process.env.FREEPBX_AMI_PORT || "0");
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it("should have valid host format", () => {
    const host = process.env.FREEPBX_HOST!;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const hostnameRegex = /^[a-zA-Z0-9.-]+$/;
    expect(ipRegex.test(host) || hostnameRegex.test(host)).toBe(true);
  });
});
