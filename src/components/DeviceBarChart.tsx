import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { getDeviceColor } from "@/lib/devices";

interface DeviceData { name: string; total: number; }
interface Props { data: DeviceData[]; loading?: boolean; phaseLabel?: string; }

const DeviceBarChart = ({ data, loading, phaseLabel = "Total" }: Props) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="h-4 w-48 animate-shimmer rounded mb-6" />
        <div className="h-[350px] animate-shimmer rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
        Consommation par appareil — {phaseLabel}
      </h3>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 20%)" horizontal={false} />
            <XAxis type="number" stroke="hsl(240 4% 55%)" fontSize={11} tickLine={false} axisLine={false} fontFamily="IBM Plex Mono" />
            <YAxis type="category" dataKey="name" stroke="hsl(240 4% 55%)" fontSize={11} tickLine={false} axisLine={false} width={110} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(240 5% 14%)", border: "1px solid hsl(240 4% 20%)", borderRadius: "6px", fontSize: "12px", fontFamily: "IBM Plex Mono" }}
              itemStyle={{ color: "hsl(0 0% 95%)" }}
              labelStyle={{ color: "hsl(240 4% 55%)" }}
            />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((entry) => <Cell key={entry.name} fill={getDeviceColor(entry.name)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DeviceBarChart;
