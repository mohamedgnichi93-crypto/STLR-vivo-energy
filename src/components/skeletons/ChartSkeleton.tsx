/**
 * ChartSkeleton — matches ConsumptionLineChart (h-[350px] inside p-6 card).
 * SVG path curves give the illusion of real chart lines.
 */
import { SkeletonBox } from "./SkeletonBox";

interface ChartSkeletonProps {
  /** Total card height in px. Matches the real chart card. Default: 462 (350 chart + 112 padding/header) */
  height?: number;
  /** Number of fake legend dots to render */
  lineCount?: number;
}

// Pre-computed wavy SVG paths that look like energy consumption curves
const CURVE_PATHS = [
  "M0,80 C60,60 120,110 180,70 C240,30 300,90 360,50 C420,10 480,70 540,40 C600,10 660,60 720,30",
  "M0,110 C60,90 120,140 180,100 C240,65 300,120 360,90 C420,60 480,110 540,85 C600,55 660,100 720,70",
  "M0,140 C60,125 120,160 180,135 C240,110 300,150 360,125 C420,100 480,145 540,120 C600,95 660,140 720,115",
  "M0,160 C60,150 120,175 180,155 C240,135 300,165 360,148 C420,130 480,160 540,145 C600,128 660,158 720,140",
];

const CURVE_COLORS = [
  "hsl(var(--chart-1) / 0.5)",
  "hsl(var(--chart-2) / 0.4)",
  "hsl(var(--chart-3) / 0.35)",
  "hsl(var(--chart-4) / 0.3)",
];

/**
 * Skeleton that mimics the ConsumptionLineChart layout:
 * - Fake legend row with colored dots
 * - SVG wavy curves on a faint grid
 * - Fake X-axis labels at the bottom
 */
export function ChartSkeleton({ height = 462, lineCount = 3 }: ChartSkeletonProps) {
  const clampedLines = Math.min(lineCount, CURVE_PATHS.length);

  return (
    <div
      className="bg-card border border-border rounded-lg p-6 animate-fade-in"
      style={{ height }}
      aria-hidden="true"
      aria-label="Chargement du graphique..."
    >
      {/* Header row: title + point count */}
      <div className="flex items-center justify-between mb-6">
        <SkeletonBox width={180} height={12} />
        <SkeletonBox width={60} height={12} />
      </div>

      {/* Legend dots */}
      <div className="flex items-center gap-4 mb-4">
        {Array.from({ length: clampedLines }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full animate-shimmer"
              style={{ backgroundColor: CURVE_COLORS[i] }}
            />
            <SkeletonBox width={52 + i * 8} height={10} />
          </div>
        ))}
      </div>

      {/* Chart area with faint grid + SVG curves */}
      <div className="relative flex-1" style={{ height: height - 130 }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between pr-2">
          {[...Array(5)].map((_, i) => (
            <SkeletonBox key={i} width={28} height={9} />
          ))}
        </div>

        {/* Chart body */}
        <div className="absolute left-8 right-0 top-0 bottom-8 overflow-hidden rounded">
          {/* Faint horizontal grid lines */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute w-full border-t border-border/40"
              style={{ top: `${i * 25}%` }}
            />
          ))}

          {/* SVG wavy lines — viewBox matches 720 wide so they fill the box */}
          <svg
            className="absolute inset-0 w-full"
            viewBox="0 0 720 190"
            preserveAspectRatio="none"
          >
            {Array.from({ length: clampedLines }).map((_, i) => (
              <path
                key={i}
                d={CURVE_PATHS[i]}
                fill="none"
                stroke={CURVE_COLORS[i]}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            ))}
          </svg>

          {/* Shimmer sweep overlay */}
          <div className="absolute inset-0 animate-shimmer opacity-30 rounded" />
        </div>

        {/* X-axis labels */}
        <div className="absolute bottom-0 left-8 right-0 flex justify-between">
          {[...Array(6)].map((_, i) => (
            <SkeletonBox key={i} width={40} height={9} />
          ))}
        </div>
      </div>
    </div>
  );
}
