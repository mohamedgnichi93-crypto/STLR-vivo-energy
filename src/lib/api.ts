import { RawConsumptionPoint, ConsumptionPoint, DeviceConsumption, Granularity, Phase, extractPhaseValue } from "./types";
import { requestQueue } from "./requestQueue";
import { checkAllCaches, saveToAppropriateCache } from "./cacheManager";

export type { ConsumptionPoint, DeviceConsumption, Granularity, Phase, RawConsumptionPoint };

const toKwh = (wh: number): number => wh;
const PROXY_URL = "/api/device";
const WATER_PROXY_URL = "/api/device/water";
const TIMEOUT_MS = 30000;
const DELAY_MS = 1000;

interface CacheEntry {
  data: RawConsumptionPoint[];
  savedAt: number;
  ttl: number;
}

function buildCacheKey(dn: string, start: string, end: string, gran: string): string {
  return `stlr_${dn}_${start}_${end}_${gran}`;
}

export function clearApiCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("stlr_")) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { }
}

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
  } catch { }
  return removed;
}

export interface FetchResult {
  data: RawConsumptionPoint[];
  fromCache?: boolean;
  rateLimited?: boolean;
}

const inFlightRequests = new Set<string>();

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
    const pA = toKwh(Number(item.phaseA ?? item.phase_a ?? item.PhaseA ?? item.energyA ?? item.energy_a ?? item.l1 ?? item.L1 ?? 0));
    const pB = toKwh(Number(item.phaseB ?? item.phase_b ?? item.PhaseB ?? item.energyB ?? item.energy_b ?? item.l2 ?? item.L2 ?? 0));
    const pC = toKwh(Number(item.phaseC ?? item.phase_c ?? item.PhaseC ?? item.energyC ?? item.energy_c ?? item.l3 ?? item.L3 ?? 0));
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

