import React, { useMemo } from 'react';
import { DEVICES } from '@/lib/devices';
import { formatKwh, formatDateByGranularity, extractMonthLabel } from '@/lib/utils';
import { Granularity } from '@/lib/types';

interface DeviceData {
  deviceDn: string;
  deviceName: string;
  total: number;
  daily: { date: string; value: number }[];
}

interface AdvancedMetricsProps {
  deviceData: DeviceData[];
  loading?: boolean;
  granularity: Granularity;
  unit?: string;
  totalDevicesOverride?: number;
}

const AdvancedMetrics: React.FC<AdvancedMetricsProps> = ({ deviceData, loading, granularity, unit = "kWh", totalDevicesOverride }) => {
  const metrics = useMemo(() => {
    if (!deviceData || deviceData.length === 0) {
      return null;
    }

    let totalConsumption = 0;
    let activeDevicesCount = 0;
    const dailyTotals: Record<string, number> = {};

    deviceData.forEach(d => {
      totalConsumption += d.total;
      if (d.total > 0) activeDevicesCount++;
      
      d.daily.forEach(p => {
        dailyTotals[p.date] = (dailyTotals[p.date] || 0) + p.value;
      });
    });

    const dailyEntries = Object.entries(dailyTotals);
    const numberOfDays = dailyEntries.length;
    const avgConsumption = numberOfDays > 0 ? totalConsumption / numberOfDays : 0;

    let peakValue = -1;
    let dateMax = '-';
    let minValue = Infinity;
    let dateMin = '-';

    dailyEntries.forEach(([date, val]) => {
      if (val > peakValue) {
        peakValue = val;
        dateMax = date;
      }
      if (val < minValue) {
        minValue = val;
        dateMin = date;
      }
    });

    if (minValue === Infinity) minValue = 0;

    let maxMonthStr = extractMonthLabel(dateMax);
    let minMonthStr = extractMonthLabel(dateMin);
    
    return {
      total: totalConsumption,
      avg: avgConsumption,
      peak: peakValue,
      min: minValue,
      dateMax: formatDateByGranularity(dateMax, granularity),
      dateMin: formatDateByGranularity(dateMin, granularity),
      moisMax: maxMonthStr,
      moisMin: minMonthStr,
      activeCount: activeDevicesCount,
      totalDevices: totalDevicesOverride ?? DEVICES.length
    };
  }, [deviceData, granularity, totalDevicesOverride]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex flex-col h-28 rounded-md overflow-hidden border border-border">
            <div className="flex-1 bg-card/60 p-3.5 relative overflow-hidden">
               <div className="h-4 w-1/2 animate-shimmer rounded mb-2"></div>
               <div className="h-4 w-3/4 animate-shimmer rounded"></div>
            </div>
            <div className="flex-1 bg-card/40 p-3.5 relative overflow-hidden">
               <div className="h-4 w-1/2 animate-shimmer rounded mb-2"></div>
               <div className="h-4 w-3/4 animate-shimmer rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // When not loading but no data: show zero values
  const safeMetrics = metrics ?? {
    total: 0,
    avg: 0,
    peak: 0,
    min: 0,
    dateMax: '—',
    dateMin: '—',
    moisMax: '—',
    moisMin: '—',
    activeCount: 0,
    totalDevices: totalDevicesOverride ?? 0,
  };

  // Format compact style using French locale
  const formatCompact = (val: number) => {
    return formatKwh(val);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      
      {/* COLUMN 1 */}
      <div className="flex flex-col rounded-lg shadow-sm overflow-hidden border border-border bg-card">
        <div className="flex-1 p-4 flex flex-col justify-center border-b border-border/50">
          <div className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {formatCompact(safeMetrics.total)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Consommation</div>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-center bg-secondary/10">
          <div className="text-lg font-bold tracking-tight text-foreground mb-1">
            {safeMetrics.moisMax}
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mois Max</div>
        </div>
      </div>

      {/* COLUMN 2 */}
      <div className="flex flex-col rounded-lg shadow-sm overflow-hidden border border-border bg-card">
        <div className="flex-1 p-4 flex flex-col justify-center border-b border-border/50">
          <div className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {formatCompact(safeMetrics.avg)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Moyenne Journalière</div>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-center bg-secondary/10">
          <div className="text-lg font-bold tracking-tight text-foreground mb-1">
            {safeMetrics.moisMin}
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mois Min</div>
        </div>
      </div>

      {/* COLUMN 3 */}
      <div className="flex flex-col rounded-lg shadow-sm overflow-hidden border border-border bg-card">
        <div className="flex-1 p-4 flex flex-col justify-center border-b border-border/50">
          <div className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {formatCompact(safeMetrics.peak)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Peak Consommation</div>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-center bg-secondary/10">
          <div className="text-lg font-bold tracking-tight text-foreground mb-1">
            {safeMetrics.dateMax}
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date Max</div>
        </div>
      </div>

      {/* COLUMN 4 */}
      <div className="flex flex-col rounded-lg shadow-sm overflow-hidden border border-border bg-card">
        <div className="flex-1 p-4 flex flex-col justify-center border-b border-border/50">
          <div className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {formatCompact(safeMetrics.min)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Min Consommation</div>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-center bg-secondary/10 relative">
          <div className="text-lg font-bold tracking-tight text-foreground mb-1">
            {safeMetrics.dateMin}
          </div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex justify-between items-center w-full">
            <span>Date Min</span>
            <span className="font-semibold text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
              {safeMetrics.activeCount}/{safeMetrics.totalDevices} Actifs
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default AdvancedMetrics;
