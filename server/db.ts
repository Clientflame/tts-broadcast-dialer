import { eq, and, desc, sql, inArray, count } from "drizzle-orm";
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

export async function getContactLists(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contactLists).where(eq(contactLists.userId, userId)).orderBy(desc(contactLists.createdAt));
}

export async function getContactList(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactLists).where(and(eq(contactLists.id, id), eq(contactLists.userId, userId))).limit(1);
  return result[0];
}

export async function updateContactList(id: number, userId: number, data: Partial<InsertContactList>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contactLists).set(data).where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)));
}

export async function deleteContactList(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(contacts).where(and(eq(contacts.listId, id), eq(contacts.userId, userId)));
  await db.delete(contactLists).where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)));
}

// ─── Contacts ────────────────────────────────────────────────────────────────
export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contacts).values(data);
  await db.update(contactLists).set({ contactCount: sql`(SELECT COUNT(*) FROM contacts WHERE listId = ${data.listId})` }).where(eq(contactLists.id, data.listId));
  return { id: result[0].insertId };
}

export async function bulkCreateContacts(data: InsertContact[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(contacts).values(data);
  const listId = data[0].listId;
  await db.update(contactLists).set({ contactCount: sql`(SELECT COUNT(*) FROM contacts WHERE listId = ${listId})` }).where(eq(contactLists.id, listId));
  return { count: data.length };
}

export async function getContacts(listId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts).where(and(eq(contacts.listId, listId), eq(contacts.userId, userId))).orderBy(desc(contacts.createdAt));
}

export async function updateContact(id: number, userId: number, data: Partial<InsertContact>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contacts).set(data).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
}

export async function deleteContacts(ids: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  const contactRows = await db.select({ listId: contacts.listId }).from(contacts).where(and(inArray(contacts.id, ids), eq(contacts.userId, userId)));
  await db.delete(contacts).where(and(inArray(contacts.id, ids), eq(contacts.userId, userId)));
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

export async function getAudioFiles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(audioFiles).where(eq(audioFiles.userId, userId)).orderBy(desc(audioFiles.createdAt));
}

export async function getAudioFile(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(audioFiles).where(and(eq(audioFiles.id, id), eq(audioFiles.userId, userId))).limit(1);
  return result[0];
}

export async function updateAudioFile(id: number, data: Partial<InsertAudioFile>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(audioFiles).set(data).where(eq(audioFiles.id, id));
}

export async function deleteAudioFile(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(audioFiles).where(and(eq(audioFiles.id, id), eq(audioFiles.userId, userId)));
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(campaigns).values(data);
  return { id: result[0].insertId };
}

export async function getCampaigns(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId))).limit(1);
  return result[0];
}

export async function updateCampaign(id: number, userId: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(campaigns).set(data).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
}

export async function deleteCampaign(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callLogs).where(and(eq(callLogs.campaignId, id), eq(callLogs.userId, userId)));
  await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
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

export async function getCallLogs(campaignId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callLogs).where(and(eq(callLogs.campaignId, campaignId), eq(callLogs.userId, userId))).orderBy(desc(callLogs.createdAt));
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
  const result = await db.select({ cnt: count() }).from(callLogs).where(and(eq(callLogs.campaignId, campaignId), inArray(callLogs.status, ["dialing", "ringing", "answered"])));
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
    active: (stats["dialing"] || 0) + (stats["ringing"] || 0) + (stats["answered"] || 0),
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

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalCampaigns: 0, activeCampaigns: 0, totalContacts: 0, totalCalls: 0, answeredCalls: 0, totalLists: 0 };
  const [campaignStats] = await db.select({
    total: count(),
    active: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
  }).from(campaigns).where(eq(campaigns.userId, userId));
  const [contactStats] = await db.select({ total: count() }).from(contacts).where(eq(contacts.userId, userId));
  const [listStats] = await db.select({ total: count() }).from(contactLists).where(eq(contactLists.userId, userId));
  const [callStats] = await db.select({
    total: count(),
    answered: sql<number>`SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END)`,
  }).from(callLogs).where(eq(callLogs.userId, userId));
  return {
    totalCampaigns: campaignStats?.total ?? 0,
    activeCampaigns: Number(campaignStats?.active ?? 0),
    totalContacts: contactStats?.total ?? 0,
    totalCalls: callStats?.total ?? 0,
    answeredCalls: Number(callStats?.answered ?? 0),
    totalLists: listStats?.total ?? 0,
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
  const existing = await db.select().from(dncList).where(and(eq(dncList.phoneNumber, normalized), eq(dncList.userId, data.userId))).limit(1);
  if (existing.length > 0) return { id: existing[0].id, duplicate: true };
  const result = await db.insert(dncList).values({ ...data, phoneNumber: normalized });
  return { id: result[0].insertId, duplicate: false };
}

export async function bulkAddToDnc(entries: InsertDncEntry[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (entries.length === 0) return { added: 0, duplicates: 0 };
  let added = 0;
  let duplicates = 0;
  for (const entry of entries) {
    const normalized = entry.phoneNumber.replace(/\D/g, "");
    const existing = await db.select({ id: dncList.id }).from(dncList).where(and(eq(dncList.phoneNumber, normalized), eq(dncList.userId, entry.userId))).limit(1);
    if (existing.length > 0) { duplicates++; continue; }
    await db.insert(dncList).values({ ...entry, phoneNumber: normalized });
    added++;
  }
  return { added, duplicates };
}

export async function getDncEntries(userId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(dncList).where(and(eq(dncList.userId, userId), like(dncList.phoneNumber, `%${search}%`))).orderBy(desc(dncList.createdAt)).limit(500);
  }
  return db.select().from(dncList).where(eq(dncList.userId, userId)).orderBy(desc(dncList.createdAt)).limit(500);
}

