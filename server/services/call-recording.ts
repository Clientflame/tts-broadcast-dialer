/**
 * Call Recording Service
 * Manages call recording lifecycle: start MixMonitor, upload to S3, track in DB
 */
import { getDb } from "../db";
import { callRecordings } from "../../drizzle/schema";
import { eq, and, desc, sql, gte, lte, like } from "drizzle-orm";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StartRecordingParams {
  userId: number;
  campaignId?: number;
  callLogId?: number;
  callQueueId?: number;
  agentId?: number;
  phoneNumber: string;
  contactName?: string;
  asteriskChannel?: string;
  recordingType?: "full" | "agent_only" | "caller_only" | "voicemail";
}

export interface UploadRecordingParams {
  recordingId: number;
  fileBuffer: Buffer;
  fileName: string;
  mimeType?: string;
  duration?: number;
}

export interface RecordingFilter {
  userId: number;
  campaignId?: number;
  agentId?: number;
  phoneNumber?: string;
  recordingType?: string;
  status?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

// ─── Start Recording ────────────────────────────────────────────────────────

export async function startRecording(params: StartRecordingParams) {
  const db = (await getDb())!;
  const now = Date.now();
  const fileId = nanoid(12);
  const fileName = `recording-${fileId}.wav`;
  const s3Key = `recordings/${params.userId}/${params.campaignId || "quick"}/${fileName}`;

  const [result] = await db.insert(callRecordings).values({
    userId: params.userId,
    campaignId: params.campaignId || null,
    callLogId: params.callLogId || null,
    callQueueId: params.callQueueId || null,
    agentId: params.agentId || null,
    phoneNumber: params.phoneNumber,
    contactName: params.contactName || null,
    s3Key,
    s3Url: "", // will be set after upload
    fileName,
    mimeType: "audio/wav",
    recordingType: params.recordingType || "full",
    asteriskChannel: params.asteriskChannel || null,
    status: "recording",
    consentObtained: 0,
    recordingStartedAt: now,
    createdAt: new Date(),
  });

  return {
    recordingId: result.insertId,
    s3Key,
    fileName,
    // MixMonitor filename for Asterisk (local path on PBX)
    mixMonitorFile: `/var/spool/asterisk/monitor/${fileName}`,
  };
}

// ─── Upload Recording to S3 ────────────────────────────────────────────────

export async function uploadRecording(params: UploadRecordingParams) {
  const db = (await getDb())!;

  // Get the recording record
  const [recording] = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.id, params.recordingId))
    .limit(1);

  if (!recording) {
    throw new Error(`Recording ${params.recordingId} not found`);
  }

  // Update status to uploading
  await db
    .update(callRecordings)
    .set({ status: "uploading" })
    .where(eq(callRecordings.id, params.recordingId));

  try {
    // Upload to S3
    const { url } = await storagePut(
      recording.s3Key,
      params.fileBuffer,
      params.mimeType || "audio/wav"
    );

    // Update record with S3 URL and metadata
    await db
      .update(callRecordings)
      .set({
        s3Url: url,
        fileName: params.fileName || recording.fileName,
        mimeType: params.mimeType || "audio/wav",
        fileSize: params.fileBuffer.length,
        duration: params.duration || null,
        status: "ready",
        recordingEndedAt: Date.now(),
      })
      .where(eq(callRecordings.id, params.recordingId));

    return { url, s3Key: recording.s3Key };
  } catch (error: any) {
    await db
      .update(callRecordings)
      .set({
        status: "failed",
        errorMessage: error.message || "Upload failed",
      })
      .where(eq(callRecordings.id, params.recordingId));
    throw error;
  }
}

// ─── Complete Recording (from PBX agent report) ─────────────────────────────

export async function completeRecording(
  recordingId: number,
  s3Url: string,
  duration?: number,
  fileSize?: number
) {
  const db = (await getDb())!;
  await db
    .update(callRecordings)
    .set({
      s3Url,
      status: "ready",
      duration: duration || null,
      fileSize: fileSize || null,
      recordingEndedAt: Date.now(),
    })
    .where(eq(callRecordings.id, recordingId));
}

