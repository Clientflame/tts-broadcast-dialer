/**
 * Voice Sample Cache — stores TTS voice samples in IndexedDB for instant replay.
 * Cache key: `${provider}:${voice}:${speed}`
 * Value: base64 data URI string
 * TTL: 7 days (samples don't change, so long cache is fine)
 */

const DB_NAME = "voice-sample-cache";
const STORE_NAME = "samples";
const DB_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  key: string;
  dataUri: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function buildKey(provider: string, voice: string, speed: number): string {
  return `${provider}:${voice}:${speed.toFixed(2)}`;
}

export async function getCachedSample(
  provider: string,
  voice: string,
  speed: number
): Promise<string | null> {
  try {
    const db = await openDB();
    const key = buildKey(provider, voice, speed);
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry && Date.now() - entry.createdAt < TTL_MS) {
          resolve(entry.dataUri);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedSample(
  provider: string,
  voice: string,
  speed: number,
  dataUri: string
): Promise<void> {
  try {
    const db = await openDB();
    const key = buildKey(provider, voice, speed);
    const entry: CacheEntry = { key, dataUri, createdAt: Date.now() };
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
  } catch {
    // Silently fail — caching is best-effort
  }
}

export async function clearExpiredSamples(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const entry = cursor.value as CacheEntry;
        if (Date.now() - entry.createdAt >= TTL_MS) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch {
    // Silently fail
  }
}

export async function clearAllSamples(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch {
    // Silently fail
  }
}
