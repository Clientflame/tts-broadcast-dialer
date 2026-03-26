import { eq, and, desc, sql, inArray, notInArray, count, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  contactLists, InsertContactList,
  contacts, InsertContact,
  audioFiles, InsertAudioFile,
  campaigns, InsertCampaign,
  callLogs, InsertCallLog,
  auditLogs, InsertAuditLog,
  callerIds, InsertCallerId,
  broadcastTemplates, InsertBroadcastTemplate,
  contactScores, InsertContactScore,
  costSettings, InsertCostSetting,
  callerIdRegions, InsertCallerIdRegion,
  userGroups, InsertUserGroup,
  userGroupMemberships, InsertUserGroupMembership,
  localAuth, InsertLocalAuth,
  callScripts, InsertCallScript,
  healthCheckSchedule, InsertHealthCheckSchedule,
  throttleHistory, InsertThrottleHistory,
  appSettings, InsertAppSetting,
  payments, InsertPayment,
  voiceAiPrompts, InsertVoiceAiPrompt,
  voiceAiConversations, InsertVoiceAiConversation,
  supervisorActions, InsertSupervisorAction,
  liveAgents,
  coachingTemplates, InsertCoachingTemplate,
  assistSessions, InsertAssistSession,
  assistSuggestions, InsertAssistSuggestion,
  agentCallLog,
  bridgeEvents, InsertBridgeEvent,
  scriptVersions, InsertScriptVersion,
  campaignTemplates, InsertCampaignTemplate,
  campaignSchedules, InsertCampaignSchedule,
  bridgeHealthChecks, InsertBridgeHealthCheck,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Contact Lists ───────────────────────────────────────────────────────────
export async function createContactList(data: InsertContactList) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contactLists).values(data);
  return { id: result[0].insertId };
}

export async function getContactLists() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contactLists).orderBy(desc(contactLists.createdAt));
}

export async function getContactList(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactLists).where(eq(contactLists.id, id)).limit(1);
  return result[0];
}

export async function updateContactList(id: number, data: Partial<InsertContactList>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contactLists).set(data).where(eq(contactLists.id, id));
}

export async function deleteContactList(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(contacts).where(eq(contacts.listId, id));
  await db.delete(contactLists).where(eq(contactLists.id, id));
}

// ─── Contacts ────────────────────────────────────────────────────────────────
export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contacts).values(data);
  await db.update(contactLists).set({ contactCount: sql`(SELECT COUNT(*) FROM contacts WHERE listId = ${data.listId})` }).where(eq(contactLists.id, data.listId));
  return { id: result[0].insertId };
}

export async function bulkCreateContacts(data: InsertContact[], options?: { skipDnc?: boolean; skipDupeCheck?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return { count: 0, duplicatesOmitted: 0, dncOmitted: 0, crossListDupes: 0, duplicatePhones: [] as string[], dncPhones: [] as string[] };

  const listId = data[0].listId;
  const userId = data[0].userId;

  // --- Step 1: Intra-file dedup (keep first occurrence) ---
  let intraFileDupes: string[] = [];
  let uniqueInFile: typeof data;
  if (options?.skipDupeCheck) {
    uniqueInFile = data;
  } else {
    const seenInFile = new Set<string>();
    uniqueInFile = data.filter(c => {
      const normalized = normalizePhone(c.phoneNumber);
      if (seenInFile.has(normalized)) {
        intraFileDupes.push(c.phoneNumber);
        return false;
      }
      seenInFile.add(normalized);
      return true;
    });
  }

  // --- Step 2: Cross-list dedup - check against ALL contact lists for this user ---
  let sameListDupes: string[] = [];
  let crossListDupePhones: string[] = [];
  let afterDedup: typeof data;
  if (options?.skipDupeCheck) {
    afterDedup = uniqueInFile;
  } else {
    const existingRows = await db.select({ phoneNumber: contacts.phoneNumber, listId: contacts.listId })
      .from(contacts)
      ;
    const existingPhones = new Set(existingRows.map(r => normalizePhone(r.phoneNumber)));
    const sameListPhones = new Set(existingRows.filter(r => r.listId === listId).map(r => normalizePhone(r.phoneNumber)));

    afterDedup = uniqueInFile.filter(c => {
      const normalized = normalizePhone(c.phoneNumber);
      if (sameListPhones.has(normalized)) {
        sameListDupes.push(c.phoneNumber);
        return false;
      }
      if (existingPhones.has(normalized)) {
        crossListDupePhones.push(c.phoneNumber);
        return false;
      }
      return true;
    });
  }

  // --- Step 3: DNC check - remove contacts on the DNC list ---
  const dncPhoneSet = await getDncPhoneNumbers();
  const dncOmitted: string[] = [];
  const afterDnc = options?.skipDnc ? afterDedup : afterDedup.filter(c => {
    const normalized = normalizePhone(c.phoneNumber);
    // DNC stores digits only, check both normalized forms
    if (dncPhoneSet.has(normalized) || dncPhoneSet.has(c.phoneNumber.replace(/\D/g, ""))) {
      dncOmitted.push(c.phoneNumber);
      return false;
    }
    return true;
  });

  const totalDupes = intraFileDupes.length + sameListDupes.length + crossListDupePhones.length;
  const allDupePhones = [...intraFileDupes, ...sameListDupes, ...crossListDupePhones];

  if (afterDnc.length > 0) {
    // Chunked insert for large imports to prevent DB timeout
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < afterDnc.length; i += CHUNK_SIZE) {
      const chunk = afterDnc.slice(i, i + CHUNK_SIZE);
      await db.insert(contacts).values(chunk);
    }
  }
  await db.update(contactLists).set({ contactCount: sql`(SELECT COUNT(*) FROM contacts WHERE listId = ${listId})` }).where(eq(contactLists.id, listId));
  return {
    count: afterDnc.length,
    duplicatesOmitted: totalDupes,
    dncOmitted: dncOmitted.length,
    crossListDupes: crossListDupePhones.length,
    duplicatePhones: allDupePhones.slice(0, 50),
    dncPhones: dncOmitted.slice(0, 50),
  };
}

/** Preview an import without actually inserting - returns dedup/DNC stats */
export async function previewImport(phoneNumbers: string[], listId: number, options?: { skipDupeCheck?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  if (options?.skipDupeCheck) {
    // Skip all dedup checks - just count DNC matches
    const dncPhoneSet = await getDncPhoneNumbers();
    let dncMatches = 0;
    for (const phone of phoneNumbers) {
      const normalized = normalizePhone(phone);
      if (dncPhoneSet.has(normalized) || dncPhoneSet.has(phone.replace(/\D/g, ""))) {
        dncMatches++;
      }
    }
    return {
      totalRows: phoneNumbers.length,
      intraFileDupes: 0,
      sameListDupes: 0,
      crossListDupes: 0,
      dncMatches,
      willImport: phoneNumbers.length - dncMatches,
      skipDupeCheck: true,
    };
  }

  // Intra-file dedup
  const seenInFile = new Set<string>();
  let intraFileDupes = 0;
  const uniquePhones: string[] = [];
  for (const phone of phoneNumbers) {
    const normalized = normalizePhone(phone);
    if (seenInFile.has(normalized)) { intraFileDupes++; continue; }
    seenInFile.add(normalized);
    uniquePhones.push(phone);
  }

  // Cross-list dedup
  const existingRows = await db.select({ phoneNumber: contacts.phoneNumber, listId: contacts.listId })
    .from(contacts)
    ;
  const existingPhones = new Set(existingRows.map(r => normalizePhone(r.phoneNumber)));
  const sameListPhones = new Set(existingRows.filter(r => r.listId === listId).map(r => normalizePhone(r.phoneNumber)));

  let sameListDupes = 0;
  let crossListDupes = 0;
  const afterDedup: string[] = [];
  for (const phone of uniquePhones) {
    const normalized = normalizePhone(phone);
    if (sameListPhones.has(normalized)) { sameListDupes++; continue; }
    if (existingPhones.has(normalized)) { crossListDupes++; continue; }
    afterDedup.push(phone);
  }

  // DNC check
  const dncPhoneSet = await getDncPhoneNumbers();
  let dncMatches = 0;
  for (const phone of afterDedup) {
    const normalized = normalizePhone(phone);
    if (dncPhoneSet.has(normalized) || dncPhoneSet.has(phone.replace(/\D/g, ""))) {
      dncMatches++;
    }
  }

  return {
    totalRows: phoneNumbers.length,
    intraFileDupes,
    sameListDupes,
    crossListDupes,
    dncMatches,
    willImport: afterDedup.length - dncMatches,
  };
}

/** Normalize phone number for comparison: strip non-digits, remove leading 1 if 11 digits */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export async function getContacts(listId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts).where(eq(contacts.listId, listId)).orderBy(desc(contacts.createdAt));
}

export async function updateContact(id: number, data: Partial<InsertContact>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contacts).set(data).where(eq(contacts.id, id));
}

export async function deleteContacts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  const contactRows = await db.select({ listId: contacts.listId }).from(contacts).where(inArray(contacts.id, ids));
  await db.delete(contacts).where(inArray(contacts.id, ids));
  const listIds = Array.from(new Set(contactRows.map(c => c.listId)));
  for (const listId of listIds) {
    await db.update(contactLists).set({ contactCount: sql`(SELECT COUNT(*) FROM contacts WHERE listId = ${listId})` }).where(eq(contactLists.id, listId));
  }
}

export async function getActiveContactsForCampaign(listId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts).where(and(eq(contacts.listId, listId), eq(contacts.status, "active")));
}

// ─── Audio Files ─────────────────────────────────────────────────────────────
export async function createAudioFile(data: InsertAudioFile) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(audioFiles).values(data);
  return { id: result[0].insertId };
}

export async function getAudioFiles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(audioFiles).orderBy(desc(audioFiles.createdAt));
}

export async function getAudioFile(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(audioFiles).where(eq(audioFiles.id, id)).limit(1);
  return result[0];
}

export async function updateAudioFile(id: number, data: Partial<InsertAudioFile>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(audioFiles).set(data).where(eq(audioFiles.id, id));
}

export async function deleteAudioFile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(audioFiles).where(eq(audioFiles.id, id));
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(campaigns).values(data);
  return { id: result[0].insertId };
}

export async function getCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

// Get campaign by ID only (no userId check) - used by PBX agent context
export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callLogs).where(eq(callLogs.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

export async function resetCampaignCallHistory(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  // Delete in small batches with delays to avoid long-running locks
  // that block PBX agent heartbeats and cause ECONNRESET errors
  let totalDeleted = 0;
  const BATCH_SIZE = 200;
  const BATCH_DELAY_MS = 100; // Brief pause between batches to let other queries through
  
  // Step 1: Mark any "claimed" call_queue items as "failed" first
  // so the PBX agent won't get 404 when reporting results
  await db.execute(
    sql`UPDATE ${callQueue} SET ${callQueue.status} = 'failed', ${callQueue.result} = 'cancelled' WHERE ${callQueue.campaignId} = ${campaignId} AND ${callQueue.status} = 'claimed'`
  );
  
  // Step 2: Batch-delete call_logs with delays between batches
  let deleted = 0;
  do {
    const result = await db.execute(
      sql`DELETE FROM ${callLogs} WHERE ${callLogs.campaignId} = ${campaignId} LIMIT ${BATCH_SIZE}`
    );
    deleted = (result as any)[0]?.affectedRows ?? 0;
    totalDeleted += deleted;
    if (deleted >= BATCH_SIZE) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  } while (deleted >= BATCH_SIZE);
  
  // Step 3: Batch-delete call_queue with delays between batches
  do {
    const result = await db.execute(
      sql`DELETE FROM ${callQueue} WHERE ${callQueue.campaignId} = ${campaignId} LIMIT ${BATCH_SIZE}`
    );
    deleted = (result as any)[0]?.affectedRows ?? 0;
    if (deleted >= BATCH_SIZE) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  } while (deleted >= BATCH_SIZE);
  
  // Step 4: Reset campaign status back to draft
  await db.update(campaigns)
    .set({ status: "draft" })
    .where(eq(campaigns.id, campaignId));
  
  return { deletedLogs: totalDeleted };
}

// ─── Call Logs ───────────────────────────────────────────────────────────────
export async function createCallLog(data: InsertCallLog) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(callLogs).values(data);
  return { id: result[0].insertId };
}

export async function bulkCreateCallLogs(data: InsertCallLog[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return;
  await db.insert(callLogs).values(data);
}

export async function getCallLogs(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callLogs).where(eq(callLogs.campaignId, campaignId)).orderBy(desc(callLogs.createdAt));
}

export async function updateCallLog(id: number, data: Partial<InsertCallLog>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callLogs).set(data).where(eq(callLogs.id, id));
}

export async function getCallLogByChannel(channel: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callLogs).where(eq(callLogs.asteriskChannel, channel)).limit(1);
  return result[0];
}

export async function getPendingCallLogs(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callLogs).where(and(eq(callLogs.campaignId, campaignId), eq(callLogs.status, "pending")));
}

export async function getActiveCallCount(campaignId: number) {
  const db = await getDb();
  if (!db) return 0;
  // Note: "answered" is a terminal status (call completed successfully), not an active call
  const result = await db.select({ cnt: count() }).from(callLogs).where(and(eq(callLogs.campaignId, campaignId), inArray(callLogs.status, ["dialing", "ringing"])));
  return result[0]?.cnt ?? 0;
}

