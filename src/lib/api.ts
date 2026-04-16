import { RawConsumptionPoint, ConsumptionPoint, DeviceConsumption, Granularity, Phase, extractPhaseValue } from "./types";
import { requestQueue } from "./requestQueue";
import { checkAllCaches, saveToAppropriateCache } from "./cacheManager";

export type { ConsumptionPoint, DeviceConsumption, Granularity, Phase, RawConsumptionPoint };

/* ── Constants ────────────────────────────────────────────────────────────── */

const toKwh = (wh: number): number => wh;
const PROXY_URL   = "http://localhost:3001/api/device";
const TIMEOUT_MS  = 30000;
const DELAY_MS    = 1000; // 1 s between devices

/* ── Persistent localStorage cache (legacy layer) ── */

interface CacheEntry {
  data: RawConsumptionPoint[];
  savedAt: number;
  ttl: number;
}

function buildCacheKey(dn: string, start: string, end: string, gran: string): string {
  return `stlr_${dn}_${start}_${end}_${gran}`;
}

/** Removes all `stlr_*` keys from localStorage only. */
export function clearApiCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("stlr_")) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/**
 * Scans all stlr_* localStorage entries and removes those that are:
 * - Empty arrays
 * - Null/invalid TTL (legacy Infinity entries)
 * - Malformed JSON
 * Safe to call at any time — does not affect valid cached data.
 */
export function cleanCorruptedCache(): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("stlr_")) keys.push(k);
    }
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const entry = JSON.parse(raw) as CacheEntry;
        const isCorrupt =
          !Array.isArray(entry.data) ||
          entry.data.length === 0 ||
          entry.ttl === null ||
          entry.ttl === undefined ||
          isNaN(entry.ttl) ||
          entry.ttl <= 0;
        if (isCorrupt) {
          localStorage.removeItem(k);
          removed++;
        }
      } catch {
        localStorage.removeItem(k);
        removed++;
      }
    }
  } catch { /* ignore */ }
  return removed;
}

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface FetchResult {
  data: RawConsumptionPoint[];
  fromCache?: boolean;
  /** True when the API returned HTTP 429 (rate limit). Data will be empty. */
  rateLimited?: boolean;
}

/* ── In-flight deduplication guard ───────────────────────────────────────── */

/**
 * Keys currently being fetched from the API.
 * Prevents duplicate simultaneous requests for the same device + date range.
 */
const inFlightRequests = new Set<string>();

/* ── Fetch helpers ────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * IMPORTANT: WattNow API Phase Data
 * 
 * The WattNow API endpoint confirms that per-phase consumption data (L1/L2/L3)
 * is available when using the correct backend URL (including userId).
 * 
 * This parser maps various possible field names (phaseA, phase_a, energyA, etc.)
 * to an internal RawConsumptionPoint format.
 * 
 * Current behavior: real values are used if available (sum > 0), otherwise fallback to 0.
 * To help debug API changes, sample keys are logged when processing new data.
 */
function parseRawItems(json: unknown): RawConsumptionPoint[] {
  const root = json as Record<string, unknown>;
  const rawItems: unknown[] = root?.data
    ? (Array.isArray(root.data) ? root.data : [root.data])
    : Array.isArray(json) ? (json as unknown[]) : [];

  const flat: Record<string, any>[] = [];
  for (const item of rawItems) {
    const it = item as Record<string, any>;
    if (Array.isArray(it?.data)) {
      flat.push(...(it.data as Record<string, any>[]));
    } else {
      flat.push(it);
    }
  }

  if (flat.length === 0) return [];

  return flat.map(item => {
    const v = toKwh(Number(item.value ?? item.consumption ?? item.energy ?? item.total ?? 0));
    
    // Try to get real phase data from API response
    const pA = toKwh(Number(
      item.phaseA ?? item.phase_a ?? item.PhaseA ?? 
      item.energyA ?? item.energy_a ?? item.l1 ?? item.L1 ?? 0
    ));
    const pB = toKwh(Number(
      item.phaseB ?? item.phase_b ?? item.PhaseB ?? 
      item.energyB ?? item.energy_b ?? item.l2 ?? item.L2 ?? 0
    ));
    const pC = toKwh(Number(
      item.phaseC ?? item.phase_c ?? item.PhaseC ?? 
      item.energyC ?? item.energy_c ?? item.l3 ?? item.L3 ?? 0
    ));
    
    // If phases sum to something > 0 → real data detected
    const hasRealPhases = (pA + pB + pC) > 0;
    
    return {
      date: String(item.date ?? item.timestamp ?? ""),
      phaseA: hasRealPhases ? pA : 0,
      phaseB: hasRealPhases ? pB : 0,
      phaseC: hasRealPhases ? pC : 0,
      total: v
    };
  });
}

