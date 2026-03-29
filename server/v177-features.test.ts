import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const routersSource = fs.readFileSync(
  path.join(__dirname, "routers.ts"),
  "utf-8"
);

const schemaSource = fs.readFileSync(
  path.join(__dirname, "../drizzle/schema.ts"),
  "utf-8"
);

const syncServiceSource = fs.readFileSync(
  path.join(__dirname, "services/vitelity-sync.ts"),
  "utf-8"
);

const analyticsSource = fs.readFileSync(
  path.join(__dirname, "../client/src/pages/Analytics.tsx"),
  "utf-8"
);

const callerIdsPageSource = fs.readFileSync(
  path.join(__dirname, "../client/src/pages/CallerIds.tsx"),
  "utf-8"
);

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe("didCostTransactions schema", () => {
  it("should define the didCostTransactions table", () => {
    expect(schemaSource).toContain('mysqlTable("did_cost_transactions"');
  });

  it("should have required columns: userId, phoneNumber, type, amount, transactionDate", () => {
    expect(schemaSource).toContain('userId: int("userId")');
    expect(schemaSource).toContain('phoneNumber: varchar("phoneNumber"');
    expect(schemaSource).toContain('amount: varchar("amount"');
    expect(schemaSource).toContain('transactionDate: bigint("transactionDate"');
  });

  it("should have type enum with purchase, monthly_rental, cnam_lookup, cnam_lidb, release, minutes, other", () => {
    expect(schemaSource).toContain('"purchase"');
    expect(schemaSource).toContain('"monthly_rental"');
    expect(schemaSource).toContain('"cnam_lookup"');
    expect(schemaSource).toContain('"cnam_lidb"');
    expect(schemaSource).toContain('"release"');
    expect(schemaSource).toContain('"minutes"');
    expect(schemaSource).toContain('"other"');
  });

  it("should have optional callerIdId for deleted DIDs", () => {
    expect(schemaSource).toContain("callerIdId: int(");
  });

  it("should have currency default to USD", () => {
    expect(schemaSource).toContain('.default("USD")');
  });

  it("should export DidCostTransaction type", () => {
    expect(schemaSource).toContain("export type DidCostTransaction");
    expect(schemaSource).toContain("export type InsertDidCostTransaction");
  });
});

// ─── Vitelity Sync Scheduler Tests ───────────────────────────────────────────

describe("Vitelity sync scheduler service", () => {
  it("should export performSync function", () => {
    expect(syncServiceSource).toContain("export async function performSync");
  });

  it("should export startSyncScheduler function", () => {
    expect(syncServiceSource).toContain("export async function startSyncScheduler");
  });

  it("should export stopSyncScheduler function", () => {
    expect(syncServiceSource).toContain("export function stopSyncScheduler");
  });

  it("should export getSyncStatus function", () => {
    expect(syncServiceSource).toContain("export async function getSyncStatus");
  });

  it("should prevent concurrent syncs with isSyncing flag", () => {
    expect(syncServiceSource).toContain("let isSyncing = false");
    expect(syncServiceSource).toContain("if (isSyncing)");
  });

  it("should compare Vitelity inventory with local DB", () => {
    expect(syncServiceSource).toContain("listVitelityDIDs");
    expect(syncServiceSource).toContain("vitelityNumbers");
    expect(syncServiceSource).toContain("localNumbers");
  });

  it("should auto-add new DIDs found on Vitelity", () => {
    expect(syncServiceSource).toContain("newNumbers");
    expect(syncServiceSource).toContain("database.insert(callerIds)");
  });

  it("should flag removed DIDs as inactive", () => {
    expect(syncServiceSource).toContain("removedNumbers");
    expect(syncServiceSource).toContain("isActive: 0");
    expect(syncServiceSource).toContain("Removed from Vitelity inventory");
  });

  it("should save last sync result to appSettings", () => {
    expect(syncServiceSource).toContain("vitelity_sync_last_run");
    expect(syncServiceSource).toContain("vitelity_sync_last_result");
  });

  it("should enforce minimum 5-minute interval", () => {
    expect(syncServiceSource).toContain("Math.max(intervalMinutes, 5)");
  });

  it("should log cost transactions for auto-synced DIDs", () => {
    expect(syncServiceSource).toContain("didCostTransactions");
    expect(syncServiceSource).toContain("Auto-synced from Vitelity inventory");
  });

  it("should return SyncResult with added, removed, matched counts", () => {
    expect(syncServiceSource).toContain("interface SyncResult");
    expect(syncServiceSource).toContain("added: number");
    expect(syncServiceSource).toContain("removed: number");
    expect(syncServiceSource).toContain("matched: number");
  });
});

