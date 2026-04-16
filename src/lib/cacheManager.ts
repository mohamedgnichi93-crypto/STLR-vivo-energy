/**
 * cacheManager.ts
 * ───────────────
 * Orchestrates a two-layer cache:
 *   Layer 1 — localStorage   (fast, synchronous, 5MB limit, 5 min TTL for today's data)
 *   Layer 2 — IndexedDB      (async, 500MB+, permanent TTL for historical data)
 */

import { RawConsumptionPoint, Granularity } from "./types";
import {
  saveToIndexedDB,
  loadFromIndexedDB,
  getLastCachedDate,
  getAllEntriesForDevice,
  closeDB,
  DB_NAME
} from "./indexedDbCache";

/* ── Cache Versioning (Immediate execution at module load) ────────────────── */

const CACHE_VERSION = 'v3_phase_fix_final'

/**
 * Ensures the cache (localStorage + IndexedDB) is cleared whenever the version increments.
 * This is an ASYNC function that MUST be awaited in main.tsx before the app renders.
 */
export async function initializeCacheManager(): Promise<void> {
  try {
    const cachedVersion = localStorage.getItem('stlr_cache_version')
    if (cachedVersion !== CACHE_VERSION) {
      // 1. Close any open IndexedDB connections
      closeDB()
      
      // 2. Clear localStorage keys (excluding settings)
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        // Only clear stlr_ data, preserve settings
        if (k?.startsWith('stlr_') && 
            k !== 'stlr_language' && 
            k !== 'stlr_theme' && 
            k !== 'stlr_cache_version' &&
            k !== 'cache_cleared') { // legacy main.tsx key
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
      
      // 3. Delete IndexedDB (AWAI-TABLE)
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME)
        req.onsuccess = () => {
          resolve()
        }
        req.onerror = () => {
          resolve() // resolve anyway to avoid hanging bootstrap
        }
        req.onblocked = () => {
          setTimeout(resolve, 500)
        }
      })
      
      // 4. Set new version
      localStorage.setItem('stlr_cache_version', CACHE_VERSION)
    }
  } catch (err) {
    // Attempt to set version anyway to prevent infinite clear loops
    try { localStorage.setItem('stlr_cache_version', CACHE_VERSION) } catch { /* ignore */ }
  }
}

/* ── Re-exported for convenience ──────────────────────────────────────────── */

export type { RawConsumptionPoint };

/* ── Constants ────────────────────────────────────────────────────────────── */

const TODAY_CACHE_TTL  = 5 * 60 * 1000;          // 5 minutes

/* ── Internal helpers ─────────────────────────────────────────────────────── */

/** Cache key format: stlr_${dn}_${start}_${end}_${gran}  (mirrors api.ts) */
function cacheKey(dn: string, start: string, end: string, gran: string): string {
  return `stlr_${dn}_${start}_${end}_${gran}`;
}

interface LocalCacheEntry {
  data: RawConsumptionPoint[];
  savedAt: number;
  ttl: number;
}

/** Reads from localStorage; returns null if missing, expired, or corrupt. */
function readLocalStorage(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string
): RawConsumptionPoint[] | null {
  try {
    const key = cacheKey(dn, startDate, endDate, granularity);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry: LocalCacheEntry = JSON.parse(raw) as LocalCacheEntry;

    if (
      entry.ttl === null ||
      entry.ttl === undefined ||
      isNaN(entry.ttl) ||
      entry.ttl <= 0
    ) return null;

    if (Date.now() - entry.savedAt > entry.ttl) {
      localStorage.removeItem(key);
      return null;
    }

    if (!Array.isArray(entry.data) || entry.data.length === 0) {
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/** Writes today's data to localStorage with a 5-minute TTL. */
function writeLocalStorage(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string,
  data: RawConsumptionPoint[]
): void {
  if (!Array.isArray(data) || data.length === 0) return;
  const key   = cacheKey(dn, startDate, endDate, granularity);
  const entry: LocalCacheEntry = { data, savedAt: Date.now(), ttl: TODAY_CACHE_TTL };
  
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    // Quota exceeded — evict oldest stlr_ entries and retry once
    evictOldestLocalStorageEntries()
    try {
      localStorage.setItem(key, JSON.stringify(entry))
    } catch {
    }
  }
}

function evictOldestLocalStorageEntries(): void {
  const stlrKeys: Array<{ key: string; savedAt: number }> = []
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('stlr_')) {
      try {
        const item = JSON.parse(localStorage.getItem(key) ?? '{}')
        stlrKeys.push({ key, savedAt: item.savedAt ?? 0 })
      } catch { /* skip */ }
    }
  }
  
  // Sort by oldest first, remove half
  stlrKeys
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(0, Math.ceil(stlrKeys.length / 2))
    .forEach(({ key }) => localStorage.removeItem(key))
}

