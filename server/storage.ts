// Self-Hosted Storage — MinIO / S3-Compatible via @aws-sdk/client-s3
// Replaces the Manus Forge Storage Proxy with direct S3 SDK calls.
// Configure via environment variables: S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_PUBLIC_URL

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ─── Configuration ──────────────────────────────────────────────────────────

function getS3Config() {
  return {
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    accessKey: process.env.S3_ACCESS_KEY || "minioadmin",
    secretKey: process.env.S3_SECRET_KEY || "",
    bucket: process.env.S3_BUCKET || "dialer-audio",
    publicUrl: (process.env.S3_PUBLIC_URL || "http://localhost:9000/dialer-audio").replace(/\/+$/, ""),
  };
}

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const config = getS3Config();
    _s3Client = new S3Client({
      endpoint: config.endpoint,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return _s3Client;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// ─── Public API (same interface as Manus version) ───────────────────────────

/**
 * Upload bytes to S3/MinIO and return the public URL.
 * The bucket must have a public-read policy so the returned URL works without signing.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getS3Config();
  const s3 = getS3Client();
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = `${config.publicUrl}/${key}`;
  return { key, url };
}

/**
 * Get the public URL for an existing object.
 * Since the bucket is public-read, no presigning is needed.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const config = getS3Config();
  const key = normalizeKey(relKey);
  const url = `${config.publicUrl}/${key}`;
  return { key, url };
}