// ─── Sync Settings tRPC Procedures ──────────────────────────────────────────

describe("Sync settings tRPC procedures", () => {
  it("should have getSyncSettings procedure", () => {
    expect(routersSource).toContain("getSyncSettings: adminProcedure");
    expect(routersSource).toContain("getSyncStatus");
  });

  it("should have updateSyncSettings procedure with enabled and intervalMinutes", () => {
    expect(routersSource).toContain("updateSyncSettings: adminProcedure");
    expect(routersSource).toContain("enabled: z.boolean()");
    expect(routersSource).toContain("intervalMinutes: z.number().min(5).max(1440)");
  });

  it("should start/stop scheduler based on enabled flag", () => {
    expect(routersSource).toContain("startSyncScheduler");
    expect(routersSource).toContain("stopSyncScheduler");
  });

  it("should have runSyncNow procedure for manual sync", () => {
    expect(routersSource).toContain("runSyncNow: adminProcedure");
    expect(routersSource).toContain("performSync");
  });

  it("should audit log sync settings changes", () => {
    expect(routersSource).toContain("vitelity.sync_settings_updated");
  });
});

// ─── Cost Tracking tRPC Procedures ──────────────────────────────────────────

describe("Cost tracking tRPC procedures", () => {
  it("should have getCostSummary procedure", () => {
    expect(routersSource).toContain("getCostSummary: protectedProcedure");
  });

  it("should accept configurable days parameter (1-365)", () => {
    expect(routersSource).toContain("days: z.number().min(1).max(365)");
  });

  it("should aggregate costs by type", () => {
    expect(routersSource).toContain("totals[t.type]");
  });

  it("should aggregate costs by DID with breakdown", () => {
    expect(routersSource).toContain("byDid[t.phoneNumber]");
    expect(routersSource).toContain("breakdown");
  });

  it("should return grandTotal", () => {
    expect(routersSource).toContain("grandTotal");
  });
});

// ─── Cost Transaction Logging ───────────────────────────────────────────────

describe("Cost transaction logging on operations", () => {
  it("should log cost transaction on single CNAM lookup ($0.01)", () => {
    // Find the cnamLookup procedure section
    const cnamIdx = routersSource.indexOf("cnamLookup: adminProcedure");
    const cnamSection = routersSource.substring(cnamIdx, cnamIdx + 2000);
    expect(cnamSection).toContain("cnam_lookup");
    expect(cnamSection).toContain('"0.01"');
  });

  it("should log cost transactions on bulk CNAM lookup", () => {
    const bulkCnamIdx = routersSource.indexOf("bulkCnamLookup: adminProcedure");
    const bulkCnamSection = routersSource.substring(bulkCnamIdx, bulkCnamIdx + 2000);
    expect(bulkCnamSection).toContain("cnam_lookup");
    expect(bulkCnamSection).toContain('"0.01"');
  });

  it("should log cost transaction on single DID purchase", () => {
    const purchaseIdx = routersSource.indexOf("purchaseDID: adminProcedure");
    const purchaseSection = routersSource.substring(purchaseIdx, purchaseIdx + 3000);
    expect(purchaseSection).toContain("didCostTransactions");
    expect(purchaseSection).toContain('"purchase"');
  });

  it("should log cost transactions on bulk DID purchase", () => {
    const bulkPurchaseIdx = routersSource.indexOf("bulkPurchaseDIDs: adminProcedure");
    const bulkPurchaseSection = routersSource.substring(bulkPurchaseIdx, bulkPurchaseIdx + 5000);
    expect(bulkPurchaseSection).toContain("didCostTransactions");
    expect(bulkPurchaseSection).toContain('"purchase"');
  });

  it("should log cost transaction on toll-free DID purchase", () => {
    const tfPurchaseIdx = routersSource.indexOf("purchaseTollFreeDID: adminProcedure");
    const tfPurchaseSection = routersSource.substring(tfPurchaseIdx, tfPurchaseIdx + 3000);
    expect(tfPurchaseSection).toContain("didCostTransactions");
    expect(tfPurchaseSection).toContain('"purchase"');
  });

  it("should log cost transaction on bulk toll-free DID purchase", () => {
    const bulkTfIdx = routersSource.indexOf("bulkPurchaseTollFreeDIDs: adminProcedure");
    const bulkTfSection = routersSource.substring(bulkTfIdx, bulkTfIdx + 5000);
    expect(bulkTfSection).toContain("didCostTransactions");
    expect(bulkTfSection).toContain('"purchase"');
  });

  it("should log cost transaction on DID release", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 3000);
    expect(releaseSection).toContain("didCostTransactions");
    expect(releaseSection).toContain('"release"');
  });
});