export async function getCampaignStats(campaignId: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, answered: 0, busy: 0, noAnswer: 0, failed: 0, pending: 0, active: 0 };
  const rows = await db.select({ status: callLogs.status, cnt: count() }).from(callLogs).where(eq(callLogs.campaignId, campaignId)).groupBy(callLogs.status);
  const stats: Record<string, number> = {};
  let total = 0;
  for (const row of rows) { stats[row.status] = row.cnt; total += row.cnt; }
  return {
    total,
    completed: (stats["completed"] || 0) + (stats["answered"] || 0),
    answered: stats["answered"] || 0,
    busy: stats["busy"] || 0,
    noAnswer: stats["no-answer"] || 0,
    failed: stats["failed"] || 0,
    pending: stats["pending"] || 0,
    // Note: "answered" is a terminal status, not active
    active: (stats["dialing"] || 0) + (stats["ringing"] || 0),
  };
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────
export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  try { await db.insert(auditLogs).values(data); } catch (e) { console.error("[Audit] Failed to log:", e); }
}

export async function getAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function getAuditLogsFiltered(opts: {
  limit?: number;
  offset?: number;
  action?: string;
  resource?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };
  const conditions: any[] = [];
  if (opts.action) conditions.push(eq(auditLogs.action, opts.action));
  if (opts.resource) conditions.push(eq(auditLogs.resource, opts.resource));
  if (opts.search) conditions.push(
    sql`(${auditLogs.userName} LIKE ${"%" + opts.search + "%"} OR ${auditLogs.action} LIKE ${"%" + opts.search + "%"} OR CAST(${auditLogs.details} AS CHAR) LIKE ${"%" + opts.search + "%"})`
  );
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [logs, countResult] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(opts.limit || 50).offset(opts.offset || 0),
    db.select({ count: sql<number>`COUNT(*)` }).from(auditLogs).where(where),
  ]);
  return { logs, total: Number(countResult[0]?.count || 0) };
}

export async function getAuditLogActions() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action);
  return result.map(r => r.action);
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalCampaigns: 0, activeCampaigns: 0, totalContacts: 0, totalCalls: 0, answeredCalls: 0, totalLists: 0 };
  const [campaignStats] = await db.select({
    total: count(),
    active: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
  }).from(campaigns);
  const [contactStats] = await db.select({ total: count() }).from(contacts);
  const [listStats] = await db.select({ total: count() }).from(contactLists);
  const [callStats] = await db.select({
    total: sql<number>`SUM(CASE WHEN status != 'pending' THEN 1 ELSE 0 END)`,
    answered: sql<number>`SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END)`,
    totalDuration: sql<number>`COALESCE(SUM(CASE WHEN status != 'pending' THEN duration ELSE 0 END), 0)`,
    avgDuration: sql<number>`COALESCE(AVG(CASE WHEN duration > 0 AND status != 'pending' THEN duration END), 0)`,
  }).from(callLogs);
  return {
    totalCampaigns: campaignStats?.total ?? 0,
    activeCampaigns: Number(campaignStats?.active ?? 0),
    totalContacts: contactStats?.total ?? 0,
    totalCalls: callStats?.total ?? 0,
    answeredCalls: Number(callStats?.answered ?? 0),
    totalLists: listStats?.total ?? 0,
    totalDurationSecs: Number(callStats?.totalDuration ?? 0),
    avgDurationSecs: Math.round(Number(callStats?.avgDuration ?? 0)),
  };
}

// ─── DNC (Do Not Call) List ─────────────────────────────────────────────────
import { dncList, InsertDncEntry } from "../drizzle/schema";
import { like } from "drizzle-orm";

export async function addToDnc(data: InsertDncEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Normalize phone number - strip non-digits
  const normalized = data.phoneNumber.replace(/\D/g, "");
  // Check if already exists
  const existing = await db.select().from(dncList).where(eq(dncList.phoneNumber, normalized)).limit(1);
  if (existing.length > 0) return { id: existing[0].id, duplicate: true };
  const result = await db.insert(dncList).values({ ...data, phoneNumber: normalized });
  return { id: result[0].insertId, duplicate: false };
}

export async function bulkAddToDnc(entries: InsertDncEntry[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (entries.length === 0) return { added: 0, duplicates: 0 };
  const userId = entries[0].userId;
  // Batch fetch existing DNC numbers for this user
  const existingRows = await db.select({ phoneNumber: dncList.phoneNumber }).from(dncList);
  const existingSet = new Set(existingRows.map(r => r.phoneNumber));
  const seenInBatch = new Set<string>();
  const toInsert: typeof entries = [];
  let duplicates = 0;
  for (const entry of entries) {
    const normalized = entry.phoneNumber.replace(/\D/g, "");
    if (existingSet.has(normalized) || seenInBatch.has(normalized)) { duplicates++; continue; }
    seenInBatch.add(normalized);
    toInsert.push({ ...entry, phoneNumber: normalized });
  }
  // Chunked insert for large batches
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    await db.insert(dncList).values(chunk);
  }
  return { added: toInsert.length, duplicates };
}

export async function getDncEntries(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(dncList).where(like(dncList.phoneNumber, `%${search}%`)).orderBy(desc(dncList.createdAt)).limit(500);
  }
  return db.select().from(dncList).orderBy(desc(dncList.createdAt)).limit(500);
}

export async function removeDncEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(dncList).where(eq(dncList.id, id));
}

export async function bulkRemoveDnc(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  await db.delete(dncList).where(inArray(dncList.id, ids));
}

export async function isPhoneOnDnc(phoneNumber: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const normalized = phoneNumber.replace(/\D/g, "");
  const result = await db.select({ id: dncList.id }).from(dncList).where(eq(dncList.phoneNumber, normalized)).limit(1);
  return result.length > 0;
}

export async function getDncPhoneNumbers(): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select({ phoneNumber: dncList.phoneNumber }).from(dncList);
  return new Set(rows.map(r => r.phoneNumber));
}

/**
 * Get phone numbers that were called within the last N hours (default 48).
 * Used for dedup to prevent calling the same number too frequently.
 */
export async function getRecentlyCalledPhoneNumbers(hoursAgo: number = 48): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const cutoff = Date.now() - (hoursAgo * 60 * 60 * 1000);
  // Only count calls that were actually dialed (not pending/cancelled)
  const rows = await db.select({ phoneNumber: callLogs.phoneNumber })
    .from(callLogs)
    .where(and(
      gte(callLogs.createdAt, new Date(cutoff)),
      inArray(callLogs.status, ["dialing", "ringing", "answered", "busy", "no-answer", "failed", "completed"])
    ));
  return new Set(rows.map(r => r.phoneNumber.replace(/\D/g, "")));
}

export async function getDncCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(dncList);
  return result?.cnt ?? 0;
}

// ─── Caller IDs (DID Pool) ──────────────────────────────────────────────────
export async function createCallerId(data: InsertCallerId) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const normalized = data.phoneNumber.replace(/\D/g, "");
  // Check for duplicate
  const existing = await db.select({ id: callerIds.id, phoneNumber: callerIds.phoneNumber })
    .from(callerIds)
    .where(and(eq(callerIds.userId, data.userId), eq(callerIds.phoneNumber, normalized)))
    .limit(1);
  if (existing.length > 0) {
    return { id: existing[0].id, duplicate: true };
  }
  const result = await db.insert(callerIds).values({ ...data, phoneNumber: normalized });
  return { id: result[0].insertId, duplicate: false };
}

export async function bulkCreateCallerIds(entries: InsertCallerId[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (entries.length === 0) return { count: 0, duplicatesOmitted: 0, duplicatePhones: [] as string[] };

  const userId = entries[0].userId;

  // Get existing caller IDs for this user
  const existingRows = await db.select({ phoneNumber: callerIds.phoneNumber })
    .from(callerIds);
  const existingPhones = new Set(existingRows.map(r => r.phoneNumber));

  // Intra-batch dedup + existing dedup
  const seenInBatch = new Set<string>();
  const dupePhones: string[] = [];
  const toInsert = entries.filter(e => {
    const normalized = e.phoneNumber.replace(/\D/g, "");
    if (seenInBatch.has(normalized) || existingPhones.has(normalized)) {
      dupePhones.push(e.phoneNumber);
      return false;
    }
    seenInBatch.add(normalized);
    return true;
  }).map(e => ({ ...e, phoneNumber: e.phoneNumber.replace(/\D/g, "") }));

  if (toInsert.length > 0) {
    await db.insert(callerIds).values(toInsert);
  }
  return { count: toInsert.length, duplicatesOmitted: dupePhones.length, duplicatePhones: dupePhones.slice(0, 50) };
}

export async function getCallerIds() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callerIds).orderBy(desc(callerIds.createdAt));
}

export async function getActiveCallerIds() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callerIds).where(eq(callerIds.isActive, 1)).orderBy(callerIds.callCount);
}

export async function updateCallerId(id: number, data: Partial<InsertCallerId>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callerIds).set(data).where(eq(callerIds.id, id));
}

export async function deleteCallerId(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callerIds).where(eq(callerIds.id, id));
}

export async function bulkDeleteCallerIds(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  await db.delete(callerIds).where(inArray(callerIds.id, ids));
}

export async function incrementCallerIdUsage(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(callerIds).set({ callCount: sql`callCount + 1`, lastUsedAt: Date.now() }).where(eq(callerIds.id, id));
}

export async function getNextRotatingCallerId() {
  const db = await getDb();
  if (!db) return undefined;
  // Round-robin: pick the active caller ID with the lowest call count
  // Skip DIDs that are in cooldown (auto-flagged but not yet reactivated)
  const now = Date.now();
  const result = await db.select().from(callerIds)
    .where(and(
      eq(callerIds.isActive, 1),
      sql`(${callerIds.cooldownUntil} IS NULL OR ${callerIds.cooldownUntil} <= ${now})`,
    ))
    .orderBy(callerIds.callCount)
    .limit(1);
  return result[0];
}

// ─── Caller ID Health Checks ──────────────────────────────────────────────
const HEALTH_CHECK_FAIL_THRESHOLD = 3; // auto-disable after this many consecutive failures

export async function getCallerIdsForHealthCheck() {
  const db = await getDb();
  if (!db) return [];
  // Get all active caller IDs that haven't been checked in the last 4 hours, or never checked
  const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
  return db.select().from(callerIds)
    .where(and(
      eq(callerIds.isActive, 1),
      sql`(${callerIds.lastCheckAt} IS NULL OR ${callerIds.lastCheckAt} < ${fourHoursAgo})`,
    ))
    .orderBy(callerIds.lastCheckAt)
    .limit(20); // Check up to 20 at a time
}

export async function getCallerIdsDueForCheck() {
  const db = await getDb();
  if (!db) return [];
  // Get all active caller IDs across all users that need checking
  const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
  return db.select().from(callerIds)
    .where(and(
      eq(callerIds.isActive, 1),
      sql`(${callerIds.lastCheckAt} IS NULL OR ${callerIds.lastCheckAt} < ${fourHoursAgo})`,
    ))
    .orderBy(callerIds.lastCheckAt)
    .limit(10); // Process 10 at a time
}

export async function updateCallerIdHealthCheck(
  id: number,
  result: "healthy" | "degraded" | "failed",
  details?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const current = await db.select({
    consecutiveFailures: callerIds.consecutiveFailures,
    userId: callerIds.userId,
    phoneNumber: callerIds.phoneNumber,
  }).from(callerIds).where(eq(callerIds.id, id)).limit(1);
  if (!current[0]) return { autoDisabled: false };

  const newFailCount = result === "failed"
    ? current[0].consecutiveFailures + 1
    : 0;

  const shouldAutoDisable = newFailCount >= HEALTH_CHECK_FAIL_THRESHOLD;

  await db.update(callerIds).set({
    healthStatus: result,
    lastCheckAt: Date.now(),
    lastCheckResult: details || result,
    consecutiveFailures: newFailCount,
    ...(shouldAutoDisable ? { isActive: 0, autoDisabled: 1 } : {}),
  }).where(eq(callerIds.id, id));

  return {
    autoDisabled: shouldAutoDisable,
    phoneNumber: current[0].phoneNumber,
    failCount: newFailCount,
  };
}

export async function resetCallerIdHealth(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callerIds).set({
    healthStatus: "unknown" as any,
    consecutiveFailures: 0,
    autoDisabled: 0,
    isActive: 1,
    lastCheckAt: null,
    lastCheckResult: null,
  }).where(eq(callerIds.id, id));
}

// ─── Real-Time DID Health Monitoring ────────────────────────────────────────
const DID_ROLLING_WINDOW = 50; // track last N calls per DID
const DID_FLAG_THRESHOLD = 70; // flag if failure rate > 70%
const DID_COOLDOWN_MS = 30 * 60 * 1000; // 30 minute cooldown when flagged
const DID_WARNING_THRESHOLD = 50; // warning if failure rate > 50%

