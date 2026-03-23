import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated, logout } from "@/lib/auth";
import { DEVICES } from "@/lib/devices";
import { fetchAllDevicesSequential } from "@/lib/api";
import { ConsumptionPoint, DeviceConsumption, Granularity, Phase, PHASE_LABELS, extractPhaseValue, aggregateToWeekly, aggregateToMonthly } from "@/lib/types";
import { validateDataset, aggregateValidation, getDeviceStatus, logValidation, ValidationResult, ValidationIssue } from "@/lib/validation";
import KPICard from "@/components/KPICard";
import ConsumptionLineChart from "@/components/ConsumptionLineChart";
import DeviceBarChart from "@/components/DeviceBarChart";
import DistributionPieChart from "@/components/DistributionPieChart";
import DashboardFilters from "@/components/DashboardFilters";
import ValidationReport from "@/components/ValidationReport";
import EmptyState from "@/components/EmptyState";
import { Zap, TrendingUp, Activity, Cpu, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AppliedFilters {
  startDate: string;
  endDate: string;
  devices: string[];
  department: string;
  granularity: Granularity;
  phase: Phase;
}

const getDefaultDates = () => {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(sevenDaysAgo), end: fmt(today) };
};

const { start: DEFAULT_START, end: DEFAULT_END } = getDefaultDates();
const ALL_DEVICES = DEVICES.map(d => d.dn);

const getAvgLabel = (granularity: Granularity): string => {
  switch (granularity) {
    case "hourly":  return "MOY. HORAIRE";
    case "weekly":  return "MOY. HEBDOMADAIRE";
    case "monthly": return "MOY. MENSUELLE";
    default:        return "MOY. JOURNALIERE";
  }
};

const applyGranularityAggregation = (points: ConsumptionPoint[], granularity: Granularity): ConsumptionPoint[] => {
  if (granularity === "weekly")  return aggregateToWeekly(points);
  if (granularity === "monthly") return aggregateToMonthly(points);
  return points;
};

const MONTH_ORDER: Record<string, number> = {
  Janvier:1,Fevrier:2,Mars:3,Avril:4,Mai:5,Juin:6,
  Juillet:7,Aout:8,Septembre:9,Octobre:10,Novembre:11,Decembre:12
};

