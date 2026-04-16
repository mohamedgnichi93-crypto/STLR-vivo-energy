import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated, getCurrentUser } from "@/lib/auth";
import { 
  getDevicesByType, 
  transformManualEntriesToRawPoints 
} from "@/lib/manualStore";
import { 
  applyGranularityAggregation, 
  buildAggregatedTimeline, 
  buildTotalTimeline, 
  computeKPIs, 
  buildChartData 
} from "@/lib/dashboardUtils";
import { DeviceConsumption, Granularity, RawConsumptionPoint } from "@/lib/types";
import { getDefaultDateRange } from "@/lib/utils";
import { exportToExcel } from "@/lib/exportExcel";
import AdvancedMetrics from "@/components/AdvancedMetrics";
import ConsumptionLineChart from "@/components/ConsumptionLineChart";
import DeviceBarChart from "@/components/DeviceBarChart";
import DistributionPieChart from "@/components/DistributionPieChart";
import DashboardFilters from "@/components/DashboardFilters";
import TopDevicesCard from "@/components/TopDevicesCard";
import TotalConsumptionChart from "@/components/TotalConsumptionChart";
import DeviceRadarChart from "@/components/DeviceRadarChart";
import DeviceTreemap from "@/components/DeviceTreemap";
import { Zap, Download, BarChart2, Loader2, Info, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEVICE_PALETTE = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
  '#84cc16', '#a855f7',
]

