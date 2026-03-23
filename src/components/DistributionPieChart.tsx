import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getDeviceColor, DEPARTMENT_COLORS } from "@/lib/devices";

interface PieData { name: string; value: number; }
interface Props { data: PieData[]; loading?: boolean; phaseLabel?: string; }

const DistributionPieChart = ({ data, loading, phaseLabel = "Total" }: Props) => {
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
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Répartition par appareil — {phaseLabel}
      </h3>
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(DEPARTMENT_COLORS).map(([dept, color]) => (
          <div key={dept} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground">{dept}</span>
          </div>
        ))}
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="45%" innerRadius={55} outerRadius={95} paddingAngle={2} dataKey="value">
              {data.map((entry) => <Cell key={entry.name} fill={getDeviceColor(entry.name)} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(240 5% 14%)", border: "1px solid hsl(240 4% 20%)", borderRadius: "6px", fontSize: "12px", fontFamily: "IBM Plex Mono" }}
              itemStyle={{ color: "hsl(0 0% 95%)" }}
            />
            <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", color: "hsl(240 4% 55%)" }}
              formatter={(value) => <span style={{ color: getDeviceColor(value) }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DistributionPieChart;