export async function recordDidCallResult(
  callerIdId: number,
  result: string,
) {
  const db = await getDb();
  if (!db) return { flagged: false };

  const isFail = ["failed", "congestion", "all-circuits-busy", "service-unavailable", "trunk-error"].includes(result);

  const current = await db.select({
    recentCallCount: callerIds.recentCallCount,
    recentFailCount: callerIds.recentFailCount,
    userId: callerIds.userId,
    phoneNumber: callerIds.phoneNumber,
    isActive: callerIds.isActive,
  }).from(callerIds).where(eq(callerIds.id, callerIdId)).limit(1);
  if (!current[0]) return { flagged: false };

  let newCallCount = current[0].recentCallCount + 1;
  let newFailCount = current[0].recentFailCount + (isFail ? 1 : 0);

  // Reset rolling window after DID_ROLLING_WINDOW calls
  if (newCallCount > DID_ROLLING_WINDOW) {
    // Scale down proportionally to keep the ratio but reset the window
    const ratio = newFailCount / newCallCount;
    newCallCount = Math.round(DID_ROLLING_WINDOW / 2);
    newFailCount = Math.round(newCallCount * ratio);
  }

  const failureRate = newCallCount > 0 ? Math.round((newFailCount / newCallCount) * 100) : 0;

  // Determine health status
  let healthStatus: "unknown" | "healthy" | "degraded" | "failed" = "healthy";
  let shouldFlag = false;
  let flagReason: string | null = null;

  if (newCallCount >= 10) { // Need at least 10 calls to make a judgment
    if (failureRate >= DID_FLAG_THRESHOLD) {
      healthStatus = "failed";
      shouldFlag = true;
      flagReason = `${failureRate}% failure rate over ${newCallCount} recent calls`;
    } else if (failureRate >= DID_WARNING_THRESHOLD) {
      healthStatus = "degraded";
    }
  }

  const updateData: any = {
    recentCallCount: newCallCount,
    recentFailCount: newFailCount,
    failureRate,
    healthStatus,
  };

  if (shouldFlag && current[0].isActive === 1) {
    updateData.isActive = 0;
    updateData.autoDisabled = 1;
    updateData.flaggedAt = Date.now();
    updateData.flagReason = flagReason;
    updateData.cooldownUntil = Date.now() + DID_COOLDOWN_MS;
  }

  await db.update(callerIds).set(updateData).where(eq(callerIds.id, callerIdId));

  return {
    flagged: shouldFlag && current[0].isActive === 1,
    phoneNumber: current[0].phoneNumber,
    failureRate,
    healthStatus,
  };
}

export async function recordDidCallResultByNumber(
  phoneNumberOrCallerIdStr: string,
  result: string,
) {
  const db = await getDb();
  if (!db) return { flagged: false };

  // Extract bare phone number from formatted callerIdStr like '"Broadcast" <4075551234>'
  let phoneNumber = phoneNumberOrCallerIdStr;
  const angleMatch = phoneNumberOrCallerIdStr.match(/<([^>]+)>/);
  if (angleMatch) {
    phoneNumber = angleMatch[1];
  }
  // Strip any non-digit characters except leading +
  phoneNumber = phoneNumber.replace(/[^0-9+]/g, "");

  // Look up the caller ID by phone number and userId
  const did = await db.select({ id: callerIds.id })
    .from(callerIds)
    .where(eq(callerIds.phoneNumber, phoneNumber))
    .limit(1);
  if (!did[0]) return { flagged: false };

  return recordDidCallResult(did[0].id, result);
}

export async function reactivateCooledDownDids() {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  // Find DIDs whose cooldown has expired
  const cooledDown = await db.select({
    id: callerIds.id,
    phoneNumber: callerIds.phoneNumber,
  }).from(callerIds)
    .where(and(
      eq(callerIds.autoDisabled, 1),
      sql`${callerIds.cooldownUntil} IS NOT NULL AND ${callerIds.cooldownUntil} <= ${now}`,
    ));

  for (const did of cooledDown) {
    await db.update(callerIds).set({
      isActive: 1,
      autoDisabled: 0,
      healthStatus: "unknown" as any,
      recentCallCount: 0,
      recentFailCount: 0,
      failureRate: 0,
      flaggedAt: null,
      flagReason: null,
      cooldownUntil: null,
    }).where(eq(callerIds.id, did.id));
  }

  return cooledDown;
}

export async function resetDidHealth(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callerIds).set({
    healthStatus: "unknown" as any,
    consecutiveFailures: 0,
    autoDisabled: 0,
    isActive: 1,
    recentCallCount: 0,
    recentFailCount: 0,
    failureRate: 0,
    flaggedAt: null,
    flagReason: null,
    cooldownUntil: null,
  }).where(eq(callerIds.id, id));
}

// ─── Broadcast Templates ────────────────────────────────────────────────────
export async function createBroadcastTemplate(data: InsertBroadcastTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(broadcastTemplates).values(data);
  return { id: result[0].insertId };
}

export async function getBroadcastTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(broadcastTemplates).orderBy(desc(broadcastTemplates.createdAt));
}

export async function getBroadcastTemplate(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(broadcastTemplates).where(eq(broadcastTemplates.id, id)).limit(1);
  return result[0];
}

export async function updateBroadcastTemplate(id: number, data: Partial<InsertBroadcastTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(broadcastTemplates).set(data).where(eq(broadcastTemplates.id, id));
}

export async function deleteBroadcastTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(broadcastTemplates).where(eq(broadcastTemplates.id, id));
}

// ─── Analytics ──────────────────────────────────────────────────────────────
export async function getCallAnalytics() {
  const db = await getDb();
  if (!db) return { statusBreakdown: [], dailyCalls: [], avgDuration: 0, totalDuration: 0 };

  const statusBreakdown = await db.select({
    status: callLogs.status,
    cnt: count(),
  }).from(callLogs).groupBy(callLogs.status);

  const dailyCalls = await db.select({
    day: sql<string>`DATE(createdAt)`,
    cnt: count(),
    answered: sql<number>`SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END)`,
  }).from(callLogs).groupBy(sql`DATE(createdAt)`).orderBy(sql`DATE(createdAt)`).limit(30);

  const [durationStats] = await db.select({
    avgDur: sql<number>`COALESCE(AVG(duration), 0)`,
    totalDur: sql<number>`COALESCE(SUM(duration), 0)`,
  }).from(callLogs).where(sql`duration IS NOT NULL AND duration > 0`);

  return {
    statusBreakdown: statusBreakdown.map(r => ({ status: r.status, count: r.cnt })),
    dailyCalls: dailyCalls.map(r => ({ day: r.day, total: r.cnt, answered: Number(r.answered || 0) })),
    avgDuration: Math.round(Number(durationStats?.avgDur ?? 0)),
    totalDuration: Number(durationStats?.totalDur ?? 0),
  };
}

export async function getCampaignAnalytics(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;

  const stats = await getCampaignStats(campaignId);

  const [durationStats] = await db.select({
    avgDur: sql<number>`COALESCE(AVG(duration), 0)`,
    totalDur: sql<number>`COALESCE(SUM(duration), 0)`,
    maxDur: sql<number>`COALESCE(MAX(duration), 0)`,
    minDur: sql<number>`COALESCE(MIN(CASE WHEN duration > 0 THEN duration END), 0)`,
  }).from(callLogs).where(and(eq(callLogs.campaignId, campaignId), sql`duration IS NOT NULL AND duration > 0`));

  return {
    campaign,
    stats,
    avgDuration: Math.round(Number(durationStats?.avgDur ?? 0)),
    totalDuration: Number(durationStats?.totalDur ?? 0),
    maxDuration: Number(durationStats?.maxDur ?? 0),
    minDuration: Number(durationStats?.minDur ?? 0),
  };
}

// ─── Contact Scores ─────────────────────────────────────────────────────────
export async function upsertContactScore(data: InsertContactScore) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(contactScores)
    .where(eq(contactScores.contactId, data.contactId)).limit(1);
  if (existing.length > 0) {
    await db.update(contactScores).set(data).where(eq(contactScores.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(contactScores).values(data);
  return { id: result[0].insertId };
}

export async function getContactScores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contactScores).orderBy(desc(contactScores.score));
}

export async function getContactScore(contactId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactScores)
    .where(eq(contactScores.contactId, contactId)).limit(1);
  return result[0];
}

export async function updateContactScore(id: number, data: Partial<InsertContactScore>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contactScores).set(data).where(eq(contactScores.id, id));
}

export async function recalculateContactScore(contactId: number) {
  const db = await getDb();
  if (!db) return;
  const logs = await db.select().from(callLogs)
    .where(eq(callLogs.contactId, contactId));
  const totalCalls = logs.length;
  const answeredCalls = logs.filter(l => l.status === "answered" || l.status === "completed").length;
  const durations = logs.filter(l => l.duration && l.duration > 0).map(l => l.duration!);
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const lastLog = logs.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
  // Score: 10 pts per answered, 5 pts per call, bonus for duration
  const score = (answeredCalls * 10) + (totalCalls * 5) + Math.min(avgDuration, 50);
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  const phoneNumber = contact[0]?.phoneNumber ?? "";
  await upsertContactScore({
    userId: 0, contactId, phoneNumber, score, totalCalls, answeredCalls, avgDuration,
    lastCallResult: lastLog?.status ?? null,
  });
}

// ─── Cost Settings ──────────────────────────────────────────────────────────
export async function getCostSettings() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(costSettings).limit(1);
  return result[0];
}

export async function upsertCostSettings(data: Partial<InsertCostSetting>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(costSettings).limit(1);
  if (existing.length > 0) {
    await db.update(costSettings).set(data).where(eq(costSettings.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(costSettings).values(data as InsertCostSetting);
  return { id: result[0].insertId };
}

// ─── Caller ID Regions ──────────────────────────────────────────────────────
export async function setCallerIdRegions(callerIdId: number, regions: Array<{ state?: string; areaCode?: string }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callerIdRegions).where(eq(callerIdRegions.callerIdId, callerIdId));
  if (regions.length > 0) {
    await db.insert(callerIdRegions).values(regions.map(r => ({ callerIdId, state: r.state ?? null, areaCode: r.areaCode ?? null })));
  }
}

export async function getCallerIdRegions(callerIdId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callerIdRegions).where(eq(callerIdRegions.callerIdId, callerIdId));
}

export async function getCallerIdsByRegion(state?: string, areaCode?: string) {
  const db = await getDb();
  if (!db) return [];
  // Get caller IDs that match the region or have no region assigned (global)
  const allCallerIdsList = await db.select().from(callerIds)
    .where(eq(callerIds.isActive, 1));
  const allRegions = await db.select().from(callerIdRegions);
  const regionMap = new Map<number, Array<{ state: string | null; areaCode: string | null }>>();
  for (const r of allRegions) {
    if (!regionMap.has(r.callerIdId)) regionMap.set(r.callerIdId, []);
    regionMap.get(r.callerIdId)!.push(r);
  }
  return allCallerIdsList.filter(cid => {
    const regions = regionMap.get(cid.id);
    if (!regions || regions.length === 0) return true; // global
    return regions.some(r =>
      (state && r.state && r.state.toLowerCase() === state.toLowerCase()) ||
      (areaCode && r.areaCode && r.areaCode === areaCode)
    );
  });
}

// ─── Campaign Cloning ───────────────────────────────────────────────────────
export async function cloneCampaign(id: number, newName: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const original = await getCampaign(id);
  if (!original) throw new Error("Campaign not found");
  const { id: _id, status: _status, completedCalls: _cc, answeredCalls: _ac, failedCalls: _fc,
    startedAt: _sa, completedAt: _ca, createdAt: _cr, updatedAt: _up, ...rest } = original;
  const result = await db.insert(campaigns).values({
    ...rest,
    name: newName,
    status: "draft",
    completedCalls: 0,
    answeredCalls: 0,
    failedCalls: 0,
  });
  return { id: result[0].insertId };
}

// ─── A/B Test Analytics ─────────────────────────────────────────────────────
export async function getABTestResults(abTestGroup: string) {
  const db = await getDb();
  if (!db) return [];
  const groupCampaigns = await db.select().from(campaigns)
    .where(eq(campaigns.abTestGroup, abTestGroup));
  const results = [];
  for (const c of groupCampaigns) {
    const stats = await getCampaignStats(c.id);
    results.push({
      campaignId: c.id,
      variant: c.abTestVariant ?? "default",
      name: c.name,
      voice: c.voice,
      totalContacts: c.totalContacts,
      completedCalls: c.completedCalls,
      answeredCalls: c.answeredCalls,
      failedCalls: c.failedCalls,
      answerRate: c.totalContacts > 0 ? Math.round((c.answeredCalls / c.totalContacts) * 100) : 0,
      stats,
    });
  }
  return results;
}

// ─── Export Helpers ──────────────────────────────────────────────────────────
export async function getCallLogsForExport(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: callLogs.id,
    phoneNumber: callLogs.phoneNumber,
    contactName: callLogs.contactName,
    status: callLogs.status,
    duration: callLogs.duration,
    attempt: callLogs.attempt,
    dtmfResponse: callLogs.dtmfResponse,
    ivrAction: callLogs.ivrAction,
    callerIdUsed: callLogs.callerIdUsed,
    errorMessage: callLogs.errorMessage,
    startedAt: callLogs.startedAt,
    answeredAt: callLogs.answeredAt,
    endedAt: callLogs.endedAt,
  }).from(callLogs).where(eq(callLogs.campaignId, campaignId))
    .orderBy(callLogs.id);
}

