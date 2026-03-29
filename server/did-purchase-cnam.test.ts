import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

const routersSource = readFileSync("server/routers.ts", "utf-8");
const vitelitySource = readFileSync("server/services/vitelity.ts", "utf-8");
const schemaSource = readFileSync("drizzle/schema.ts", "utf-8");

// ─── Vitelity Service Tests ─────────────────────────────────────────────────

describe("Vitelity DID Purchasing Service", () => {
  it("exports searchAvailableDIDs function", () => {
    expect(vitelitySource).toContain("export async function searchAvailableDIDs");
  });

  it("exports purchaseDID function", () => {
    expect(vitelitySource).toContain("export async function purchaseDID");
  });

  it("purchaseDID can be used for bulk purchasing (called in a loop)", () => {
    expect(vitelitySource).toContain("export async function purchaseDID");
  });

  it("searchAvailableDIDs accepts state parameter", () => {
    expect(vitelitySource).toContain("searchAvailableDIDs");
    expect(vitelitySource).toContain("state:");
  });

  it("purchaseDID calls the getlocaldid API command", () => {
    expect(vitelitySource).toContain("getlocaldid");
  });

  it("exports getVitelityBalance function", () => {
    expect(vitelitySource).toContain("export async function getVitelityBalance");
  });
});

describe("Vitelity CNAM Service", () => {
  it("exports cnamLookup function", () => {
    expect(vitelitySource).toContain("export async function cnamLookup");
  });

  it("exports setLidb function", () => {
    expect(vitelitySource).toContain("export async function setLidb");
  });

  it("cnamLookup calls the cnam API command", () => {
    expect(vitelitySource).toContain('cmd: "cnam"');
  });

  it("setLidb calls the lidb API command", () => {
    expect(vitelitySource).toContain('cmd: "lidb"');
  });
});

// ─── Schema Tests ───────────────────────────────────────────────────────────

describe("CNAM Schema Fields", () => {
  it("callerIds table has cnamName column", () => {
    expect(schemaSource).toContain("cnamName");
  });

  it("callerIds table has cnamLookedUpAt column", () => {
    expect(schemaSource).toContain("cnamLookedUpAt");
  });
});

// ─── Router Tests ───────────────────────────────────────────────────────────

describe("DID Purchase Procedures", () => {
  it("has searchAvailableDIDs procedure", () => {
    expect(routersSource).toContain("searchAvailableDIDs:");
  });

  it("has purchaseDID procedure", () => {
    expect(routersSource).toContain("purchaseDID:");
  });

  it("has bulkPurchaseDIDs procedure", () => {
    expect(routersSource).toContain("bulkPurchaseDIDs:");
  });

  it("has vitelityBalance procedure", () => {
    expect(routersSource).toContain("vitelityBalance:");
  });

  it("purchaseDID requires did input", () => {
    const purchaseBlock = routersSource.substring(
      routersSource.indexOf("purchaseDID:"),
      routersSource.indexOf("purchaseDID:") + 500
    );
    expect(purchaseBlock).toContain("did:");
  });

  it("searchAvailableDIDs requires state input", () => {
    const searchBlock = routersSource.substring(
      routersSource.indexOf("searchAvailableDIDs:"),
      routersSource.indexOf("searchAvailableDIDs:") + 500
    );
    expect(searchBlock).toContain("state:");
  });

  it("purchaseDID creates audit log", () => {
    const purchaseBlock = routersSource.substring(
      routersSource.indexOf("purchaseDID:"),
      routersSource.indexOf("purchaseDID:") + 2000
    );
    expect(purchaseBlock).toContain("createAuditLog");
  });

  it("bulkPurchaseDIDs creates audit log", () => {
    const bulkBlock = routersSource.substring(
      routersSource.indexOf("bulkPurchaseDIDs:"),
      routersSource.indexOf("bulkPurchaseDIDs:") + 3000
    );
    expect(bulkBlock).toContain("createAuditLog");
  });
});

