import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";
import { WATER_DEVICES } from "@/lib/devices";
import { fetchAllWaterDevicesSequential } from "@/lib/api";
import {
  applyGranularityAggregation,
  buildAggregatedTimeline,
  computeKPIs,
} from "@/lib/dashboardUtils";
import {
  RawConsumptionPoint,
  DeviceConsumption,
  Granularity,
} from "@/lib/types";
import {
  validateDataset,
  aggregateValidation,
  logValidation,
  ValidationResult,
  ValidationIssue,
} from "@/lib/validation";
import { getDefaultDateRange, formatKwh } from "@/lib/utils";
import ConsumptionLineChart from "@/components/ConsumptionLineChart";
import { ChartErrorBoundary } from "@/components/ChartErrorBoundary";
import AdvancedMetrics from "@/components/AdvancedMetrics";
import DashboardFilters from "@/components/DashboardFilters";
import ValidationReport from "@/components/ValidationReport";
import EmptyState from "@/components/EmptyState";
import { Droplets, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FetchResult } from "@/lib/api";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from "recharts";

/* ── Constants ────────────────────────────────────────────────────────────── */

const WATER_UNIT = "m³";

interface AppliedFilters {
  startDate: string;
  endDate: string;
  devices: string[];
  department: string;
  granularity: Granularity;
  phase: "total";
}

const initDates = getDefaultDateRange();
const DEFAULT_START = initDates.startDate;
const DEFAULT_END = initDates.endDate;
const ALL_WATER_DEVICES = WATER_DEVICES.map((d) => d.dn);

/* ── Component ────────────────────────────────────────────────────────────── */