// ─── User Groups ────────────────────────────────────────────────────────────

export async function createUserGroup(data: InsertUserGroup) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(userGroups).values(data);
  return { id: result[0].insertId };
}

export async function getUserGroups() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userGroups).orderBy(userGroups.name);
}

export async function getUserGroup(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userGroups).where(eq(userGroups.id, id)).limit(1);
  return result[0];
}

export async function updateUserGroup(id: number, data: Partial<InsertUserGroup>) {
  const db = await getDb();
  if (!db) return;
  await db.update(userGroups).set(data).where(eq(userGroups.id, id));
}

export async function deleteUserGroup(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(userGroupMemberships).where(eq(userGroupMemberships.groupId, id));
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

// ─── User Group Memberships ─────────────────────────────────────────────────

export async function addUserToGroup(userId: number, groupId: number) {
  const db = await getDb();
  if (!db) return;
  // Check if already a member
  const existing = await db.select().from(userGroupMemberships)
    .where(and(eq(userGroupMemberships.userId, userId), eq(userGroupMemberships.groupId, groupId)))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(userGroupMemberships).values({ userId, groupId });
}

export async function removeUserFromGroup(userId: number, groupId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(userGroupMemberships)
    .where(and(eq(userGroupMemberships.userId, userId), eq(userGroupMemberships.groupId, groupId)));
}

export async function getUserGroupMemberships(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select().from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, userId));
  if (memberships.length === 0) return [];
  const groupIds = memberships.map(m => m.groupId);
  const groups = await db.select().from(userGroups)
    .where(inArray(userGroups.id, groupIds));
  return groups;
}

export async function getGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select().from(userGroupMemberships)
    .where(eq(userGroupMemberships.groupId, groupId));
  if (memberships.length === 0) return [];
  const userIds = memberships.map(m => m.userId);
  return db.select().from(users).where(inArray(users.id, userIds));
}

export async function getUserPermissions(userId: number): Promise<Record<string, boolean>> {
  const groups = await getUserGroupMemberships(userId);
  const merged: Record<string, boolean> = {};
  for (const group of groups) {
    const perms = group.permissions as Record<string, boolean> | null;
    if (perms) {
      for (const [key, value] of Object.entries(perms)) {
        if (value) merged[key] = true; // Union of all group permissions
      }
    }
  }
  return merged;
}

// ─── User Management (Admin) ────────────────────────────────────────────────

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.createdAt);
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

// ─── Local Auth (Email/Password) ────────────────────────────────────────────

export async function createLocalAuth(data: InsertLocalAuth) {
  const db = await getDb();
  if (!db) return;
  await db.insert(localAuth).values(data);
}

export async function getLocalAuthByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localAuth).where(eq(localAuth.email, email)).limit(1);
  return result[0];
}

export async function getLocalAuthByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localAuth).where(eq(localAuth.userId, userId)).limit(1);
  return result[0];
}

export async function updateLocalAuthPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(localAuth).set({ passwordHash }).where(eq(localAuth.userId, userId));
}

export async function setResetToken(email: string, token: string, expiry: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(localAuth).set({ resetToken: token, resetTokenExpiry: expiry }).where(eq(localAuth.email, email));
}

export async function getLocalAuthByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localAuth).where(eq(localAuth.resetToken, token)).limit(1);
  return result[0];
}

export async function clearResetToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(localAuth).set({ resetToken: null, resetTokenExpiry: null }).where(eq(localAuth.userId, userId));
}

export async function setVerificationToken(email: string, token: string, expiry: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(localAuth).set({ verificationToken: token, verificationTokenExpiry: expiry }).where(eq(localAuth.email, email));
}

export async function getLocalAuthByVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localAuth).where(eq(localAuth.verificationToken, token)).limit(1);
  return result[0];
}

export async function markEmailVerified(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(localAuth).set({ isVerified: 1, verificationToken: null, verificationTokenExpiry: null }).where(eq(localAuth.userId, userId));
}

// Get a single contact by ID
export async function getContact(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Call Queue (PBX Agent Polling) ─────────────────────────────────────────
import { callQueue, InsertCallQueueItem, pbxAgents, InsertPbxAgent } from "../drizzle/schema";
import { lt, isNull, isNotNull, asc } from "drizzle-orm";

export async function enqueueCall(data: InsertCallQueueItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(callQueue).values(data);
  return { id: result[0].insertId };
}

export async function claimPendingCalls(agentId: string, limit: number) {
  const db = await getDb();
  if (!db) return [];
  // Get pending calls ordered by priority then creation time
  const pending = await db.select().from(callQueue)
    .where(eq(callQueue.status, "pending"))
    .orderBy(asc(callQueue.priority), asc(callQueue.createdAt))
    .limit(limit);

  if (pending.length === 0) return [];

  const ids = pending.map(c => c.id);
  const now = Date.now();
  await db.update(callQueue)
    .set({ status: "claimed", claimedBy: agentId, claimedAt: now })
    .where(and(inArray(callQueue.id, ids), eq(callQueue.status, "pending")));

  // Return the claimed items with updated status
  return db.select().from(callQueue)
    .where(and(inArray(callQueue.id, ids), eq(callQueue.claimedBy, agentId)));
}

export async function updateCallQueueItem(id: number, data: Partial<InsertCallQueueItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callQueue).set(data).where(eq(callQueue.id, id));
}

export async function getCallQueueItem(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callQueue).where(eq(callQueue.id, id)).limit(1);
  return result[0];
}

export async function getCallQueueStats() {
  const db = await getDb();
  if (!db) return { pending: 0, claimed: 0, dialing: 0, completed: 0, failed: 0 };
  const result = await db.select({
    status: callQueue.status,
    count: count(),
  }).from(callQueue).groupBy(callQueue.status);
  const stats: Record<string, number> = {};
  for (const row of result) {
    stats[row.status] = row.count;
  }
  return {
    pending: stats["pending"] || 0,
    claimed: stats["claimed"] || 0,
    dialing: stats["dialing"] || 0,
    completed: stats["completed"] || 0,
    failed: stats["failed"] || 0,
  };
}

// Release stale claimed calls (agent crashed without reporting)
export async function releaseStaleClaimedCalls(staleThresholdMs: number = 120000) {
  const db = await getDb();
  if (!db) return;
  const cutoff = Date.now() - staleThresholdMs;
  await db.update(callQueue)
    .set({ status: "pending", claimedBy: null, claimedAt: null })
    .where(and(eq(callQueue.status, "claimed"), lt(callQueue.claimedAt, cutoff)));
}

// Get count of currently claimed calls for a specific agent
export async function getClaimedCallCountByAgent(agentId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(callQueue)
    .where(and(eq(callQueue.status, "claimed"), eq(callQueue.claimedBy, agentId)));
  return Number(result[0]?.count ?? 0);
}

// ─── PBX Agents ─────────────────────────────────────────────────────────────
export async function upsertPbxAgent(data: { agentId: string; apiKey: string; name?: string; ipAddress?: string; maxCalls?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(pbxAgents).values({
    agentId: data.agentId,
    apiKey: data.apiKey,
    name: data.name,
    ipAddress: data.ipAddress,
    maxCalls: data.maxCalls || 5,
    status: "online",
    lastHeartbeat: Date.now(),
  }).onDuplicateKeyUpdate({
    set: {
      lastHeartbeat: Date.now(),
      status: "online",
      ipAddress: data.ipAddress,
    },
  });
}

export async function getPbxAgentByApiKey(apiKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pbxAgents).where(eq(pbxAgents.apiKey, apiKey)).limit(1);
  return result[0];
}

export async function updatePbxAgentHeartbeat(agentId: string, activeCalls?: number, capabilities?: Record<string, any>) {
  const db = await getDb();
  if (!db) return;
  const data: Partial<InsertPbxAgent> = { lastHeartbeat: Date.now(), status: "online" };
  if (activeCalls !== undefined) data.activeCalls = activeCalls;
  if (capabilities !== undefined) data.capabilities = capabilities as any;
  await db.update(pbxAgents).set(data).where(eq(pbxAgents.agentId, agentId));
}

export async function getPbxAgents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pbxAgents).orderBy(desc(pbxAgents.lastHeartbeat));
}

export async function registerPbxAgent(data: { agentId: string; name: string; apiKey: string; status: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(pbxAgents).values({
    agentId: data.agentId,
    name: data.name,
    apiKey: data.apiKey,
    status: data.status || "offline",
    maxCalls: 5,
  });
  return { id: Number(result[0].insertId), agentId: data.agentId, name: data.name };
}

export async function deletePbxAgent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pbxAgents).where(eq(pbxAgents.id, id));
}

export async function updatePbxAgentMaxCalls(agentId: string, maxCalls: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pbxAgents).set({ maxCalls }).where(eq(pbxAgents.agentId, agentId));
}

export async function updatePbxAgentCps(agentId: string, cpsLimit: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pbxAgents).set({ cpsLimit }).where(eq(pbxAgents.agentId, agentId));
}

export async function updatePbxAgentCpsPacing(agentId: string, cpsPacingMs: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pbxAgents).set({ cpsPacingMs }).where(eq(pbxAgents.agentId, agentId));
}

export async function deletePbxAgentByAgentId(agentId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pbxAgents).where(eq(pbxAgents.agentId, agentId));
}

export async function getPbxAgentByAgentId(agentId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pbxAgents).where(eq(pbxAgents.agentId, agentId)).limit(1);
  return result[0];
}

export async function updateAgentThrottle(agentId: string, data: {
  effectiveMaxCalls?: number | null;
  throttleReason?: string | null;
  throttleStartedAt?: number | bigint | null;
  throttleCarrierErrors?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(pbxAgents).set(data as any).where(eq(pbxAgents.agentId, agentId));
}

export async function incrementAgentCarrierErrors(agentId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(pbxAgents).set({
    throttleCarrierErrors: sql`${pbxAgents.throttleCarrierErrors} + 1`,
  } as any).where(eq(pbxAgents.agentId, agentId));
}

// ─── Call Scripts ──────────────────────────────────────────────────────────
export async function createCallScript(data: InsertCallScript) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(callScripts).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getCallScripts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callScripts).orderBy(desc(callScripts.createdAt));
}

export async function getCallScript(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callScripts)
    .where(eq(callScripts.id, id))
    .limit(1);
  return result[0];
}

export async function getCallScriptById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callScripts)
    .where(eq(callScripts.id, id))
    .limit(1);
  return result[0];
}

export async function updateCallScript(id: number, data: Partial<InsertCallScript>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callScripts).set(data).where(eq(callScripts.id, id));
}

export async function deleteCallScript(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callScripts).where(eq(callScripts.id, id));
}


// ─── Health Check Schedule ────────────────────────────────────────────────
export async function getHealthCheckSchedule() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(healthCheckSchedule).limit(1);
  return rows[0] || null;
}

export async function upsertHealthCheckSchedule(data: { enabled: number; intervalHours: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getHealthCheckSchedule();
  const nextRunAt = data.enabled ? new Date(Date.now() + data.intervalHours * 60 * 60 * 1000) : null;
  if (existing) {
    await db.update(healthCheckSchedule)
      .set({ enabled: data.enabled, intervalHours: data.intervalHours, nextRunAt })
      .where(eq(healthCheckSchedule.id, existing.id));
    return { ...existing, ...data, nextRunAt };
  } else {
    const result = await db.insert(healthCheckSchedule).values({ userId: 0, enabled: data.enabled, intervalHours: data.intervalHours, nextRunAt });
    return { id: Number(result[0].insertId), ...data, nextRunAt };
  }
}

export async function markHealthCheckRun() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const schedule = await getHealthCheckSchedule();
  if (!schedule) return;
  const nextRunAt = new Date(Date.now() + schedule.intervalHours * 60 * 60 * 1000);
  await db.update(healthCheckSchedule)
    .set({ lastRunAt: new Date(), nextRunAt })
    .where(eq(healthCheckSchedule.id, schedule.id));
}

/** Get all schedules that are due to run (enabled and nextRunAt <= now) */
export async function getDueHealthCheckSchedules() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(healthCheckSchedule)
    .where(and(
      eq(healthCheckSchedule.enabled, 1),
      sql`${healthCheckSchedule.nextRunAt} <= NOW()`
    ));
}


// ─── Throttle History ──────────────────────────────────────────────────────
export async function createThrottleEvent(data: {
  agentId: string;
  agentName?: string | null;
  eventType: "throttle_triggered" | "ramp_up" | "full_recovery" | "manual_reset";
  previousMaxCalls?: number;
  newMaxCalls?: number;
  carrierErrors?: number;
  reason?: string;
}): Promise<void> {
  const dbInst = await getDb();
  if (!dbInst) return;
  await dbInst.insert(throttleHistory).values({
    agentId: data.agentId,
    agentName: data.agentName || null,
    eventType: data.eventType,
    previousMaxCalls: data.previousMaxCalls || null,
    newMaxCalls: data.newMaxCalls || null,
    carrierErrors: data.carrierErrors || 0,
    reason: data.reason || null,
  });
}