export async function removeDncEntry(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(dncList).where(and(eq(dncList.id, id), eq(dncList.userId, userId)));
}

export async function bulkRemoveDnc(ids: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  await db.delete(dncList).where(and(inArray(dncList.id, ids), eq(dncList.userId, userId)));
}

export async function isPhoneOnDnc(phoneNumber: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const normalized = phoneNumber.replace(/\D/g, "");
  const result = await db.select({ id: dncList.id }).from(dncList).where(and(eq(dncList.phoneNumber, normalized), eq(dncList.userId, userId))).limit(1);
  return result.length > 0;
}

export async function getDncPhoneNumbers(userId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select({ phoneNumber: dncList.phoneNumber }).from(dncList).where(eq(dncList.userId, userId));
  return new Set(rows.map(r => r.phoneNumber));
}

export async function getDncCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(dncList).where(eq(dncList.userId, userId));
  return result?.cnt ?? 0;
}

// ─── Caller IDs (DID Pool) ──────────────────────────────────────────────────
export async function createCallerId(data: InsertCallerId) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const normalized = data.phoneNumber.replace(/\D/g, "");
  const result = await db.insert(callerIds).values({ ...data, phoneNumber: normalized });
  return { id: result[0].insertId };
}

export async function bulkCreateCallerIds(entries: InsertCallerId[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (entries.length === 0) return { count: 0 };
  const normalized = entries.map(e => ({ ...e, phoneNumber: e.phoneNumber.replace(/\D/g, "") }));
  await db.insert(callerIds).values(normalized);
  return { count: normalized.length };
}

export async function getCallerIds(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callerIds).where(eq(callerIds.userId, userId)).orderBy(desc(callerIds.createdAt));
}

export async function getActiveCallerIds(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callerIds).where(and(eq(callerIds.userId, userId), eq(callerIds.isActive, 1))).orderBy(callerIds.callCount);
}

export async function updateCallerId(id: number, userId: number, data: Partial<InsertCallerId>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callerIds).set(data).where(and(eq(callerIds.id, id), eq(callerIds.userId, userId)));
}

export async function deleteCallerId(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callerIds).where(and(eq(callerIds.id, id), eq(callerIds.userId, userId)));
}

export async function bulkDeleteCallerIds(ids: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  await db.delete(callerIds).where(and(inArray(callerIds.id, ids), eq(callerIds.userId, userId)));
}

export async function incrementCallerIdUsage(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(callerIds).set({ callCount: sql`callCount + 1`, lastUsedAt: Date.now() }).where(eq(callerIds.id, id));
}

export async function getNextRotatingCallerId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Round-robin: pick the active caller ID with the lowest call count
  const result = await db.select().from(callerIds)
    .where(and(eq(callerIds.userId, userId), eq(callerIds.isActive, 1)))
    .orderBy(callerIds.callCount)
    .limit(1);
  return result[0];
}

// ─── Broadcast Templates ────────────────────────────────────────────────────
export async function createBroadcastTemplate(data: InsertBroadcastTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(broadcastTemplates).values(data);
  return { id: result[0].insertId };
}

export async function getBroadcastTemplates(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(broadcastTemplates).where(eq(broadcastTemplates.userId, userId)).orderBy(desc(broadcastTemplates.createdAt));
}

export async function getBroadcastTemplate(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(broadcastTemplates).where(and(eq(broadcastTemplates.id, id), eq(broadcastTemplates.userId, userId))).limit(1);
  return result[0];
}

export async function updateBroadcastTemplate(id: number, userId: number, data: Partial<InsertBroadcastTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(broadcastTemplates).set(data).where(and(eq(broadcastTemplates.id, id), eq(broadcastTemplates.userId, userId)));
}

export async function deleteBroadcastTemplate(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(broadcastTemplates).where(and(eq(broadcastTemplates.id, id), eq(broadcastTemplates.userId, userId)));
}

// ─── Analytics ──────────────────────────────────────────────────────────────
export async function getCallAnalytics(userId: number) {
  const db = await getDb();
  if (!db) return { statusBreakdown: [], dailyCalls: [], avgDuration: 0, totalDuration: 0 };

  const statusBreakdown = await db.select({
    status: callLogs.status,
    cnt: count(),
  }).from(callLogs).where(eq(callLogs.userId, userId)).groupBy(callLogs.status);

  const dailyCalls = await db.select({
    day: sql<string>`DATE(createdAt)`,
    cnt: count(),
    answered: sql<number>`SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END)`,
  }).from(callLogs).where(eq(callLogs.userId, userId)).groupBy(sql`DATE(createdAt)`).orderBy(sql`DATE(createdAt)`).limit(30);

  const [durationStats] = await db.select({
    avgDur: sql<number>`COALESCE(AVG(duration), 0)`,
    totalDur: sql<number>`COALESCE(SUM(duration), 0)`,
  }).from(callLogs).where(and(eq(callLogs.userId, userId), sql`duration IS NOT NULL AND duration > 0`));

  return {
    statusBreakdown: statusBreakdown.map(r => ({ status: r.status, count: r.cnt })),
    dailyCalls: dailyCalls.map(r => ({ day: r.day, total: r.cnt, answered: Number(r.answered || 0) })),
    avgDuration: Math.round(Number(durationStats?.avgDur ?? 0)),
    totalDuration: Number(durationStats?.totalDur ?? 0),
  };
}

export async function getCampaignAnalytics(campaignId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const campaign = await getCampaign(campaignId, userId);
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
