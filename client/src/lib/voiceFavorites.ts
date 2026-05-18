/**
 * Voice Favorites — stores user's preferred voices in localStorage.
 * Favorites appear at the top of voice dropdown lists.
 */

const STORAGE_KEY = "voice-favorites";

export interface VoiceFavorite {
  id: string;        // e.g. "alloy" or "en-US-Wavenet-C"
  provider: "openai" | "google";
  addedAt: number;
}

function loadFavorites(): VoiceFavorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VoiceFavorite[];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: VoiceFavorite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Silently fail
  }
}

export function getFavorites(): VoiceFavorite[] {
  return loadFavorites();
}

export function isFavorite(voiceId: string, provider: "openai" | "google"): boolean {
  return loadFavorites().some(f => f.id === voiceId && f.provider === provider);
}

export function toggleFavorite(voiceId: string, provider: "openai" | "google"): boolean {
  const favorites = loadFavorites();
  const idx = favorites.findIndex(f => f.id === voiceId && f.provider === provider);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    saveFavorites(favorites);
    return false; // Removed
  } else {
    favorites.push({ id: voiceId, provider, addedAt: Date.now() });
    saveFavorites(favorites);
    return true; // Added
  }
}

export function getFavoriteIds(provider: "openai" | "google"): string[] {
  return loadFavorites()
    .filter(f => f.provider === provider)
    .map(f => f.id);
}

/**
 * Sort a voice list with favorites at the top.
 * Preserves original order within favorites and non-favorites groups.
 */
export function sortWithFavorites<T extends { id: string }>(
  voices: T[],
  provider: "openai" | "google"
): T[] {
  const favIds = new Set(getFavoriteIds(provider));
  const favs = voices.filter(v => favIds.has(v.id));
  const rest = voices.filter(v => !favIds.has(v.id));
  return [...favs, ...rest];
}
