import React, { useMemo } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { TooltipProps, LegendProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { formatKwh } from "@/lib/utils";
import { DEVICE_COLORS } from "@/lib/deviceColors";
import { REPORT_PALETTE } from "@/lib/reportDataFetcher";

interface DeviceData {
  dn: string;
  name: string;
  total: number;
  daily: { timestamp: string; value: number }[];
}

interface DeviceRadarChartProps {
  deviceData: DeviceData[];
  loading?: boolean;
  className?: string;
  unit?: string;
}

/** Hash-based fallback color so unknown device IDs get distinct colors instead of a single hardcoded one. */
function getFallbackColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return REPORT_PALETTE[Math.abs(hash) % REPORT_PALETTE.length];
}

const METRICS = [
  { key: 'total', name: 'Total' },
  { key: 'peak', name: 'Pic' },
  { key: 'avg', name: 'Moy.' },
  { key: 'activeDays', name: 'Jours' },
  { key: 'stability', name: 'Stab.' },
  { key: 'percent', name: '% Total' }
];

const DeviceRadarChart: React.FC<DeviceRadarChartProps> = ({ deviceData, loading, className, unit = "kWh" }) => {
  const radarData = useMemo(() => {
    if (!deviceData || deviceData.length === 0) return { enrichedData: [], dataPoints: [] };

    // 1. Calculate raw metrics for each device
    const rawData = deviceData.map(d => {
      const dailyValues = d.daily.map(p => p.value);
      const total = d.total;
      const peak = Math.max(...dailyValues, 0);
      const avg = dailyValues.length > 0 ? total / dailyValues.length : 0;
      const activeDays = dailyValues.filter(v => v > 0).length;
      
      let stdDev = 0;
      if (dailyValues.length > 0) {
        const variance = dailyValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / dailyValues.length;
        stdDev = Math.sqrt(variance);
      }
      const stability = stdDev === 0 ? (activeDays > 0 ? 100 : 0) : 1000 / (stdDev + 1); 

      return { dn: d.dn, name: d.name, total, peak, avg, activeDays, stability };
    });

    const sumTotal = rawData.reduce((sum, d) => sum + d.total, 0);

    const enrichedData = rawData.map(d => ({
      ...d,
      percent: sumTotal > 0 ? (d.total / sumTotal) * 100 : 0
    }));

    // 2. Find min/max for normalization
    const ranges = METRICS.reduce((acc, m) => {
      const values = enrichedData.map(d => d[m.key as keyof typeof d] as number);
      acc[m.key] = { min: Math.min(...values), max: Math.max(...values) };
      return acc;
    }, {} as Record<string, {min: number, max: number}>);

    // 3. Create Radar data array (one object per metric)
    const dataPoints = METRICS.map(m => {
      const point: Record<string, any> = { metric: m.name, fullMark: 100, originalValues: {} };
      enrichedData.forEach(d => {
        const rawVal = d[m.key as keyof typeof d] as number;
        point.originalValues[d.dn] = rawVal;
        
        const r = ranges[m.key];
        // FALLBACK FIX (Cause B): Ensure visible path when no variance or all zeros
        if (r.max === r.min || isNaN(r.max)) {
          // All equal & non-zero = full radar; all zero = empty
          point[d.dn] = (r.max > 0 ? 100 : 0);
        } else {
          point[d.dn] = ((rawVal - r.min) / (r.max - r.min)) * 80 + 10; // Scale 10-90% for better visibility
        }
      });
      return point;
    });

    return { enrichedData, dataPoints };
  }, [deviceData]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 w-full">
        <div className="h-4 w-48 bg-secondary/50 rounded animate-pulse mb-2" />
        <div className="flex items-center justify-center h-[350px]">
          <div className="w-64 h-64 bg-secondary/50 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  const { enrichedData, dataPoints } = radarData;

  if (enrichedData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 w-full">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
          COMPARAISON DES APPAREILS — RADAR
        </h3>
        <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
          Aucune donnée disponible
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-md p-3 shadow-lg z-50">
        <p className="text-sm font-medium text-foreground mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((entry) => {
            const dn = entry.dataKey;
            const color = entry.color;
            const rawValue = (entry.payload as Record<string, any>).originalValues[dn];
            
            const formatted = label === '% Total' ? `${rawValue.toFixed(1)}%` 
                            : label === 'Jours' ? `${rawValue} j`
                            : label === 'Stab.' ? rawValue.toFixed(2)
                            : `${formatKwh(rawValue)} ${unit}`;

            return (
              <div key={dn} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{entry.name}:</span>
                <span className="font-mono text-primary">{formatted}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const CustomLegend = ({ payload }: LegendProps) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-muted-foreground font-mono">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-5 w-full h-full flex flex-col ${className || ""}`}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
        COMPARAISON DES APPAREILS — RADAR
      </h3>
      <div className="flex-1 w-full relative min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={dataPoints}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9, fontWeight: 'bold' }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: 20 }} />
            
            {enrichedData.map((d) => (
              <Radar
                key={d.dn}
                name={d.name}
                dataKey={d.dn}
                stroke={DEVICE_COLORS[d.dn] || getFallbackColor(d.dn)}
                strokeWidth={2}
                fill={DEVICE_COLORS[d.dn] || getFallbackColor(d.dn)}
                fillOpacity={0.2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DeviceRadarChart;
