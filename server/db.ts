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
  contactScores, InsertContactScore,
  costSettings, InsertCostSetting,
  callerIdRegions, InsertCallerIdRegion,
  userGroups, InsertUserGroup,
  userGroupMemberships, InsertUserGroupMembership,
  localAuth, InsertLocalAuth,
  callScripts, InsertCallScript,
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

// ─── Contact Scores ─────────────────────────────────────────────────────────
export async function upsertContactScore(data: InsertContactScore) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(contactScores)
    .where(and(eq(contactScores.contactId, data.contactId), eq(contactScores.userId, data.userId))).limit(1);
  if (existing.length > 0) {
    await db.update(contactScores).set(data).where(eq(contactScores.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(contactScores).values(data);
  return { id: result[0].insertId };
}

export async function getContactScores(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contactScores).where(eq(contactScores.userId, userId)).orderBy(desc(contactScores.score));
}

export async function getContactScore(contactId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactScores)
    .where(and(eq(contactScores.contactId, contactId), eq(contactScores.userId, userId))).limit(1);
  return result[0];
}

export async function updateContactScore(id: number, data: Partial<InsertContactScore>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contactScores).set(data).where(eq(contactScores.id, id));
}

export async function recalculateContactScore(contactId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  const logs = await db.select().from(callLogs)
    .where(and(eq(callLogs.contactId, contactId), eq(callLogs.userId, userId)));
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
    userId, contactId, phoneNumber, score, totalCalls, answeredCalls, avgDuration,
    lastCallResult: lastLog?.status ?? null,
  });
}

// ─── Cost Settings ──────────────────────────────────────────────────────────
export async function getCostSettings(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(costSettings).where(eq(costSettings.userId, userId)).limit(1);
  return result[0];
}

export async function upsertCostSettings(userId: number, data: Partial<InsertCostSetting>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(costSettings).where(eq(costSettings.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(costSettings).set(data).where(eq(costSettings.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(costSettings).values({ userId, ...data } as InsertCostSetting);
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

export async function getCallerIdsByRegion(userId: number, state?: string, areaCode?: string) {
  const db = await getDb();
  if (!db) return [];
  // Get caller IDs that match the region or have no region assigned (global)
  const allCallerIdsList = await db.select().from(callerIds)
    .where(and(eq(callerIds.userId, userId), eq(callerIds.isActive, 1)));
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
export async function cloneCampaign(id: number, userId: number, newName: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const original = await getCampaign(id, userId);
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
export async function getABTestResults(abTestGroup: string, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const groupCampaigns = await db.select().from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.abTestGroup, abTestGroup)));
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
export async function getCallLogsForExport(campaignId: number, userId: number) {
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
  }).from(callLogs).where(and(eq(callLogs.campaignId, campaignId), eq(callLogs.userId, userId)))
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

// Get a single contact by ID
export async function getContact(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Call Queue (PBX Agent Polling) ─────────────────────────────────────────
import { callQueue, InsertCallQueueItem, pbxAgents, InsertPbxAgent } from "../drizzle/schema";
import { lt, isNull, asc } from "drizzle-orm";

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

export async function updatePbxAgentHeartbeat(agentId: string, activeCalls?: number) {
  const db = await getDb();
  if (!db) return;
  const data: Partial<InsertPbxAgent> = { lastHeartbeat: Date.now(), status: "online" };
  if (activeCalls !== undefined) data.activeCalls = activeCalls;
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

export async function deletePbxAgentByAgentId(agentId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(pbxAgents).where(eq(pbxAgents.agentId, agentId));
}

// ─── Call Scripts ──────────────────────────────────────────────────────────
export async function createCallScript(data: InsertCallScript) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(callScripts).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getCallScripts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callScripts).where(eq(callScripts.userId, userId)).orderBy(desc(callScripts.createdAt));
}

export async function getCallScript(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callScripts)
    .where(and(eq(callScripts.id, id), eq(callScripts.userId, userId)))
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

export async function updateCallScript(id: number, userId: number, data: Partial<InsertCallScript>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(callScripts).set(data).where(and(eq(callScripts.id, id), eq(callScripts.userId, userId)));
}

export async function deleteCallScript(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(callScripts).where(and(eq(callScripts.id, id), eq(callScripts.userId, userId)));
}
