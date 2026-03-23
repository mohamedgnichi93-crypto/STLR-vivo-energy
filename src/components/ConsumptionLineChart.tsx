import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ConsumptionPoint, Granularity } from "@/lib/types";
import { downsample, formatTick } from "@/lib/chartUtils";

interface Props {
  data: ConsumptionPoint[];
  loading?: boolean;
  granularity?: Granularity;
  phaseLabel?: string;
}

const MAX_CHART_POINTS = 200;

const GRANULARITY_LABELS: Record<Granularity, string> = {
  hourly:  "HORAIRE",
  daily:   "JOURNALIERE",
  weekly:  "HEBDOMADAIRE",
  monthly: "MENSUELLE",
};

const ConsumptionLineChart = ({ data, loading, granularity = "daily", phaseLabel = "Total" }: Props) => {
  const chartData = useMemo(() => downsample(data, MAX_CHART_POINTS), [data]);
  const showDots = chartData.length <= 60;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="h-4 w-48 animate-shimmer rounded mb-6" />
        <div className="h-[350px] animate-shimmer rounded" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            TENDANCE {GRANULARITY_LABELS[granularity]} - {phaseLabel}
          </h3>
        </div>
        <div className="h-[350px] flex flex-col items-center justify-center gap-3 border border-dashed border-border rounded-lg">
          <span className="text-2xl">📭</span>
          <p className="text-sm text-muted-foreground">Aucune donnee pour cette periode</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          TENDANCE {GRANULARITY_LABELS[granularity]} - {phaseLabel}
        </h3>
        <span className="text-xs text-muted-foreground font-mono">
          {data.length.toLocaleString()} points
        </span>
      </div>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 20%)" vertical={false} />
            <XAxis
              dataKey="date" stroke="hsl(240 4% 55%)" fontSize={11}
              tickLine={false} axisLine={false} fontFamily="IBM Plex Mono"
              tickFormatter={(v) => formatTick(v, granularity)}
              interval="preserveStartEnd" minTickGap={50}
            />
            <YAxis stroke="hsl(240 4% 55%)" fontSize={11} tickLine={false} axisLine={false} fontFamily="IBM Plex Mono" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(240 5% 14%)", border: "1px solid hsl(240 4% 20%)", borderRadius: "6px", fontSize: "12px", fontFamily: "IBM Plex Mono" }}
              itemStyle={{ color: "hsl(155 60% 52%)" }}
              labelStyle={{ color: "hsl(240 4% 55%)" }}
            />
            <Line
              type="monotone" dataKey="value" stroke="hsl(155 60% 52%)" strokeWidth={1.5}
              dot={showDots ? { fill: "hsl(155 60% 52%)", strokeWidth: 0, r: 2 } : false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "hsl(155 60% 52%)" }}
              isAnimationActive={chartData.length < 100}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ConsumptionLineChart;