export async function fetchDeviceRawData(
  dn: string, startDate: string, endDate: string,
  granularity: Granularity = "daily",
  forceRefresh: boolean = false
): Promise<FetchResult> {
  const cacheKey = buildCacheKey(dn, startDate, endDate, granularity);
  if (!forceRefresh) {
    const cached = await checkAllCaches(dn, startDate, endDate, granularity);
    if (cached !== null) return { data: cached.data, fromCache: true };
  }
  if (inFlightRequests.has(cacheKey)) {
    while (inFlightRequests.has(cacheKey)) await sleep(100);
    if (!forceRefresh) {
      const cachedAfterWait = await checkAllCaches(dn, startDate, endDate, granularity);
      if (cachedAfterWait !== null) return { data: cachedAfterWait.data, fromCache: true };
    }
  }
  inFlightRequests.add(cacheKey);
  const interval = granularity === "hourly" ? "hourly" : "daily";
  const url = `${PROXY_URL}/${interval}/${dn}/${startDate}/${endDate}`;
  try {
    const result = await requestQueue.enqueue({
      id: cacheKey, dn, startDate, endDate, granularity, priority: 'normal',
      execute: async () => {
        const response = await fetchWithTimeout(url);
        if (response.status === 429) return { data: [], fromCache: false, rateLimited: true };
        if (!response.ok) throw new Error(`API error [${response.status}] for ${dn}`);
        const json = await response.json();
        const data = parseRawItems(json);
        return { data, fromCache: false };
      }
    });
    if (!result.fromCache && result.data.length > 0) {
      await saveToAppropriateCache(dn, startDate, endDate, granularity, result.data);
    }
    return result;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export async function checkAllDeviceCachesInParallel(
  dns: string[], startDate: string, endDate: string, granularity: Granularity
): Promise<Map<string, FetchResult | null>> {
  const results = await Promise.all(
    dns.map(async (dn) => {
      const cached = await checkAllCaches(dn, startDate, endDate, granularity);
      if (cached !== null) return [dn, { data: cached.data, fromCache: true }] as [string, FetchResult];
      return [dn, null] as [string, null];
    })
  );
  return new Map(results);
}

export async function fetchAllDevicesSequential(
  dns: string[], startDate: string, endDate: string,
  granularity: Granularity = "daily",
  onProgress?: (loaded: number, total: number) => void,
  forceRefresh: boolean = false,
  onDeviceLoaded?: (dn: string, result: FetchResult) => void
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  const cacheMap = forceRefresh
    ? new Map<string, FetchResult | null>()
    : await checkAllDeviceCachesInParallel(dns, startDate, endDate, granularity);
  const devicesToFetch: string[] = [];
  let loadedCount = 0;
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
  for (let i = 0; i < devicesToFetch.length; i++) {
    const dn = devicesToFetch[i];
    try {
      const result = await fetchDeviceRawData(dn, startDate, endDate, granularity, forceRefresh);
      results.set(dn, result);
      loadedCount++;
      onDeviceLoaded?.(dn, result);
    } catch {
      const emptyResult: FetchResult = { data: [], fromCache: false };
      results.set(dn, emptyResult);
      loadedCount++;
      onDeviceLoaded?.(dn, emptyResult);
    }
    onProgress?.(loadedCount, dns.length);
    if (i < devicesToFetch.length - 1) await sleep(DELAY_MS);
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

function buildWaterCacheKey(dn: string, start: string, end: string, gran: string): string {
  return `water_${dn}_${start}_${end}_${gran}`;
}

export async function fetchWaterDeviceRawData(
  dn: string, startDate: string, endDate: string,
  granularity: Granularity = "daily",
  forceRefresh: boolean = false
): Promise<FetchResult> {
  const cacheKey = buildWaterCacheKey(dn, startDate, endDate, granularity);
  if (!forceRefresh) {
    const cached = await checkAllCaches(cacheKey, startDate, endDate, granularity);
    if (cached !== null) return { data: cached.data, fromCache: true };
  }
  if (inFlightRequests.has(cacheKey)) {
    while (inFlightRequests.has(cacheKey)) await sleep(100);
    if (!forceRefresh) {
      const cachedAfterWait = await checkAllCaches(cacheKey, startDate, endDate, granularity);
      if (cachedAfterWait !== null) return { data: cachedAfterWait.data, fromCache: true };
    }
  }
  inFlightRequests.add(cacheKey);
  const interval = granularity === "hourly" ? "hourly" : "daily";
  const url = `${WATER_PROXY_URL}/${interval}/${dn}/${startDate}/${endDate}`;
  try {
    const result = await requestQueue.enqueue({
      id: cacheKey, dn, startDate, endDate, granularity, priority: 'normal',
      execute: async () => {
        const response = await fetchWithTimeout(url);
        if (response.status === 429) return { data: [], fromCache: false, rateLimited: true };
        if (!response.ok) throw new Error(`API error [${response.status}] for water device ${dn}`);
        const json: unknown = await response.json();
        const waterJson: unknown = (() => {
          if (Array.isArray(json)) {
            const volumeSeries = json.find(
              (s): s is { label: string; data: unknown[] } =>
                typeof s === 'object' && s !== null && 'label' in s &&
                (s as { label: string }).label === 'volume' && 'data' in s
            );
            if (volumeSeries) return volumeSeries.data;
          }
          return json;
        })();
        const data = parseRawItems(waterJson);
        return { data, fromCache: false };
      }
    });
    if (!result.fromCache && result.data.length > 0) {
      await saveToAppropriateCache(cacheKey, startDate, endDate, granularity, result.data);
    }
    return result;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export async function fetchAllWaterDevicesSequential(
  dns: string[], startDate: string, endDate: string,
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
    } catch {
      const emptyResult: FetchResult = { data: [], fromCache: false };
      results.set(dn, emptyResult);
      loadedCount++;
      onDeviceLoaded?.(dn, emptyResult);
    }
    onProgress?.(loadedCount, dns.length);
    if (i < dns.length - 1) await sleep(DELAY_MS);
  }
  return results;
}