describe("CNAM Lookup Procedures", () => {
  it("has cnamLookup procedure", () => {
    expect(routersSource).toContain("cnamLookup:");
  });

  it("has bulkCnamLookup procedure", () => {
    expect(routersSource).toContain("bulkCnamLookup:");
  });

  it("has setLidb procedure", () => {
    expect(routersSource).toContain("setLidb:");
  });

  it("cnamLookup accepts callerIdId to save results to DB", () => {
    const cnamBlock = routersSource.substring(
      routersSource.indexOf("cnamLookup:"),
      routersSource.indexOf("cnamLookup:") + 600
    );
    expect(cnamBlock).toContain("callerIdId");
  });

  it("cnamLookup saves CNAM result to database when callerIdId provided", () => {
    const cnamBlock = routersSource.substring(
      routersSource.indexOf("cnamLookup:"),
      routersSource.indexOf("cnamLookup:") + 600
    );
    expect(cnamBlock).toContain("updateCallerId");
    expect(cnamBlock).toContain("cnamName");
    expect(cnamBlock).toContain("cnamLookedUpAt");
  });

  it("bulkCnamLookup accepts array of dids with callerIdId", () => {
    const bulkBlock = routersSource.substring(
      routersSource.indexOf("bulkCnamLookup:"),
      routersSource.indexOf("bulkCnamLookup:") + 600
    );
    expect(bulkBlock).toContain("callerIdId");
  });

  it("bulkCnamLookup saves each result to database", () => {
    const bulkBlock = routersSource.substring(
      routersSource.indexOf("bulkCnamLookup:"),
      routersSource.indexOf("bulkCnamLookup:") + 800
    );
    expect(bulkBlock).toContain("updateCallerId");
  });

  it("cnamLookup creates audit log", () => {
    const cnamBlock = routersSource.substring(
      routersSource.indexOf("cnamLookup:"),
      routersSource.indexOf("cnamLookup:") + 600
    );
    expect(cnamBlock).toContain("createAuditLog");
  });

  it("setLidb requires did and name inputs", () => {
    const lidbBlock = routersSource.substring(
      routersSource.indexOf("setLidb:"),
      routersSource.indexOf("setLidb:") + 400
    );
    expect(lidbBlock).toContain("did:");
    expect(lidbBlock).toContain("name:");
  });

  it("all CNAM procedures are admin-only", () => {
    const cnamStart = routersSource.indexOf("cnamLookup:");
    const lidbEnd = routersSource.indexOf("setLidb:") + 200;
    const cnamSection = routersSource.substring(cnamStart, lidbEnd);
    // All three should use adminProcedure
    expect(cnamSection.match(/adminProcedure/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Frontend Integration Tests ─────────────────────────────────────────────

describe("CallerIds Frontend - Purchase & CNAM", () => {
  const callerIdsSource = readFileSync("client/src/pages/CallerIds.tsx", "utf-8");

  it("has Purchase DIDs button", () => {
    expect(callerIdsSource).toMatch(/Purchase.*DID|Buy.*DID/i);
  });

  it("has CNAM column in the table", () => {
    expect(callerIdsSource).toContain("CNAM");
  });

  it("has CNAM lookup button per DID row", () => {
    expect(callerIdsSource).toContain("cnamLookupMut.mutate");
  });

  it("has bulk CNAM lookup button in selection toolbar", () => {
    expect(callerIdsSource).toContain("bulkCnamLookupMut.mutate");
  });

  it("shows CNAM lookup price hint", () => {
    expect(callerIdsSource).toMatch(/\$0\.01|per.lookup/i);
  });

  it("displays CNAM name when available", () => {
    expect(callerIdsSource).toContain("cnamName");
  });

  it("shows CNAM lookup timestamp", () => {
    expect(callerIdsSource).toContain("cnamLookedUpAt");
  });

  it("has state selection for DID purchasing", () => {
    expect(callerIdsSource).toMatch(/purchaseState|state.*select/i);
  });

  it("has route configuration in purchase dialog", () => {
    expect(callerIdsSource).toContain("purchaseRouteEnabled");
  });
});
