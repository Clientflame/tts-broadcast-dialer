/**
 * Audio Proxy — serves stored audio files through the Express server.
 * 
 * This solves the problem where S3/MinIO URLs are not directly accessible
 * from the browser (e.g., internal Docker network endpoints, missing Caddy
 * proxy rules, or presigned URL expiration).
 * 
 * The proxy fetches audio from whatever storage backend is configured
 * (forge, s3, local) and streams it to the browser as audio/mpeg.
 * 
 * Usage: GET /api/audio-proxy/<storage-key>
 * Example: GET /api/audio-proxy/script-audio/static/abc123.mp3
 */

import { Router } from "express";
import { resolveStorageUrl, storageReadLocal, getActiveStorageMode } from "../storage";

export const audioProxyRouter = Router();

/**
 * GET /api/audio-proxy/*
 * Proxies audio files from storage to the browser.
 * No authentication required — audio keys are unguessable (MD5 hashes).
 */
audioProxyRouter.get("/*", async (req: any, res: any) => {
  try {
    // Extract the storage key from the URL path (everything after /api/audio-proxy/)
    const storageKey = req.params[0] as string;
    if (!storageKey) {
      return res.status(400).json({ error: "Missing storage key" });
    }

    // Security: only allow audio file extensions
    const allowedExtensions = [".mp3", ".wav", ".ogg", ".webm", ".m4a"];
    const ext = storageKey.substring(storageKey.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return res.status(403).json({ error: "Only audio files can be proxied" });
    }

    // Security: prevent directory traversal
    if (storageKey.includes("..") || storageKey.startsWith("/")) {
      return res.status(403).json({ error: "Invalid storage key" });
    }

    const mode = getActiveStorageMode();

    // For local storage, read directly from disk (fastest path)
    if (mode === "local") {
      const buffer = await storageReadLocal(storageKey);
      if (!buffer) {
        return res.status(404).json({ error: "Audio file not found" });
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Accept-Ranges", "bytes");
      return res.send(buffer);
    }

    // For forge or s3 mode, fetch via the resolved URL
    // resolveStorageUrl() handles converting relative URLs to absolute for local,
    // and returns absolute URLs as-is for forge/s3
    const { storageGet } = await import("../storage");
    const { url } = await storageGet(storageKey);
    const fetchUrl = resolveStorageUrl(url);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      console.error(`[AudioProxy] Failed to fetch ${storageKey}: ${response.status} ${response.statusText}`);
      return res.status(response.status === 404 ? 404 : 502).json({
        error: response.status === 404 ? "Audio file not found" : "Failed to fetch audio from storage",
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Determine content type from the response or extension
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.setHeader("Accept-Ranges", "bytes");
    res.send(audioBuffer);
  } catch (err: any) {
    console.error("[AudioProxy] Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Convert a storage URL (from storagePut) to a proxy URL that the browser can access.
 * 
 * - If the URL is already a relative /api/storage/... path (local mode), return as-is
 *   (the browser can access it directly via the same origin).
 * - If the URL is an absolute URL (forge/s3), extract the storage key and return
 *   a proxy URL like /api/audio-proxy/<key>.
 * - This ensures the browser ALWAYS gets a same-origin URL it can play.
 */
export function toProxyUrl(storageUrl: string, storageKey: string): string {
  // Local storage URLs are already relative and accessible from the browser
  if (storageUrl.startsWith("/api/storage/")) {
    return storageUrl;
  }

  // For forge/s3 URLs, use the proxy endpoint with the known storage key
  return `/api/audio-proxy/${storageKey}`;
}

/**
 * Convert an array of storage URLs to browser-accessible proxy URLs.
 * 
 * This is the main function used by the preview endpoint. It handles:
 * - Local storage URLs (/api/storage/...) → returned as-is
 * - Forge URLs (https://...forge.../path) → extracts key from URL path
 * - S3/MinIO URLs (https://...endpoint/bucket/key) → extracts key from URL path
 * 
 * The key extraction is best-effort: we look for known prefixes like
 * "script-audio/", "tts-audio/", "campaign-audio/", etc.
 */
export function toBrowserAudioUrls(urls: string[]): string[] {
  return urls.map((url) => {
    // Already a relative URL (local mode) — browser can access directly
    if (url.startsWith("/api/storage/") || url.startsWith("/api/audio-proxy/")) {
      return url;
    }

    // Extract the storage key from the URL
    // Known prefixes that our storage uses:
    const knownPrefixes = [
      "script-audio/",
      "script-stitched/",
      "tts-audio/",
      "campaign-audio/",
      "voicemail/",
      "recordings/",
    ];

    for (const prefix of knownPrefixes) {
      const idx = url.indexOf(prefix);
      if (idx !== -1) {
        const key = url.substring(idx);
        // Remove any query string (presigned URL params)
        const cleanKey = key.split("?")[0];
        return `/api/audio-proxy/${cleanKey}`;
      }
    }

    // Fallback: try to extract path after the last known bucket/domain segment
    // For forge URLs like https://api.manus.im/v1/storage/download?path=script-audio/...
    try {
      const parsed = new URL(url);
      const pathParam = parsed.searchParams.get("path");
      if (pathParam) {
        return `/api/audio-proxy/${pathParam}`;
      }
      // For S3 URLs: https://endpoint/bucket/key — take everything after bucket
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2) {
        // Skip the first part (bucket name) and join the rest
        const key = pathParts.slice(1).join("/");
        if (key.endsWith(".mp3") || key.endsWith(".wav")) {
          return `/api/audio-proxy/${key}`;
        }
      }
    } catch {
      // Not a valid URL — return as-is
    }

    // If we can't extract a key, return the original URL
    // (this shouldn't happen in practice)
    console.warn(`[AudioProxy] Could not extract storage key from URL: ${url.substring(0, 80)}...`);
    return url;
  });
}