// ─── Bulk Release tRPC Procedure ────────────────────────────────────────────

describe("Bulk DID release procedure", () => {
  it("should have bulkReleaseDIDs procedure", () => {
    expect(routersSource).toContain("bulkReleaseDIDs: adminProcedure");
  });

  it("should accept ids array, releaseFromVitelity, and deleteFromFreepbx flags", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 500);
    expect(releaseSection).toContain("ids: z.array(z.number()).min(1)");
    expect(releaseSection).toContain("releaseFromVitelity: z.boolean()");
    expect(releaseSection).toContain("deleteFromFreepbx: z.boolean()");
  });

  it("should call Vitelity removeDID when releaseFromVitelity is true", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 3000);
    expect(releaseSection).toContain("removeDID");
    expect(releaseSection).toContain("input.releaseFromVitelity");
  });

  it("should call FreePBX deleteInboundRoutes when deleteFromFreepbx is true", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 3000);
    expect(releaseSection).toContain("deleteInboundRoutes");
    expect(releaseSection).toContain("input.deleteFromFreepbx");
  });

  it("should always delete from local DB", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 5000);
    expect(releaseSection).toContain("deleteCallerId");
    expect(releaseSection).toContain("dbDeleted");
  });

  it("should return per-DID results with vitelityReleased, freepbxDeleted, dbDeleted flags", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 3000);
    expect(releaseSection).toContain("vitelityReleased");
    expect(releaseSection).toContain("freepbxDeleted");
    expect(releaseSection).toContain("dbDeleted");
  });

  it("should audit log the bulk release", () => {
    const releaseIdx = routersSource.indexOf("bulkReleaseDIDs: adminProcedure");
    const releaseSection = routersSource.substring(releaseIdx, releaseIdx + 5000);
    expect(releaseSection).toContain("callerId.bulkRelease");
  });
});

// ─── Frontend: Analytics DID Cost Dashboard ─────────────────────────────────

describe("Analytics page DID cost dashboard", () => {
  it("should have DID Costs tab", () => {
    expect(analyticsSource).toContain("DID Costs");
    expect(analyticsSource).toContain("DIDCostDashboard");
  });

  it("should have Call Analytics tab", () => {
    expect(analyticsSource).toContain("Call Analytics");
  });

  it("should use getCostSummary query", () => {
    expect(analyticsSource).toContain("callerIds.getCostSummary");
  });

  it("should have time range selector (7, 30, 90, 180, 365 days)", () => {
    expect(analyticsSource).toContain('"7"');
    expect(analyticsSource).toContain('"30"');
    expect(analyticsSource).toContain('"90"');
    expect(analyticsSource).toContain('"180"');
    expect(analyticsSource).toContain('"365"');
  });

  it("should show summary cards: Total Spend, Transactions, DIDs with Costs, Avg Cost/DID", () => {
    expect(analyticsSource).toContain("Total Spend");
    expect(analyticsSource).toContain("Transactions");
    expect(analyticsSource).toContain("DIDs with Costs");
    expect(analyticsSource).toContain("Avg Cost/DID");
  });

  it("should have cost breakdown by type pie chart", () => {
    expect(analyticsSource).toContain("Cost Breakdown by Type");
    expect(analyticsSource).toContain("PieChart");
  });

  it("should have daily cost trend bar chart", () => {
    expect(analyticsSource).toContain("Daily Cost Trend");
    expect(analyticsSource).toContain("BarChart");
  });

  it("should have per-DID cost breakdown table", () => {
    expect(analyticsSource).toContain("Per-DID Cost Breakdown");
    expect(analyticsSource).toContain("phoneNumber");
  });

  it("should show purchase, CNAM, minutes, and other columns in table", () => {
    expect(analyticsSource).toContain("Purchase");
    expect(analyticsSource).toContain("CNAM");
    expect(analyticsSource).toContain("Minutes");
    expect(analyticsSource).toContain("Other");
  });

  it("should have search filter for DIDs", () => {
    expect(analyticsSource).toContain("Search DID");
  });

  it("should have sort by cost button", () => {
    expect(analyticsSource).toContain("Sort by cost");
  });

  it("should show footer totals", () => {
    expect(analyticsSource).toContain("filteredByDid.reduce");
  });
});