/* ── Public API ───────────────────────────────────────────────────────────── */

export async function fetchDeviceRawData(
  dn: string, startDate: string, endDate: string,
  granularity: Granularity = "daily",
  forceRefresh: boolean = false
): Promise<FetchResult> {
  const cacheKey = buildCacheKey(dn, startDate, endDate, granularity);

  // 1. Cache-first — return immediately if valid
  if (!forceRefresh) {
    const cached = await checkAllCaches(dn, startDate, endDate, granularity);
    if (cached !== null) {
      return { data: cached.data, fromCache: true };
    }
  }

  // 2. In-flight deduplication
  if (inFlightRequests.has(cacheKey)) {
    while (inFlightRequests.has(cacheKey)) {
      await sleep(100);
    }
    // After waiting, another identical request just finished and cached it!
    if (!forceRefresh) {
      const cachedAfterWait = await checkAllCaches(dn, startDate, endDate, granularity);
      if (cachedAfterWait !== null) {
        return { data: cachedAfterWait.data, fromCache: true };
      }
    }
  }
  
  inFlightRequests.add(cacheKey);

  const interval = granularity === "hourly" ? "hourly" : "daily";
  const url = `${PROXY_URL}/${interval}/${dn}/${startDate}/${endDate}`;

  try {
    // 3. API call via request queue
    const result = await requestQueue.enqueue({
      id: cacheKey,
      dn,
      startDate,
      endDate,
      granularity,
      priority: 'normal',
      execute: async () => {
        const response = await fetchWithTimeout(url);
        // Handle 429 — return empty data, move on
        if (response.status === 429) {
          return { data: [], fromCache: false, rateLimited: true };
        }

        // Handle other HTTP errors
        if (!response.ok) {
          throw new Error(`API error [${response.status}] for ${dn}`);
        }

        // Success
        const json = await response.json();
        const data = parseRawItems(json);
        
        return { data, fromCache: false };
      }
    });

    // 4. Cache successful responses
    if (!result.fromCache && result.data.length > 0) {
      await saveToAppropriateCache(dn, startDate, endDate, granularity, result.data);
    }

    return result;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Checks cache for ALL devices simultaneously using Promise.all.
 * Returns a Map of DN → cached result (or null if not cached).
 * This runs all cache checks in parallel (~60ms total vs ~420ms+ sequential).
 */
export async function checkAllDeviceCachesInParallel(
  dns: string[],
  startDate: string,
  endDate: string,
  granularity: Granularity
): Promise<Map<string, FetchResult | null>> {
  const results = await Promise.all(
    dns.map(async (dn) => {
      const cached = await checkAllCaches(dn, startDate, endDate, granularity);
      if (cached !== null) {
        return [dn, { data: cached.data, fromCache: true }] as [string, FetchResult];
      }
      return [dn, null] as [string, null];
    })
  );
  return new Map(results);
}

/**
 * Fetches all devices with an optimized strategy:
 * 1. Checks all caches in parallel (instant return for cached data).
 * 2. Fetches missing devices from the API sequentially to honor rate limits.
 * 3. Only sleeps between actual API calls.
 */
export async function fetchAllDevicesSequential(
  dns: string[],
  startDate: string,
  endDate: string,
  granularity: Granularity = "daily",
  onProgress?: (loaded: number, total: number) => void,
  forceRefresh: boolean = false,
  onDeviceLoaded?: (dn: string, result: FetchResult) => void
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  
  // STEP 1: Check ALL caches in parallel (unless forceRefresh is active)
  const cacheMap = forceRefresh 
    ? new Map<string, FetchResult | null>() 
    : await checkAllDeviceCachesInParallel(dns, startDate, endDate, granularity);
  
  const devicesToFetch: string[] = [];
  let loadedCount = 0;

  // STEP 2: Process cache hits immediately
  for (const dn of dns) {
    const cached = cacheMap.get(dn);
    if (cached) {
      results.set(dn, cached);
      loadedCount++;
      onDeviceLoaded?.(dn, cached);
      onProgress?.(loadedCount, dns.length);
    } else {
      devicesToFetch.push(dn);
    }
  }

  // STEP 3: Fetch remaining from API sequentially
  for (let i = 0; i < devicesToFetch.length; i++) {
    const dn = devicesToFetch[i];
    try {
      const result = await fetchDeviceRawData(dn, startDate, endDate, granularity, forceRefresh);
      results.set(dn, result);
      loadedCount++;
      onDeviceLoaded?.(dn, result);
    } catch (err: unknown) {
      const emptyResult: FetchResult = { data: [], fromCache: false };
      results.set(dn, emptyResult);
      loadedCount++;
      onDeviceLoaded?.(dn, emptyResult);
    }

    onProgress?.(loadedCount, dns.length);
    
    // Only sleep if there are more devices to fetch from the API
    if (i < devicesToFetch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}

export async function fetchDeviceConsumption(
  dn: string, startDate: string, endDate: string,
  granularity: Granularity = "daily", phase: Phase = "total"
): Promise<ConsumptionPoint[]> {
  const { data } = await fetchDeviceRawData(dn, startDate, endDate, granularity);
  return data.map(p => ({ date: p.date, value: extractPhaseValue(p, phase) }));
}

/* ── Water Device API ────────────────────────────────────────────────────── */

const WATER_PROXY_URL = "http://localhost:3001/api/device/water";

/**
 * Builds a water-specific cache key to avoid collision with electricity cache.
 */
function buildWaterCacheKey(dn: string, start: string, end: string, gran: string): string {
  return `water_${dn}_${start}_${end}_${gran}`;
}

/**
 * Fetches raw consumption data for a WATER device.
 * Uses the /api/device/water/:interval/:dn/:start/:end proxy route.
 * Cache keys are prefixed with 'water_' to avoid collision with electricity data.
 */
export async function fetchWaterDeviceRawData(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: Granularity = "daily",
  forceRefresh: boolean = false
): Promise<FetchResult> {
  const cacheKey = buildWaterCacheKey(dn, startDate, endDate, granularity);

  // 1. Cache-first (reuse same cache infrastructure)
  if (!forceRefresh) {
    const cached = await checkAllCaches(cacheKey, startDate, endDate, granularity);
    if (cached !== null) {
      return { data: cached.data, fromCache: true };
    }
  }

  // 2. In-flight deduplication
  if (inFlightRequests.has(cacheKey)) {
    while (inFlightRequests.has(cacheKey)) {
      await sleep(100);
    }
    if (!forceRefresh) {
      const cachedAfterWait = await checkAllCaches(cacheKey, startDate, endDate, granularity);
      if (cachedAfterWait !== null) {
        return { data: cachedAfterWait.data, fromCache: true };
      }
    }
  }

  inFlightRequests.add(cacheKey);

  const interval = granularity === "hourly" ? "hourly" : "daily";
  const url = `${WATER_PROXY_URL}/${interval}/${dn}/${startDate}/${endDate}`;

  try {
    // 3. API call via request queue
    const result = await requestQueue.enqueue({
      id: cacheKey,
      dn,
      startDate,
      endDate,
      granularity,
      priority: 'normal',
      execute: async () => {
        const response = await fetchWithTimeout(url);

        if (response.status === 429) {
          return { data: [], fromCache: false, rateLimited: true };
        }

        if (!response.ok) {
          throw new Error(`API error [${response.status}] for water device ${dn}`);
        }

        const json: unknown = await response.json();

        // Water API returns [{label:"volume",data:[...]},{label:"debit",data:[...]}]
        // We only want "volume" (m³) — NOT "debit" (flow rate m³/h)
        const waterJson: unknown = (() => {
          if (Array.isArray(json)) {
            const volumeSeries = json.find(
              (s): s is { label: string; data: unknown[] } =>
                typeof s === 'object' &&
                s !== null &&
                'label' in s &&
                (s as { label: string }).label === 'volume' &&
                'data' in s
            );
            if (volumeSeries) {
              return volumeSeries.data;
            }
          }
          // Not the water multi-series format — return as-is (fallback)
          return json;
        })();

        const data = parseRawItems(waterJson);

        return { data, fromCache: false };
      }
    });

    // 4. Cache successful responses
    if (!result.fromCache && result.data.length > 0) {
      await saveToAppropriateCache(cacheKey, startDate, endDate, granularity, result.data);
    }

    return result;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Fetches all water devices sequentially (same pattern as fetchAllDevicesSequential).
 */
export async function fetchAllWaterDevicesSequential(
  dns: string[],
  startDate: string,
  endDate: string,
  granularity: Granularity = "daily",
  onProgress?: (loaded: number, total: number) => void,
  forceRefresh: boolean = false,
  onDeviceLoaded?: (dn: string, result: FetchResult) => void
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  let loadedCount = 0;

  for (let i = 0; i < dns.length; i++) {
    const dn = dns[i];
    try {
      const result = await fetchWaterDeviceRawData(dn, startDate, endDate, granularity, forceRefresh);
      results.set(dn, result);
      loadedCount++;
      onDeviceLoaded?.(dn, result);
    } catch (err: unknown) {
      const emptyResult: FetchResult = { data: [], fromCache: false };
      results.set(dn, emptyResult);
      loadedCount++;
      onDeviceLoaded?.(dn, emptyResult);
    }

    onProgress?.(loadedCount, dns.length);

    // Only sleep if there are more devices to fetch from the API
    if (i < dns.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}

