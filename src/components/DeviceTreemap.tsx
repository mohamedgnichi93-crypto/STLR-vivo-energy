import React from "react";
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip, TooltipProps } from "recharts";
import { formatKwh } from "@/lib/utils";
import { DEVICE_COLORS } from "@/lib/deviceColors";

interface DeviceEntry {
  dn: string;
  name: string;
  total: number;
  daily: { timestamp: string; value: number }[];
}

interface DeviceTreemapProps {
  deviceData: DeviceEntry[];
  loading?: boolean;
  unit?: string;
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  percentage?: number;
  dn?: string;
  depth?: number;
  root?: boolean;
  unit?: string;
}

const CustomTreemapContent = (props: TreemapContentProps) => {
  const { x = 0, y = 0, width = 0, height = 0, name = '', size = 0, percentage = 0, dn = '', depth, unit = 'kWh' } = props;
  
  // Ignore root node to prevent undefined property errors
  if (depth === 0 || !dn) return <g />;

  const color = DEVICE_COLORS[dn] ?? '#6366f1';
  
  if (width < 30 || height < 30) return <g />;
  
  const showName = width > 80 && height > 50 && typeof name === 'string';
  const showValue = width > 100 && height > 70 && typeof size === 'number';
  const showPercent = width > 120 && height > 90 && typeof percentage === 'number';
  
  return (
    <g>
      <rect
        x={x + 2} y={y + 2}
        width={width - 4} height={height - 4}
        style={{
          fill: color,
          fillOpacity: 0.85,
          stroke: 'hsl(var(--background))',
          strokeWidth: 3,
        }}
        rx={6}
      />
      <rect
        x={x + 2} y={y + 2}
        width={width - 4} height={Math.min(height - 4, 60)}
        style={{
          fill: 'url(#treemapGradient)',
          fillOpacity: 0.3,
        }}
        rx={6}
      />
      {showName && (
        <text
          x={x + 12} y={y + 24}
          fill="white"
          fontSize={Math.min(14, width / 8)}
          fontWeight="600"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
        >
          {name}
        </text>
      )}
      {showValue && (
        <text
          x={x + 12} y={y + 44}
          fill="rgba(255,255,255,0.9)"
          fontSize={Math.min(12, width / 10)}
          fontWeight="400"
        >
          {formatKwh(size)} {unit}
        </text>
      )}
      {showPercent && (
        <text
          x={x + 12} y={y + height - 14}
          fill="rgba(255,255,255,0.7)"
          fontSize={11}
        >
          {percentage.toFixed(1)}% du total
        </text>
      )}
    </g>
  );
};

const CustomTooltip = ({ active, payload, unit = 'kWh' }: TooltipProps<number, string> & { unit?: string }) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-md p-3 shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DEVICE_COLORS[entry.dn] || '#6366f1' }} />
        <p className="text-sm font-medium text-foreground">{entry.name}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-mono text-primary">{formatKwh(entry.size)} {unit}</span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {entry.percentage.toFixed(1)}% du total
      </p>
    </div>
  );
};

const DeviceTreemap: React.FC<DeviceTreemapProps> = ({ deviceData, loading, unit = 'kWh' }) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 w-full h-full flex flex-col">
        <div className="h-4 w-48 animate-shimmer rounded mb-2" />
        <div className="h-4 w-32 animate-shimmer rounded mb-6" />
        <div className="w-full h-[380px] animate-shimmer rounded-lg" />
      </div>
    );
  }

  if (!deviceData || deviceData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 w-full h-full flex flex-col">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          RÉPARTITION PAR CONSOMMATION
        </h3>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          Surface proportionnelle à la consommation totale
        </p>
        <div className="flex items-center justify-center h-[380px] text-muted-foreground text-sm">
          Aucune donnée disponible
        </div>
      </div>
    );
  }

  const validData = deviceData.filter(d => d.total > 0).sort((a, b) => b.total - a.total);
  const totalSum = validData.reduce((acc, curr) => acc + curr.total, 0);

  const treemapData = {
    name: 'root',
    children: validData.map(d => ({
      name: d.name,
      dn: d.dn,
      size: d.total,
      percentage: totalSum > 0 ? (d.total / totalSum) * 100 : 0,
    }))
  };

  const top3Devices = validData.slice(0, 3);

  return (
    <div className="bg-card border border-border rounded-lg p-5 col-span-full w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            RÉPARTITION PAR CONSOMMATION
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Surface proportionnelle à la consommation totale
          </p>
        </div>
        <div className="flex gap-3">
          {top3Devices.map(d => (
            <div key={d.dn} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DEVICE_COLORS[d.dn] || '#6366f1' }} />
              <span className="text-xs text-muted-foreground">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={380}>
        <Treemap
          data={treemapData.children}
          dataKey="size"
          aspectRatio={4/3}
          content={<CustomTreemapContent unit={unit} />}
        >
          <defs>
            <linearGradient id="treemapGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.15" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>
          <RechartsTooltip content={<CustomTooltip unit={unit} />} />
        </Treemap>
      </ResponsiveContainer>
      
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-6 pt-6 border-t border-border">
        {validData.map((d) => (
          <div key={d.dn} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0"
                 style={{ backgroundColor: DEVICE_COLORS[d.dn] || '#6366f1' }} />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]" title={d.name}>
                {d.name.length > 12 ? `${d.name.substring(0, 10)}...` : d.name}
              </span>
              <span className="text-[10px] font-semibold text-foreground">
                {totalSum > 0 ? ((d.total / totalSum) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceTreemap;
