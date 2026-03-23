import { generateMockData } from "./mockData";
import { RawConsumptionPoint, ConsumptionPoint, DeviceConsumption, Granularity, Phase, extractPhaseValue } from "./types";

export type { ConsumptionPoint, DeviceConsumption, Granularity, Phase, RawConsumptionPoint };

const toKwh = (wh: number): number => wh / 1000;
const PROXY_URL = "http://localhost:3001/api/device";
const TIMEOUT_MS = 30000;
const RETRY_COUNT = 3;
const DELAY_MS = 300;

export interface FetchResult {
  data: RawConsumptionPoint[];
  isMock: boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOnce(dn: string, startDate: string, endDate: string, granularity: Granularity): Promise<FetchResult> {
  const interval = granularity === "hourly" ? "hourly" : "daily";
  const url = `${PROXY_URL}/${interval}/${dn}/${startDate}/${endDate}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`API error [${response.status}]`);
  const json = await response.json();

  const items: any[] = json?.data
    ? (Array.isArray(json.data) ? json.data : [json.data])
    : Array.isArray(json) ? json : [];

  const flatItems: any[] = [];
  for (const item of items) {
    if (Array.isArray(item?.data)) flatItems.push(...item.data);
    else flatItems.push(item);
  }

  if (flatItems.length > 0 && (flatItems[0].phaseA !== undefined || flatItems[0].total !== undefined)) {
    return {
      isMock: false,
      data: flatItems.map((item: any) => ({
        date: item.date || item.timestamp || "",
        phaseA: toKwh(Number(item.phaseA ?? 0)),
        phaseB: toKwh(Number(item.phaseB ?? 0)),
        phaseC: toKwh(Number(item.phaseC ?? 0)),
        total: toKwh(Number(item.total ?? item.value ?? item.consumption ?? item.energy ?? 0)),
      })),
    };
  }

  if (flatItems.length > 0) {
    return {
      isMock: false,
      data: flatItems.map((item: any) => {
        const val = toKwh(Number(item.value || item.consumption || item.energy || 0));
        return { date: item.date || item.timestamp || "", phaseA: val*0.45, phaseB: val*0.15, phaseC: val*0.40, total: val };
      }),
    };
  }

  return { isMock: false, data: [] };
}

export async function fetchDeviceRawData(
  dn: string, startDate: string, endDate: string,
  granularity: Granularity = "daily"
): Promise<FetchResult> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      return await fetchOnce(dn, startDate, endDate, granularity);
    } catch (err: any) {
      lastError = err;
      if (attempt < RETRY_COUNT) await sleep(1000 * attempt);
    }
  }
  console.warn(`All attempts failed for ${dn}, using mock data.`, lastError);
  return { isMock: true, data: generateMockData(dn, startDate, endDate, granularity) };
}

export async function fetchAllDevicesSequential(
  dns: string[], startDate: string, endDate: string,
  granularity: Granularity = "daily"
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  for (let i = 0; i < dns.length; i++) {
    results.set(dns[i], await fetchDeviceRawData(dns[i], startDate, endDate, granularity));
    if (i < dns.length - 1) await sleep(DELAY_MS);
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
