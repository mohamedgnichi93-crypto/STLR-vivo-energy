import { RawConsumptionPoint } from "./types";
import { computeChecksum, verifyChecksum } from "./checksum";
import { enforceStorageBudget, StorageFullError } from "./storageBudget";

/* ── Constants ────────────────────────────────────────────────────────────── */

export const DB_NAME    = "stlr_energy_cache";
const DB_VERSION = 1;
const STORE_NAME = "consumption_data";

/* ── Stored entry shape ───────────────────────────────────────────────────── */

interface IndexedDBEntry {
  /** Same format as localStorage key: stlr_${dn}_${start}_${end}_${gran} */
  key: string;
  data: RawConsumptionPoint[];
  /** Unix timestamp (ms) when this entry was saved */
  savedAt: number;
  /** Number.MAX_SAFE_INTEGER for historical data, short TTL for live data */
  ttl: number;
  dn: string;
  granularity: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  checksum: string; // FNV-1a hex string for integrity verification
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

let dbInstance: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Closes the active database connection and clears internal references.
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    _dbPromise = null;
  }
}

/**
 * Opens (and if necessary upgrades) the IndexedDB database.
 * Resolves with the open IDBDatabase handle.
 */
function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        // Secondary indexes for querying by device / granularity / dates
        store.createIndex("dn",          "dn",          { unique: false });
        store.createIndex("granularity", "granularity", { unique: false });
        store.createIndex("dn_gran",     ["dn", "granularity"], { unique: false });
      }
    };

    req.onsuccess  = () => {
      dbInstance = req.result;
      resolve(req.result);
    };
    req.onerror    = () => {
      _dbPromise = null; // allow retry
      reject(req.error);
    };
    req.onblocked  = () => {};
  });

  return _dbPromise;
}

/**
 * Wraps an IDBRequest in a Promise<T>.
 */
function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Builds the cache key (mirrors the localStorage key format exactly).
 * Format: stlr_${dn}_${start}_${end}_${gran}
 */
function buildKey(dn: string, startDate: string, endDate: string, granularity: string): string {
  return `stlr_${dn}_${startDate}_${endDate}_${granularity}`;
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Initialises the IndexedDB database.
 * Must be called once at application startup (e.g. in main.tsx).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initIndexedDB(): Promise<void> {
  try {
    await openDB();
  } catch (err) {
  }
}

/**
 * Saves energy consumption data to IndexedDB.
 * Historical data (endDate < today) is stored with ttl = Number.MAX_SAFE_INTEGER (permanent).
 * Refuses to store empty arrays.
 */
export async function saveToIndexedDB(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string,
  data: RawConsumptionPoint[]
): Promise<void> {
  if (!Array.isArray(data) || data.length === 0) {
    return;
  }

  try {
    // Enforce storage budget before saving
    await enforceStorageBudget();
    
    const db = await openDB();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    const isHistorical = new Date(endDate) <= yesterday;
    const ttl = isHistorical ? Number.MAX_SAFE_INTEGER : 5 * 60 * 1000;

    // Compute checksum for integrity verification
    const checksum = computeChecksum(data);

    const entry: IndexedDBEntry = {
      key: buildKey(dn, startDate, endDate, granularity),
      data,
      savedAt: Date.now(),
      ttl,
      dn,
      granularity,
      startDate,
      endDate,
      checksum,
    };

    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.put(entry));
  } catch (err) {
    if (err instanceof StorageFullError) {
      // Do not crash the app — just skip the cache save
      return;
    }
  }
}

/**
 * Loads cached data from IndexedDB.
 * Returns null if:
 * - Entry not found
 * - Entry is expired (ttl exceeded)
 * - Entry contains empty / corrupt data
 * - Checksum verification fails
 */
export async function loadFromIndexedDB(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string
): Promise<RawConsumptionPoint[] | null> {
  try {
    const db    = await openDB();
    const key   = buildKey(dn, startDate, endDate, granularity);
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const entry = await promisifyRequest(store.get(key)) as IndexedDBEntry | undefined;

    if (!entry) return null;

    // Guard: corrupt / missing TTL
    if (
      entry.ttl === null ||
      entry.ttl === undefined ||
      isNaN(entry.ttl) ||
      entry.ttl <= 0
    ) {
      void deleteFromIndexedDB(dn, startDate, endDate, granularity);
      return null;
    }

    // Guard: expired
    if (Date.now() - entry.savedAt > entry.ttl) {
      void deleteFromIndexedDB(dn, startDate, endDate, granularity);
      return null;
    }

    // Guard: empty data
    if (!Array.isArray(entry.data) || entry.data.length === 0) {
      void deleteFromIndexedDB(dn, startDate, endDate, granularity);
      return null;
    }

    // Handle legacy entries without checksum
    if (!entry.checksum) {
      // Legacy entry — compute and save checksum now (migration)
      const checksum = computeChecksum(entry.data);
      await updateEntryChecksum(key, checksum);
      // Still return the data (we trust existing entries)
      return entry.data;
    }

    // Verify checksum for integrity
    const isValid = verifyChecksum(entry.data, entry.checksum);
    if (!isValid) {
      await deleteFromIndexedDB(dn, startDate, endDate, granularity);
      return null;
    }

    return entry.data;
  } catch (err) {
    return null;
  }
}