function getDeviceColorById(deviceId: string): string {
  let hash = 0
  for (let i = 0; i < deviceId.length; i++) {
    hash = deviceId.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return DEVICE_PALETTE[Math.abs(hash) % DEVICE_PALETTE.length]
}

const initDates = getDefaultDateRange();
const DEFAULT_START = initDates.startDate;
const DEFAULT_END = initDates.endDate;

const ElectricityManualDashboard = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isViewer = currentUser?.role === 'viewer';

  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const [deviceData, setDeviceData] = useState<DeviceConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const rawPointsMapRef = useRef<Map<string, RawConsumptionPoint[]>>(new Map());

  useEffect(() => { if (!isAuthenticated()) navigate("/"); }, [navigate]);

  const allManualDevices = useMemo(() => getDevicesByType('electricity'), []);

  useEffect(() => {
    setSelectedDevices(allManualDevices.map(d => d.id));
  }, [allManualDevices]);

  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    rawPointsMapRef.current.clear();

    // Clear any existing timer to prevent stale updates
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    
    fetchTimerRef.current = setTimeout(() => {
      const results: DeviceConsumption[] = allManualDevices
        .filter(d => selectedDevices.includes(d.id))
        .map(device => {
          const rawPoints = transformManualEntriesToRawPoints(device.id, startDate, endDate);
          rawPointsMapRef.current.set(device.id, rawPoints);
          
          const aggregation = applyGranularityAggregation(
            rawPoints.map(p => ({ date: p.date, value: p.total })),
            granularity
          );

          return {
            deviceName: device.name,
            deviceDn: device.id,
            total: aggregation.reduce((s, d) => s + d.value, 0) || 0,
            daily: aggregation
          };
        })
        .filter(d => d.daily.length > 0);

      setDeviceData(results);
      setLoading(false);
    }, 100);
  }, [allManualDevices, selectedDevices, startDate, endDate, granularity]);

  useEffect(() => {
    if (allManualDevices.length > 0) {
      fetchData();
    } else {
      setLoading(false);
      setDeviceData([]);
    }
    // Cleanup timer on unmount or dep change
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, [fetchData, allManualDevices.length]);

  // Listen for changes from Home page or other tabs
  useEffect(() => {
    const handleStorageChange = () => {
      fetchData();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  // Safe KPI values
  const { totalConsumption, avgPerPeriod, peakValue, minValue } = useMemo(() => {
    if (deviceData.length === 0) {
      return { totalConsumption: 0, avgPerPeriod: 0, peakValue: 0, minValue: 0 };
    }
    return computeKPIs(deviceData);
  }, [deviceData]);

  const aggregatedTimeline = useMemo(() => buildAggregatedTimeline(deviceData), [deviceData]);
  const totalTimeline = useMemo(() => buildTotalTimeline(aggregatedTimeline), [aggregatedTimeline]);
  const { barData, pieData } = useMemo(() => buildChartData(deviceData), [deviceData]);

  const filteredDevices = useMemo(() => 
    allManualDevices
      .filter(d => selectedDevices.includes(d.id))
      .map((d) => ({ dn: d.id, name: d.name, color: getDeviceColorById(d.id) })),
    [allManualDevices, selectedDevices]
  );

  const chartCompatibleData = useMemo(() => deviceData.map(d => ({
    dn: d.deviceDn,
    name: d.deviceName,
    total: d.total,
    daily: d.daily.map(p => ({ timestamp: p.date, value: p.value }))
  })), [deviceData]);

  const handleExport = async () => {
    if (deviceData.length === 0) return;
    setExporting(true);
    try {
      await exportToExcel({
        deviceData,
        aggregatedTimeline: aggregatedTimeline as any[],
        rawPointsMap: rawPointsMapRef.current,
        startDate,
        endDate,
        granularity,
        phase: 'Total',
        totalConsumption,
        avgPerPeriod,
        peakValue,
        minValue,
        selectedDevices: deviceData.map(d => d.deviceDn),
        unit: 'kWh',
      });
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {isViewer && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-4 w-fit">
          <Eye className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs font-medium text-blue-400">Mode lecture seule</span>
        </div>
      )}
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-green-400" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Électricité — Manuel</h1>
            <p className="text-xs text-muted-foreground">Données saisies manuellement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isViewer && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/comparison-manual?type=electricity')}
                disabled={deviceData.length === 0}
                className="gap-2"
              >
                <BarChart2 className="h-4 w-4 text-blue-500" />
                <span className="hidden sm:inline">Détails</span>
              </Button>

              <Button 
                size="sm"
                onClick={handleExport}
                disabled={exporting || deviceData.length === 0}
                className="gap-2"
              >
                {exporting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> <span className="hidden sm:inline">Export...</span></>
                ) : (
                  <><Download className="h-4 w-4" /> <span className="hidden sm:inline">Exporter Excel</span></>
                )}
              </Button>
            </>
          )}
        </div>
      </header>

      {allManualDevices.length === 0 && !loading && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6 group transition-all hover:bg-primary/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Aucun appareil configuré</p>
              <p className="text-xs text-muted-foreground">Créez un appareil de type électricité dans l'accueil pour commencer la saisie.</p>
            </div>
          </div>
          {!isViewer && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/home/electricity')}
              className="text-primary hover:text-primary hover:bg-primary/10 font-bold"
            >
              + Ajouter un appareil →
            </Button>
          )}
        </div>
      )}

      <DashboardFilters
        startDate={startDate}
        endDate={endDate}
        selectedDevices={selectedDevices}
        selectedDepartment="all"
        granularity={granularity}
        phase="total"
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onDevicesChange={setSelectedDevices}
        onDepartmentChange={() => {}}
        onGranularityChange={setGranularity}
        onPhaseChange={() => {}}
        isDirty={false}
        onApply={fetchData}
        loading={loading}
        hidePhase={true}
        hideDepartment={true}
        availableDevices={allManualDevices.map(d => ({ dn: d.id, name: d.name }))}
      />

      <div className="mt-8">
        <div className="space-y-6">
          <AdvancedMetrics 
            deviceData={deviceData} 
            loading={loading} 
            granularity={granularity} 
            totalDevicesOverride={allManualDevices.length}
          />

          <TopDevicesCard
            deviceData={deviceData}
            loading={loading}
            totalConsumption={totalConsumption}
            unit="kWh"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-[400px]">
                <ConsumptionLineChart
                  data={aggregatedTimeline}
                  devices={filteredDevices}
                  loading={loading}
                  granularity={granularity}
                  unit="kWh"
                  className="h-full"
                />
              </div>
              <div className="h-[300px]">
                <DeviceBarChart 
                  data={barData} 
                  loading={loading} 
                  unit="kWh"
                  className="h-full" 
                />
              </div>
            </div>
            <div className="space-y-6">
              <div className="h-[400px]">
                <DistributionPieChart 
                  data={pieData} 
                  loading={loading} 
                  unit="kWh"
                  className="h-full" 
                />
              </div>
              <div className="h-[300px]">
                <TotalConsumptionChart 
                  data={totalTimeline}
                  granularity={granularity}
                  loading={loading}
                  unit="kWh"
                  className="h-full"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="h-[450px]">
              <DeviceTreemap 
                deviceData={chartCompatibleData} 
                loading={loading} 
              />
            </div>
            <div className="h-[450px]">
              <DeviceRadarChart 
                deviceData={chartCompatibleData} 
                loading={loading} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ElectricityManualDashboard;
