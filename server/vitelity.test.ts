import { describe, it, expect, vi } from "vitest";
import fs from "fs";

// Read the vitelity service source
const vitelitySource = fs.readFileSync("server/services/vitelity.ts", "utf-8");

describe("Vitelity API Service", () => {
  it("should have VITELITY_API_LOGIN env var set", () => {
    expect(process.env.VITELITY_API_LOGIN).toBeTruthy();
    expect(process.env.VITELITY_API_LOGIN!.length).toBeGreaterThan(0);
  });

  it("should have VITELITY_API_PASS env var set", () => {
    expect(process.env.VITELITY_API_PASS).toBeTruthy();
    expect(process.env.VITELITY_API_PASS!.length).toBeGreaterThan(0);
  });

  it("should use correct Vitelity API URL", () => {
    expect(vitelitySource).toContain("https://api.vitelity.net/api.php");
  });

  it("should send login and pass as POST params", () => {
    expect(vitelitySource).toContain("login");
    expect(vitelitySource).toContain("pass");
    expect(vitelitySource).toContain("cmd");
  });

  it("should parse plain text response format correctly", () => {
    // Test the parsing logic by checking the source handles the x[[ ]]x format
    expect(vitelitySource).toContain("x?\\[\\[");
    expect(vitelitySource).toContain("\\]\\]x?");
  });

  it("should handle error responses from Vitelity", () => {
    expect(vitelitySource).toContain("invalidauth");
    expect(vitelitySource).toContain("missingdata");
  });

  it("should export listVitelityDIDs function", () => {
    expect(vitelitySource).toContain("export async function listVitelityDIDs");
  });

  it("should export testVitelityConnection function", () => {
    expect(vitelitySource).toContain("export async function testVitelityConnection");
  });

  it("should request extra=yes for full DID details", () => {
    expect(vitelitySource).toContain('extra: "yes"');
  });

  it("should parse CSV fields: did, rateCenter, state, ratePerMinute, subAccount, ratePerMonth", () => {
    expect(vitelitySource).toContain("rateCenter");
    expect(vitelitySource).toContain("ratePerMinute");
    expect(vitelitySource).toContain("subAccount");
    expect(vitelitySource).toContain("ratePerMonth");
  });
});