const getDateSortKey = (date: string): number => {
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return new Date(date).getTime();
  const monthMatch = date.match(/^(\w+)\s+(\d{4})$/);
  if (monthMatch) {
    const m = MONTH_ORDER[monthMatch[1]] ?? 0;
    return parseInt(monthMatch[2]) * 100 + m;
  }
  const weekMatch = date.match(/Sem\.\s*(\d+)\s*-\s*(\d{4})/);
  if (weekMatch) return parseInt(weekMatch[2]) * 100 + parseInt(weekMatch[1]);
  return 0;
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [pendingStartDate, setPendingStartDate] = useState(DEFAULT_START);
  const [pendingEndDate, setPendingEndDate] = useState(DEFAULT_END);
  const [pendingDevices, setPendingDevices] = useState<string[]>(ALL_DEVICES);
  const [pendingDepartment, setPendingDepartment] = useState("all");
  const [pendingGranularity, setPendingGranularity] = useState<Granularity>("daily");
  const [pendingPhase, setPendingPhase] = useState<Phase>("total");

  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
    startDate: DEFAULT_START, endDate: DEFAULT_END,
    devices: ALL_DEVICES, department: "all",
    granularity: "daily", phase: "total",
  });

  const [deviceData, setDeviceData] = useState<DeviceConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code?: string | number; message: string } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, "ok" | "delayed" | "error">>({});
  const [usingMockData, setUsingMockData] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => { if (!isAuthenticated()) navigate("/"); }, [navigate]);

  const isDirty = useMemo(() => (
    pendingStartDate !== appliedFilters.startDate ||
    pendingEndDate !== appliedFilters.endDate ||
    pendingDepartment !== appliedFilters.department ||
    pendingGranularity !== appliedFilters.granularity ||
    pendingPhase !== appliedFilters.phase ||
    JSON.stringify([...pendingDevices].sort()) !== JSON.stringify([...appliedFilters.devices].sort())
  ), [pendingStartDate, pendingEndDate, pendingDevices, pendingDepartment, pendingGranularity, pendingPhase, appliedFilters]);

  const fetchAllData = useCallback(async (filters: AppliedFilters) => {
    const { startDate, endDate, devices, granularity, phase } = filters;

    if (devices.length === 0 || !startDate || !endDate || startDate > endDate) {
      setDeviceData([]); setLoading(false); setValidationResult(null); return;
    }

    if (granularity === "hourly") {
      const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
      if (diff > 31) {
        toast.warning("L'affichage horaire est limite a 31 jours. Bascule en journalier.");
        const corrected = { ...filters, granularity: "daily" as Granularity };
        setAppliedFilters(corrected);
        setPendingGranularity("daily");
        fetchAllData(corrected);
        return;
      }
    }

    setLoading(true); setError(null);

    try {
      const allIssues: ValidationIssue[] = [];
      let totalPoints = 0;
      const statuses: Record<string, "ok" | "delayed" | "error"> = {};
      let anyMock = false;

      const fetchGranularity: Granularity = (granularity === "weekly" || granularity === "monthly") ? "daily" : granularity;

      // Sequential fetch with 200ms delay between devices
      const fetchMap = await fetchAllDevicesSequential(devices, startDate, endDate, fetchGranularity);

      const successful: DeviceConsumption[] = [];
      let failedCount = 0;

      for (const dn of devices) {
        const fetchResult = fetchMap.get(dn);
        if (!fetchResult || (!fetchResult.data && fetchResult.error)) { 
          failedCount++; 
          statuses[dn] = "error"; 
          continue; 
        }

        if (fetchResult.isMock) anyMock = true;

        const rawData = fetchResult.data;

        const device = DEVICES.find(d => d.dn === dn)!;
        const { validated, issues } = validateDataset(rawData, device.name, fetchGranularity, startDate, endDate);
        allIssues.push(...issues);
        totalPoints += rawData.length;
        statuses[dn] = getDeviceStatus(validated, fetchGranularity);

        const dailyPoints = validated.map(p => ({ date: p.date, value: extractPhaseValue(p, phase) }));
        const aggregated = applyGranularityAggregation(dailyPoints, granularity);
        const total = aggregated.reduce((sum, d) => sum + d.value, 0);
        successful.push({ deviceName: device.name, deviceDn: dn, total, daily: aggregated });
      }

      if (failedCount === devices.length && devices.length > 0) {
        let mainErr: any = null;
        for (const dn of devices) {
          if (fetchMap.get(dn)?.error) {
            mainErr = fetchMap.get(dn)!.error;
            break;
          }
        }
        throw mainErr || new Error("All devices failed to load");
      } else if (failedCount > 0) {
        toast.warning(`${failedCount} appareil(s) : échec du chargement`);
      }

      setDeviceData(successful);
      setDeviceStatuses(statuses);
      setUsingMockData(anyMock);

      const validation = aggregateValidation(allIssues, totalPoints);
      setValidationResult(validation);
      setLastUpdate(new Date());
      logValidation(validation);
    } catch (err: any) {
      const code = err?.status ?? err?.code ?? "ERR";
      const message = err?.message ?? "Erreur inconnue";
      setError({ code, message });
      setDeviceData([]);
      toast.error("Erreur lors du chargement des donnees");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApplyFilters = useCallback(() => {
    const next: AppliedFilters = {
      startDate: pendingStartDate, endDate: pendingEndDate,
      devices: pendingDevices, department: pendingDepartment,
      granularity: pendingGranularity, phase: pendingPhase,
    };
    setAppliedFilters(next);
    fetchAllData(next);
  }, [pendingStartDate, pendingEndDate, pendingDevices, pendingDepartment, pendingGranularity, pendingPhase, fetchAllData]);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      fetchAllData(appliedFilters);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const phaseLabel = PHASE_LABELS[appliedFilters.phase];
  const avgLabel = getAvgLabel(appliedFilters.granularity);

  const totalConsumption = useMemo(() => deviceData.reduce((s, d) => s + d.total, 0), [deviceData]);
  const avgPerPeriod = useMemo(() => {
    const pts = deviceData.flatMap(d => d.daily);
    return pts.length === 0 ? 0 : pts.reduce((s, d) => s + d.value, 0) / pts.length;
  }, [deviceData]);
  const peakValue = useMemo(() => {
    const vals = deviceData.flatMap(d => d.daily.map(p => p.value));
    return vals.length > 0 ? Math.max(...vals) : 0;
  }, [deviceData]);

  const aggregatedTimeline = useMemo(() => {
    const map: Record<string, number> = {};
    deviceData.forEach(d => d.daily.forEach(p => { map[p.date] = (map[p.date] || 0) + p.value; }));
    return Object.entries(map)
      .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => getDateSortKey(a.date) - getDateSortKey(b.date));
  }, [deviceData]);

  const barData = useMemo(() => deviceData.map(d => ({ name: d.deviceName, total: Math.round(d.total * 100) / 100 })), [deviceData]);
  const pieData = useMemo(() => deviceData.filter(d => d.total > 0).map(d => ({ name: d.deviceName, value: Math.round(d.total * 100) / 100 })), [deviceData]);

  const formatNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  const renderMainContent = () => {
    if (error && !loading) {
      return <EmptyState type="error" errorCode={error.code} errorMessage={error.message} onRetry={() => fetchAllData(appliedFilters)} />;
    }
    
    const hasAnyData = deviceData.some(d => d.daily.length > 0);
    
    if (!loading && !usingMockData && !hasAnyData) {
      return <EmptyState type="no-data" onRetry={() => fetchAllData(appliedFilters)} />;
    }
    
    const demoSuffix = usingMockData ? " (DEMO)" : "";
    
    const loadingBanner = loading ? (
      <div className="mb-4 bg-secondary/50 border border-border rounded-lg p-3 text-center text-sm font-medium text-foreground flex items-center justify-center">
        <span className="animate-pulse flex items-center gap-2">
          ⏳ Chargement des données...
        </span>
      </div>
    ) : null;

    return (
      <>
        {loadingBanner}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <KPICard title={`Consommation totale - ${phaseLabel}${demoSuffix}`} value={formatNumber(totalConsumption)} unit="kWh" icon={Zap} loading={loading} />
          <KPICard title={`${avgLabel} - ${phaseLabel}${demoSuffix}`} value={formatNumber(avgPerPeriod)} unit="kWh" icon={TrendingUp} loading={loading} />
          <KPICard title={`Pic de demande - ${phaseLabel}${demoSuffix}`} value={formatNumber(peakValue)} unit="kWh" icon={Activity} loading={loading} />
          <KPICard title={`Appareils actifs${demoSuffix}`} value={`${appliedFilters.devices.length}`} unit={`/ ${DEVICES.length}`} icon={Cpu} loading={loading} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <div className="lg:col-span-2">
            <ConsumptionLineChart data={aggregatedTimeline} loading={loading} granularity={appliedFilters.granularity} phaseLabel={phaseLabel + demoSuffix} />
          </div>
          <DistributionPieChart data={pieData} loading={loading} phaseLabel={phaseLabel + demoSuffix} />
        </div>
        <div className="mt-4">
          <DeviceBarChart data={barData} loading={loading} phaseLabel={phaseLabel + demoSuffix} />
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Vue d'ensemble</h1>
            <p className="text-xs text-muted-foreground">STLR Energie Intelligente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchAllData(appliedFilters)} disabled={loading} className="border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate("/"); }} className="border-border text-muted-foreground hover:text-foreground">
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Deconnexion
          </Button>
        </div>
      </header>

      {usingMockData && !loading && (
        <div className="mb-4 rounded-lg p-3 text-center text-sm font-medium text-white animate-pulse" style={{ backgroundColor: "#DC2626" }}>
          DONNEES DE DEMONSTRATION — L'API est indisponible. Les valeurs affichees sont fictives.
        </div>
      )}

      <DashboardFilters
        startDate={pendingStartDate} endDate={pendingEndDate}
        selectedDevices={pendingDevices} selectedDepartment={pendingDepartment}
        granularity={pendingGranularity} phase={pendingPhase}
        onStartDateChange={setPendingStartDate} onEndDateChange={setPendingEndDate}
        onDevicesChange={setPendingDevices} onDepartmentChange={setPendingDepartment}
        onGranularityChange={setPendingGranularity} onPhaseChange={setPendingPhase}
        isDirty={isDirty} onApply={handleApplyFilters} loading={loading}
        deviceStatuses={deviceStatuses}
      />

      <ValidationReport result={validationResult} lastUpdate={lastUpdate} />

      {renderMainContent()}
    </div>
  );
};

export default Dashboard;