export async function getThrottleHistory(agentId?: string, limit = 50): Promise<any[]> {
  const dbInst = await getDb();
  if (!dbInst) return [];
  if (agentId) {
    return dbInst.select().from(throttleHistory)
      .where(eq(throttleHistory.agentId, agentId))
      .orderBy(desc(throttleHistory.createdAt))
      .limit(limit);
  }
  return dbInst.select().from(throttleHistory)
    .orderBy(desc(throttleHistory.createdAt))
    .limit(limit);
}

// ─── Broadcast Template Bulk Delete ────────────────────────────────────────
export async function bulkDeleteBroadcastTemplates(ids: number[]): Promise<number> {
  const dbInst = await getDb();
  if (!dbInst) return 0;
  let deleted = 0;
  for (const id of ids) {
    const result = await dbInst.delete(broadcastTemplates)
      .where(eq(broadcastTemplates.id, id));
    if ((result as any)[0]?.affectedRows > 0) deleted++;
  }
  return deleted;
}


// ─── Call Queue Helpers ────────────────────────────────────────────────────
export async function getPendingCallQueueCount(): Promise<number> {
  const dbInst = await getDb();
  if (!dbInst) return 0;
  const { callQueue } = await import("../drizzle/schema");
  const { eq, count: countFn } = await import("drizzle-orm");
  const result = await dbInst.select({ cnt: countFn() })
    .from(callQueue)
    .where(eq(callQueue.status, "pending"));
  return result[0]?.cnt ?? 0;
}

export async function getPendingHealthCheckCount(): Promise<number> {
  const dbInst = await getDb();
  if (!dbInst) return 0;
  const { callQueue } = await import("../drizzle/schema");
  const { eq, and, count: countFn, or } = await import("drizzle-orm");
  const result = await dbInst.select({ cnt: countFn() })
    .from(callQueue)
    .where(and(
      eq(callQueue.status, "pending"),
      or(
        eq(callQueue.audioName, "health-check"),
        eq(callQueue.context, "health-check")
      )
    ));
  return result[0]?.cnt ?? 0;
}

// ─── Agent Metrics ──────────────────────────────────────────────────────────

export async function getAgentMetrics() {
  const db = await getDb();
  if (!db) return [];

  // Get all agents (agents are shared, not per-user)
  const agents = await db.select().from(pbxAgents);

  const metrics = [];
  for (const agent of agents) {
    // Get total calls, results breakdown, and avg duration from callQueue
    const allCalls = await db
      .select({
        result: callQueue.result,
        status: callQueue.status,
        createdAt: callQueue.createdAt,
      })
      .from(callQueue)
      .where(
        and(
          eq(callQueue.claimedBy, agent.agentId),
          inArray(callQueue.status, ["completed", "failed"])
        )
      );

    const totalCalls = allCalls.length;
    const answered = allCalls.filter(c => c.result === "answered").length;
    const busy = allCalls.filter(c => c.result === "busy").length;
    const noAnswer = allCalls.filter(c => c.result === "no-answer").length;
    const failed = allCalls.filter(c => c.result === "failed" || c.result === "congestion").length;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;

    metrics.push({
      agentId: agent.agentId,
      agentName: agent.name || agent.agentId,
      totalCalls,
      answered,
      busy,
      noAnswer,
      failed,
      answerRate,
      maxCalls: agent.maxCalls ?? 5,
      effectiveMaxCalls: agent.effectiveMaxCalls,
      isOnline: agent.lastHeartbeat ? Date.now() - (agent.lastHeartbeat ?? 0) < 30000 : false,
    });
  }

  return metrics;
}

export async function getAgentCallTimeSeries(agentId: string, days: number = 7) {
  const db = await getDb();
  if (!db) return [];

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const calls = await db
    .select({
      result: callQueue.result,
      createdAt: callQueue.createdAt,
    })
    .from(callQueue)
    .where(
      and(
        eq(callQueue.claimedBy, agentId),
        inArray(callQueue.status, ["completed", "failed"]),
        gte(callQueue.createdAt, cutoff)
      )
    )
    .orderBy(callQueue.createdAt);

  // Group by hour
  const hourlyMap = new Map<string, { total: number; answered: number; busy: number; noAnswer: number; failed: number }>();

  for (const call of calls) {
    const date = new Date(call.createdAt);
    const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;

    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, { total: 0, answered: 0, busy: 0, noAnswer: 0, failed: 0 });
    }
    const bucket = hourlyMap.get(hourKey)!;
    bucket.total++;
    if (call.result === "answered") bucket.answered++;
    else if (call.result === "busy") bucket.busy++;
    else if (call.result === "no-answer") bucket.noAnswer++;
    else bucket.failed++;
  }

  return Array.from(hourlyMap.entries()).map(([hour, data]) => ({
    hour,
    ...data,
    answerRate: data.total > 0 ? Math.round((data.answered / data.total) * 100) : 0,
  }));
}

export async function getAgentDailyStats(agentId: string, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const calls = await db
    .select({
      result: callQueue.result,
      createdAt: callQueue.createdAt,
    })
    .from(callQueue)
    .where(
      and(
        eq(callQueue.claimedBy, agentId),
        inArray(callQueue.status, ["completed", "failed"]),
        gte(callQueue.createdAt, cutoff)
      )
    )
    .orderBy(callQueue.createdAt);

  // Group by day
  const dailyMap = new Map<string, { total: number; answered: number; busy: number; noAnswer: number; failed: number }>();

  for (const call of calls) {
    const date = new Date(call.createdAt);
    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, { total: 0, answered: 0, busy: 0, noAnswer: 0, failed: 0 });
    }
    const bucket = dailyMap.get(dayKey)!;
    bucket.total++;
    if (call.result === "answered") bucket.answered++;
    else if (call.result === "busy") bucket.busy++;
    else if (call.result === "no-answer") bucket.noAnswer++;
    else bucket.failed++;
  }

  return Array.from(dailyMap.entries()).map(([day, data]) => ({
    day,
    ...data,
    answerRate: data.total > 0 ? Math.round((data.answered / data.total) * 100) : 0,
  }));
}

// ─── Call Activity Feed ─────────────────────────────────────────────────
export async function getRecentCallActivity(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({
    id: callQueue.id,
    phoneNumber: callQueue.phoneNumber,
    status: callQueue.status,
    result: callQueue.result,
    claimedBy: callQueue.claimedBy,
    claimedAt: callQueue.claimedAt,
    callerIdStr: callQueue.callerIdStr,
    campaignId: callQueue.campaignId,
    campaignName: campaigns.name,
    audioName: callQueue.audioName,
    callDuration: callQueue.callDuration,
    createdAt: callQueue.createdAt,
    updatedAt: callQueue.updatedAt,
  })
    .from(callQueue)
    .leftJoin(campaigns, eq(callQueue.campaignId, campaigns.id))
    .orderBy(desc(callQueue.updatedAt))
    .limit(limit);

  // Also get agent names for attribution
  const agentIds = Array.from(new Set(rows.filter((r: any) => r.claimedBy).map((r: any) => r.claimedBy!)));
  let agentMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const agents = await db.select({ agentId: pbxAgents.agentId, name: pbxAgents.name })
      .from(pbxAgents)
      .where(inArray(pbxAgents.agentId, agentIds));
    agentMap = Object.fromEntries(agents.map((a: any) => [a.agentId, a.name || a.agentId]));
  }

  return rows.map((r: any) => ({
    id: r.id,
    phoneNumber: r.phoneNumber,
    status: r.status,
    result: r.result,
    agentId: r.claimedBy,
    agentName: r.claimedBy ? (agentMap[r.claimedBy] || r.claimedBy) : null,
    callerIdStr: r.callerIdStr,
    campaignId: r.campaignId,
    campaignName: r.campaignName || "Quick Test",
    audioName: r.audioName,
    callDuration: r.callDuration || null,
    createdAt: r.createdAt ? new Date(r.createdAt).getTime() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : null,
    claimedAt: r.claimedAt,
  }));
}


// ─── Per-DID Analytics ──────────────────────────────────────────────────────

export async function getDidAnalyticsSummary() {
  const db = await getDb();
  if (!db) return [];

  // Get all caller IDs for the user
  const dids = await db.select().from(callerIds);

  // Use call_logs table (has clean callerIdUsed field) instead of call_queue (polluted callerIdStr)
  // Exclude 'pending' and 'cancelled' statuses - only count actually dialed calls
  const rows = await db.execute(
    sql`SELECT callerIdUsed,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'answered' OR status = 'completed' THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as noAnswer,
      SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
      0 as congestion,
      AVG(CASE WHEN (status = 'answered' OR status = 'completed') AND duration > 0 THEN duration ELSE NULL END) as avgDuration,
      SUM(CASE WHEN (status = 'answered' OR status = 'completed') THEN COALESCE(duration, 0) ELSE 0 END) as totalDuration,
      MIN(createdAt) as firstUsed,
      MAX(createdAt) as lastUsed
    FROM call_logs
    WHERE callerIdUsed IS NOT NULL
      AND status NOT IN ('pending', 'cancelled')
    GROUP BY callerIdUsed`
  ) as any;

  const resultRows = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];

  // Build stats map with forced Number() conversion to avoid MySQL string returns
  const statsMap = new Map<string, any>();
  for (const r of resultRows) {
    const cid = String(r.callerIdUsed || "");
    if (cid) {
      statsMap.set(cid, {
        total: Number(r.total) || 0,
        answered: Number(r.answered) || 0,
        failed: Number(r.failed) || 0,
        noAnswer: Number(r.noAnswer) || 0,
        busy: Number(r.busy) || 0,
        congestion: Number(r.congestion) || 0,
        avgDuration: Number(r.avgDuration) || 0,
        totalDuration: Number(r.totalDuration) || 0,
        firstUsed: r.firstUsed,
        lastUsed: r.lastUsed,
      });
    }
  }

  return dids.map(did => {
    const s = statsMap.get(did.phoneNumber);
    const total = s?.total || 0;
    const answered = s?.answered || 0;
    const answerRate = total > 0 ? Math.round((answered / total) * 100) : 0;

    return {
      id: did.id,
      phoneNumber: did.phoneNumber,
      label: did.label,
      isActive: did.isActive,
      healthStatus: did.healthStatus,
      autoDisabled: did.autoDisabled,
      failureRate: did.failureRate,
      recentCallCount: did.recentCallCount,
      flaggedAt: did.flaggedAt,
      flagReason: did.flagReason,
      cooldownUntil: did.cooldownUntil,
      // Call stats
      totalCalls: total,
      answered,
      failed: s?.failed || 0,
      noAnswer: s?.noAnswer || 0,
      busy: s?.busy || 0,
      congestion: s?.congestion || 0,
      answerRate,
      avgDuration: s?.avgDuration ? Math.round(s.avgDuration) : 0,
      totalDuration: s?.totalDuration || 0,
      firstUsed: s?.firstUsed ? new Date(s.firstUsed).getTime() : null,
      lastUsed: s?.lastUsed ? new Date(s.lastUsed).getTime() : null,
    };
  });
}

export async function getDidCallVolume(callerIdStr?: string, days: number = 7) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Use call_logs table with callerIdUsed for accurate DID tracking
  const baseQuery = callerIdStr
    ? sql`SELECT callerIdUsed as callerIdStr, DATE(createdAt) as call_date, COUNT(*) as total, SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END) as answered, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM call_logs WHERE callerIdUsed IS NOT NULL AND status NOT IN ('pending','cancelled') AND createdAt >= ${since} AND callerIdUsed = ${callerIdStr} GROUP BY callerIdUsed, call_date ORDER BY call_date`
    : sql`SELECT callerIdUsed as callerIdStr, DATE(createdAt) as call_date, COUNT(*) as total, SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END) as answered, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM call_logs WHERE callerIdUsed IS NOT NULL AND status NOT IN ('pending','cancelled') AND createdAt >= ${since} GROUP BY callerIdUsed, call_date ORDER BY call_date`;

  const rows = await db.execute(baseQuery) as any;
  const resultRows = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];

  return resultRows.map((r: any) => ({
    callerIdStr: String(r.callerIdStr || ""),
    date: r.call_date ? String(r.call_date) : "",
    total: Number(r.total) || 0,
    answered: Number(r.answered) || 0,
    failed: Number(r.failed) || 0,
  }));
}

export async function getDidFlagHistory() {
  const db = await getDb();
  if (!db) return [];

  // Get audit logs related to DID flagging
  const logs = await db.select()
    .from(auditLogs)
    .where(
      sql`${auditLogs.action} IN ('did.flagged', 'did.reactivated', 'callerId.healthCheck', 'callerId.create')`,
    )
    .orderBy(sql`${auditLogs.createdAt} DESC`)
    .limit(100);

  return logs.map(l => ({
    id: l.id,
    action: l.action,
    resource: l.resource,
    resourceId: l.resourceId,
    details: l.details,
    createdAt: l.createdAt ? new Date(l.createdAt).getTime() : null,
  }));
}