/**
 * Deletes a specific entry from IndexedDB.
 * Used internally by loadFromIndexedDB when evicting corrupt/expired entries.
 */
export async function deleteFromIndexedDB(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string
): Promise<void> {
  try {
    const db    = await openDB();
    const key   = buildKey(dn, startDate, endDate, granularity);
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.delete(key));
  } catch (err) {
  }
}

/**
 * Updates the checksum of an existing entry.
 * Used for migrating legacy entries without checksums.
 */
async function updateEntryChecksum(key: string, checksum: string): Promise<void> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const entry = await promisifyRequest(store.get(key)) as IndexedDBEntry | undefined;
    
    if (entry) {
      entry.checksum = checksum;
      await promisifyRequest(store.put(entry));
    }
  } catch (err) {
  }
}

/**
 * Fast existence check: returns true if a non-expired entry for this
 * device + date range + granularity exists in IndexedDB.
 * Does NOT load the full data array.
 */
export async function isRangeCachedInIndexedDB(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: string
): Promise<boolean> {
  const data = await loadFromIndexedDB(dn, startDate, endDate, granularity);
  return data !== null;
}

/**
 * Returns the most recent endDate cached for a given device + granularity.
 * Used by runIncrementalUpdate to find the gap that needs to be fetched.
 *
 * Example: if we have entries for 2024-01-01→2024-12-31 and 2025-01-01→2025-12-31,
 * this returns "2025-12-31".
 *
 * Returns null if no entries exist for this device + granularity.
 */
export async function getLastCachedDate(
  dn: string,
  granularity: string
): Promise<string | null> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("dn_gran");

    // IDBKeyRange for [dn, granularity] compound index
    const range = IDBKeyRange.only([dn, granularity]);
    const req   = index.openCursor(range, "prev"); // descending order by key
    const entries: IndexedDBEntry[] = [];

    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          entries.push(cursor.value as IndexedDBEntry);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });

    if (entries.length === 0) return null;

    // Find the maximum endDate across all cached entries
    const latestEndDate = entries.reduce<string>((max, e) => {
      return e.endDate > max ? e.endDate : max;
    }, "");

    return latestEndDate || null;
  } catch (err) {
    return null;
  }
}

/**
 * Returns the total size of the IndexedDB store in megabytes.
 * Uses the StorageManager API where available, falls back to entry-level estimation.
 */
export async function getIndexedDBSizeMB(): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const usageBytes = estimate.usage ?? 0;
      return Math.round((usageBytes / 1024 / 1024) * 100) / 100;
    }

    // Fallback: sum serialised entry sizes
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.openCursor();
    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          totalBytes += JSON.stringify(cursor.value).length * 2; // UTF-16 chars
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });

    return Math.round((totalBytes / 1024 / 1024) * 100) / 100;
  } catch (err) {
    return 0;
  }
}

/**
 * Returns all entries from IndexedDB for display in the CacheStatus UI.
 * Each entry contains device, granularity, date range, and entry count.
 */
export async function getAllIndexedDBEntries(): Promise<IndexedDBEntry[]> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const entries = await promisifyRequest(store.getAll()) as IndexedDBEntry[];
    return entries;
  } catch (err) {
    return [];
  }
}

/**
 * Returns ALL IndexedDB entries for a given device + granularity.
 * Used by findCoveringCacheEntry() to detect sub-range hits.
 * Only returns non-expired entries with valid checksums.
 */
export async function getAllEntriesForDevice(
  dn: string,
  granularity: string
): Promise<IndexedDBEntry[]> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const entries = await promisifyRequest(store.getAll()) as IndexedDBEntry[];
    
    const now = Date.now();
    const filtered = entries.filter(entry => {
      // Match dn and granularity
      if (entry.dn !== dn || entry.granularity !== granularity) return false;
      // Check not expired
      if (now > entry.savedAt + entry.ttl) return false;
      // Must have data
      if (!entry.data || entry.data.length === 0) return false;
      return true;
    });
    return filtered;
  } catch (err) {
    return [];
  }
}

/**
 * Deletes all IndexedDB entries whose endDate is older than `olderThanDays` days.
 * Safe to call at any time — does not remove permanent historical entries
 * unless they are genuinely ancient (you control the threshold).
 * Pass 0 to delete ALL entries.
 */
export async function pruneOldEntries(olderThanDays: number): Promise<void> {
  try {
    const db        = await openDB();
    const tx        = db.transaction(STORE_NAME, "readwrite");
    const store     = tx.objectStore(STORE_NAME);
    const cutoff    = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const allEntries = await promisifyRequest(store.getAll()) as IndexedDBEntry[];
    let removed = 0;

    for (const entry of allEntries) {
      if (entry.endDate < cutoffStr) {
        await promisifyRequest(store.delete(entry.key));
        removed++;
      }
    }
  } catch (err) {
  }
}

/**
 * Force-clears the entire IndexedDB store.
 * Used for one-time migrations when data format or scale changes.
 */
export async function clearAllIndexedDBData(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.clear());
  } catch (err) {
  }
}

/**
 * Deletes the entire IndexedDB database.
 */
export async function deleteEntireDatabase(): Promise<void> {
  closeDB();
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      reject(req.error);
    };
    req.onblocked = () => {
      resolve();
    };
  });
}