// ─── Frontend: Release DIDs Dialog ──────────────────────────────────────────

describe("CallerIds page release DIDs dialog", () => {
  it("should have Release DIDs button in selection toolbar", () => {
    expect(callerIdsPageSource).toContain("Release DIDs");
    expect(callerIdsPageSource).toContain("setShowRelease(true)");
  });

  it("should have release confirmation dialog", () => {
    expect(callerIdsPageSource).toContain("Release DIDs Confirmation Dialog");
    expect(callerIdsPageSource).toContain("permanently release");
  });

  it("should have Release from Vitelity toggle", () => {
    expect(callerIdsPageSource).toContain("Release from Vitelity");
    expect(callerIdsPageSource).toContain("releaseFromVitelity");
  });

  it("should have Delete from FreePBX toggle", () => {
    expect(callerIdsPageSource).toContain("Delete from FreePBX");
    expect(callerIdsPageSource).toContain("releaseFromFreepbx");
  });

  it("should show selected DID list in confirmation", () => {
    expect(callerIdsPageSource).toContain("DID(s) selected");
    expect(callerIdsPageSource).toContain("selected.has(c.id)");
  });

  it("should call bulkReleaseDIDs mutation", () => {
    expect(callerIdsPageSource).toContain("bulkReleaseMut.mutate");
    expect(callerIdsPageSource).toContain("callerIds.bulkReleaseDIDs");
  });

  it("should show loading state during release", () => {
    expect(callerIdsPageSource).toContain("Releasing...");
    expect(callerIdsPageSource).toContain("bulkReleaseMut.isPending");
  });
});

// ─── Frontend: Sync Settings Dialog ─────────────────────────────────────────

describe("CallerIds page sync settings dialog", () => {
  it("should have sync settings button (gear icon)", () => {
    expect(callerIdsPageSource).toContain("setShowSyncSettings(true)");
    expect(callerIdsPageSource).toContain("Auto-Sync Settings");
  });

  it("should have Enable Auto-Sync toggle", () => {
    expect(callerIdsPageSource).toContain("Enable Auto-Sync");
    expect(callerIdsPageSource).toContain("syncEnabled");
  });

  it("should have interval selector with options from 5 min to 24 hours", () => {
    expect(callerIdsPageSource).toContain("Every 5 minutes");
    expect(callerIdsPageSource).toContain("Every 15 minutes");
    expect(callerIdsPageSource).toContain("Every 30 minutes");
    expect(callerIdsPageSource).toContain("Every hour");
    expect(callerIdsPageSource).toContain("Every 6 hours");
    expect(callerIdsPageSource).toContain("Every 12 hours");
    expect(callerIdsPageSource).toContain("Every 24 hours");
  });

  it("should show last sync info", () => {
    expect(callerIdsPageSource).toContain("Last Sync");
    expect(callerIdsPageSource).toContain("syncSettings.lastRun");
  });

  it("should show sync result counts", () => {
    expect(callerIdsPageSource).toContain("syncSettings.lastResult");
    expect(callerIdsPageSource).toContain("added");
    expect(callerIdsPageSource).toContain("removed");
    expect(callerIdsPageSource).toContain("matched");
  });

  it("should show sync in progress indicator", () => {
    expect(callerIdsPageSource).toContain("Sync in progress");
    expect(callerIdsPageSource).toContain("syncSettings.isRunning");
  });

  it("should call updateSyncSettings mutation on save", () => {
    expect(callerIdsPageSource).toContain("updateSyncSettingsMut.mutate");
    expect(callerIdsPageSource).toContain("callerIds.updateSyncSettings");
  });

  it("should use getSyncSettings query", () => {
    expect(callerIdsPageSource).toContain("callerIds.getSyncSettings");
  });
});
