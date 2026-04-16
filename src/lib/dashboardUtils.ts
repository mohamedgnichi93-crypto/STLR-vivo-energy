import { 
  ConsumptionPoint, 
  DeviceConsumption, 
  Granularity, 
  aggregateToWeekly, 
  aggregateToMonthly 
} from "./types";

/**
 * Aggregates consumption points based on selected granularity (Weekly/Monthly).
 * Daily and Hourly are returned as-is (already processed by API).
 */
export const applyGranularityAggregation = (points: ConsumptionPoint[], granularity: Granularity): ConsumptionPoint[] => {
  if (granularity === "weekly")  return aggregateToWeekly(points);
  if (granularity === "monthly") return aggregateToMonthly(points);
  return points;
};

const MONTH_ORDER: Record<string, number> = {
  Janvier:1, Fevrier:2, Mars:3, Avril:4, Mai:5, Juin:6,
  Juillet:7, Aout:8, Septembre:9, Octobre:10, Novembre:11, Decembre:12
};

/**
 * Generates a sortable numerical key for X-Axis date strings across granularities.
 */
export const getDateSortKey = (date: string): number => {
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return new Date(date).getTime();
  
  const monthMatch = date.match(/^(\w+)\s+(\d{4})$/);
  if (monthMatch) {
    const m = MONTH_ORDER[monthMatch[1]] ?? 0;
    return parseInt(monthMatch[2]) * 100 + m;
  }
  
  const weekMatch = date.match(/Sem\.\s*(\d+)\s*-\s*(\d{4})/);
  if (weekMatch) return parseInt(weekMatch[2]) * 100 + parseInt(weekMatch[1]);
  
  return 0;
};

/**
 * Returns a human-readable label for the average KPI based on granularity.
 */
export const getAvgLabel = (granularity: Granularity): string => {
  switch (granularity) {
    case "hourly":  return "MOY. HORAIRE";
    case "weekly":  return "MOY. HEBDOMADAIRE";
    case "monthly": return "MOY. MENSUELLE";
    default:        return "MOY. JOURNALIERE";
  }
};

/**
 * Builds a cross-tabulated timeline where each date point contains values for all devices.
 */
export const buildAggregatedTimeline = (deviceData: DeviceConsumption[]) => {
  const map: Record<string, Record<string, number>> = {};
  
  deviceData.forEach(d => {
    d.daily.forEach(p => {
      if (!map[p.date]) map[p.date] = {};
      map[p.date][d.deviceDn] = p.value;
    });
  });
  
  return Object.entries(map)
    .map(([date, deviceValues]) => ({ date, ...deviceValues }))
    .sort((a, b) => getDateSortKey(a.date) - getDateSortKey(b.date));
};

/**
 * Builds a single timeline representing the sum of all devices at each date point.
 */
export const buildTotalTimeline = (aggregatedTimeline: any[]) => {
  return aggregatedTimeline.map(point => {
    const total = Object.entries(point)
      .filter(([key]) => key !== 'date')
      .reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
    return { date: point.date, total };
  });
};

/**
 * Computes high-level KPIs for the dashboard metrics.
 */
export function computeKPIs(deviceData: DeviceConsumption[]) {
  const totalConsumption = deviceData.reduce((s, d) => s + d.total, 0);
  
  const allPoints = deviceData.flatMap(d => d.daily);
  const avgPerPeriod = allPoints.length === 0 ? 0 : allPoints.reduce((s, d) => s + d.value, 0) / allPoints.length;
  
  const peakValue = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.value)) : 0;
  const minValue = allPoints.length > 0 ? Math.min(...allPoints.map(p => p.value)) : 0;
  
  return {
    totalConsumption,
    avgPerPeriod,
    peakValue,
    minValue
  };
}

/**
 * Prepares data for device-level bar and pie charts.
 */
export const buildChartData = (deviceData: DeviceConsumption[]) => {
  const barData = deviceData.map(d => ({ 
    name: d.deviceName, 
    total: Math.round(d.total * 100) / 100 
  }));
  
  const pieData = deviceData
    .filter(d => d.total > 0)
    .map(d => ({ 
      name: d.deviceName, 
      value: Math.round(d.total * 100) / 100 
    }));
    
  return { barData, pieData };
};
