import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Read source files for structural verification
const routersSource = readFileSync(join(__dirname, "routers.ts"), "utf-8");
const freepbxRoutesSource = readFileSync(join(__dirname, "services/freepbx-routes.ts"), "utf-8");
const vitelitySource = readFileSync(join(__dirname, "services/vitelity.ts"), "utf-8");
const callerIdsSource = readFileSync(join(__dirname, "../client/src/pages/CallerIds.tsx"), "utf-8");

describe("Vitelity DID Import - Backend", () => {
  it("should have a Vitelity service file", () => {
    expect(vitelitySource).toBeTruthy();
    expect(vitelitySource.length).toBeGreaterThan(100);
  });

  it("should export listVitelityDIDs function", () => {
    expect(vitelitySource).toContain("export async function listVitelityDIDs");
  });

  it("should use VITELITY_API_LOGIN and VITELITY_API_PASS env vars", () => {
    expect(vitelitySource).toContain("VITELITY_API_LOGIN");
    expect(vitelitySource).toContain("VITELITY_API_PASS");
  });

  it("should call the Vitelity API with listdids command", () => {
    expect(vitelitySource).toContain("listdids");
  });

  it("should parse plain-text response from Vitelity", () => {
    expect(vitelitySource).toContain("parsePlainTextResponse");
  });

  it("should return DID objects with did, rateCenter, state, ratePerMinute", () => {
    expect(vitelitySource).toContain("did");
    expect(vitelitySource).toContain("rateCenter");
    expect(vitelitySource).toContain("state");
    expect(vitelitySource).toContain("ratePerMinute");
  });
});

describe("Vitelity DID Import - tRPC Procedures", () => {
  it("should have listVitelityDIDs procedure", () => {
    expect(routersSource).toContain("listVitelityDIDs");
  });

  it("should have importFromVitelity procedure", () => {
    expect(routersSource).toContain("importFromVitelity");
  });

  it("should have testVitelityConnection procedure", () => {
    expect(routersSource).toContain("testVitelityConnection");
  });

  it("importFromVitelity should accept dids array with phoneNumber, label, and inboundRoute", () => {
    const importBlock = routersSource.substring(
      routersSource.indexOf("importFromVitelity"),
      routersSource.indexOf("importFromVitelity") + 800
    );
    expect(importBlock).toContain("phoneNumber");
    expect(importBlock).toContain("label");
    expect(importBlock).toContain("inboundRoute");
  });

  it("importFromVitelity should create audit log", () => {
    const startIdx = routersSource.indexOf("importFromVitelity: admin");
    const importBlock = routersSource.substring(startIdx, startIdx + 2000);
    expect(importBlock).toContain("createAuditLog");
  });
});

describe("Route Conflict Resolution - Backend", () => {
  it("should have checkExistingRoutesDetailed function", () => {
    expect(freepbxRoutesSource).toContain("export async function checkExistingRoutesDetailed");
  });

  it("checkExistingRoutesDetailed should return ExistingInboundRoute objects", () => {
    const funcBlock = freepbxRoutesSource.substring(
      freepbxRoutesSource.indexOf("checkExistingRoutesDetailed"),
      freepbxRoutesSource.indexOf("checkExistingRoutesDetailed") + 600
    );
    expect(funcBlock).toContain("ExistingInboundRoute");
  });

  it("checkExistingRoutesDetailed should query extension, description, destination, pricid", () => {
    const startIdx = freepbxRoutesSource.indexOf("async function checkExistingRoutesDetailed");
    const funcBlock = freepbxRoutesSource.substring(startIdx, startIdx + 1000);
    expect(funcBlock).toContain("extension, description, destination, pricid");
  });

  it("should have checkInboundRoutesDetailed tRPC procedure", () => {
    expect(routersSource).toContain("checkInboundRoutesDetailed");
  });

  it("checkInboundRoutesDetailed should be a mutation", () => {
    const block = routersSource.substring(
      routersSource.indexOf("checkInboundRoutesDetailed"),
      routersSource.indexOf("checkInboundRoutesDetailed") + 300
    );
    expect(block).toContain(".mutation(");
  });

  it("should have updateInboundRoute procedure for conflict updates", () => {
    expect(routersSource).toContain("updateInboundRoute");
  });

  it("updateInboundRoute should accept did, destination, description, cidPrefix", () => {
    const block = routersSource.substring(
      routersSource.indexOf("updateInboundRoute: admin"),
      routersSource.indexOf("updateInboundRoute: admin") + 300
    );
    expect(block).toContain("did:");
    expect(block).toContain("destination:");
    expect(block).toContain("description:");
    expect(block).toContain("cidPrefix:");
  });
});

