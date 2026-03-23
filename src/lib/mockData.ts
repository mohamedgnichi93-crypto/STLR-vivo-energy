import { RawConsumptionPoint, Granularity } from "./types";

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

const BASE_CONSUMPTION: Record<string, number> = {
  "dn-13-10833": 120,
  "dn-13-11386": 450,
  "dn-13-11390": 85,
  "dn-13-11405": 310,
  "dn-13-11407": 200,
  "dn-13-15005": 275,
  "dn-13-15015": 180,
};

const HOURLY_PROFILE = [
  0.3, 0.25, 0.2, 0.2, 0.25, 0.35, 0.55, 0.85,
  1.2, 1.4, 1.5, 1.45, 1.1, 1.35, 1.5, 1.45,
  1.3, 1.1, 0.8, 0.6, 0.5, 0.45, 0.4, 0.35,
];

// Phase distribution ratios (sum ≈ 1.0)
const PHASE_RATIOS = { a: 0.45, b: 0.15, c: 0.40 };

function buildPoint(date: string, totalValue: number, rand: () => number): RawConsumptionPoint {
  // Add slight per-phase jitter
  const jA = 1 + (rand() - 0.5) * 0.1;
  const jB = 1 + (rand() - 0.5) * 0.1;
  const jC = 1 + (rand() - 0.5) * 0.1;
  const rawA = totalValue * PHASE_RATIOS.a * jA;
  const rawB = totalValue * PHASE_RATIOS.b * jB;
  const rawC = totalValue * PHASE_RATIOS.c * jC;
  const sum = rawA + rawB + rawC;
  return {
    date,
    phaseA: Math.round(rawA * 100) / 100,
    phaseB: Math.round(rawB * 100) / 100,
    phaseC: Math.round(rawC * 100) / 100,
    total: Math.round(sum * 100) / 100,
  };
}

export function generateMockData(
  dn: string,
  startDate: string,
  endDate: string,
  granularity: Granularity = "daily"
): RawConsumptionPoint[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);
  if (granularity === "daily" && diffDays > 730) return [];
  if (granularity === "hourly" && diffDays > 31) return [];

  const results: RawConsumptionPoint[] = [];
  const base = BASE_CONSUMPTION[dn] || 150;

  if (granularity === "hourly") {
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      for (let h = 0; h < 24; h++) {
        const rand = seededRandom(dn + dateStr + h);
        const dayOfWeek = current.getDay();
        const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;
        const hourlyBase = (base / 24) * HOURLY_PROFILE[h];
        const variation = (rand() - 0.5) * hourlyBase * 0.3;
        const totalValue = (hourlyBase + variation) * weekendFactor;
        results.push(buildPoint(`${dateStr} ${String(h).padStart(2, "0")}:00`, totalValue, rand));
      }
      current.setDate(current.getDate() + 1);
    }
  } else {
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const rand = seededRandom(dn + dateStr);
      const variation = (rand() - 0.5) * base * 0.4;
      const dayOfWeek = current.getDay();
      const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;
      const totalValue = (base + variation) * weekendFactor;
      results.push(buildPoint(dateStr, totalValue, rand));
      current.setDate(current.getDate() + 1);
    }
  }

  return results;
}
