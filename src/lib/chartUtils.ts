import { Granularity } from "./types";

export interface ChartDataPoint {
  date: string;
  [key: string]: number | string;
}

export interface Device {
  dn: string;
  name: string;
  color: string;
}

/**
 * LTTB — Largest Triangle Three Buckets downsampling
 * Preserves peaks, troughs and visual shape of the data
 * Perfect for hourly energy consumption charts
 */
export function downsample<T extends { date: string; value: number }>(
  data: T[],
  threshold: number
): T[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold <= 0) return data;
  if (dataLength <= 2) return data;

  const sampled: T[] = [];
  let sampledIndex = 0;

  // Always include first point
  sampled[sampledIndex++] = data[0];

  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0; // previously selected point
  let maxAreaPoint: T = data[0];

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate bucket boundaries
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.min(
      Math.floor((i + 2) * bucketSize) + 1,
      dataLength
    );

    // Calculate average point in next bucket
    let avgX = 0;
    let avgY = 0;
    const avgRangeLength = avgRangeEnd - avgRangeStart;
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += j;
      avgY += data[j].value;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    // Current bucket range
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1;

    // Point a
    const pointAX = a;
    const pointAY = data[a].value;

    // Find point in current bucket with largest triangle area
    let maxArea = -1;
    for (let j = rangeStart; j < rangeEnd; j++) {
      // Triangle area
      const area = Math.abs(
        (pointAX - avgX) * (data[j].value - pointAY) -
        (pointAX - j) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[j];
        a = j;
      }
    }

    sampled[sampledIndex++] = maxAreaPoint;
  }

  // Always include last point
  sampled[sampledIndex++] = data[dataLength - 1];

  return sampled;
}

/**
 * Downsample multi-series data (multiple devices)
 * Applies LTTB per device, preserving temporal alignment
 */
export function downsampleMultiSeries(
  data: ChartDataPoint[],
  dateKey: string,
  threshold: number
): ChartDataPoint[] {
  if (data.length <= threshold) return data;

  // Use 'total' or the first numeric series for LTTB selection
  const keys = Object.keys(data[0]).filter(k => k !== dateKey);
  const firstKey = keys.find(k => k === 'total') || keys[0];
  
  if (!firstKey) return data;

  // Convert to {date, value} for LTTB
  const simple = data.map((d, i) => ({ 
    date: String(d[dateKey]), 
    value: typeof d[firstKey] === 'number' ? d[firstKey] as number : 0,
    _idx: i 
  }));

  // Get sampled indices via LTTB
  const sampled = downsample(simple, threshold);
  const sampledIndices = new Set(sampled.map(s => s._idx));

  // Return original multi-series data at sampled indices
  return data.filter((_, i) => sampledIndices.has(i));
}

/**
 * Smart tick formatter based on data density
 */
export function formatTick(label: string, granularity: Granularity): string {
  if (!label) return "";
  
  try {
    const date = new Date(label);
    if (isNaN(date.getTime())) return label; // Handle non-standard formats (weekly/monthly)

    switch (granularity) {
      case "hourly":
        return `${String(date.getDate()).padStart(2, "0")}/${String(
          date.getMonth() + 1
        ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}h`;

      case "daily":
        return `${String(date.getDate()).padStart(2, "0")}/${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

      case "weekly":
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const week = Math.ceil(
          ((date.getTime() - startOfYear.getTime()) / 86400000 +
            startOfYear.getDay() + 1) /
            7
        );
        return `S${String(week).padStart(2, "0")}`;

      case "monthly":
        const months = [
          "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
          "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"
        ];
        return `${months[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;

      default:
        return label.substring(5, 10);
    }
  } catch {
    return label;
  }
}

function monthShort(m: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(m, 10) - 1] || m;
}

export { monthShort }; // for compatibility if needed elsewhere
