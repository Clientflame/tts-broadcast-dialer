import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Contact Lists ───────────────────────────────────────────────────────────
export const contactLists = mysqlTable("contact_lists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  contactCount: int("contactCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactList = typeof contactLists.$inferSelect;
export type InsertContactList = typeof contactLists.$inferInsert;

// ─── Contacts ────────────────────────────────────────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull(),
  userId: int("userId").notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  firstName: varchar("firstName", { length: 100 }),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }),
  company: varchar("company", { length: 255 }),
  state: varchar("state", { length: 50 }),
  databaseName: varchar("databaseName", { length: 255 }),
  customFields: json("customFields").$type<Record<string, string>>(),
  status: mysqlEnum("status", ["active", "inactive", "dnc"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Audio Files ─────────────────────────────────────────────────────────────
export const audioFiles = mysqlTable("audio_files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  text: text("text").notNull(),
  voice: varchar("voice", { length: 50 }).notNull(),
  s3Url: text("s3Url"),
  s3Key: varchar("s3Key", { length: 512 }),
  duration: int("duration"),
  fileSize: int("fileSize"),
  status: mysqlEnum("status", ["generating", "ready", "failed"]).default("generating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AudioFile = typeof audioFiles.$inferSelect;
export type InsertAudioFile = typeof audioFiles.$inferInsert;

// ─── Campaigns ───────────────────────────────────────────────────────────────
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  contactListId: int("contactListId").notNull(),
  audioFileId: int("audioFileId"),
  messageText: text("messageText"),
  voice: varchar("voice", { length: 50 }).default("alloy"),
  callerIdNumber: varchar("callerIdNumber", { length: 20 }),
  callerIdName: varchar("callerIdName", { length: 100 }),
  status: mysqlEnum("status", [
    "draft",
    "scheduled",
    "running",
    "paused",
    "completed",
    "cancelled",
  ]).default("draft").notNull(),
  maxConcurrentCalls: int("maxConcurrentCalls").default(1).notNull(),
  retryAttempts: int("retryAttempts").default(0).notNull(),
  retryDelay: int("retryDelay").default(300).notNull(),
  scheduledAt: bigint("scheduledAt", { mode: "number" }),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York"),
  timeWindowStart: varchar("timeWindowStart", { length: 5 }).default("09:00"),
  timeWindowEnd: varchar("timeWindowEnd", { length: 5 }).default("21:00"),
  totalContacts: int("totalContacts").default(0).notNull(),
  completedCalls: int("completedCalls").default(0).notNull(),
  answeredCalls: int("answeredCalls").default(0).notNull(),
  failedCalls: int("failedCalls").default(0).notNull(),
  startedAt: bigint("startedAt", { mode: "number" }),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ─── Call Logs ───────────────────────────────────────────────────────────────
export const callLogs = mysqlTable("call_logs", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  userId: int("userId").notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  contactName: varchar("contactName", { length: 200 }),
  status: mysqlEnum("status", [
    "pending",
    "dialing",
    "ringing",
    "answered",
    "busy",
    "no-answer",
    "failed",
    "completed",
    "cancelled",
  ]).default("pending").notNull(),
  duration: int("duration"),
  attempt: int("attempt").default(1).notNull(),
  asteriskChannel: varchar("asteriskChannel", { length: 255 }),
  asteriskCallId: varchar("asteriskCallId", { length: 255 }),
  errorMessage: text("errorMessage"),
  dtmfResponse: varchar("dtmfResponse", { length: 10 }),
  startedAt: bigint("startedAt", { mode: "number" }),
  answeredAt: bigint("answeredAt", { mode: "number" }),
  endedAt: bigint("endedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

// ─── Audit Logs ──────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  resourceId: int("resourceId"),
  details: json("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Do Not Call (DNC) List ─────────────────────────────────────────────────
export const dncList = mysqlTable("dnc_list", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  reason: varchar("reason", { length: 255 }),
  source: mysqlEnum("source", ["manual", "import", "opt-out", "complaint"]).default("manual").notNull(),
  addedBy: varchar("addedBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DncEntry = typeof dncList.$inferSelect;
export type InsertDncEntry = typeof dncList.$inferInsert;

// ─── DID / Caller ID Pool ──────────────────────────────────────────────────
export const callerIds = mysqlTable("caller_ids", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  label: varchar("label", { length: 255 }),
  isActive: int("isActive").default(1).notNull(),
  callCount: int("callCount").default(0).notNull(),
  lastUsedAt: bigint("lastUsedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallerId = typeof callerIds.$inferSelect;
export type InsertCallerId = typeof callerIds.$inferInsert;

// ─── Broadcast Templates ───────────────────────────────────────────────────
export const broadcastTemplates = mysqlTable("broadcast_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  messageText: text("messageText"),
  voice: varchar("voice", { length: 50 }).default("alloy"),
  maxConcurrentCalls: int("maxConcurrentCalls").default(1),
  retryAttempts: int("retryAttempts").default(0),
  retryDelay: int("retryDelay").default(300),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York"),
  timeWindowStart: varchar("timeWindowStart", { length: 5 }).default("09:00"),
  timeWindowEnd: varchar("timeWindowEnd", { length: 5 }).default("21:00"),
  useDidRotation: int("useDidRotation").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BroadcastTemplate = typeof broadcastTemplates.$inferSelect;
export type InsertBroadcastTemplate = typeof broadcastTemplates.$inferInsert;