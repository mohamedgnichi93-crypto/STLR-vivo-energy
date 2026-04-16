import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Granularity } from "@/lib/types";
import { formatTick } from "@/lib/chartUtils";
import { formatKwh } from "@/lib/utils";
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import TotalConsumptionChartSkeleton from "./skeletons/TotalConsumptionChartSkeleton";

interface Props {
  data: Array<{ date: string; total: number }>;
  loading?: boolean;
  granularity?: Granularity;
  unit?: string;
  className?: string;
}

const TotalConsumptionChart = ({ data, loading, granularity = "daily", unit = "kWh", className }: Props) => {
  if (loading) {
    return <TotalConsumptionChartSkeleton className={className} />;
  }

  const GRANULARITY_LABELS: Record<Granularity, string> = {
    hourly:  "HORAIRE",
    daily:   "JOURNALIERE",
    weekly:  "HEBDOMADAIRE",
    monthly: "MENSUELLE",
  };

  const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload || payload.length === 0) return null;

    const value = payload[0].value;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {label}
        </p>
        <div className="flex items-center justify-between gap-4 text-xs font-bold">
          <span className="text-foreground">Consommation Totale</span>
          <span className="font-mono text-primary tabular-nums">
            {formatKwh(value as number)} {unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-6 flex flex-col ${className || ""}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            CONSOMMATION TOTALE — TOUS APPAREILS
          </h3>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-tight">
            Somme de tous les appareils sur la période ({GRANULARITY_LABELS[granularity]})
          </p>
        </div>
        <span className="text-xs text-muted-foreground font-mono bg-secondary/30 px-2 py-0.5 rounded border border-border/50">
          {data.length.toLocaleString()} points
        </span>
      </div>
      
      <div className="h-[300px] w-full mt-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
            <XAxis
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={10}
              tickLine={false} 
              axisLine={false} 
              fontFamily="IBM Plex Mono"
              tickFormatter={(v) => formatTick(v, granularity)}
              interval="preserveStartEnd" 
              minTickGap={50}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              fontFamily="IBM Plex Mono"
              tickFormatter={(value: number) => formatKwh(value)}
              width={80}
              label={{ value: unit, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="total" 
              stroke="#10b981" 
              fill="url(#totalGradient)"
              strokeWidth={2}
              activeDot={{ r: 5, strokeWidth: 0, fill: "#10b981" }}
              isAnimationActive={data.length < 500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TotalConsumptionChart;