const WaterWattnowDashboard = () => {
  const navigate = useNavigate();

  /* ─ Pending filter state ─ */
  const [pendingStartDate, setPendingStartDate] = useState(DEFAULT_START);
  const [pendingEndDate, setPendingEndDate] = useState(DEFAULT_END);
  const [pendingDevices, setPendingDevices] = useState<string[]>(ALL_WATER_DEVICES);
  const [pendingDepartment, setPendingDepartment] = useState("all");
  const [pendingGranularity, setPendingGranularity] = useState<Granularity>("daily");

  /* ─ Applied filters (phase forced to 'total' — water has no phases) ─ */
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
    startDate: DEFAULT_START,
    endDate: DEFAULT_END,
    devices: ALL_WATER_DEVICES,
    department: "all",
    granularity: "daily",
    phase: "total",
  });

  /* ─ Data state ─ */
  const [deviceData, setDeviceData] = useState<DeviceConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code?: string | number; message: string } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [rateLimitedDns, setRateLimitedDns] = useState<string[]>([]);

  const rawPointsMapRef = useRef<Map<string, RawConsumptionPoint[]>>(new Map());
  const lineChartRef = useRef<HTMLDivElement>(null);

  /* ─ Auth guard ─ */
  useEffect(() => {
    if (!isAuthenticated()) navigate("/");
  }, [navigate]);

  /* ─ Dirty check ─ */
  const isDirty = useMemo(
    () =>
      pendingStartDate !== appliedFilters.startDate ||
      pendingEndDate !== appliedFilters.endDate ||
      pendingDepartment !== appliedFilters.department ||
      pendingGranularity !== appliedFilters.granularity ||
      JSON.stringify([...pendingDevices].sort()) !==
        JSON.stringify([...appliedFilters.devices].sort()),
    [pendingStartDate, pendingEndDate, pendingDevices, pendingDepartment, pendingGranularity, appliedFilters]
  );

  /* ─ Process raw API points into DeviceConsumption ─ */
  const processDeviceData = useCallback(
    (dn: string, rawPoints: RawConsumptionPoint[], filters: AppliedFilters) => {
      const device = WATER_DEVICES.find((d) => d.dn === dn);
      if (!device) return null;

      const fetchGranularity: Granularity =
        filters.granularity === "weekly" || filters.granularity === "monthly"
          ? "daily"
          : filters.granularity;

      const { validated, issues } = validateDataset(
        rawPoints,
        device.name,
        fetchGranularity,
        filters.startDate,
        filters.endDate
      );

      // Water: always use total (no phases)
      const pts = validated.map((p) => ({ date: p.date, value: p.total }));
      const agg = applyGranularityAggregation(pts, filters.granularity);

      return {
        device: {
          deviceName: device.name,
          deviceDn: dn,
          total: agg.reduce((s, d) => s + d.value, 0),
          daily: agg,
        },
        issues,
      };
    },
    []
  );

  /* ─ Core data loader ─ */
  const fetchAllData = useCallback(
    async (filters: AppliedFilters, forceRefresh: boolean = false) => {
      const { startDate, endDate, devices, granularity } = filters;

      if (devices.length === 0 || !startDate || !endDate || startDate > endDate) {
        setDeviceData([]);
        setLoading(false);
        setValidationResult(null);
        return;
      }

      if (granularity === "hourly") {
        const diff =
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
        if (diff > 90) {
          toast.warning(
            "L'affichage horaire est limité à 90 jours. Passage en mode journalier.",
            { duration: 4000 }
          );
          const corrected: AppliedFilters = { ...filters, granularity: "daily" };
          setAppliedFilters(corrected);
          setPendingGranularity("daily");
          fetchAllData(corrected);
          return;
        }
      }

      const fetchGranularity: Granularity =
        granularity === "weekly" || granularity === "monthly" ? "daily" : granularity;

      if (deviceData.length === 0) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);
      setRateLimitedDns([]);
      setLoadProgress({ loaded: 0, total: devices.length });

      try {
        const allIssues: ValidationIssue[] = [];
        let totalPoints = 0;
        const partialResults = new Map<string, DeviceConsumption>();

        const fetchMap = await fetchAllWaterDevicesSequential(
          devices,
          startDate,
          endDate,
          fetchGranularity,
          (loaded, total) => setLoadProgress({ loaded, total }),
          forceRefresh,
          (dn, result) => {
            const processed = processDeviceData(dn, result.data, filters);
            if (processed) {
              rawPointsMapRef.current.set(dn, result.data);
              partialResults.set(dn, processed.device);
              allIssues.push(...processed.issues);
              totalPoints += result.data.length;
              setDeviceData(Array.from(partialResults.values()));
            }
          }
        );

        const limited: string[] = [];
        for (const [dn, result] of fetchMap.entries()) {
          if (result.rateLimited) limited.push(dn);
        }
        if (limited.length > 0) {
          setRateLimitedDns(limited);
          const names = limited
            .map((dn) => WATER_DEVICES.find((d) => d.dn === dn)?.name ?? dn)
            .join(", ");
          toast.warning(
            `⚠️ Limite API atteinte pour : ${names}. Réessayez dans quelques minutes.`,
            { duration: 8000 }
          );
        }

        if (partialResults.size === 0) {
          throw new Error("Aucune donnée disponible pour les compteurs d'eau sélectionnés");
        }

        const validation = aggregateValidation(allIssues, totalPoints);
        setValidationResult(validation);
        setLastUpdate(new Date());
        logValidation(validation);

        const cachedCount = [...fetchMap.values()].filter((r) => r.fromCache).length;
        if (cachedCount > 0 && !forceRefresh) {
          toast.info(`${cachedCount} compteur(s) chargé(s) depuis le cache`);
        }
        if (forceRefresh) {
          toast.success("Données actualisées depuis l'API ✓");
        }
      } catch (err) {
        const errorObj = err as { status?: number; message?: string };
        const code = errorObj.status ?? "ERR";
        const message =
          errorObj.message || (err instanceof Error ? err.message : "Erreur inconnue");
        setError({ code, message });
        setDeviceData([]);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadProgress(null);
      }
    },
    [deviceData.length, processDeviceData]
  );

  /* ─ Granularity change handler ─ */
  const handleGranularityChange = useCallback(
    (newGranularity: Granularity) => {
      if (newGranularity === "hourly") {
        const diffDays = Math.ceil(
          (new Date(pendingEndDate).getTime() -
            new Date(pendingStartDate).getTime()) /
            86400000
        );
        if (diffDays > 90) {
          const end = new Date();
          end.setDate(end.getDate() - 1);
          const start = new Date(end);
          start.setDate(start.getDate() - 6);

          setPendingStartDate(start.toISOString().split("T")[0]);
          setPendingEndDate(end.toISOString().split("T")[0]);

          toast.info("Période ajustée à 7 jours pour le mode horaire", {
            duration: 3000,
          });
        }
      }
      setPendingGranularity(newGranularity);
    },
    [pendingStartDate, pendingEndDate]
  );

  /* ─ Apply filters ─ */
  const handleApplyFilters = useCallback(() => {
    const next: AppliedFilters = {
      startDate: pendingStartDate,
      endDate: pendingEndDate,
      devices: pendingDevices,
      department: pendingDepartment,
      granularity: pendingGranularity,
      phase: "total",
    };
    setAppliedFilters(next);
    fetchAllData(next);
  }, [
    pendingStartDate,
    pendingEndDate,
    pendingDevices,
    pendingDepartment,
    pendingGranularity,
    fetchAllData,
  ]);

  /* ─ Initial load ─ */
  useEffect(() => {
    fetchAllData(appliedFilters);
  }, []); // intentional: run only on mount

  /* ── Derived data ──────────────────────────────────────────────────────── */

  const filteredDevices = useMemo(() => {
    return WATER_DEVICES.filter((device) =>
      appliedFilters.devices.includes(device.dn)
    ).map((device) => ({ dn: device.dn, name: device.name, color: device.color }));
  }, [appliedFilters.devices]);

  const { totalConsumption, avgPerPeriod, peakValue, minValue } = useMemo(
    () => computeKPIs(deviceData),
    [deviceData]
  );
  const aggregatedTimeline = useMemo(
    () => buildAggregatedTimeline(deviceData),
    [deviceData]
  );
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    deviceData.forEach(d => {
      d.daily.forEach(point => {
        const month = point.date.substring(0, 7); // "2025-01"
        map.set(month, (map.get(month) ?? 0) + point.value);
      });
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        label: new Date(month + '-01').toLocaleDateString('fr-FR', { 
          month: 'short', year: '2-digit' 
        }),
        value: +value.toFixed(3),
      }));
  }, [deviceData]);

  const weeklyPatternData = useMemo(() => {
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dayShort = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    
    deviceData.forEach(d => {
      d.daily.forEach(point => {
        const dayIndex = new Date(point.date).getDay(); // 0=Sun, 6=Sat
        sums[dayIndex] += point.value;
        counts[dayIndex]++;
      });
    });
    
    // Reorder to Mon-Sun (1,2,3,4,5,6,0)
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.map(i => ({
      day: dayShort[i],
      fullDay: dayNames[i],
      avg: counts[i] > 0 ? +(sums[i] / counts[i]).toFixed(3) : 0,
      isWeekend: i === 0 || i === 6,
    }));
  }, [deviceData]);

  const cumulativeData = useMemo(() => {
    const allPoints = deviceData
      .flatMap(d => d.daily)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    let cumulative = 0;
    return allPoints.map(point => {
      cumulative += point.value;
      return {
        date: point.date,
        label: new Date(point.date).toLocaleDateString('fr-FR', { 
          day: '2-digit', month: '2-digit' 
        }),
        cumulative: +cumulative.toFixed(3),
        daily: +point.value.toFixed(3),
      };
    });
  }, [deviceData]);

  /* ── Export handler (Excel) ─────────────────────────────────────────────── */
  const handleExport = useCallback(async () => {
    if (deviceData.length === 0) {
      toast.warning("Aucune donnée à exporter.");
      return;
    }
    setExporting(true);
    try {
      const { exportToExcel } = await import("@/lib/exportExcel");
      await exportToExcel({
        deviceData,
        aggregatedTimeline: aggregatedTimeline as Record<string, unknown>[],
        rawPointsMap: rawPointsMapRef.current,
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        granularity: appliedFilters.granularity,
        phase: "total",
        totalConsumption,
        avgPerPeriod,
        peakValue,
        minValue,
        selectedDevices: appliedFilters.devices,
      });
      toast.success("Rapport exporté avec succès ✓");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "inconnue";
      toast.error(`Erreur export : ${msg}`);
    } finally {
      setExporting(false);
    }
  }, [
    deviceData,
    aggregatedTimeline,
    appliedFilters,
    totalConsumption,
    avgPerPeriod,
    peakValue,
    minValue,
  ]);

  /* ── Main content renderer ──────────────────────────────────────────────── */

  const renderMainContent = () => {
    if (error && !loading) {
      return (
        <EmptyState
          type="error"
          errorCode={error.code}
          errorMessage={error.message}
          onRetry={() => fetchAllData(appliedFilters)}
        />
      );
    }

    const hasAnyData = deviceData.some((d) => d.daily.length > 0);

    if (!loading && !hasAnyData) {
      return (
        <EmptyState
          type="no-data"
          onRetry={() => fetchAllData(appliedFilters)}
        />
      );
    }

    const loadingBanner = loading ? (
      <div className="mb-4 bg-secondary/50 border border-border rounded-lg p-3 text-center text-sm font-medium text-foreground flex items-center justify-center">
        <span className="animate-pulse flex items-center gap-2">
          ⏳{" "}
          {loadProgress
            ? `Chargement en cours... (${loadProgress.loaded}/${loadProgress.total} compteurs)`
            : "Initialisation..."}
        </span>
      </div>
    ) : null;

    return (
      <div
        className={`overflow-x-hidden w-full ${
          refreshing
            ? "opacity-50 pointer-events-none transition-opacity duration-300"
            : "transition-opacity duration-300"
        }`}
      >
        {loadingBanner}
        <AdvancedMetrics
          deviceData={deviceData}
          loading={loading}
          granularity={appliedFilters.granularity}
          unit={WATER_UNIT}
          totalDevicesOverride={WATER_DEVICES.length}
        />

        <div className="mt-4" ref={lineChartRef}>
          <ChartErrorBoundary>
            <ConsumptionLineChart
              data={aggregatedTimeline}
              devices={filteredDevices}
              loading={loading}
              granularity={appliedFilters.granularity}
              phaseLabel="Volume"
              unit={WATER_UNIT}
              className="h-[400px]"
            />
          </ChartErrorBoundary>
        </div>

        {/* NEW CHART 1 — Monthly Bar Chart */}
        <div className="bg-card border border-border rounded-xl p-5 mt-4">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              CONSOMMATION MENSUELLE — VOLUME
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agrégation mensuelle en m³
            </p>
          </div>
          {monthlyData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              Aucune donnée disponible
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    angle={-35}
                    textAnchor="end"
                    height={55}
                    interval={0}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v: number) => formatKwh(v)}
                    width={75}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`${formatKwh(value)} m³`, 'Volume']}
                    labelFormatter={(label: string) => `Mois : ${label}`}
                  />
                  <Bar dataKey="value" fill="#0EA5E9" radius={[4, 4, 0, 0]}>
                    <LabelList 
                      dataKey="value" 
                      position="top" 
                      formatter={(v: number) => formatKwh(v)}
                      style={{ fontSize: '9px', fill: 'hsl(var(--muted-foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Row 4 — Weekly pattern + Cumulative (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* NEW CHART 2 — Weekly Pattern Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                PROFIL HEBDOMADAIRE — VOLUME MOYEN
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Consommation moyenne par jour de la semaine (m³)
              </p>
            </div>
            {weeklyPatternData.every(d => d.avg === 0) ? (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                Aucune donnée disponible
              </div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyPatternData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v: number) => formatKwh(v)}
                      width={75}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, _: string, props: { payload?: { fullDay?: string } }) => [
                        `${formatKwh(value)} m³`,
                        props.payload?.fullDay ?? 'Moyenne'
                      ]}
                    />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {weeklyPatternData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.isWeekend ? '#0369A1' : '#0EA5E9'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#0EA5E9' }} />
                <span className="text-xs text-muted-foreground">Jour de semaine</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#0369A1' }} />
                <span className="text-xs text-muted-foreground">Weekend</span>
              </div>
            </div>
          </div>

          {/* NEW CHART 3 — Cumulative Consumption Line */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                CONSOMMATION CUMULÉE
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Volume total accumulé sur la période (m³)
              </p>
            </div>
            {cumulativeData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Aucune donnée disponible
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulativeData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v: number) => formatKwh(v)}
                      width={75}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, name: string) => [
                        `${formatKwh(value)} m³`,
                        name === 'cumulative' ? 'Cumulé' : 'Journalier'
                      ]}
                      labelFormatter={(label: string) => `Date : ${label}`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cumulative" 
                      stroke="#0EA5E9" 
                      strokeWidth={2}
                      fill="url(#cumulativeGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {cumulativeData.length > 0 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
                <span>
                  Début : <span className="text-foreground font-mono font-bold">
                    {formatKwh(cumulativeData[0]?.cumulative ?? 0)} m³
                  </span>
                </span>
                <span>
                  Total accumulé : <span className="text-cyan-400 font-mono font-bold">
                    {formatKwh(cumulativeData[cumulativeData.length - 1]?.cumulative ?? 0)} m³
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Droplets className="h-6 w-6 text-cyan-400" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                Vue d'ensemble — WattNow Eau
              </h1>
              {refreshing && (
                <span className="text-[10px] font-bold text-cyan-400 animate-pulse bg-cyan-400/10 px-1.5 py-0.5 rounded border border-cyan-400/20 uppercase tracking-tighter">
                  Mise à jour...
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              STLR Énergie Intelligente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading || exporting || deviceData.length === 0}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            {exporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Export en cours...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Exporter Excel
              </>
            )}
          </Button>
        </div>
      </header>

      <DashboardFilters
        startDate={pendingStartDate}
        endDate={pendingEndDate}
        selectedDevices={pendingDevices}
        selectedDepartment={pendingDepartment}
        granularity={pendingGranularity}
        phase="total"
        onStartDateChange={setPendingStartDate}
        onEndDateChange={setPendingEndDate}
        onDevicesChange={setPendingDevices}
        onDepartmentChange={setPendingDepartment}
        onGranularityChange={handleGranularityChange}
        onPhaseChange={() => {}}
        isDirty={isDirty}
        onApply={handleApplyFilters}
        loading={loading}
        rateLimitedDns={rateLimitedDns}
        hidePhase
        hideDepartment
        availableDevices={WATER_DEVICES}
      />

      <ValidationReport result={validationResult} lastUpdate={lastUpdate} />

      {renderMainContent()}
    </div>
  );
};

export default WaterWattnowDashboard;