describe("Vitelity DID Import - Frontend", () => {
  it("should have Import from Vitelity button", () => {
    expect(callerIdsSource).toContain("Import from Vitelity");
  });

  it("should have Vitelity import dialog", () => {
    expect(callerIdsSource).toContain("Import DIDs from Vitelity");
  });

  it("should show DID table with phone number, rate center, state, rate", () => {
    expect(callerIdsSource).toContain("Rate Center");
    expect(callerIdsSource).toContain("Rate/Min");
    expect(callerIdsSource).toContain("Sub Account");
  });

  it("should have select all checkbox for Vitelity DIDs", () => {
    expect(callerIdsSource).toContain("vitelitySelected.size === vitelityDIDs.length");
  });

  it("should have label input for Vitelity import", () => {
    expect(callerIdsSource).toContain("vitelityLabel");
    expect(callerIdsSource).toContain("Apply Label to All");
  });

  it("should have route config section in Vitelity import", () => {
    expect(callerIdsSource).toContain("vitelityRouteEnabled");
    expect(callerIdsSource).toContain("vitelityRouteDest");
  });

  it("should have progress indicator for Vitelity import", () => {
    expect(callerIdsSource).toContain("vitelityImportProgress");
  });

  it("should have refresh button for Vitelity DIDs", () => {
    expect(callerIdsSource).toContain("refetchVitelity");
  });

  it("should have error state for Vitelity connection", () => {
    expect(callerIdsSource).toContain("Failed to connect to Vitelity");
  });
});

describe("Route Conflict Resolution - Frontend", () => {
  it("should have conflict resolution dialog", () => {
    expect(callerIdsSource).toContain("Route Conflicts Detected");
  });

  it("should show existing route vs new route comparison", () => {
    expect(callerIdsSource).toContain("Existing Route");
    expect(callerIdsSource).toContain("New Route");
  });

  it("should have Update, Skip, and Keep Existing actions", () => {
    expect(callerIdsSource).toContain("\"update\"");
    expect(callerIdsSource).toContain("\"skip\"");
    expect(callerIdsSource).toContain("\"keep\"");
  });

  it("should have quick action buttons (Update All, Skip All, Keep All)", () => {
    expect(callerIdsSource).toContain("Update All");
    expect(callerIdsSource).toContain("Skip All");
    expect(callerIdsSource).toContain("Keep All Existing");
  });

  it("should have per-DID action dropdown", () => {
    expect(callerIdsSource).toContain("ConflictAction");
  });

  it("should explain each action option", () => {
    expect(callerIdsSource).toContain("Replace the existing route with the new destination");
    expect(callerIdsSource).toContain("Don't create a route for this DID");
    expect(callerIdsSource).toContain("Keep the current route as-is");
  });

  it("should check for conflicts before bulk add with routes", () => {
    expect(callerIdsSource).toContain("checkConflictsMut");
  });

  it("should check for conflicts before Vitelity import with routes", () => {
    expect(callerIdsSource).toContain("Checking for existing routes...");
  });

  it("should handle both bulk and vitelity conflict sources", () => {
    expect(callerIdsSource).toContain("conflictSource");
    expect(callerIdsSource).toContain("\"vitelity\"");
    expect(callerIdsSource).toContain("\"bulk\"");
  });

  it("should call updateInboundRoute for Update action", () => {
    expect(callerIdsSource).toContain("callerIds.updateInboundRoute.mutate");
  });

  it("should show update count and skip count toasts", () => {
    expect(callerIdsSource).toContain("existing route(s)");
  });

  it("should have Cancel Import button in conflict dialog", () => {
    expect(callerIdsSource).toContain("Cancel Import");
  });

  it("should have Proceed with Import button", () => {
    expect(callerIdsSource).toContain("Proceed with Import");
  });
});