export async function getDidCampaignBreakdown(callerIdStr: string) {
  const db = await getDb();
  if (!db) return [];

  // Use call_logs table with callerIdUsed for accurate DID tracking
  const rows = await db.execute(
    sql`SELECT campaignId,
      (SELECT name FROM campaigns WHERE id = call_logs.campaignId) as campaignName,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as noAnswer,
      AVG(CASE WHEN status IN ('answered','completed') AND duration > 0 THEN duration ELSE NULL END) as avgDuration
    FROM call_logs
    WHERE callerIdUsed = ${callerIdStr}
      AND status NOT IN ('pending','cancelled')
    GROUP BY campaignId`
  ) as any;

  const resultRows = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];

  return resultRows.map((r: any) => {
    const total = Number(r.total) || 0;
    const answered = Number(r.answered) || 0;
    return {
      campaignId: r.campaignId,
      campaignName: r.campaignName || "Quick Test",
      total,
      answered,
      failed: Number(r.failed) || 0,
      noAnswer: Number(r.noAnswer) || 0,
      answerRate: total > 0 ? Math.round((answered / total) * 100) : 0,
      avgDuration: r.avgDuration ? Math.round(Number(r.avgDuration)) : 0,
    };
  });
}

// ─── Area Code Distribution ──────────────────────────────────────────────────

export async function getAreaCodeDistribution(campaignId?: number, hours: number = 24) {
  const db = await getDb();
  if (!db) return { areaCodes: [], total: 0 };

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Build raw SQL to extract area code (first 3 digits after normalizing)
  const campaignFilter = campaignId
    ? sql`AND ${callQueue.campaignId} = ${campaignId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(phoneNumber, '-', ''), '(', ''), ')', ''), ' ', ''), 
        CASE WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(phoneNumber, '-', ''), '(', ''), ')', ''), ' ', ''), 1) = '1' 
             THEN 2 ELSE 1 END, 3) as areaCode,
      COUNT(*) as total,
      SUM(CASE WHEN result = 'answered' THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN result IN ('failed', 'congestion', 'trunk-error') THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN result = 'no-answer' THEN 1 ELSE 0 END) as noAnswer
    FROM call_queue
    WHERE result IS NOT NULL
      AND createdAt >= ${since}
      ${campaignFilter}
    GROUP BY areaCode
    ORDER BY total DESC
  `) as any;

  const resultRows = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
  const total = resultRows.reduce((sum: number, r: any) => sum + Number(r.total || 0), 0);

  return {
    areaCodes: resultRows.map((r: any) => ({
      areaCode: String(r.areaCode || "???"),
      total: Number(r.total) || 0,
      answered: Number(r.answered) || 0,
      failed: Number(r.failed) || 0,
      noAnswer: Number(r.noAnswer) || 0,
      answerRate: Number(r.total) > 0 ? Math.round((Number(r.answered) / Number(r.total)) * 100) : 0,
      percentage: total > 0 ? Math.round((Number(r.total) / total) * 1000) / 10 : 0,
    })),
    total,
  };
}


// ─── Retry Failed Contacts ──────────────────────────────────────────────────
export async function getRetriableContactCount(campaignId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Find contacts that have only failed/no-answer/busy outcomes (no answered calls)
  const [result] = await db.select({ cnt: count() }).from(callLogs)
    .where(and(
      eq(callLogs.campaignId, campaignId),
      inArray(callLogs.status, ["failed", "no-answer", "busy"]),
    ));
  // Exclude contacts that also have an answered call
  const answeredPhones = db.select({ phoneNumber: callLogs.phoneNumber }).from(callLogs)
    .where(and(
      eq(callLogs.campaignId, campaignId),
      eq(callLogs.status, "answered"),
    ));
  const [retriable] = await db.selectDistinct({ cnt: sql<number>`COUNT(DISTINCT ${callLogs.phoneNumber})` }).from(callLogs)
    .where(and(
      eq(callLogs.campaignId, campaignId),
      inArray(callLogs.status, ["failed", "no-answer", "busy"]),
      notInArray(callLogs.phoneNumber, answeredPhones),
    ));
  return Number(retriable?.cnt ?? 0);
}

export async function retryFailedContacts(campaignId: number): Promise<{ retriedCount: number; deletedLogs: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get phone numbers that were answered — we don't retry those
  const answeredRows = await db.selectDistinct({ phoneNumber: callLogs.phoneNumber }).from(callLogs)
    .where(and(
      eq(callLogs.campaignId, campaignId),
      eq(callLogs.status, "answered"),
    ));
  const answeredPhones = new Set(answeredRows.map(r => r.phoneNumber));

  // Get distinct phone numbers with failed/no-answer/busy that were NOT answered
  const failedRows = await db.selectDistinct({ phoneNumber: callLogs.phoneNumber }).from(callLogs)
    .where(and(
      eq(callLogs.campaignId, campaignId),
      inArray(callLogs.status, ["failed", "no-answer", "busy"]),
    ));
  const retriablePhones = failedRows.map(r => r.phoneNumber).filter(p => !answeredPhones.has(p));

  if (retriablePhones.length === 0) {
    return { retriedCount: 0, deletedLogs: 0 };
  }

  // Delete call logs for retriable phones (so they can be re-dialed)
  const logResult = await db.delete(callLogs).where(and(
    eq(callLogs.campaignId, campaignId),
    inArray(callLogs.phoneNumber, retriablePhones),
  ));

  // Delete any existing queue items for these phones
  await db.delete(callQueue).where(and(
    eq(callQueue.campaignId, campaignId),
    inArray(callQueue.phoneNumber, retriablePhones),
  ));

  // Set campaign back to draft so it can be restarted
  await db.update(campaigns)
    .set({ status: "paused" })
    .where(eq(campaigns.id, campaignId));

  return { retriedCount: retriablePhones.length, deletedLogs: Number((logResult as any)[0]?.affectedRows ?? retriablePhones.length) };
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function getAppSettings(keys?: string[]): Promise<Array<{ key: string; value: string | null; description: string | null; isSecret: number; updatedAt: Date }>> {
  const db = await getDb();
  if (!db) return [];
  if (keys && keys.length > 0) {
    return db.select({
      key: appSettings.key,
      value: appSettings.value,
      description: appSettings.description,
      isSecret: appSettings.isSecret,
      updatedAt: appSettings.updatedAt,
    }).from(appSettings).where(inArray(appSettings.key, keys));
  }
  return db.select({
    key: appSettings.key,
    value: appSettings.value,
    description: appSettings.description,
    isSecret: appSettings.isSecret,
    updatedAt: appSettings.updatedAt,
  }).from(appSettings);
}

export async function upsertAppSetting(key: string, value: string | null, description?: string, isSecret?: number, updatedBy?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(appSettings).set({ value, ...(description !== undefined && { description }), ...(updatedBy !== undefined && { updatedBy }) }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, description, isSecret: isSecret ?? 0, updatedBy });
  }
}

export async function deleteAppSetting(key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

// ─── Notification Preferences ──────────────────────────────────────────────
// Stored as app_settings with key prefix "notify_"
// Values: "1" = enabled, "0" = disabled

export const NOTIFICATION_TYPES = [
  { key: "notify_did_auto_flag", label: "DID Auto-Flagged", description: "When a DID is auto-flagged due to high failure rate" },
  { key: "notify_did_auto_disable", label: "DID Auto-Disabled", description: "When a DID is auto-disabled after consecutive health check failures" },
  { key: "notify_campaign_complete", label: "Campaign Completed", description: "When a campaign finishes dialing all contacts" },
  { key: "notify_campaign_auto_complete", label: "Campaign Auto-Completed", description: "When a campaign is auto-completed after server restart" },
  { key: "notify_agent_offline", label: "PBX Agent Offline", description: "When a PBX agent stops sending heartbeats" },
  { key: "notify_auto_throttle", label: "Auto-Throttle", description: "When an agent is auto-throttled due to carrier errors" },
  { key: "notify_bridge_offline", label: "Voice AI Bridge Offline", description: "When the Voice AI bridge service goes offline on a PBX agent" },
  { key: "notify_bridge_online", label: "Voice AI Bridge Online", description: "When the Voice AI bridge service comes online on a PBX agent" },
] as const;

export async function getNotificationPreferences(): Promise<Record<string, boolean>> {
  const keys = NOTIFICATION_TYPES.map(t => t.key);
  const settings = await getAppSettings(keys);
  const prefs: Record<string, boolean> = {};
  for (const type of NOTIFICATION_TYPES) {
    const setting = settings.find(s => s.key === type.key);
    // Default: all notifications disabled until user explicitly enables them
    prefs[type.key] = setting?.value === "1";
  }
  return prefs;
}

export async function isNotificationEnabled(key: string): Promise<boolean> {
  const value = await getAppSetting(key);
  return value === "1";
}

export async function setNotificationPreference(key: string, enabled: boolean, updatedBy?: number): Promise<void> {
  const type = NOTIFICATION_TYPES.find(t => t.key === key);
  if (!type) throw new Error(`Unknown notification type: ${key}`);
  await upsertAppSetting(key, enabled ? "1" : "0", type.description, 0, updatedBy);
}

// ─── User Deletion ──────────────────────────────────────────────────────────

export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove group memberships
  await db.delete(userGroupMemberships).where(eq(userGroupMemberships.userId, userId));
  // Remove local auth record
  await db.delete(localAuth).where(eq(localAuth.userId, userId));
  // Remove user record
  await db.delete(users).where(eq(users.id, userId));
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}


// ─── Payment Functions ───────────────────────────────────────────────────────

export async function createPayment(data: Omit<InsertPayment, "id">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(payments).values(data);
  return result[0].insertId;
}

export async function getPayment(paymentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return result[0];
}

export async function updatePayment(paymentId: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payments).set(data).where(eq(payments.id, paymentId));
}

export async function getPaymentsByContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).where(eq(payments.contactId, contactId)).orderBy(desc(payments.createdAt));
}

export async function getPaymentsByCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).where(eq(payments.campaignId, campaignId)).orderBy(desc(payments.createdAt));
}

export async function getCampaignPaymentStats(campaignId: number) {
  const db = await getDb();
  if (!db) return { totalPayments: 0, totalAmount: 0, successfulPayments: 0, successfulAmount: 0, pendingPayments: 0, failedPayments: 0 };
  
  const rows = await db.select({
    status: payments.status,
    cnt: count(),
    total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
  }).from(payments).where(eq(payments.campaignId, campaignId)).groupBy(payments.status);

  let totalPayments = 0, totalAmount = 0, successfulPayments = 0, successfulAmount = 0, pendingPayments = 0, failedPayments = 0;
  for (const row of rows) {
    totalPayments += row.cnt;
    totalAmount += row.total;
    if (row.status === "succeeded") { successfulPayments = row.cnt; successfulAmount = row.total; }
    if (row.status === "pending" || row.status === "processing") pendingPayments += row.cnt;
    if (row.status === "failed") failedPayments = row.cnt;
  }
  return { totalPayments, totalAmount, successfulPayments, successfulAmount, pendingPayments, failedPayments };
}

export async function getAllPayments(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(limit);
}


// ─── Voice AI Prompts ─────────────────────────────────────────────────────────
export async function getVoiceAiPrompts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(voiceAiPrompts).orderBy(desc(voiceAiPrompts.createdAt));
}

export async function getVoiceAiPrompt(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(voiceAiPrompts).where(eq(voiceAiPrompts.id, id));
  return row ?? null;
}

/** Get prompt by ID only (no user filter) — used by Voice AI Bridge API */
export async function getVoiceAiPromptById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(voiceAiPrompts).where(eq(voiceAiPrompts.id, id));
  return row ?? null;
}

export async function createVoiceAiPrompt(data: InsertVoiceAiPrompt) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(voiceAiPrompts).values(data).$returningId();
  return result;
}

export async function updateVoiceAiPrompt(id: number, data: Partial<InsertVoiceAiPrompt>) {
  const db = await getDb();
  if (!db) return;
  await db.update(voiceAiPrompts).set(data).where(eq(voiceAiPrompts.id, id));
}

export async function deleteVoiceAiPrompt(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(voiceAiPrompts).where(eq(voiceAiPrompts.id, id));
}

// ─── Voice AI Conversations ───────────────────────────────────────────────────
export async function getVoiceAiConversations(opts?: { campaignId?: number; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.campaignId) conditions.push(eq(voiceAiConversations.campaignId, opts.campaignId));
  return db.select().from(voiceAiConversations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(voiceAiConversations.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getVoiceAiConversation(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(voiceAiConversations).where(eq(voiceAiConversations.id, id));
  return row ?? null;
}

export async function createVoiceAiConversation(data: InsertVoiceAiConversation) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(voiceAiConversations).values(data).$returningId();
  return result;
}

export async function updateVoiceAiConversation(id: number, data: Partial<InsertVoiceAiConversation>) {
  const db = await getDb();
  if (!db) return;
  await db.update(voiceAiConversations).set(data).where(eq(voiceAiConversations.id, id));
}

export async function deleteVoiceAiConversation(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(voiceAiConversations).where(eq(voiceAiConversations.id, id));
}

export async function bulkDeleteVoiceAiConversations(ids: number[]) {
  const db = await getDb();
  if (!db) return 0;
  if (ids.length === 0) return 0;
  const result = await db.delete(voiceAiConversations).where(inArray(voiceAiConversations.id, ids));
  return result[0]?.affectedRows ?? ids.length;
}

export async function getVoiceAiStats() {
  const db = await getDb();
  if (!db) return null;
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    completed: sql<number>`sum(case when ${voiceAiConversations.status} = 'completed' then 1 else 0 end)`,
    escalated: sql<number>`sum(case when ${voiceAiConversations.status} = 'escalated' then 1 else 0 end)`,
    errors: sql<number>`sum(case when ${voiceAiConversations.status} = 'error' then 1 else 0 end)`,
    avgDuration: sql<number>`coalesce(avg(${voiceAiConversations.duration}), 0)`,
    avgTurns: sql<number>`coalesce(avg(${voiceAiConversations.turnCount}), 0)`,
    promiseToPay: sql<number>`sum(case when ${voiceAiConversations.disposition} = 'promise_to_pay' then 1 else 0 end)`,
    paymentMade: sql<number>`sum(case when ${voiceAiConversations.disposition} = 'payment_made' then 1 else 0 end)`,
    callbackScheduled: sql<number>`sum(case when ${voiceAiConversations.disposition} = 'callback_scheduled' then 1 else 0 end)`,
    disputed: sql<number>`sum(case when ${voiceAiConversations.disposition} = 'dispute_filed' then 1 else 0 end)`,
  }).from(voiceAiConversations);
  return stats;
}

