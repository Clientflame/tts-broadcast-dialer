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
  linkedAgentId: int("linkedAgentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  lastActiveAt: timestamp("lastActiveAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── User Groups ────────────────────────────────────────────────────────────
export const userGroups = mysqlTable("user_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  permissions: json("permissions").$type<Record<string, boolean>>(),
  isDefault: int("isDefault").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserGroup = typeof userGroups.$inferSelect;
export type InsertUserGroup = typeof userGroups.$inferInsert;

// ─── User Group Memberships ─────────────────────────────────────────────────
export const userGroupMemberships = mysqlTable("user_group_memberships", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserGroupMembership = typeof userGroupMemberships.$inferSelect;
export type InsertUserGroupMembership = typeof userGroupMemberships.$inferInsert;

// ─── Local Auth (Email/Password) ────────────────────────────────────────────
export const localAuth = mysqlTable("local_auth", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  isVerified: int("isVerified").default(0).notNull(),
  verificationToken: varchar("verificationToken", { length: 255 }),
  verificationTokenExpiry: bigint("verificationTokenExpiry", { mode: "number" }),
  resetToken: varchar("resetToken", { length: 255 }),
  resetTokenExpiry: bigint("resetTokenExpiry", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LocalAuth = typeof localAuth.$inferSelect;
export type InsertLocalAuth = typeof localAuth.$inferInsert;

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
  // Call routing mode
  routingMode: mysqlEnum("routingMode", ["broadcast", "live_agent", "hybrid", "voice_ai"]).default("broadcast").notNull(),
  voiceAiPromptId: int("voiceAiPromptId"), // FK to voice_ai_prompts
  // Power dialer settings
  powerDialRatio: varchar("powerDialRatio", { length: 10 }).default("1.2"), // e.g., 1.2 = 20% overdial
  wrapUpTimeSecs: int("wrapUpTimeSecs").default(30).notNull(), // seconds for agent wrap-up
  // IVR options
  ivrEnabled: int("ivrEnabled").default(0).notNull(),
  ivrOptions: json("ivrOptions").$type<Array<{ digit: string; action: string; label: string }>>(),
  // Voicemail drop (AMD)
  amdEnabled: int("amdEnabled").default(0).notNull(),
  voicemailAudioFileId: int("voicemailAudioFileId"),
  voicemailMessageText: text("voicemailMessageText"),
  // Time zone enforcement
  enforceContactTimezone: int("enforceContactTimezone").default(0).notNull(),
  contactTzWindowStart: varchar("contactTzWindowStart", { length: 5 }).default("08:00"),
  contactTzWindowEnd: varchar("contactTzWindowEnd", { length: 5 }).default("21:00"),
  // IVR Payment
  ivrPaymentEnabled: int("ivrPaymentEnabled").default(0).notNull(),
  ivrPaymentAmountField: varchar("ivrPaymentAmountField", { length: 100 }),
  ivrPaymentDigit: varchar("ivrPaymentDigit", { length: 2 }).default("1"),
  // A/B testing
  abTestGroup: varchar("abTestGroup", { length: 50 }),
  abTestVariant: varchar("abTestVariant", { length: 10 }),
  // Geo targeting
  targetStates: json("targetStates").$type<string[]>(),
  targetAreaCodes: json("targetAreaCodes").$type<string[]>(),
  useGeoCallerIds: int("useGeoCallerIds").default(0).notNull(),
  // Dynamic TTS personalization
  usePersonalizedTTS: int("usePersonalizedTTS").default(0).notNull(),
  ttsSpeed: varchar("ttsSpeed", { length: 10 }).default("1.0"),
  useDidRotation: int("useDidRotation").default(0).notNull(),
  didLabel: varchar("didLabel", { length: 100 }), // Filter DID rotation pool by label
  // Call Script (mixed TTS + recorded segments)
  scriptId: int("scriptId"),
  callbackNumber: varchar("callbackNumber", { length: 20 }),
  useDidCallbackNumber: int("useDidCallbackNumber").default(0).notNull(),
  // Predictive dialer
  predictiveAgentCount: int("predictiveAgentCount").default(1).notNull(),
  predictiveTargetWaitTime: int("predictiveTargetWaitTime").default(5).notNull(), // seconds
  predictiveMaxAbandonRate: int("predictiveMaxAbandonRate").default(3).notNull(), // percentage
  // Call Recording
  recordingEnabled: int("recordingEnabled").default(0).notNull(),
  recordingRetentionDays: int("recordingRetentionDays").default(90).notNull(),
  // Call pacing
  pacingMode: mysqlEnum("pacingMode", ["fixed", "adaptive", "predictive"]).default("fixed").notNull(),
  pacingTargetDropRate: int("pacingTargetDropRate").default(3).notNull(),
  pacingMinConcurrent: int("pacingMinConcurrent").default(1).notNull(),
  pacingMaxConcurrent: int("pacingMaxConcurrent").default(5).notNull(),
  status: mysqlEnum("status", [
    "draft",
    "scheduled",
    "running",
    "paused",
    "completed",
    "cancelled",
  ]).default("draft").notNull(),
  maxConcurrentCalls: int("maxConcurrentCalls").default(1).notNull(),
  cpsLimit: int("cpsLimit").default(3).notNull(),  // Calls per second rate limit (1-10)
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
  ivrAction: varchar("ivrAction", { length: 50 }),
  callerIdUsed: varchar("callerIdUsed", { length: 20 }),
  amdResult: varchar("amdResult", { length: 20 }), // HUMAN, MACHINE, NOTSURE, HANGUP
  voicemailDropped: int("voicemailDropped").default(0),
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
  // Health check fields
  healthStatus: mysqlEnum("healthStatus", ["unknown", "healthy", "degraded", "failed"]).default("unknown").notNull(),
  lastCheckAt: bigint("lastCheckAt", { mode: "number" }),
  lastCheckResult: text("lastCheckResult"),
  consecutiveFailures: int("consecutiveFailures").default(0).notNull(),
  autoDisabled: int("autoDisabled").default(0).notNull(),
  // Rolling call result tracking for real-time DID health
  recentCallCount: int("recentCallCount").default(0).notNull(),
  recentFailCount: int("recentFailCount").default(0).notNull(),
  failureRate: int("failureRate").default(0).notNull(), // percentage 0-100
  flaggedAt: bigint("flaggedAt", { mode: "number" }),
  flagReason: varchar("flagReason", { length: 255 }),
  cooldownUntil: bigint("cooldownUntil", { mode: "number" }),
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

// ─── Contact Scores ───────────────────────────────────────────────────────
export const contactScores = mysqlTable("contact_scores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  contactId: int("contactId").notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  score: int("score").default(0).notNull(),
  totalCalls: int("totalCalls").default(0).notNull(),
  answeredCalls: int("answeredCalls").default(0).notNull(),
  avgDuration: int("avgDuration").default(0).notNull(),
  lastCallResult: varchar("lastCallResult", { length: 50 }),
  tags: json("tags").$type<string[]>(),
  notes: text("notes"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactScore = typeof contactScores.$inferSelect;
export type InsertContactScore = typeof contactScores.$inferInsert;

// ─── Cost Settings ────────────────────────────────────────────────────────
export const costSettings = mysqlTable("cost_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  trunkCostPerMinute: varchar("trunkCostPerMinute", { length: 20 }).default("0.01").notNull(),
  ttsCostPer1kChars: varchar("ttsCostPer1kChars", { length: 20 }).default("0.015").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  avgCallDurationSecs: int("avgCallDurationSecs").default(30).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CostSetting = typeof costSettings.$inferSelect;
export type InsertCostSetting = typeof costSettings.$inferInsert;

// ─── Caller ID Regions ────────────────────────────────────────────────────
export const callerIdRegions = mysqlTable("caller_id_regions", {
  id: int("id").autoincrement().primaryKey(),
  callerIdId: int("callerIdId").notNull(),
  state: varchar("state", { length: 50 }),
  areaCode: varchar("areaCode", { length: 10 }),
});

export type CallerIdRegion = typeof callerIdRegions.$inferSelect;
export type InsertCallerIdRegion = typeof callerIdRegions.$inferInsert;
// ─── Call Queue (PBX Agent Polling) ──────────────────────────────────────
export const callQueue = mysqlTable("call_queue", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  campaignId: int("campaignId"),
  callLogId: int("callLogId"),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  channel: varchar("channel", { length: 255 }).notNull(),
  context: varchar("context", { length: 100 }).default("tts-broadcast").notNull(),
  callerIdStr: varchar("callerIdStr", { length: 255 }),
  audioUrl: text("audioUrl"),
  audioUrls: json("audioUrls").$type<string[]>(), // ordered list of audio URLs for multi-segment scripts
  audioName: varchar("audioName", { length: 255 }),
  variables: json("variables").$type<Record<string, string>>(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, claimed, dialing, completed, failed
  priority: int("priority").default(5).notNull(), // 1=highest, 10=lowest; quicktest=1
  claimedBy: varchar("claimedBy", { length: 100 }), // PBX agent ID
  claimedAt: bigint("claimedAt", { mode: "number" }),
  result: varchar("result", { length: 50 }), // answered, busy, no-answer, failed, congestion
  callDuration: int("callDuration"), // call duration in seconds (for answered calls)
  resultDetails: json("resultDetails").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallQueueItem = typeof callQueue.$inferSelect;
export type InsertCallQueueItem = typeof callQueue.$inferInsert;

// ─── PBX Agents ──────────────────────────────────────────────────────────
export const pbxAgents = mysqlTable("pbx_agents", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agentId", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }),
  apiKey: varchar("apiKey", { length: 255 }).notNull(),
  lastHeartbeat: bigint("lastHeartbeat", { mode: "number" }),
  status: varchar("status", { length: 20 }).default("offline").notNull(), // online, offline
  activeCalls: int("activeCalls").default(0),
  maxCalls: int("maxCalls").default(5),
  // Auto-throttle fields
  effectiveMaxCalls: int("effectiveMaxCalls"),  // null = use maxCalls (no throttle active)
  throttleReason: text("throttleReason"),
  throttleStartedAt: bigint("throttleStartedAt", { mode: "number" }),
  throttleCarrierErrors: int("throttleCarrierErrors").default(0).notNull(),
  cpsLimit: int("cpsLimit").default(3),  // Calls per second rate limit (1-10)
  cpsPacingMs: int("cpsPacingMs").default(1000),  // Milliseconds between calls (1000=1/s, 2000=1/2s, 3000=1/3s)
  ipAddress: varchar("ipAddress", { length: 45 }),
  capabilities: json("capabilities").$type<{ voiceAiBridge?: boolean; ariConnected?: boolean; [key: string]: any }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PbxAgent = typeof pbxAgents.$inferSelect;
export type InsertPbxAgent = typeof pbxAgents.$inferInsert;

// ─── Call Scripts (Mixed TTS + Recorded Audio) ─────────────────────────────
export type ScriptSegment = {
  id: string;           // unique segment ID (uuid)
  type: "tts" | "recorded";
  position: number;     // order in the script (0-based)
  // TTS segment fields
  text?: string;        // TTS text with merge fields: {{first_name}}, {{last_name}}, {{callback_number}}
  voice?: string;       // TTS voice ID (OpenAI or Google)
  provider?: "openai" | "google"; // TTS provider
  speed?: string;       // TTS speed (e.g., "1.0")
  // Recorded segment fields
  audioFileId?: number; // reference to audio_files table
  audioName?: string;   // display name of the recorded audio
  audioUrl?: string;    // S3 URL of the recorded audio
};

export const callScripts = mysqlTable("call_scripts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  callbackNumber: varchar("callbackNumber", { length: 20 }),
  segments: json("segments").$type<ScriptSegment[]>().notNull(),
  // Constraints
  maxRecordedSegments: int("maxRecordedSegments").default(2).notNull(),
  // Metadata
  estimatedDuration: int("estimatedDuration"), // estimated total duration in seconds
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallScript = typeof callScripts.$inferSelect;
export type InsertCallScript = typeof callScripts.$inferInsert;

// ─── Health Check Schedule ──────────────────────────────────────────────────
export const healthCheckSchedule = mysqlTable("health_check_schedule", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  enabled: int("enabled").default(0).notNull(), // 0 = disabled, 1 = enabled
  intervalHours: int("intervalHours").default(24).notNull(), // how often to run (in hours)
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type HealthCheckSchedule = typeof healthCheckSchedule.$inferSelect;
export type InsertHealthCheckSchedule = typeof healthCheckSchedule.$inferInsert;


// ─── Throttle History Log ──────────────────────────────────────────────────
export const throttleHistory = mysqlTable("throttle_history", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agentId", { length: 64 }).notNull(),
  agentName: varchar("agentName", { length: 255 }),
  eventType: mysqlEnum("eventType", ["throttle_triggered", "ramp_up", "full_recovery", "manual_reset"]).notNull(),
  previousMaxCalls: int("previousMaxCalls"),
  newMaxCalls: int("newMaxCalls"),
  carrierErrors: int("carrierErrors").default(0),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ThrottleHistory = typeof throttleHistory.$inferSelect;
export type InsertThrottleHistory = typeof throttleHistory.$inferInsert;

// ─── App Settings (key-value store for admin-configurable settings) ──────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  description: varchar("description", { length: 500 }),
  isSecret: int("isSecret").default(0).notNull(), // 1 = mask value in API responses
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

// ─── Payments (IVR Payment Integration) ─────────────────────────────────────
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  campaignId: int("campaignId"),
  callLogId: int("callLogId"),
  contactId: int("contactId"),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  amount: int("amount").notNull(), // amount in cents
  currency: varchar("currency", { length: 10 }).default("usd").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "succeeded", "failed", "refunded"]).default("pending").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  paymentMethod: varchar("paymentMethod", { length: 50 }), // card, ach
  last4: varchar("last4", { length: 4 }),
  errorMessage: text("errorMessage"),
  metadata: json("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;


// ─── Live Agents (SIP Extensions for Predictive Dialer) ─────────────────────
export const liveAgents = mysqlTable("live_agents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sipExtension: varchar("sipExtension", { length: 20 }).notNull(),
  sipPassword: varchar("sipPassword", { length: 255 }),
  email: varchar("email", { length: 320 }),
  status: mysqlEnum("status", [
    "offline",
    "available",
    "ringing",
    "on_call",
    "wrap_up",
    "on_break",
    "reserved",
  ]).default("offline").notNull(),
  currentCallId: int("currentCallId"),
  currentCampaignId: int("currentCampaignId"),
  statusChangedAt: bigint("statusChangedAt", { mode: "number" }),
  skills: json("skills").$type<string[]>(),
  priority: int("priority").default(5).notNull(),
  maxConcurrentCalls: int("maxConcurrentCalls").default(1).notNull(),
  totalCallsHandled: int("totalCallsHandled").default(0).notNull(),
  totalTalkTime: int("totalTalkTime").default(0).notNull(),
  totalWrapTime: int("totalWrapTime").default(0).notNull(),
  avgHandleTime: int("avgHandleTime").default(0).notNull(),
  lastLoginAt: bigint("lastLoginAt", { mode: "number" }),
  lastLogoutAt: bigint("lastLogoutAt", { mode: "number" }),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LiveAgent = typeof liveAgents.$inferSelect;
export type InsertLiveAgent = typeof liveAgents.$inferInsert;

// ─── Agent Sessions (Login/Logout/Break Tracking) ────────────────────────────
export const agentSessions = mysqlTable("agent_sessions", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  userId: int("userId").notNull(),
  sessionType: mysqlEnum("sessionType", ["login", "logout", "break_start", "break_end", "status_change"]).notNull(),
  previousStatus: varchar("previousStatus", { length: 20 }),
  newStatus: varchar("newStatus", { length: 20 }),
  campaignId: int("campaignId"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  durationSecs: int("durationSecs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentSession = typeof agentSessions.$inferSelect;
export type InsertAgentSession = typeof agentSessions.$inferInsert;

// ─── Agent Call Log (Per-Agent Disposition & Wrap-Up) ────────────────────────
export const agentCallLog = mysqlTable("agent_call_log", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  userId: int("userId").notNull(),
  campaignId: int("campaignId"),
  callQueueId: int("callQueueId"),
  callLogId: int("callLogId"),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  contactName: varchar("contactName", { length: 200 }),
  connectedAt: bigint("connectedAt", { mode: "number" }),
  disconnectedAt: bigint("disconnectedAt", { mode: "number" }),
  talkDuration: int("talkDuration"),
  holdDuration: int("holdDuration"),
  wrapUpDuration: int("wrapUpDuration"),
  disposition: mysqlEnum("disposition", [
    "connected",
    "promise_to_pay",
    "payment_made",
    "callback_requested",
    "wrong_number",
    "deceased",
    "disputed",
    "refused_to_pay",
    "no_contact",
    "left_message",
    "other",
  ]).default("connected"),
  wrapUpNotes: text("wrapUpNotes"),
  wrapUpCode: varchar("wrapUpCode", { length: 50 }),
  wasTransferred: int("wasTransferred").default(0),
  transferredTo: varchar("transferredTo", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentCallLogEntry = typeof agentCallLog.$inferSelect;
export type InsertAgentCallLogEntry = typeof agentCallLog.$inferInsert;

// ─── Campaign Agent Assignments ──────────────────────────────────────────────
export const campaignAgentAssignments = mysqlTable("campaign_agent_assignments", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  agentId: int("agentId").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
});

export type CampaignAgentAssignment = typeof campaignAgentAssignments.$inferSelect;
export type InsertCampaignAgentAssignment = typeof campaignAgentAssignments.$inferInsert;

// ─── Call Recordings ────────────────────────────────────────────────────────
export const callRecordings = mysqlTable("call_recordings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  campaignId: int("campaignId"),
  callLogId: int("callLogId"),
  callQueueId: int("callQueueId"),
  agentId: int("agentId"), // live agent who handled the call (null for broadcast)
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  contactName: varchar("contactName", { length: 200 }),
  // Recording file info
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: text("s3Url").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 50 }).default("audio/wav").notNull(),
  fileSize: int("fileSize"), // bytes
  duration: int("duration"), // seconds
  // Recording metadata
  recordingType: mysqlEnum("recordingType", ["full", "agent_only", "caller_only", "voicemail"]).default("full").notNull(),
  asteriskChannel: varchar("asteriskChannel", { length: 255 }),
  mixMonitorId: varchar("mixMonitorId", { length: 255 }),
  // Status
  status: mysqlEnum("status", ["recording", "uploading", "ready", "failed", "deleted"]).default("recording").notNull(),
  errorMessage: text("errorMessage"),
  // Compliance
  consentObtained: int("consentObtained").default(0).notNull(), // 1 = consent recorded
  retainUntil: bigint("retainUntil", { mode: "number" }), // retention policy date
  deletedAt: bigint("deletedAt", { mode: "number" }),
  // Timestamps
  recordingStartedAt: bigint("recordingStartedAt", { mode: "number" }),
  recordingEndedAt: bigint("recordingEndedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallRecording = typeof callRecordings.$inferSelect;
export type InsertCallRecording = typeof callRecordings.$inferInsert;


// ─── Voice AI Prompts ─────────────────────────────────────────────────────────
export const voiceAiPrompts = mysqlTable("voice_ai_prompts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt").notNull(),
  openingMessage: text("openingMessage"), // What the AI says first
  voice: varchar("voice", { length: 50 }).default("coral").notNull(), // OpenAI Realtime voice
  language: varchar("language", { length: 10 }).default("en").notNull(),
  temperature: varchar("temperature", { length: 10 }).default("0.7"),
  maxTurnDuration: int("maxTurnDuration").default(120).notNull(), // seconds
  maxConversationDuration: int("maxConversationDuration").default(300).notNull(), // seconds
  silenceTimeout: int("silenceTimeout").default(10).notNull(), // seconds before hang up on silence
  // Compliance
  requireAiDisclosure: int("requireAiDisclosure").default(1).notNull(),
  requireMiniMiranda: int("requireMiniMiranda").default(0).notNull(),
  miniMirandaText: text("miniMirandaText"),
  // Escalation triggers
  escalateOnDtmf: varchar("escalateOnDtmf", { length: 5 }).default("#"),
  escalateKeywords: json("escalateKeywords").$type<string[]>(), // e.g., ["speak to human", "supervisor", "lawyer"]
  // Function tools enabled
  enabledTools: json("enabledTools").$type<string[]>(), // e.g., ["account_lookup", "schedule_callback", "process_payment"]
  isDefault: int("isDefault").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VoiceAiPrompt = typeof voiceAiPrompts.$inferSelect;
export type InsertVoiceAiPrompt = typeof voiceAiPrompts.$inferInsert;

// ─── Voice AI Conversations ───────────────────────────────────────────────────
export const voiceAiConversations = mysqlTable("voice_ai_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  campaignId: int("campaignId"),
  callLogId: int("callLogId"),
  callQueueId: int("callQueueId"),
  promptId: int("promptId"), // which voice AI prompt was used
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  contactName: varchar("contactName", { length: 200 }),
  // Conversation data
  transcript: json("transcript").$type<Array<{ role: string; content: string; timestamp: number; functionCall?: { name: string; args: string; result?: string } }>>(),
  summary: text("summary"), // AI-generated conversation summary
  sentiment: varchar("sentiment", { length: 20 }), // positive, neutral, negative, hostile
  // Outcomes
  disposition: mysqlEnum("disposition", [
    "completed",
    "promise_to_pay",
    "payment_made",
    "callback_scheduled",
    "dispute_filed",
    "wrong_number",
    "refused",
    "escalated_to_agent",
    "no_response",
    "voicemail",
    "hung_up",
    "error",
  ]).default("completed"),
  paymentAmount: varchar("paymentAmount", { length: 20 }),
  callbackDate: bigint("callbackDate", { mode: "number" }),
  // Function calls made during conversation
  functionCalls: json("functionCalls").$type<Array<{ name: string; args: Record<string, unknown>; result: unknown; timestamp: number }>>(),
  // Metrics
  turnCount: int("turnCount").default(0), // number of back-and-forth turns
  aiTokensUsed: int("aiTokensUsed").default(0),
  estimatedCost: varchar("estimatedCost", { length: 20 }), // e.g., "0.45"
  duration: int("duration"), // seconds
  // Status
  status: mysqlEnum("status", ["active", "completed", "error", "escalated"]).default("active").notNull(),
  errorMessage: text("errorMessage"),
  // Escalation
  escalatedToAgentId: int("escalatedToAgentId"),
  escalationReason: varchar("escalationReason", { length: 255 }),
  // Timestamps
  startedAt: bigint("startedAt", { mode: "number" }),
  endedAt: bigint("endedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceAiConversation = typeof voiceAiConversations.$inferSelect;
export type InsertVoiceAiConversation = typeof voiceAiConversations.$inferInsert;

// ─── Supervisor Actions (Whisper/Barge/Monitor) ───────────────────────────────
export const supervisorActions = mysqlTable("supervisor_actions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // supervisor user ID
  agentId: int("agentId").notNull(), // target agent
  callLogId: int("callLogId"),
  actionType: mysqlEnum("actionType", ["monitor", "whisper", "barge", "disconnect"]).notNull(),
  channel: varchar("channel", { length: 255 }), // Asterisk channel being supervised
  startedAt: bigint("startedAt", { mode: "number" }),
  endedAt: bigint("endedAt", { mode: "number" }),
  duration: int("duration"), // seconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupervisorAction = typeof supervisorActions.$inferSelect;
export type InsertSupervisorAction = typeof supervisorActions.$inferInsert;
// ─── Agent Assist: Coaching Templates ────────────────────────────────────────
export const coachingTemplates = mysqlTable("coaching_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [
    "objection_handling",
    "compliance",
    "closing",
    "rapport_building",
    "payment_negotiation",
    "de_escalation",
    "general",
  ]).default("general").notNull(),
  triggers: json("triggers").$type<string[]>(),
  suggestions: json("suggestions").$type<{
    title: string;
    body: string;
    priority: "high" | "medium" | "low";
  }[]>(),
  isActive: int("isActive").default(1).notNull(),
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CoachingTemplate = typeof coachingTemplates.$inferSelect;
export type InsertCoachingTemplate = typeof coachingTemplates.$inferInsert;

// ─── Agent Assist: Sessions ──────────────────────────────────────────────────
export const assistSessions = mysqlTable("assist_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  agentId: int("agentId").notNull(),
  callLogId: int("callLogId"),
  campaignId: int("campaignId"),
  contactId: int("contactId"),
  contactName: varchar("contactName", { length: 200 }),
  contactPhone: varchar("contactPhone", { length: 20 }),
  status: mysqlEnum("status", ["active", "paused", "ended"]).default("active").notNull(),
  callStage: mysqlEnum("callStage", [
    "greeting",
    "verification",
    "discovery",
    "presentation",
    "objection",
    "negotiation",
    "closing",
    "wrap_up",
  ]).default("greeting").notNull(),
  sentimentScore: varchar("sentimentScore", { length: 10 }),
  sentimentLabel: mysqlEnum("sentimentLabel", ["very_negative", "negative", "neutral", "positive", "very_positive"]).default("neutral"),
  totalSuggestions: int("totalSuggestions").default(0).notNull(),
  acceptedSuggestions: int("acceptedSuggestions").default(0).notNull(),
  dismissedSuggestions: int("dismissedSuggestions").default(0).notNull(),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  endedAt: bigint("endedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AssistSession = typeof assistSessions.$inferSelect;
export type InsertAssistSession = typeof assistSessions.$inferInsert;

// ─── Agent Assist: Suggestions ───────────────────────────────────────────────
export const assistSuggestions = mysqlTable("assist_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  templateId: int("templateId"),
  type: mysqlEnum("type", [
    "talk_track",
    "objection_handle",
    "compliance_alert",
    "next_action",
    "sentiment_alert",
    "closing_cue",
    "de_escalation",
    "info_card",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  triggerContext: text("triggerContext"),
  status: mysqlEnum("status", ["pending", "accepted", "dismissed", "expired"]).default("pending").notNull(),
  respondedAt: bigint("respondedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AssistSuggestion = typeof assistSuggestions.$inferSelect;
export type InsertAssistSuggestion = typeof assistSuggestions.$inferInsert;

// ─── Voice AI Bridge Events (Uptime/Downtime History) ───────────────────────
export const bridgeEvents = mysqlTable("bridge_events", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agentId", { length: 100 }).notNull(),
  agentName: varchar("agentName", { length: 255 }),
  eventType: mysqlEnum("eventType", ["online", "offline", "installed", "install_failed", "updated"]).notNull(),
  details: text("details"), // additional context (e.g., install output, error message)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BridgeEvent = typeof bridgeEvents.$inferSelect;
export type InsertBridgeEvent = typeof bridgeEvents.$inferInsert;

// ─── Call Script Version History ────────────────────────────────────────────
export const scriptVersions = mysqlTable("script_versions", {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  version: int("version").notNull(), // auto-incrementing version number per script
  userId: int("userId").notNull(), // who made the change
  userName: varchar("userName", { length: 255 }),
  changeType: mysqlEnum("changeType", ["created", "edited", "reverted"]).default("edited").notNull(),
  changeSummary: text("changeSummary"), // human-readable summary of what changed
  // Snapshot of the script at this version
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  callbackNumber: varchar("callbackNumber", { length: 20 }),
  segments: json("segments").$type<ScriptSegment[]>().notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScriptVersion = typeof scriptVersions.$inferSelect;
export type InsertScriptVersion = typeof scriptVersions.$inferInsert;

// ─── Campaign Templates ─────────────────────────────────────────────────────
export const campaignTemplates = mysqlTable("campaign_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Snapshot of campaign config
  config: json("config").$type<{
    type?: string;
    scriptId?: number;
    listId?: number;
    callerIdStrategy?: string;
    callerIdGroup?: string;
    cpsLimit?: number;
    retryAttempts?: number;
    retryDelay?: number;
    timezone?: string;
    timeWindowStart?: string;
    timeWindowEnd?: string;
    usePersonalizedTTS?: number;
    ttsSpeed?: string;
    ivrEnabled?: number;
    ivrConfig?: any;
    voiceAiEnabled?: number;
    voiceAiPersonaId?: number;
  }>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignTemplate = typeof campaignTemplates.$inferSelect;
export type InsertCampaignTemplate = typeof campaignTemplates.$inferInsert;

// ─── Campaign Schedules ─────────────────────────────────────────────────────
export const campaignSchedules = mysqlTable("campaign_schedules", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  userId: int("userId").notNull(),
  scheduledAt: bigint("scheduledAt", { mode: "number" }).notNull(), // UTC timestamp ms
  status: mysqlEnum("status", ["pending", "launched", "cancelled", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  launchedAt: bigint("launchedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignSchedule = typeof campaignSchedules.$inferSelect;
export type InsertCampaignSchedule = typeof campaignSchedules.$inferInsert;

// ─── Bridge Health Checks (Proactive SSH-based) ────────────────────────────
export const bridgeHealthChecks = mysqlTable("bridge_health_checks", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agentId", { length: 255 }),
  checkType: mysqlEnum("checkType", ["heartbeat", "ssh_probe", "manual"]).default("heartbeat").notNull(),
  status: mysqlEnum("status", ["healthy", "degraded", "offline", "error"]).default("healthy").notNull(),
  responseTimeMs: int("responseTimeMs"),
  details: text("details"),
  errorMessage: text("errorMessage"),
  checkedAt: bigint("checkedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BridgeHealthCheck = typeof bridgeHealthChecks.$inferSelect;
export type InsertBridgeHealthCheck = typeof bridgeHealthChecks.$inferInsert;

// ─── Client Deployments (Admin Dashboard) ──────────────────────────────────
export const clientDeployments = mysqlTable("client_deployments", {
  id: int("id").autoincrement().primaryKey(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  serverIp: varchar("serverIp", { length: 45 }).notNull(), // IPv4 or IPv6
  domain: varchar("domain", { length: 255 }),
  version: varchar("version", { length: 50 }),
  environment: mysqlEnum("environment", ["production", "staging", "development"]).default("production").notNull(),
  status: mysqlEnum("status", ["online", "offline", "degraded", "maintenance", "provisioning"]).default("provisioning").notNull(),
  lastHeartbeat: bigint("lastHeartbeat", { mode: "number" }),
  sslExpiry: bigint("sslExpiry", { mode: "number" }),
  diskUsagePercent: int("diskUsagePercent"),
  memoryUsageMb: int("memoryUsageMb"),
  cpuUsagePercent: int("cpuUsagePercent"),
  pbxHost: varchar("pbxHost", { length: 255 }),
  pbxAgentVersion: varchar("pbxAgentVersion", { length: 50 }),
  bridgeStatus: mysqlEnum("bridgeStatus", ["connected", "disconnected", "unknown"]).default("unknown").notNull(),
  notes: text("notes"),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 20 }),
  installedAt: bigint("installedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientDeployment = typeof clientDeployments.$inferSelect;
export type InsertClientDeployment = typeof clientDeployments.$inferInsert;