// ─── Mark Recording Failed ──────────────────────────────────────────────────

export async function failRecording(recordingId: number, errorMessage: string) {
  const db = (await getDb())!;
  await db
    .update(callRecordings)
    .set({
      status: "failed",
      errorMessage,
      recordingEndedAt: Date.now(),
    })
    .where(eq(callRecordings.id, recordingId));
}

// ─── List Recordings ────────────────────────────────────────────────────────

export async function listRecordings(filter: RecordingFilter) {
  const db = (await getDb())!;
  const conditions: any[] = [eq(callRecordings.userId, filter.userId)];

  if (filter.campaignId) {
    conditions.push(eq(callRecordings.campaignId, filter.campaignId));
  }
  if (filter.agentId) {
    conditions.push(eq(callRecordings.agentId, filter.agentId));
  }
  if (filter.phoneNumber) {
    conditions.push(like(callRecordings.phoneNumber, `%${filter.phoneNumber}%`));
  }
  if (filter.recordingType) {
    conditions.push(eq(callRecordings.recordingType, filter.recordingType as any));
  }
  if (filter.status) {
    conditions.push(eq(callRecordings.status, filter.status as any));
  }
  if (filter.dateFrom) {
    conditions.push(gte(callRecordings.recordingStartedAt, filter.dateFrom));
  }
  if (filter.dateTo) {
    conditions.push(lte(callRecordings.recordingStartedAt, filter.dateTo));
  }

  const limit = filter.limit || 50;
  const offset = filter.offset || 0;

  const rows = await db
    .select()
    .from(callRecordings)
    .where(and(...conditions))
    .orderBy(desc(callRecordings.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(callRecordings)
    .where(and(...conditions));

  return {
    recordings: rows,
    total: countResult?.count || 0,
    limit,
    offset,
  };
}

// ─── Get Single Recording ───────────────────────────────────────────────────

export async function getRecording(recordingId: number) {
  const db = (await getDb())!;
  const [recording] = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.id, recordingId))
    .limit(1);
  return recording || null;
}

// ─── Delete Recording ───────────────────────────────────────────────────────

export async function deleteRecording(recordingId: number) {
  const db = (await getDb())!;
  await db
    .update(callRecordings)
    .set({
      status: "deleted",
      deletedAt: Date.now(),
    })
    .where(eq(callRecordings.id, recordingId));
}

// ─── Get Recording Stats ────────────────────────────────────────────────────

export async function getRecordingStats(userId: number) {
  const db = (await getDb())!;

  const [stats] = await db
    .select({
      totalRecordings: sql<number>`count(*)`,
      readyRecordings: sql<number>`sum(case when status = 'ready' then 1 else 0 end)`,
      totalDuration: sql<number>`coalesce(sum(duration), 0)`,
      totalSize: sql<number>`coalesce(sum(${callRecordings.fileSize}), 0)`,
      avgDuration: sql<number>`coalesce(avg(duration), 0)`,
    })
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.userId, userId),
        sql`${callRecordings.status} != 'deleted'`
      )
    );

  return {
    totalRecordings: Number(stats?.totalRecordings || 0),
    readyRecordings: Number(stats?.readyRecordings || 0),
    totalDuration: Number(stats?.totalDuration || 0),
    totalSize: Number(stats?.totalSize || 0),
    avgDuration: Math.round(Number(stats?.avgDuration || 0)),
  };
}

// ─── Apply Retention Policy ─────────────────────────────────────────────────

export async function applyRetentionPolicy(userId: number) {
  const db = (await getDb())!;
  const now = Date.now();

  // Find recordings past their retention date
  const expired = await db
    .select({ id: callRecordings.id })
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.userId, userId),
        eq(callRecordings.status, "ready"),
        sql`${callRecordings.retainUntil} IS NOT NULL AND ${callRecordings.retainUntil} <= ${now}`
      )
    );

  if (expired.length === 0) return { deleted: 0 };

  for (const rec of expired) {
    await deleteRecording(rec.id);
  }

  return { deleted: expired.length };
}