// ─── Supervisor Actions ───────────────────────────────────────────────────────
export async function createSupervisorAction(data: InsertSupervisorAction) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(supervisorActions).values(data).$returningId();
  return result;
}

export async function updateSupervisorAction(id: number, data: Partial<InsertSupervisorAction>) {
  const db = await getDb();
  if (!db) return;
  await db.update(supervisorActions).set(data).where(eq(supervisorActions.id, id));
}

export async function getRecentSupervisorActions(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supervisorActions).orderBy(desc(supervisorActions.createdAt)).limit(limit);
}


// ─── Get Single Live Agent ────────────────────────────────────────────────────
export async function getLiveAgent(agentId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(liveAgents).where(eq(liveAgents.id, agentId));
  return row ?? null;
}


// ─── Agent Assist: Coaching Templates ────────────────────────────────────────
export async function createCoachingTemplate(data: InsertCoachingTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(coachingTemplates).values(data);
  return { id: result[0].insertId };
}

export async function getCoachingTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(coachingTemplates).orderBy(desc(coachingTemplates.createdAt));
}

export async function getCoachingTemplate(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(coachingTemplates).where(eq(coachingTemplates.id, id));
  return row;
}

export async function updateCoachingTemplate(id: number, data: Partial<InsertCoachingTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(coachingTemplates).set(data).where(eq(coachingTemplates.id, id));
}

export async function deleteCoachingTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(coachingTemplates).where(eq(coachingTemplates.id, id));
}

export async function getActiveCoachingTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(coachingTemplates).where(eq(coachingTemplates.isActive, 1));
}

export async function incrementTemplateUsage(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(coachingTemplates).set({ usageCount: sql`${coachingTemplates.usageCount} + 1` }).where(eq(coachingTemplates.id, id));
}

// ─── Agent Assist: Sessions ──────────────────────────────────────────────────
export async function createAssistSession(data: InsertAssistSession) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(assistSessions).values(data);
  return { id: result[0].insertId };
}

export async function getAssistSession(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(assistSessions).where(eq(assistSessions.id, id));
  return row;
}

export async function getActiveAssistSession(agentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(assistSessions).where(and(eq(assistSessions.agentId, agentId), eq(assistSessions.status, "active")));
  return row;
}

export async function updateAssistSession(id: number, data: Partial<InsertAssistSession>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(assistSessions).set(data).where(eq(assistSessions.id, id));
}

export async function endAssistSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(assistSessions).set({ status: "ended", endedAt: Date.now() }).where(eq(assistSessions.id, id));
}

export async function getAssistSessionsByAgent(agentId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assistSessions).where(eq(assistSessions.agentId, agentId)).orderBy(desc(assistSessions.createdAt)).limit(limit);
}

export async function getAssistStats() {
  const db = await getDb();
  if (!db) return { totalSessions: 0, activeSessions: 0, totalSuggestions: 0, acceptedSuggestions: 0, avgAcceptRate: 0 };
  const [stats] = await db.select({
    totalSessions: count(),
    activeSessions: sql<number>`SUM(CASE WHEN ${assistSessions.status} = 'active' THEN 1 ELSE 0 END)`,
    totalSuggestions: sql<number>`SUM(${assistSessions.totalSuggestions})`,
    acceptedSuggestions: sql<number>`SUM(${assistSessions.acceptedSuggestions})`,
  }).from(assistSessions);
  const total = Number(stats?.totalSuggestions) || 0;
  const accepted = Number(stats?.acceptedSuggestions) || 0;
  return {
    totalSessions: Number(stats?.totalSessions) || 0,
    activeSessions: Number(stats?.activeSessions) || 0,
    totalSuggestions: total,
    acceptedSuggestions: accepted,
    avgAcceptRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
  };
}

// ─── Agent Assist: Suggestions ───────────────────────────────────────────────
export async function createAssistSuggestion(data: InsertAssistSuggestion) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(assistSuggestions).values(data);
  // Increment session counter
  if (data.sessionId) {
    await db.update(assistSessions).set({
      totalSuggestions: sql`${assistSessions.totalSuggestions} + 1`,
    }).where(eq(assistSessions.id, data.sessionId));
  }
  return { id: result[0].insertId };
}

export async function getSessionSuggestions(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assistSuggestions).where(eq(assistSuggestions.sessionId, sessionId)).orderBy(desc(assistSuggestions.createdAt));
}

export async function respondToSuggestion(id: number, sessionId: number, response: "accepted" | "dismissed") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(assistSuggestions).set({ status: response, respondedAt: Date.now() }).where(eq(assistSuggestions.id, id));
  // Update session counters
  const field = response === "accepted" ? assistSessions.acceptedSuggestions : assistSessions.dismissedSuggestions;
  await db.update(assistSessions).set({
    [response === "accepted" ? "acceptedSuggestions" : "dismissedSuggestions"]: sql`${field} + 1`,
  }).where(eq(assistSessions.id, sessionId));
}

export async function expirePendingSuggestions(sessionId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(assistSuggestions).set({ status: "expired" }).where(and(eq(assistSuggestions.sessionId, sessionId), eq(assistSuggestions.status, "pending")));
}

// ─── Coaching Report: Agent Performance ─────────────────────────────────────
export async function getAgentCoachingPerformance() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT 
      s.agentId,
      la.name AS agentName,
      la.sipExtension,
      COUNT(DISTINCT s.id) AS totalSessions,
      SUM(s.totalSuggestions) AS totalSuggestions,
      SUM(s.acceptedSuggestions) AS acceptedSuggestions,
      SUM(s.dismissedSuggestions) AS dismissedSuggestions,
      CASE WHEN SUM(s.totalSuggestions) > 0 
        THEN ROUND(SUM(s.acceptedSuggestions) / SUM(s.totalSuggestions) * 100, 1)
        ELSE 0 END AS acceptRate,
      MAX(s.startedAt) AS lastSessionAt
    FROM assist_sessions s
    LEFT JOIN live_agents la ON la.id = s.agentId
    GROUP BY s.agentId, la.name, la.sipExtension
    ORDER BY totalSessions DESC
  `);
  return (rows as any)[0] || [];
}

// ─── Coaching Report: Template Effectiveness ────────────────────────────────
export async function getTemplateEffectiveness() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT 
      ct.id,
      ct.name,
      ct.category,
      ct.usageCount,
      COUNT(DISTINCT asug.id) AS suggestionCount,
      SUM(CASE WHEN asug.status = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount,
      SUM(CASE WHEN asug.status = 'dismissed' THEN 1 ELSE 0 END) AS dismissedCount,
      CASE WHEN COUNT(DISTINCT asug.id) > 0
        THEN ROUND(SUM(CASE WHEN asug.status = 'accepted' THEN 1 ELSE 0 END) / COUNT(DISTINCT asug.id) * 100, 1)
        ELSE 0 END AS acceptRate
    FROM coaching_templates ct
    LEFT JOIN assist_suggestions asug ON asug.templateId = ct.id
    GROUP BY ct.id, ct.name, ct.category, ct.usageCount
    ORDER BY ct.usageCount DESC
  `);
  return (rows as any)[0] || [];
}

// ─── Coaching Report: Suggestion Type Breakdown ─────────────────────────────
export async function getSuggestionTypeBreakdown() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT 
      asug.type,
      COUNT(*) AS total,
      SUM(CASE WHEN asug.status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN asug.status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
      SUM(CASE WHEN asug.status = 'expired' THEN 1 ELSE 0 END) AS expired,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(SUM(CASE WHEN asug.status = 'accepted' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1)
        ELSE 0 END AS acceptRate
    FROM assist_suggestions asug
    JOIN assist_sessions s ON s.id = asug.sessionId
    GROUP BY asug.type
    ORDER BY total DESC
  `);
  return (rows as any)[0] || [];
}

// ─── Coaching Report: Training Gaps (low accept rate by category per agent) ─
export async function getTrainingGaps() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT 
      s.agentId,
      la.name AS agentName,
      asug.type AS suggestionType,
      COUNT(*) AS total,
      SUM(CASE WHEN asug.status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(SUM(CASE WHEN asug.status = 'accepted' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1)
        ELSE 0 END AS acceptRate
    FROM assist_suggestions asug
    JOIN assist_sessions s ON s.id = asug.sessionId
    LEFT JOIN live_agents la ON la.id = s.agentId
    GROUP BY s.agentId, la.name, asug.type
    HAVING COUNT(*) >= 3 AND acceptRate < 40
    ORDER BY acceptRate ASC
  `);
  return (rows as any)[0] || [];
}

// ─── Coaching Report: Daily Trend ───────────────────────────────────────────
export async function getCoachingDailyTrend(days = 30) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const rows = await db.execute(sql`
    SELECT 
      DATE(FROM_UNIXTIME(s.startedAt / 1000)) AS day,
      COUNT(DISTINCT s.id) AS sessions,
      SUM(s.totalSuggestions) AS suggestions,
      SUM(s.acceptedSuggestions) AS accepted,
      CASE WHEN SUM(s.totalSuggestions) > 0
        THEN ROUND(SUM(s.acceptedSuggestions) / SUM(s.totalSuggestions) * 100, 1)
        ELSE 0 END AS acceptRate
    FROM assist_sessions s
    WHERE s.startedAt >= ${cutoff}
    GROUP BY day
    ORDER BY day ASC
  `);
  return (rows as any)[0] || [];
}

// ─── Coaching Report: Sentiment Distribution ────────────────────────────────
export async function getSentimentDistribution() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT 
      sentimentLabel AS label,
      COUNT(*) AS count
    FROM assist_sessions
    WHERE sentimentLabel IS NOT NULL
    GROUP BY sentimentLabel
    ORDER BY FIELD(sentimentLabel, 'very_negative', 'negative', 'neutral', 'positive', 'very_positive')
  `);
  return (rows as any)[0] || [];
}


// ─── Agent-User Linking & Agent Dashboard ─────────────────────────────────

export async function getLinkedAgentForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.linkedAgentId) return undefined;
  const [agent] = await db.select().from(liveAgents).where(eq(liveAgents.id, user.linkedAgentId)).limit(1);
  return agent;
}

export async function linkUserToAgent(userId: number, agentId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ linkedAgentId: agentId }).where(eq(users.id, userId));
}

export async function unlinkUserFromAgent(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ linkedAgentId: null }).where(eq(users.id, userId));
}

export async function getAgentCallHistory(agentId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentCallLog)
    .where(eq(agentCallLog.agentId, agentId))
    .orderBy(desc(agentCallLog.createdAt))
    .limit(limit);
}

export async function getAgentPerformanceStats(agentId: number) {
  const db = await getDb();
  if (!db) return { totalCalls: 0, answeredCalls: 0, avgTalkTime: 0, totalTalkTime: 0, dispositions: {} };

  const calls = await db.select().from(agentCallLog)
    .where(eq(agentCallLog.agentId, agentId));

  const totalCalls = calls.length;
  const answeredCalls = calls.filter(c => c.talkDuration && c.talkDuration > 0).length;
  const totalTalkTime = calls.reduce((sum, c) => sum + (c.talkDuration || 0), 0);
  const avgTalkTime = answeredCalls > 0 ? Math.round(totalTalkTime / answeredCalls) : 0;

  const dispositions: Record<string, number> = {};
  for (const c of calls) {
    const d = c.disposition || "other";
    dispositions[d] = (dispositions[d] || 0) + 1;
  }

  return { totalCalls, answeredCalls, avgTalkTime, totalTalkTime, dispositions };
}

export async function getAgentTodayStats(agentId: number) {
  const db = await getDb();
  if (!db) return { callsToday: 0, talkTimeToday: 0, avgTalkTimeToday: 0 };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const calls = await db.select().from(agentCallLog)
    .where(and(
      eq(agentCallLog.agentId, agentId),
      gte(agentCallLog.createdAt, startOfDay)
    ));

  const callsToday = calls.length;
  const talkTimeToday = calls.reduce((sum, c) => sum + (c.talkDuration || 0), 0);
  const answeredToday = calls.filter(c => c.talkDuration && c.talkDuration > 0).length;
  const avgTalkTimeToday = answeredToday > 0 ? Math.round(talkTimeToday / answeredToday) : 0;

  return { callsToday, talkTimeToday, avgTalkTimeToday };
}

export async function getAllLiveAgentsForLinking() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: liveAgents.id,
    name: liveAgents.name,
    sipExtension: liveAgents.sipExtension,
    email: liveAgents.email,
    status: liveAgents.status,
  }).from(liveAgents).orderBy(liveAgents.name);
}

// ─── Bridge Events (Uptime/Downtime History) ────────────────────────────────

export async function createBridgeEvent(data: Omit<InsertBridgeEvent, "id">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(bridgeEvents).values(data);
  return result[0].insertId;
}

export async function getBridgeEvents(opts?: { agentId?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.agentId) conditions.push(eq(bridgeEvents.agentId, opts.agentId));
  return db.select().from(bridgeEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bridgeEvents.createdAt))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);
}

export async function getBridgeEventStats() {
  const db = await getDb();
  if (!db) return { totalEvents: 0, onlineEvents: 0, offlineEvents: 0, installEvents: 0, lastOnline: null as string | null, lastOffline: null as string | null };
  const [stats] = await db.select({
    totalEvents: count(),
    onlineEvents: sql<number>`SUM(CASE WHEN ${bridgeEvents.eventType} = 'online' THEN 1 ELSE 0 END)`,
    offlineEvents: sql<number>`SUM(CASE WHEN ${bridgeEvents.eventType} = 'offline' THEN 1 ELSE 0 END)`,
    installEvents: sql<number>`SUM(CASE WHEN ${bridgeEvents.eventType} IN ('installed', 'updated') THEN 1 ELSE 0 END)`,
  }).from(bridgeEvents);

  // Get last online/offline timestamps
  const [lastOnlineRow] = await db.select({ createdAt: bridgeEvents.createdAt }).from(bridgeEvents)
    .where(eq(bridgeEvents.eventType, "online")).orderBy(desc(bridgeEvents.createdAt)).limit(1);
  const [lastOfflineRow] = await db.select({ createdAt: bridgeEvents.createdAt }).from(bridgeEvents)
    .where(eq(bridgeEvents.eventType, "offline")).orderBy(desc(bridgeEvents.createdAt)).limit(1);

  return {
    totalEvents: Number(stats?.totalEvents) || 0,
    onlineEvents: Number(stats?.onlineEvents) || 0,
    offlineEvents: Number(stats?.offlineEvents) || 0,
    installEvents: Number(stats?.installEvents) || 0,
    lastOnline: lastOnlineRow?.createdAt?.toISOString() ?? null,
    lastOffline: lastOfflineRow?.createdAt?.toISOString() ?? null,
  };
}


// ─── Script Version History ────────────────────────────────────────────────

export async function createScriptVersion(data: InsertScriptVersion) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(scriptVersions).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getScriptVersions(scriptId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId))
    .orderBy(desc(scriptVersions.version))
    .limit(limit);
}

export async function getScriptVersion(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(scriptVersions)
    .where(eq(scriptVersions.id, id))
    .limit(1);
  return row;
}

export async function getLatestScriptVersionNumber(scriptId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${scriptVersions.version}), 0)` })
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId));
  return Number(row?.maxVersion) || 0;
}

