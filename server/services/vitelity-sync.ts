/**
 * Vitelity Auto-Sync Scheduler
 * Runs periodic sync of Vitelity DID inventory with local database.
 * Configuration stored in appSettings:
 *   - vitelity_sync_enabled: "1" or "0"
 *   - vitelity_sync_interval_minutes: e.g., "60"
 *   - vitelity_sync_last_run: ISO timestamp
 *   - vitelity_sync_last_result: JSON summary
 */

import { getAppSetting, upsertAppSetting, getDb } from "../db";
import { listVitelityDIDs, type VitelityDID } from "./vitelity";
import { callerIds, didCostTransactions, auditLogs } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

export interface SyncResult {
  timestamp: string;
  added: number;
  removed: number;
  matched: number;
  newDIDs: string[];
  removedDIDs: string[];
  error?: string;
}

/**
 * Perform a Vitelity sync: compare remote inventory with local DB
 */
export async function performSync(userId: number): Promise<SyncResult> {
  if (isSyncing) {
    return {
      timestamp: new Date().toISOString(),
      added: 0,
      removed: 0,
      matched: 0,
      newDIDs: [],
      removedDIDs: [],
      error: "Sync already in progress",
    };
  }

  isSyncing = true;
  try {
    // Fetch DIDs from Vitelity
    const vitelityDIDs = await listVitelityDIDs();
    const vitelityNumbers = vitelityDIDs.map(d => d.did);

    // Fetch local DIDs
    const database = await getDb();
    if (!database) throw new Error("Database not available");
    const localDIDs = await database
      .select({ id: callerIds.id, phoneNumber: callerIds.phoneNumber, isActive: callerIds.isActive })
      .from(callerIds)
      .where(eq(callerIds.userId, userId));

    const localNumbers = localDIDs.map((d: { phoneNumber: string }) => d.phoneNumber);

    // Find new DIDs on Vitelity not in local DB
    const newNumbers = vitelityNumbers.filter((n: string) => !localNumbers.includes(n));

    // Find DIDs in local DB not on Vitelity (potentially removed/released)
    const removedNumbers = localNumbers.filter((n: string) => !vitelityNumbers.includes(n));

    // Matched (exist in both)
    const matchedCount = vitelityNumbers.filter((n: string) => localNumbers.includes(n)).length;

    // Auto-add new DIDs
    if (newNumbers.length > 0) {
      const vitelityMap = new Map<string, VitelityDID>();
      for (const v of vitelityDIDs) {
        vitelityMap.set(v.did, v);
      }

      const newEntries = newNumbers.map(num => {
        const v = vitelityMap.get(num);
        return {
          userId,
          phoneNumber: num,
          label: v ? `${v.rateCenter || ""} ${v.state || ""}`.trim() || "Vitelity Sync" : "Vitelity Sync",
          isActive: 1,
          callCount: 0,
          consecutiveFailures: 0,
          autoDisabled: 0,
          recentCallCount: 0,
          recentFailCount: 0,
          failureRate: 0,
        };
      });

      await database.insert(callerIds).values(newEntries);

      // Log cost transactions for new DIDs
      const costEntries = newNumbers.map(num => ({
        userId,
        phoneNumber: num,
        type: "purchase" as const,
        amount: "0.00", // Synced, not purchased through app
        description: "Auto-synced from Vitelity inventory",
        transactionDate: Date.now(),
      }));
      await database.insert(didCostTransactions).values(costEntries);
    }

    // Flag removed DIDs (don't delete, just mark inactive)
    if (removedNumbers.length > 0) {
      const removedIds = localDIDs
        .filter((d: { id: number; phoneNumber: string }) => removedNumbers.includes(d.phoneNumber))
        .map((d: { id: number; phoneNumber: string }) => d.id);

      if (removedIds.length > 0) {
        await database
          .update(callerIds)
          .set({ isActive: 0, flagReason: "Removed from Vitelity inventory" })
          .where(inArray(callerIds.id, removedIds));
      }
    }

    const result: SyncResult = {
      timestamp: new Date().toISOString(),
      added: newNumbers.length,
      removed: removedNumbers.length,
      matched: matchedCount,
      newDIDs: newNumbers,
      removedDIDs: removedNumbers,
    };

    // Save last sync result
    await upsertAppSetting("vitelity_sync_last_run", new Date().toISOString(), "Last Vitelity sync timestamp");
    await upsertAppSetting("vitelity_sync_last_result", JSON.stringify(result), "Last Vitelity sync result");

    // Audit log
    await database.insert(auditLogs).values({
      userId,
      action: "vitelity.auto_sync",
      resource: "callerIds",
      details: result as unknown as Record<string, unknown>,
    });

    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const result: SyncResult = {
      timestamp: new Date().toISOString(),
      added: 0,
      removed: 0,
      matched: 0,
      newDIDs: [],
      removedDIDs: [],
      error: errorMsg,
    };
    await upsertAppSetting("vitelity_sync_last_result", JSON.stringify(result), "Last Vitelity sync result");
    return result;
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the auto-sync scheduler
 */
export async function startSyncScheduler(userId: number): Promise<void> {
  stopSyncScheduler();

  const enabled = await getAppSetting("vitelity_sync_enabled");
  if (enabled !== "1") {
    console.log("[VitelitySync] Auto-sync is disabled");
    return;
  }

  const intervalStr = await getAppSetting("vitelity_sync_interval_minutes");
  const intervalMinutes = parseInt(intervalStr || "60", 10);
  const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000; // minimum 5 minutes

  console.log(`[VitelitySync] Starting auto-sync every ${intervalMinutes} minutes`);

  syncTimer = setInterval(async () => {
    console.log("[VitelitySync] Running scheduled sync...");
    const result = await performSync(userId);
    console.log(`[VitelitySync] Sync complete: +${result.added} added, -${result.removed} removed, ${result.matched} matched`);
  }, intervalMs);
}

/**
 * Stop the auto-sync scheduler
 */
export function stopSyncScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[VitelitySync] Auto-sync scheduler stopped");
  }
}

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<{
  enabled: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  lastResult: SyncResult | null;
  isRunning: boolean;
}> {
  const enabled = await getAppSetting("vitelity_sync_enabled");
  const interval = await getAppSetting("vitelity_sync_interval_minutes");
  const lastRun = await getAppSetting("vitelity_sync_last_run");
  const lastResultStr = await getAppSetting("vitelity_sync_last_result");

  let lastResult: SyncResult | null = null;
  if (lastResultStr) {
    try {
      lastResult = JSON.parse(lastResultStr);
    } catch {}
  }

  return {
    enabled: enabled === "1",
    intervalMinutes: parseInt(interval || "60", 10),
    lastRun,
    lastResult,
    isRunning: isSyncing,
  };
}
