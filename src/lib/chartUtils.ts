import { ConsumptionPoint } from "./types";

/**
 * Downsample data points using LTTB (Largest Triangle Three Buckets)
 * for performant chart rendering with large datasets.
 */
export function downsample(data: ConsumptionPoint[], maxPoints: number): ConsumptionPoint[] {
  if (data.length <= maxPoints) return data;

  const sampled: ConsumptionPoint[] = [data[0]];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;

  for (let i = 1; i < maxPoints - 1; i++) {
    const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);

    // Average of next bucket for area calculation
    const nextStart = Math.floor(i * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1);
    let avgX = 0, avgY = 0, count = 0;
    for (let j = nextStart; j <= nextEnd; j++) {
      avgX += j;
      avgY += data[j].value;
      count++;
    }
    avgX /= count;
    avgY /= count;

    // Find point with max triangle area
    let maxArea = -1;
    let maxAreaIndex = rangeStart;
    const pointAX = prevIndex;
    const pointAY = data[prevIndex].value;

    for (let j = rangeStart; j <= rangeEnd; j++) {
      const area = Math.abs(
        (pointAX - avgX) * (data[j].value - pointAY) -
        (pointAX - j) * (avgY - pointAY)
      );
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(data[maxAreaIndex]);
    prevIndex = maxAreaIndex;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

/**
 * Smart tick formatter based on data density
 */
export function formatTick(label: string, granularity: "daily" | "hourly"): string {
  if (granularity === "hourly") {
    // "2026-02-01 14:00" → "Feb 01 14h"
    const parts = label.split(" ");
    if (parts.length === 2) {
      const [, m, d] = parts[0].split("-");
      const hour = parts[1].replace(":00", "h");
      return `${monthShort(m)} ${d} ${hour}`;
    }
    return label;
  }
  // "2026-02-01" → "Feb 01"
  const parts = label.split("-");
  if (parts.length === 3) {
    return `${monthShort(parts[1])} ${parts[2]}`;
  }
  return label;
}

function monthShort(m: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(m, 10) - 1] || m;
}
