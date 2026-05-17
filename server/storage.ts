// Storage abstraction layer
// Priority: Manus Forge → S3-compatible (Cloudflare R2, AWS S3, MinIO) → Local filesystem
// For multi-install deployments, use S3-compatible storage (Cloudflare R2 recommended for zero egress fees).

import { ENV } from './_core/env';
import path from 'path';
import fs from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Storage Mode Detection ─────────────────────────────────────────────────

type StorageMode = 'forge' | 's3' | 'local';

function getStorageMode(): StorageMode {
  // Priority 1: Manus Forge (platform-managed S3)
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return 'forge';
  // Priority 2: Generic S3-compatible (Cloudflare R2, AWS S3, MinIO, etc.)
  if (ENV.s3Endpoint && ENV.s3AccessKey && ENV.s3SecretKey && ENV.s3Bucket) return 's3';
  // Fallback: Local filesystem (not recommended for production with remote PBX)
  return 'local';
}

// Log storage mode on module load
const _storageMode = getStorageMode();
console.log(`[Storage] Mode: ${_storageMode}${_storageMode === 's3' ? ` (endpoint: ${ENV.s3Endpoint})` : ''}`);

// ─── S3-Compatible Storage (Cloudflare R2, AWS S3, MinIO) ──────────────────

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    if (!ENV.s3Endpoint || !ENV.s3AccessKey || !ENV.s3SecretKey) {
      throw new Error('S3 credentials not configured (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY required)');
    }
    _s3Client = new S3Client({
      region: 'auto', // Cloudflare R2 uses 'auto'
      endpoint: ENV.s3Endpoint,
      credentials: {
        accessKeyId: ENV.s3AccessKey,
        secretAccessKey: ENV.s3SecretKey,
      },
      // Force path-style for R2 compatibility
      forcePathStyle: true,
    });
  }
  return _s3Client;
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = normalizeKey(relKey);

  const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

  await client.send(new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    // R2 doesn't support ACL, but this is harmless for AWS S3
    // ACL: 'public-read',
  }));

  // Build the public URL
  const url = getS3PublicUrl(key);
  return { key, url };
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  // If we have a public URL configured, use it directly (no signing needed)
  if (ENV.s3PublicUrl) {
    return { key, url: getS3PublicUrl(key) };
  }

  // Otherwise generate a presigned URL (valid for 1 hour)
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });
  const url = await getSignedUrl(client, command, { expiresIn: 3600 });
  return { key, url };
}

/**
 * Build the public URL for an S3 object.
 * Uses S3_PUBLIC_URL if configured (e.g., custom domain or R2 public bucket URL).
 * Falls back to constructing from the endpoint.
 */
function getS3PublicUrl(key: string): string {
  if (ENV.s3PublicUrl) {
    const base = ENV.s3PublicUrl.replace(/\/+$/, '');
    return `${base}/${key}`;
  }
  // Fallback: construct from endpoint (works for R2 public buckets)
  // R2 public URL format: https://pub-{hash}.r2.dev/{key}
  // or custom domain: https://storage.yourdomain.com/{key}
  const endpoint = ENV.s3Endpoint.replace(/\/+$/, '');
  return `${endpoint}/${ENV.s3Bucket}/${key}`;
}

// ─── Forge Storage (Manus Platform) ─────────────────────────────────────────

type StorageConfig = { baseUrl: string; apiKey: string };

function getForgeConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Storage proxy credentials missing");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function forgeGet(relKey: string): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

// ─── Local Filesystem Storage (Self-Hosted) ─────────────────────────────────

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), 'data', 'storage');

// For local storage, we use relative URLs (/api/storage/...) so they work
// from any browser regardless of the server's IP/domain.
// The browser resolves them against the current origin automatically.

async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(LOCAL_STORAGE_DIR, key);
  const dir = path.dirname(filePath);

  await fs.mkdir(dir, { recursive: true });

  if (typeof data === 'string') {
    await fs.writeFile(filePath, data, 'utf-8');
  } else {
    await fs.writeFile(filePath, data);
  }

  const url = `/api/storage/${encodeURI(key)}`;
  return { key, url };
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: `/api/storage/${encodeURI(key)}`,
  };
}

// ─── Express Route for Local Storage ────────────────────────────────────────

import type { Express } from 'express';

export function mountLocalStorageRoute(app: Express): void {
  if (getStorageMode() !== 'local') return;

  console.log('[Storage] Using local filesystem storage at:', LOCAL_STORAGE_DIR);

  // Use a regex-based route to capture everything after /api/storage/
  app.get(/^\/api\/storage\/(.+)/, async (req: any, res: any) => {
    try {
      const relPath = (req.params as string[])[0];
      if (!relPath) {
        res.status(400).send('Missing file path');
        return;
      }

      // Prevent directory traversal
      const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(LOCAL_STORAGE_DIR, safePath);

      // Ensure the resolved path is within LOCAL_STORAGE_DIR
      if (!filePath.startsWith(LOCAL_STORAGE_DIR)) {
        res.status(403).send('Forbidden');
        return;
      }

      await fs.access(filePath);

      // Determine content type from extension
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.webm': 'audio/webm',
        '.m4a': 'audio/mp4',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const fileBuffer = await fs.readFile(filePath);
      res.send(fileBuffer);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        res.status(404).send('File not found');
      } else {
        console.error('[Storage] Error serving file:', err);
        res.status(500).send('Internal server error');
      }
    }
  });
}

// ─── URL Resolution Helper ──────────────────────────────────────────────────

/**
 * Resolve a storage URL for server-side fetch.
 * - Forge/S3 URLs are already absolute (https://...) — returned as-is.
 * - Local storage URLs are relative (/api/storage/...) — prepend localhost.
 * Use this whenever server code needs to fetch() a stored file.
 */
export function resolveStorageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url; // Already absolute (Forge, S3, or external)
  }
  // Relative URL from local storage — resolve against localhost
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}${url}`;
}

/**
 * Read a locally-stored file directly from disk (bypasses HTTP).
 * Returns null if the file doesn't exist or storage mode is not local.
 * Use this for server-side operations that need the raw bytes without HTTP overhead.
 */
export async function storageReadLocal(relKey: string): Promise<Buffer | null> {
  if (getStorageMode() !== 'local') return null;
  try {
    const key = normalizeKey(relKey);
    const filePath = path.join(LOCAL_STORAGE_DIR, key);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const mode = getStorageMode();
  if (mode === 'forge') {
    return forgePut(relKey, data, contentType);
  }
  if (mode === 's3') {
    return s3Put(relKey, data, contentType);
  }
  return localPut(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const mode = getStorageMode();
  if (mode === 'forge') {
    return forgeGet(relKey);
  }
  if (mode === 's3') {
    return s3Get(relKey);
  }
  return localGet(relKey);
}

/** Expose current storage mode for diagnostics */
export function getActiveStorageMode(): StorageMode {
  return getStorageMode();
}
