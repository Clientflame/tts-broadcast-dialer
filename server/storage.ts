// Storage abstraction layer
// Uses Manus Forge storage proxy when credentials are available,
// falls back to local filesystem storage for self-hosted deployments.

import { ENV } from './_core/env';
import path from 'path';
import fs from 'fs/promises';

// ─── Storage Mode Detection ─────────────────────────────────────────────────

type StorageMode = 'forge' | 'local';

function getStorageMode(): StorageMode {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (baseUrl && apiKey) return 'forge';
  return 'local';
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
 * - Forge URLs are already absolute (https://...) — returned as-is.
 * - Local storage URLs are relative (/api/storage/...) — prepend localhost.
 * Use this whenever server code needs to fetch() a stored file.
 */
export function resolveStorageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url; // Already absolute (Forge or external)
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
  return localPut(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const mode = getStorageMode();
  if (mode === 'forge') {
    return forgeGet(relKey);
  }
  return localGet(relKey);
}
