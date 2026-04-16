import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { Granularity } from "@/lib/types";
import { downsampleMultiSeries, ChartDataPoint, Device } from "@/lib/chartUtils";
import { formatKwh } from "@/lib/utils";
import { DEVICE_COLORS } from "@/lib/deviceColors";

interface Props {
  data: ChartDataPoint[];
  devices: Device[];
  loading?: boolean;
  granularity?: Granularity;
  phaseLabel?: string;
  unit?: string;
  className?: string;
}

const MAX_CHART_POINTS = 200;

const GRANULARITY_LABELS: Record<Granularity, string> = {
  hourly: "HORAIRE",
  daily: "JOURNALIERE",
  weekly: "HEBDOMADAIRE",
  monthly: "MENSUELLE",
};

const formatXAxisTick = (value: string, granularity: Granularity): string => {
  if (!value) return ''
  
  try {
    const date = new Date(value)
    if (isNaN(date.getTime())) return value;
    
    switch(granularity) {
      case 'hourly':
        // Show "01/02 14h" format
        return `${String(date.getDate()).padStart(2,'0')}/${
          String(date.getMonth()+1).padStart(2,'0')} ${
          String(date.getHours()).padStart(2,'0')}h`
      
      case 'daily':
        // Show "01/02" format  
        return `${String(date.getDate()).padStart(2,'0')}/${
          String(date.getMonth()+1).padStart(2,'0')}`
      
      case 'weekly':
        // Show "S05" format
        const startOfYear = new Date(date.getFullYear(), 0, 1)
        const week = Math.ceil(
          ((date.getTime() - startOfYear.getTime()) / 86400000 + 
           startOfYear.getDay() + 1) / 7
        )
        return `S${String(week).padStart(2,'0')}`
      
      case 'monthly':
        // Show "Jan 25" format
        const months = ['Jan','Fév','Mar','Avr','Mai','Jun',
                        'Jul','Aoû','Sep','Oct','Nov','Déc']
        return `${months[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`
      
      default:
        return value.substring(5, 10) // "MM-DD"
    }
  } catch {
    return value
  }
}

const ConsumptionLineChart = ({ data = [], devices = [], loading, granularity = "daily", phaseLabel = "Total", unit = "kWh", className }: Props) => {
  const [hiddenDevices, setHiddenDevices] = useState<Set<string>>(new Set());

  // Use upgraded LTTB multi-series downsampling
  const chartData = useMemo(() => downsampleMultiSeries(data || [], "date", MAX_CHART_POINTS), [data]);

  const filteredDevices = devices.filter(device => !hiddenDevices.has(device.dn));

  const toggleDevice = (dn: string) => {
    setHiddenDevices(prev => {
      const next = new Set(prev);
      if (next.has(dn)) {
        next.delete(dn);
      } else {
        next.add(dn);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="h-4 w-48 animate-shimmer rounded mb-6" />
        <div className="h-[350px] animate-shimmer rounded" />
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload || payload.length === 0) return null;

    const sortedPayload = [...payload]
      .filter((entry) => typeof entry.value === 'number' && entry.value > 0)
      .sort((a, b) => (b.value as number) - (a.value as number));

    const total = sortedPayload.reduce((sum: number, entry) => sum + (entry.value as number), 0);

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {formatXAxisTick(String(label), granularity)}
        </p>
        {sortedPayload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-foreground">
                {entry.name}
              </span>
            </span>
            <span className="font-mono font-medium tabular-nums text-primary">
              {formatKwh(entry.value as number)} {unit}
            </span>
          </div>
        ))}
        {total > 0 && (
          <div className="border-t border-border pt-2 mt-2 flex justify-between text-xs font-medium">
            <span className="text-foreground">Total</span>
            <span className="font-mono tabular-nums text-primary">
              {formatKwh(total)} {unit}
            </span>
          </div>
        )}
      </div>
    );
  };

  const CustomLegend = () => {
    return (
      <div className="flex flex-wrap gap-4 justify-center text-xs mt-4">
        {devices.map((device) => {
          const isHidden = hiddenDevices.has(device.dn);
          const color = DEVICE_COLORS[device.dn] || device.color;

          return (
            <button
              key={device.dn}
              onClick={() => toggleDevice(device.dn)}
              className={`flex items-center gap-2 px-2 py-1 rounded transition-all duration-200 ${!isHidden
                  ? 'opacity-100 hover:opacity-80'
                  : 'opacity-30 hover:opacity-50'
                }`}
              style={{
                color: !isHidden ? color : 'hsl(var(--muted-foreground))',
                border: !isHidden ? `1px solid ${color}20` : '1px solid hsl(var(--border))'
              }}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{device.name}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const rawDataLength = data.length;
  const displayedLength = chartData.length;

  return (
    <div className={`bg-card border border-border rounded-lg p-6 flex flex-col ${className || ""}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            TENDANCE {GRANULARITY_LABELS[granularity]} - {phaseLabel}
          </h3>
          {rawDataLength > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground/60 
                             bg-secondary/50 px-1.5 py-0.5 rounded">
              {rawDataLength.toLocaleString('fr-FR')} pts
              {rawDataLength !== displayedLength && (
                <span className="text-primary/60"> → {displayedLength}</span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[350px] relative">
        {(!data || data.length === 0) ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              Aucune donnée pour la période sélectionnée
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date" 
                stroke="hsl(var(--muted-foreground))" 
                tickFormatter={(value) => formatXAxisTick(value, granularity)}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false} 
                axisLine={false} 
                fontFamily="IBM Plex Mono"
                interval="preserveStartEnd" 
                minTickGap={granularity === 'hourly' ? 60 : 30}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                fontFamily="IBM Plex Mono"
                tickFormatter={(value: number) => formatKwh(value)}
                label={{ value: unit, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
              {filteredDevices.map(device => (
                <Area
                  key={device.dn}
                  type="monotone"
                  dataKey={device.dn}
                  name={device.name}
                  stroke={DEVICE_COLORS[device.dn] || device.color}
                  strokeWidth={2}
                  fill={DEVICE_COLORS[device.dn] || device.color}
                  fillOpacity={0.15}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={chartData.length < 100}
                  connectNulls={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ConsumptionLineChart;
