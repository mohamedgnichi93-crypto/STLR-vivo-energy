export type Granularity = "daily" | "hourly" | "weekly" | "monthly";
export type Phase = "phaseA" | "phaseB" | "phaseC" | "total";

export const PHASE_LABELS: Record<Phase, string> = {
  phaseA: "Phase A",
  phaseB: "Phase B",
  phaseC: "Phase C",
  total: "Total",
};

export interface RawConsumptionPoint {
  date: string;
  phaseA: number;
  phaseB: number;
  phaseC: number;
  total: number;
}

export interface ConsumptionPoint {
  date: string;
  value: number;
}

export interface DeviceConsumption {
  deviceName: string;
  deviceDn: string;
  total: number;
  daily: ConsumptionPoint[];
}

export function extractPhaseValue(raw: RawConsumptionPoint, phase: Phase): number {
  switch (phase) {
    case "phaseA": return raw.phaseA ?? 0;
    case "phaseB": return raw.phaseB ?? 0;
    case "phaseC": return raw.phaseC ?? 0;
    case "total":
    default: return raw.total ?? 0;
  }
}

export function aggregateToWeekly(points: ConsumptionPoint[]): ConsumptionPoint[] {
  const map: Record<string, { value: number; sortKey: number }> = {};
  points.forEach(p => {
    const d = new Date(p.date);
    const year = d.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    const key = `Sem. ${week} - ${year}`;
    if (!map[key]) map[key] = { value: 0, sortKey: year * 100 + week };
    map[key].value += p.value;
  });
  return Object.entries(map)
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .map(([date, { value }]) => ({ date, value: Math.round(value * 100) / 100 }));
}

export function aggregateToMonthly(points: ConsumptionPoint[]): ConsumptionPoint[] {
  const MONTHS = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];
  const map: Record<string, { value: number; sortKey: number }> = {};
  points.forEach(p => {
    const d = new Date(p.date);
    const month = d.getMonth();
    const year = d.getFullYear();
    const key = `${MONTHS[month]} ${year}`;
    if (!map[key]) map[key] = { value: 0, sortKey: year * 100 + month };
    map[key].value += p.value;
  });
  return Object.entries(map)
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .map(([date, { value }]) => ({ date, value: Math.round(value * 100) / 100 }));
}
