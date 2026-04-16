import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getDeviceColor } from "@/lib/devices";
import { formatKwh } from "@/lib/utils";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

interface PieData { name: string; value: number; }
interface Props { data: PieData[]; loading?: boolean; phaseLabel?: string; unit?: string; className?: string; isDonut?: boolean; }

const DistributionPieChart = ({ data = [], loading, phaseLabel = "Total", unit = "kWh", className, isDonut }: Props) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="h-4 w-48 animate-shimmer rounded mb-6" />
        <div className="h-[350px] animate-shimmer rounded" />
      </div>
    );
  }

  const hasData = data && data.length > 0 && data.some(d => d.value > 0);

  const renderCustomizedLabel = (props: PieSectorDataItem) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0, value = 0, fill } = props;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius * 1.15;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.03) return null;

    const formattedValue = formatKwh(value);

    return (
      <text
        x={x}
        y={y}
        fill={fill}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize="10"
        fontFamily="IBM Plex Mono"
        fontWeight="bold"
      >
        {`${formattedValue} (${(percent * 100).toFixed(1)}%)`}
      </text>
    );
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-6 flex flex-col ${className || ""}`}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Répartition par appareil — {phaseLabel}
      </h3>
      <div className="flex-1 min-h-[350px] relative">
        {!hasData ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              Aucune répartition disponible
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie 
                data={data} 
                cx="50%" cy="45%" 
                innerRadius={isDonut ? 50 : 0} 
                outerRadius={85} 
                paddingAngle={isDonut ? 2 : 0} 
                dataKey="value"
                labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, opacity: 0.5 }}
                label={renderCustomizedLabel}
              >
                {data.map((entry) => <Cell key={entry.name} fill={getDeviceColor(entry.name)} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", fontFamily: "IBM Plex Mono" }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`${formatKwh(value)} ${unit}`, '']}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(value) => (
                  <span style={{ color: getDeviceColor(value) }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default DistributionPieChart;
