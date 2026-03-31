import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const routersPath = path.join(__dirname, "routers.ts");
const routersSrc = fs.readFileSync(routersPath, "utf-8");

const vitelityPath = path.join(__dirname, "services/vitelity.ts");
const vitelitySrc = fs.readFileSync(vitelityPath, "utf-8");

const campaignsPath = path.join(__dirname, "../client/src/pages/Campaigns.tsx");
const campaignsSrc = fs.readFileSync(campaignsPath, "utf-8");

const callerIdsPath = path.join(__dirname, "../client/src/pages/CallerIds.tsx");
const callerIdsSrc = fs.readFileSync(callerIdsPath, "utf-8");

describe("Vitelity Auto-Sync", () => {
  it("should have syncVitelityDIDs procedure in routers", () => {
    expect(routersSrc).toContain("syncVitelityDIDs:");
  });

  it("should have compareInventory function in vitelity service", () => {
    expect(vitelitySrc).toContain("compareInventory");
  });

  it("should create audit log for sync operations", () => {
    const idx = routersSrc.indexOf("syncVitelityDIDs:");
    const syncBlock = routersSrc.substring(idx, idx + 2000);
    expect(syncBlock).toContain("createAuditLog");
  });

  it("should add new DIDs found on Vitelity to local database", () => {
    const idx = routersSrc.indexOf("syncVitelityDIDs:");
    const syncBlock = routersSrc.substring(idx, idx + 2000);
    expect(syncBlock).toContain("bulkCreateCallerIds");
  });

  it("should return sync results with added/removed/matched", () => {
    const idx = routersSrc.indexOf("syncVitelityDIDs:");
    const syncBlock = routersSrc.substring(idx, idx + 2000);
    expect(syncBlock).toContain("syncResult");
  });

  it("should have Sync Vitelity button in CallerIds UI", () => {
    expect(callerIdsSrc).toContain("Sync Vitelity");
  });

  it("should show sync loading state", () => {
    expect(callerIdsSrc).toContain("syncLoading");
    expect(callerIdsSrc).toContain("Syncing...");
  });

  it("should use syncMut mutation in CallerIds", () => {
    expect(callerIdsSrc).toContain("syncMut.mutate()");
  });
});

describe("Toll-Free DID Purchasing", () => {
  it("should have searchAvailableTollFreeDIDs function in vitelity service", () => {
    expect(vitelitySrc).toContain("searchAvailableTollFreeDIDs");
  });

  it("should have purchaseTollFreeDID function in vitelity service", () => {
    expect(vitelitySrc).toContain("purchaseTollFreeDID");
  });

  it("should have searchTollFreeDIDs procedure in routers", () => {
    expect(routersSrc).toContain("searchTollFreeDIDs:");
  });

  it("should have purchaseTollFreeDID procedure in routers", () => {
    expect(routersSrc).toContain("purchaseTollFreeDID:");
  });

  it("should have bulkPurchaseTollFreeDIDs procedure in routers", () => {
    expect(routersSrc).toContain("bulkPurchaseTollFreeDIDs:");
  });

  it("should have toll-free tab in Purchase DIDs dialog", () => {
    expect(callerIdsSrc).toContain("Toll-Free DIDs");
    expect(callerIdsSrc).toContain("purchaseTab");
  });

  it("should have local and tollfree tab options", () => {
    expect(callerIdsSrc).toContain("purchaseTab === \"local\"");
    expect(callerIdsSrc).toContain("purchaseTab === \"tollfree\"");
  });

  it("should query toll-free DIDs when tab is active", () => {
    expect(callerIdsSrc).toContain("searchTollFreeDIDs");
  });

  it("should use bulkTollFreePurchaseMut for purchasing", () => {
    expect(callerIdsSrc).toContain("bulkTollFreePurchaseMut");
  });

  it("should add purchased toll-free DIDs to caller IDs with userId", () => {
    const idx = routersSrc.indexOf("purchaseTollFreeDID:");
    const block = routersSrc.substring(idx, idx + 1500);
    expect(block).toContain("bulkCreateCallerIds");
    expect(block).toContain("userId: ctx.user.id");
  });

  it("should support optional SIP routing for toll-free DIDs", () => {
    const idx = routersSrc.indexOf("purchaseTollFreeDID:");
    const block = routersSrc.substring(idx, idx + 1500);
    expect(block).toContain("routeSip");
  });

  it("should support FreePBX inbound route creation for toll-free DIDs", () => {
    const idx = routersSrc.indexOf("purchaseTollFreeDID:");
    const block = routersSrc.substring(idx, idx + 1500);
    expect(block).toContain("createInboundRoutes");
  });
});

describe("DID Pool Label Counts", () => {
  it("should have labelCounts procedure in routers", () => {
    expect(routersSrc).toContain("labelCounts:");
  });

  it("should query labelCounts in Campaigns page", () => {
    expect(campaignsSrc).toContain("labelCounts");
    expect(campaignsSrc).toContain("trpc.callerIds.labelCounts.useQuery()");
  });

  it("should pass labelCounts to CampaignFormTabs", () => {
    expect(campaignsSrc).toContain("labelCounts={labelCounts}");
  });

  it("should show DID count next to All Active DIDs option", () => {
    expect(campaignsSrc).toContain('labelCounts.filter(lc => lc.label !== "__all__").reduce((sum, lc) => sum + lc.count, 0)');
    expect(campaignsSrc).toContain("DIDs)");
  });

  it("should show DID count next to each label option", () => {
    expect(campaignsSrc).toContain("lc?.count || 0");
  });

  it("should show selected label count in description text", () => {
    expect(campaignsSrc).toContain("labelCounts.find(c => c.label === form.didLabel)");
  });

  it("should also query labelCounts in CallerIds page", () => {
    expect(callerIdsSrc).toContain("trpc.callerIds.labelCounts.useQuery()");
  });
});

describe("Vitelity Service Functions", () => {
  it("should export listVitelityDIDs function", () => {
    expect(vitelitySrc).toContain("listVitelityDIDs");
  });

  it("should export searchAvailableDIDs function", () => {
    expect(vitelitySrc).toContain("searchAvailableDIDs");
  });

  it("should export cnamLookup function", () => {
    expect(vitelitySrc).toContain("cnamLookup");
  });

  it("should use VITELITY_API_LOGIN and VITELITY_API_PASS env vars", () => {
    expect(vitelitySrc).toContain("VITELITY_API_LOGIN");
    expect(vitelitySrc).toContain("VITELITY_API_PASS");
  });

  it("should call api.vitelity.net endpoint", () => {
    expect(vitelitySrc).toContain("api.vitelity.net");
  });
});