// ─── Script Performance Metrics ────────────────────────────────────────────

export async function getScriptPerformanceMetrics(scriptId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Join campaigns (which reference scriptId) with call_logs to aggregate metrics per script
  const conditions = [
    isNotNull(campaigns.scriptId),
  ];
  if (scriptId) {
    conditions.push(eq(campaigns.scriptId, scriptId));
  }

  const rows = await db.select({
    scriptId: campaigns.scriptId,
    totalCalls: count(),
    answeredCalls: sql<number>`SUM(CASE WHEN ${callLogs.status} IN ('answered', 'completed') THEN 1 ELSE 0 END)`,
    failedCalls: sql<number>`SUM(CASE WHEN ${callLogs.status} = 'failed' THEN 1 ELSE 0 END)`,
    busyCalls: sql<number>`SUM(CASE WHEN ${callLogs.status} = 'busy' THEN 1 ELSE 0 END)`,
    noAnswerCalls: sql<number>`SUM(CASE WHEN ${callLogs.status} = 'no-answer' THEN 1 ELSE 0 END)`,
    totalDuration: sql<number>`COALESCE(SUM(${callLogs.duration}), 0)`,
    avgDuration: sql<number>`COALESCE(AVG(CASE WHEN ${callLogs.status} IN ('answered', 'completed') AND ${callLogs.duration} > 0 THEN ${callLogs.duration} END), 0)`,
    campaignCount: sql<number>`COUNT(DISTINCT ${campaigns.id})`,
  })
    .from(callLogs)
    .innerJoin(campaigns, eq(callLogs.campaignId, campaigns.id))
    .where(and(...conditions))
    .groupBy(campaigns.scriptId);

  return rows.map(r => ({
    scriptId: r.scriptId!,
    totalCalls: Number(r.totalCalls) || 0,
    answeredCalls: Number(r.answeredCalls) || 0,
    failedCalls: Number(r.failedCalls) || 0,
    busyCalls: Number(r.busyCalls) || 0,
    noAnswerCalls: Number(r.noAnswerCalls) || 0,
    answerRate: r.totalCalls ? Math.round((Number(r.answeredCalls) / Number(r.totalCalls)) * 100) : 0,
    totalDuration: Number(r.totalDuration) || 0,
    avgDuration: Math.round(Number(r.avgDuration) || 0),
    campaignCount: Number(r.campaignCount) || 0,
  }));
}


// ─── Campaign Templates ─────────────────────────────────────────────────────

export async function createCampaignTemplate(data: Omit<InsertCampaignTemplate, "id">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(campaignTemplates).values(data);
  return { id: result[0].insertId };
}

export async function getCampaignTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignTemplates).orderBy(desc(campaignTemplates.updatedAt));
}

export async function getCampaignTemplate(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(campaignTemplates).where(eq(campaignTemplates.id, id)).limit(1);
  return row;
}

export async function updateCampaignTemplate(id: number, data: Partial<InsertCampaignTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(campaignTemplates).set(data).where(eq(campaignTemplates.id, id));
}

export async function deleteCampaignTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(campaignTemplates).where(eq(campaignTemplates.id, id));
}

// ─── Campaign Schedules ─────────────────────────────────────────────────────

export async function createCampaignSchedule(data: Omit<InsertCampaignSchedule, "id">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(campaignSchedules).values(data);
  return { id: result[0].insertId };
}

export async function getCampaignSchedule(campaignId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(campaignSchedules)
    .where(and(eq(campaignSchedules.campaignId, campaignId), eq(campaignSchedules.status, "pending")))
    .orderBy(desc(campaignSchedules.scheduledAt))
    .limit(1);
  return row;
}

export async function getPendingSchedules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignSchedules)
    .where(and(
      eq(campaignSchedules.status, "pending"),
      sql`${campaignSchedules.scheduledAt} <= ${Date.now()}`
    ));
}

export async function updateCampaignSchedule(id: number, data: Partial<InsertCampaignSchedule>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(campaignSchedules).set(data).where(eq(campaignSchedules.id, id));
}

export async function cancelCampaignSchedule(campaignId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(campaignSchedules)
    .set({ status: "cancelled" })
    .where(and(eq(campaignSchedules.campaignId, campaignId), eq(campaignSchedules.status, "pending")));
}

export async function getCampaignScheduleHistory(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignSchedules)
    .where(eq(campaignSchedules.campaignId, campaignId))
    .orderBy(desc(campaignSchedules.createdAt));
}

// ─── Contact Segmentation ───────────────────────────────────────────────────

export async function getContactSegmentation(listId: number) {
  const db = await getDb();
  if (!db) return { byAreaCode: [], byTimezone: [], byOutcome: [], total: 0 };

  // By area code (first 3 digits of phone number)
  const areaCodeRows = await db.execute(sql`
    SELECT 
      SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(phoneNumber, '-', ''), '(', ''), ')', ''), ' ', ''),
        CASE WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(phoneNumber, '-', ''), '(', ''), ')', ''), ' ', ''), 1) = '1'
          THEN 2 ELSE 1 END, 3) AS areaCode,
      COUNT(*) AS cnt
    FROM contacts
    WHERE listId = ${listId}
    GROUP BY areaCode
    ORDER BY cnt DESC
    LIMIT 50
  `) as any;

  // By outcome (from call_logs for contacts in this list)
  const outcomeRows = await db.execute(sql`
    SELECT 
      cl.status,
      COUNT(*) AS cnt
    FROM call_logs cl
    INNER JOIN contacts c ON cl.contactId = c.id
    WHERE c.listId = ${listId}
    GROUP BY cl.status
    ORDER BY cnt DESC
  `) as any;

  const [totalRow] = await db.select({ cnt: count() }).from(contacts).where(eq(contacts.listId, listId));

  return {
    byAreaCode: (Array.isArray(areaCodeRows) ? (Array.isArray(areaCodeRows[0]) ? areaCodeRows[0] : areaCodeRows) : []).map((r: any) => ({
      areaCode: String(r.areaCode || ""),
      count: Number(r.cnt) || 0,
    })),
    byOutcome: (Array.isArray(outcomeRows) ? (Array.isArray(outcomeRows[0]) ? outcomeRows[0] : outcomeRows) : []).map((r: any) => ({
      status: String(r.status || ""),
      count: Number(r.cnt) || 0,
    })),
    byTimezone: [], // timezone detection requires external API or area code mapping
    total: Number(totalRow?.cnt) || 0,
  };
}

// ─── Contact Dedup Across Lists ─────────────────────────────────────────────

export async function findDuplicateContacts(listIds?: number[]) {
  const db = await getDb();
  if (!db) return [];

  const listFilter = listIds && listIds.length > 0
    ? sql`WHERE c.listId IN (${sql.join(listIds.map(id => sql`${id}`), sql`, `)})`
    : sql``;

  const rows = await db.execute(sql`
    SELECT 
      c.phoneNumber,
      COUNT(*) AS occurrences,
      GROUP_CONCAT(DISTINCT c.listId) AS listIds,
      GROUP_CONCAT(DISTINCT cl.name) AS listNames
    FROM contacts c
    LEFT JOIN contact_lists cl ON cl.id = c.listId
    ${listFilter}
    GROUP BY c.phoneNumber
    HAVING COUNT(*) > 1
    ORDER BY occurrences DESC
    LIMIT 500
  `) as any;

  const resultRows = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
  return resultRows.map((r: any) => ({
    phoneNumber: String(r.phoneNumber || ""),
    occurrences: Number(r.occurrences) || 0,
    listIds: String(r.listIds || "").split(",").map(Number).filter(Boolean),
    listNames: String(r.listNames || "").split(",").filter(Boolean),
  }));
}

export async function removeDuplicateContacts(listId: number, keepStrategy: "first" | "last" = "first") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Find duplicates within the list
  const dupeRows = await db.execute(sql`
    SELECT phoneNumber, MIN(id) AS firstId, MAX(id) AS lastId, COUNT(*) AS cnt
    FROM contacts
    WHERE listId = ${listId}
    GROUP BY phoneNumber
    HAVING COUNT(*) > 1
  `) as any;

  const resultRows = Array.isArray(dupeRows) ? (Array.isArray(dupeRows[0]) ? dupeRows[0] : dupeRows) : [];
  let removedCount = 0;

  for (const row of resultRows) {
    const keepId = keepStrategy === "first" ? row.firstId : row.lastId;
    const result = await db.delete(contacts).where(and(
      eq(contacts.listId, listId),
      eq(contacts.phoneNumber, row.phoneNumber),
      sql`${contacts.id} != ${keepId}`
    ));
    removedCount += Number(row.cnt) - 1;
  }

  return { removedCount, duplicateGroups: resultRows.length };
}

// ─── Bridge Health Checks (Proactive) ───────────────────────────────────────

export async function createBridgeHealthCheck(data: Omit<InsertBridgeHealthCheck, "id">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(bridgeHealthChecks).values(data);
  return { id: result[0].insertId };
}

export async function getBridgeHealthChecks(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bridgeHealthChecks)
    .orderBy(desc(bridgeHealthChecks.checkedAt))
    .limit(limit);
}

export async function getBridgeHealthStats() {
  const db = await getDb();
  if (!db) return { totalChecks: 0, healthyChecks: 0, offlineChecks: 0, avgResponseTime: 0, uptimePercent: 0 };

  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const [stats] = await db.select({
    totalChecks: count(),
    healthyChecks: sql<number>`SUM(CASE WHEN ${bridgeHealthChecks.status} = 'healthy' THEN 1 ELSE 0 END)`,
    offlineChecks: sql<number>`SUM(CASE WHEN ${bridgeHealthChecks.status} = 'offline' THEN 1 ELSE 0 END)`,
    avgResponseTime: sql<number>`COALESCE(AVG(${bridgeHealthChecks.responseTimeMs}), 0)`,
  }).from(bridgeHealthChecks).where(gte(bridgeHealthChecks.checkedAt, last24h));

  const total = Number(stats?.totalChecks) || 0;
  const healthy = Number(stats?.healthyChecks) || 0;

  return {
    totalChecks: total,
    healthyChecks: healthy,
    offlineChecks: Number(stats?.offlineChecks) || 0,
    avgResponseTime: Math.round(Number(stats?.avgResponseTime) || 0),
    uptimePercent: total > 0 ? Math.round((healthy / total) * 100) : 0,
  };
}