/** Returns true if endDate is strictly before the start of today (i.e. purely historical). */
function isHistoricalPeriod(endDate: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);
  return new Date(endDate) <= yesterday;
}

/** Formats a Date to YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Searches IndexedDB for any cached entry that FULLY COVERS
 * the requested date range for the same dn + granularity.
 */
async function findCoveringCacheEntry(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string
): Promise<RawConsumptionPoint[] | null> {
  const allEntries = await getAllEntriesForDevice(dn, granularity);
  
  if (!allEntries || allEntries.length === 0) return null;
  
  const coveringEntry = allEntries.find(entry => 
    entry.startDate <= startDate && entry.endDate >= endDate
  );
  
  if (!coveringEntry) return null;
  
  const sliced = coveringEntry.data.filter(point => {
    const pointDate = point.date.substring(0, 10);
    return pointDate >= startDate && pointDate <= endDate;
  });
  
  return sliced.length > 0 ? sliced : null;
}

/**
 * Checks both cache layers for existing data.
 */
export async function checkAllCaches(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: Granularity
): Promise<{ data: RawConsumptionPoint[]; fromCache: true } | null> {
  // Layer 1: localStorage
  const local = readLocalStorage(dn, startDate, endDate, granularity);
  if (local !== null) {
    return { data: local, fromCache: true };
  }

  // Layer 2: IndexedDB exact match
  const idb = await loadFromIndexedDB(dn, startDate, endDate, granularity);
  if (idb !== null) {
    return { data: idb, fromCache: true };
  }

  // Layer 3: IndexedDB sub-range detection
  const subRange = await findCoveringCacheEntry(dn, startDate, endDate, granularity);
  if (subRange !== null) {
    writeLocalStorage(dn, startDate, endDate, granularity, subRange);
    return { data: subRange, fromCache: true };
  }

  return null;
}

/**
 * Saves data to the appropriate cache layer after a successful API call.
 */
export async function saveToAppropriateCache(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: Granularity,
  data: RawConsumptionPoint[]
): Promise<void> {
  if (!Array.isArray(data) || data.length === 0) return;

  const historical = isHistoricalPeriod(endDate);

  if (historical) {
    await saveToIndexedDB(dn, startDate, endDate, granularity, data);
  } else {
    writeLocalStorage(dn, startDate, endDate, granularity, data);
  }
}

/**
 * Silently runs an incremental cache update on dashboard mount.
 */
export async function runIncrementalUpdate(
  allDevices: string[],
  granularities: Granularity[],
  fetchFn: (
    dn: string,
    start: string,
    end: string,
    gran: Granularity
  ) => Promise<RawConsumptionPoint[]>
): Promise<void> {
  const today     = new Date();
  const todayStr  = toDateStr(today);

  for (const dn of allDevices) {
    for (const gran of granularities) {
      try {
        const lastCached = await getLastCachedDate(dn, gran);

        if (!lastCached) continue;
        if (lastCached >= todayStr) continue;

        const gapStart = new Date(lastCached);
        gapStart.setDate(gapStart.getDate() + 1);
        const gapStartStr = toDateStr(gapStart);

        const data = await fetchFn(dn, gapStartStr, todayStr, gran);

        if (Array.isArray(data) && data.length > 0) {
          await saveToIndexedDB(dn, gapStartStr, todayStr, gran, data);
        }

        await new Promise<void>((r) => setTimeout(r, 1000));
      } catch (err) {
      }
    }
  }
}
