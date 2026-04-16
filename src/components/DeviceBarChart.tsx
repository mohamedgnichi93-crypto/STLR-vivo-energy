import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { getDeviceColor } from "@/lib/devices";
import { formatKwh } from "@/lib/utils";

interface DeviceData { name: string; total: number; color?: string; }
interface Props { data: DeviceData[]; loading?: boolean; phaseLabel?: string; unit?: string; className?: string; }

const DeviceBarChart = ({ data = [], loading, phaseLabel = "Total", unit = "kWh", className }: Props) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="h-4 w-48 animate-shimmer rounded mb-6" />
        <div className="h-[350px] animate-shimmer rounded" />
      </div>
    );
  }

  const sortedData = [...(data || [])].sort((a, b) => b.total - a.total);

  const CustomLabel = (props: { x?: number, y?: number, width?: number, height?: number, value?: number }) => {
    const { x, y, width, height, value } = props;
    if (value === 0) return null;
    return (
      <text 
        x={x + width + 8} 
        y={y + height / 2 + 4} 
        fill="hsl(var(--foreground))" 
        fontSize={11} 
        fontFamily="IBM Plex Mono"
        fontWeight="500"
      >
        {formatKwh(value as number)} {unit}
      </text>
    );
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-6 flex flex-col ${className || "h-[450px]"}`}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
        Consommation par appareil — {phaseLabel}
      </h3>
      <div className="flex-1 min-h-[350px] relative">
        {!sortedData || sortedData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              Aucune donnée par appareil
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={sortedData} 
              layout="vertical"
              margin={{ top: 5, right: 120, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} vertical={true} />
              <XAxis 
                type="number"
                stroke="hsl(var(--muted-foreground))" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                fontFamily="IBM Plex Mono"
                tickFormatter={(value: number) => formatKwh(value)}
                hide
              />
              <YAxis 
                dataKey="name" 
                type="category"
                stroke="hsl(var(--foreground))" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false} 
                width={110}
                tickFormatter={(value: string) => value.length > 15 ? `${value.substring(0, 13)}...` : value}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", fontFamily: "IBM Plex Mono" }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.1 }}
                formatter={(value: number) => [`${formatKwh(value)} ${unit}`, '']}
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={32}>
                {sortedData.map((entry) => <Cell key={entry.name} fill={entry.color || getDeviceColor(entry.name)} />)}
                <LabelList dataKey="total" content={<CustomLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default DeviceBarChart;
