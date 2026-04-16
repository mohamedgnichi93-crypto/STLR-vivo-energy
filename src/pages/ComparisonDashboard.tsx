import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Link } from "react-router-dom";
import { 
  ArrowLeft, Calendar as CalendarIcon, Cpu, Activity, BarChart2, TrendingUp, TrendingDown, Download, AlertCircle, Zap, Info, Plus, X, Target, Loader2
} from "lucide-react";
import { 
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, 
  Tooltip as RechartsTooltip, XAxis, YAxis, Cell, Radar, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, ReferenceLine, Line, LineChart 
} from "recharts";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { checkAllCaches } from "@/lib/cacheManager";
import { DEVICES, getDeviceColor } from "@/lib/devices";
import { formatKwh, clampDate, ensureDateOrder, getDefaultDateRange } from "@/lib/utils";
import { Phase, PHASE_LABELS, extractPhaseValue, RawConsumptionPoint, aggregateToMonthly } from "@/lib/types";
import { exportComparisonToExcel } from "@/lib/exportExcel";

// Mode definitions
type CompareMode = "devices" | "dates" | "years";

// Heatmap constants
const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const defaultRange = getDefaultDateRange();
const previousYear = new Date().getFullYear() - 1;

export default function ComparisonDashboard() {
  // --- UI STATE ---
  const [mode, setMode] = useState<CompareMode>("devices");
  const [phase, setPhase] = useState<Phase>("total");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([DEVICES[0].dn, DEVICES[1].dn]);

  // Mode: Dates/Devices
  const [startDateA, setStartDateA] = useState(defaultRange.startDate);
  const [endDateA, setEndDateA] = useState(defaultRange.endDate);
  const [startDateB, setStartDateB] = useState(defaultRange.startDate);
  const [endDateB, setEndDateB] = useState(defaultRange.endDate);

  // Mode: Years
  const [yearA, setYearA] = useState(new Date().getFullYear().toString());
  const [yearB, setYearB] = useState(previousYear.toString());
  const [startMonth, setStartMonth] = useState("01");
  const [endMonth, setEndMonth] = useState("06");

  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map DN codes to device names for Excel export
  const dnToName = useMemo(() => {
    const map: Record<string, string> = {};
    DEVICES.forEach(d => { map[d.dn] = d.name; });
    return map;
  }, []);

  // --- DATA STATE (Snapshot of active parameters + loaded records) ---
  const [activeVis, setActiveVis] = useState<{
    mode: CompareMode;
    phase: Phase;
    devices: string[];
    periodA: string; // Used for UI labels
    periodB: string; // Used for UI labels
    startDate?: string;
    endDate?: string;
  } | null>(null);

  const [dataA, setDataA] = useState<Map<string, RawConsumptionPoint[]>>(new Map());
  const [dataB, setDataB] = useState<Map<string, RawConsumptionPoint[]>>(new Map());

  // Component mounted initialization hook — ONLY load defaults silently.
  useEffect(() => {
    handleApply(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set isDirty safely wrapper
  const markDirty = () => setIsDirty(true);

  // Input Guards
  const handleDateBlur = (val: string, setter: (val: string) => void, limitRole: 'start' | 'end') => {
    if (!val) return;
    const clamped = clampDate(val, limitRole);
    setter(clamped);
    markDirty();
  };

  const handleDeviceUpdate = (index: number, val: string) => {
    const arr = [...selectedDevices];
    arr[index] = val;
    setSelectedDevices(arr);
    markDirty();
  };

  const addDevice = () => {
    if (selectedDevices.length >= 4) return;
    const available = DEVICES.find(d => !selectedDevices.includes(d.dn));
    if (available) {
      setSelectedDevices([...selectedDevices, available.dn]);
      markDirty();
    }
  };

  const removeDevice = (index: number) => {
    if (selectedDevices.length <= 2) return; // Min 2 logically
    const arr = [...selectedDevices];
    arr.splice(index, 1);
    setSelectedDevices(arr);
    markDirty();
  };

  const getEOM = (year: number, month: number) => new Date(year, month, 0).getDate();

  // Primary loader - completely siloed to CACHE layer only as per specs
  const handleApply = async (isMount = false) => {
    // If not on mount, manually check date constraints
    if (!isMount) {
      const pA = ensureDateOrder(startDateA, endDateA);
      setStartDateA(pA.startDate); setEndDateA(pA.endDate);
      const pB = ensureDateOrder(startDateB, endDateB);
      setStartDateB(pB.startDate); setEndDateB(pB.endDate);
      if (parseInt(startMonth) > parseInt(endMonth)) {
        setStartMonth("01"); setEndMonth("12");
      }
    }

    setIsDirty(false);
    setLoading(true);
    setError(null);

    const fA = new Map<string, RawConsumptionPoint[]>();
    const fB = new Map<string, RawConsumptionPoint[]>();
    const fH = new Map<string, RawConsumptionPoint[]>();

    let labelA = "";
    let labelB = "";

    try {
      if (mode === "devices") {
        labelA = `${startDateA} au ${endDateA}`;
        labelB = labelA;
        for (const dn of selectedDevices) {
          const res = await checkAllCaches(dn, startDateA, endDateA, "daily");
          if (!res) throw new Error(`Données journalières absentes pour ${DEVICES.find(d=>d.dn===dn)?.name}. Chargez-les depuis le Tableau de bord.`);
          fA.set(dn, res.data);
        }
      } 
      else if (mode === "dates") {
        const dn = selectedDevices[0];
        labelA = `[A] ${startDateA} au ${endDateA}`;
        labelB = `[B] ${startDateB} au ${endDateB}`;

        const rA = await checkAllCaches(dn, startDateA, endDateA, "daily");
        if (!rA) throw new Error("Les données de la Période A ne sont pas en cache. Visitez le tableau de bord.");
        fA.set(dn, rA.data);

        const rB = await checkAllCaches(dn, startDateB, endDateB, "daily");
        if (!rB) throw new Error("Les données de la Période B ne sont pas en cache. Visitez le tableau de bord.");
        fB.set(dn, rB.data);
      } 
      else if (mode === "years") {
        const dn = selectedDevices[0];
        
        const sM = String(startMonth).padStart(2,'0');
        const eM = String(endMonth).padStart(2,'0');
        
        const sA = `${yearA}-${sM}-01`;
        const eA = `${yearA}-${eM}-${String(getEOM(Number(yearA), Number(endMonth))).padStart(2,'0')}`;
        labelA = `Année ${yearA} (Mois ${sM}-${eM})`;

        const sB = `${yearB}-${sM}-01`;
        const eB = `${yearB}-${eM}-${String(getEOM(Number(yearB), Number(endMonth))).padStart(2,'0')}`;
        labelB = `Année ${yearB} (Mois ${sM}-${eM})`;

        const rA = await checkAllCaches(dn, sA, eA, "daily");
        if (!rA) throw new Error(`Données pour l'année ${yearA} introuvables en cache.`);
        fA.set(dn, rA.data);

        const rB = await checkAllCaches(dn, sB, eB, "daily");
        if (!rB) throw new Error(`Données pour l'année ${yearB} introuvables en cache.`);
        fB.set(dn, rB.data);
      }

      setDataA(fA);
      setDataB(fB);
      setActiveVis({ 
        mode, 
        phase, 
        devices: mode === "devices" ? [...selectedDevices] : [selectedDevices[0]], 
        periodA: labelA, 
        periodB: labelB,
        startDate: startDateA,
        endDate: endDateA
      });

    } catch (err) {
      const error = err as { message?: string };
      setError(error.message || "Erreur de chargement. Données possiblement indisponibles");
      if (isMount) { setIsDirty(true); } // Leave dirty so user can retry
    } finally {
      setLoading(false);
    }
  };

  // --- STATS PARSING & CALCULATIONS ---
  const extractVal = (pts: RawConsumptionPoint[], p: Phase) => pts.reduce((sum, pt) => sum + extractPhaseValue(pt, p), 0);
  const meanVal = (pts: RawConsumptionPoint[], p: Phase) => {
    const act = pts.filter(pt => extractPhaseValue(pt, p) > 0);
    return act.length ? extractVal(pts, p) / act.length : 0;
  };
  const peakVal = (pts: RawConsumptionPoint[], p: Phase) => Math.max(0, ...pts.map(pt => extractPhaseValue(pt, p)));

  const stats = useMemo(() => {
    if (!activeVis) return { aName: "", bName: "", totalA: 0, totalB: 0, diffRaw: 0, diffPercent: 0, ratio: 0, table: [], isPos: false };

    let aName = "";
    let bName = "";
    let tA = 0; let tB = 0;
    
    interface StatRow { label: string; valA: number; valB: number; strA: string; strB: string; formatAsDiff: boolean }
    const rows: StatRow[] = [];

    if (activeVis.mode === "devices") {
      aName = DEVICES.find(d => d.dn === activeVis.devices[0])?.name || activeVis.devices[0];
      bName = activeVis.devices.length > 1 
                ? DEVICES.find(d => d.dn === activeVis.devices[1])?.name || activeVis.devices[1]
                : aName;

      const ptsA = dataA.get(activeVis.devices[0]) || [];
      const ptsB = activeVis.devices.length > 1 ? (dataA.get(activeVis.devices[1]) || []) : [];

      tA = extractVal(ptsA, activeVis.phase);
      tB = extractVal(ptsB, activeVis.phase);

      rows.push({ label: "Total Vitesse (kWh)", valA: tA, valB: tB, strA: formatKwh(tA), strB: formatKwh(tB), formatAsDiff: true });
      rows.push({ label: "Moyenne/jour", valA: meanVal(ptsA, activeVis.phase), valB: meanVal(ptsB, activeVis.phase), strA: formatKwh(meanVal(ptsA, activeVis.phase)), strB: formatKwh(meanVal(ptsB, activeVis.phase)), formatAsDiff: true });
      rows.push({ label: "Pic maximum", valA: peakVal(ptsA, activeVis.phase), valB: peakVal(ptsB, activeVis.phase), strA: formatKwh(peakVal(ptsA, activeVis.phase)), strB: formatKwh(peakVal(ptsB, activeVis.phase)), formatAsDiff: true });
      rows.push({ label: "Jours actifs", valA: ptsA.length, valB: ptsB.length, strA: String(ptsA.length), strB: String(ptsB.length), formatAsDiff: false });

    } else {
      const dn = activeVis.devices[0];
      // Dates or Years
      if (activeVis.mode === "dates") {
        aName = "Période A"; bName = "Période B";
      } else {
        aName = `Année ${yearA}`; bName = `Année ${yearB}`;
      }
      
      const ptsA = dataA.get(dn) || [];
      const ptsB = dataB.get(dn) || [];

      tA = extractVal(ptsA, activeVis.phase);
      tB = extractVal(ptsB, activeVis.phase);

      rows.push({ label: "Total (kWh)", valA: tA, valB: tB, strA: formatKwh(tA), strB: formatKwh(tB), formatAsDiff: true });
      rows.push({ label: "Moyenne/jour", valA: meanVal(ptsA, activeVis.phase), valB: meanVal(ptsB, activeVis.phase), strA: formatKwh(meanVal(ptsA, activeVis.phase)), strB: formatKwh(meanVal(ptsB, activeVis.phase)), formatAsDiff: true });
      rows.push({ label: "Pic maximum", valA: peakVal(ptsA, activeVis.phase), valB: peakVal(ptsB, activeVis.phase), strA: formatKwh(peakVal(ptsA, activeVis.phase)), strB: formatKwh(peakVal(ptsB, activeVis.phase)), formatAsDiff: true });
      rows.push({ label: "Jours enregistrés", valA: ptsA.length, valB: ptsB.length, strA: String(ptsA.length), strB: String(ptsB.length), formatAsDiff: false });
    }

    const diffRaw = Math.abs(tA - tB);
    const ratio = tA > 0 && tB > 0 ? Math.max(tA, tB) / Math.min(tA, tB) : 0;
    const pct = tA > 0 && tB > 0 ? ((Math.max(tA, tB) - Math.min(tA, tB)) / Math.min(tA, tB)) * 100 : 0;
    const diffPercent = Math.min(999, pct);

    return { aName, bName, totalA: tA, totalB: tB, diffRaw, diffPercent, isPos: (tA > tB), ratio, table: rows };
  }, [activeVis, dataA, dataB, yearA, yearB]);

  // --- CHART 1: EVOLUTION COMPARATIVE ---
  const lineChartData = useMemo(() => {
    if (!activeVis) return [];
    
    if (activeVis.mode === "devices") {
      const longestData = activeVis.devices.reduce((acc: RawConsumptionPoint[], dn) => {
         const d = dataA.get(dn) || [];
         return d.length > acc.length ? d : acc;
      }, []);

      return longestData.map(point => {
        const entry: Record<string, any> = { date: point.date };
        activeVis.devices.forEach(dn => {
          const match = dataA.get(dn)?.find(p => p.date === point.date);
          entry[dn] = match ? extractPhaseValue(match, activeVis.phase) : null;
        });
        return entry;
      });
    } 
    else if (activeVis.mode === "dates") {
      const dn = activeVis.devices[0];
      const ptsA = dataA.get(dn) || [];
      const ptsB = dataB.get(dn) || [];
      const maxDays = Math.max(ptsA.length, ptsB.length);
      const arr = [];
      for (let i = 0; i < maxDays; i++) {
        arr.push({
          index: `Jour ${i+1}`,
          A: ptsA[i] ? extractPhaseValue(ptsA[i], activeVis.phase) : null,
          B: ptsB[i] ? extractPhaseValue(ptsB[i], activeVis.phase) : null
        });
      }
      return arr;
    }
    else if (activeVis.mode === "years") {
      const dn = activeVis.devices[0];
      // Convert to standard points for types.ts aggregation
      const convert = (arr: RawConsumptionPoint[]) => arr.map(a => ({ date: a.date, value: extractPhaseValue(a, activeVis.phase) }));
      const aggA = aggregateToMonthly(convert(dataA.get(dn) || []));
      const aggB = aggregateToMonthly(convert(dataB.get(dn) || []));
      
      const map: Record<string, any> = {};
      
      // Since it's month name mapping we just strip out the year from the aggregated output 
      // i.e `Janvier 2025` -> `Janvier` to allow matching.
      aggA.forEach(a => { const m = a.date.split(' ')[0]; if (!map[m]) map[m] = { month: m, A: 0, B: 0 }; map[m].A = a.value; });
      aggB.forEach(b => { const m = b.date.split(' ')[0]; if (!map[m]) map[m] = { month: m, A: map[m]?.A || 0, B: 0 }; map[m].B = b.value; });
      
      const monthOrder = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];
      return Object.values(map).sort((a,b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
    }
    return [];
  }, [activeVis, dataA, dataB]);

  // --- CHART 2: FACE A FACE ---
  const barChartData = useMemo(() => {
    if (!activeVis) return [];
    if (activeVis.mode === "devices") {
      return activeVis.devices.map(dn => {
         const d = dataA.get(dn);
         return {
            name: DEVICES.find(x => x.dn === dn)?.name || dn,
            total: d ? extractVal(d, activeVis.phase) : 0,
            fill: getDeviceColor(dn)
         }
      });
    } else {
      return [
        { name: stats.aName, total: stats.totalA, fill: "#3b82f6" },
        { name: stats.bName, total: stats.totalB, fill: "#10b981" }
      ];
    }
  }, [activeVis, dataA, dataB, stats]);

  // --- CHART 3: RADAR CHART ---
  const radarData = useMemo(() => {
    if (!activeVis || activeVis.mode !== "devices" || activeVis.devices.length < 2) return [];
    const metricsRaw = activeVis.devices.map(dn => {
       const pts = dataA.get(dn) || [];
       return {
         dn,
         total: extractVal(pts, activeVis.phase),
         moy: meanVal(pts, activeVis.phase),
         pic: peakVal(pts, activeVis.phase)
       }
    });

    const maxT = Math.max(0.01, ...metricsRaw.map(m => m.total));
    const maxM = Math.max(0.01, ...metricsRaw.map(m => m.moy));
    const maxP = Math.max(0.01, ...metricsRaw.map(m => m.pic));

    return [
      { 
        metric: "Consommation Totale", 
        ...metricsRaw.reduce((acc, m) => ({...acc, [`${m.dn}_normalized`]: maxT > 0 ? m.total / maxT : 0, [`${m.dn}_raw`]: m.total}), {})
      },
      { 
        metric: "Moyenne/Jour", 
        ...metricsRaw.reduce((acc, m) => ({...acc, [`${m.dn}_normalized`]: maxM > 0 ? m.moy / maxM : 0, [`${m.dn}_raw`]: m.moy}), {})
      },
      { 
        metric: "Pic Max", 
        ...metricsRaw.reduce((acc, m) => ({...acc, [`${m.dn}_normalized`]: maxP > 0 ? m.pic / maxP : 0, [`${m.dn}_raw`]: m.pic}), {})
      }
    ];
  }, [activeVis, dataA]);


  // --- EXPORT TO EXCEL ---
  const handleExport = async () => {
    if (!activeVis || lineChartData.length === 0) return;
    setExporting(true);
    try {
      await exportComparisonToExcel({
        stats,
        lineChartData,
        mode: activeVis.mode,
        phase: PHASE_LABELS[activeVis.phase] || activeVis.phase,
        startDate: activeVis.startDate || "",
        endDate: activeVis.endDate || "",
        dnToName,
      });
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  // Border logic
  const colorA = activeVis?.mode === "devices" ? getDeviceColor(activeVis.devices[0]) : "#3b82f6";
  const colorB = activeVis?.mode === "devices" && activeVis.devices.length > 1 ? getDeviceColor(activeVis.devices[1]) : "#10b981";
  
  // Diff card color logic (Traffic Light Analysis format)
  let diffColor = "text-foreground bg-secondary/10 border-border/50";
  if (stats.diffPercent > 50) diffColor = "text-destructive bg-destructive/10 border-destructive/20";
  else if (stats.diffPercent >= 10) diffColor = "text-orange-500 bg-orange-500/10 border-orange-500/20";

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 pb-20 w-full overflow-x-hidden">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 pb-4 border-b border-border gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BarChart2 className="h-6 w-6 text-primary" />
            Comparison Dashboard
            <Badge variant="outline" className="ml-2 bg-secondary/30 text-[10px] text-muted-foreground border-border/50 font-normal">
              ⚡ Exclusivement depuis le Cache
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Analyse détaillée, multi-critères et exportation</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} disabled={!activeVis || loading || exporting} className="gap-2 bg-secondary/20">
            {exporting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Export...</>
            ) : (
              <><Download className="h-4 w-4" /> Exporter</>
            )}
          </Button>
          <Button variant="outline" asChild className="gap-2 bg-secondary/80 text-foreground">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Link>
          </Button>
        </div>
      </header>

      {/* FILTER PANEL */}
      <div className={`bg-card border rounded-lg p-5 mb-6 shadow-sm w-full overflow-hidden transition-all duration-300 ${isDirty ? "border-primary/50 ring-2 ring-primary/20" : "border-border"}`}>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Column 1: Mode & Phase */}
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5 w-full min-w-0">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Mode de Comparaison</label>
              <Select value={mode} onValueChange={(v: any) => { setMode(v); markDirty(); }}>
                <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="devices">Appareils (Jusqu'à 4)</SelectItem>
                  <SelectItem value="dates">Périodes (Sur 1 appareil)</SelectItem>
                  <SelectItem value="years">Année vs Année</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col gap-1.5 w-full min-w-0">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phase Électrique</label>
              <Select value={phase} onValueChange={(v: any) => { setPhase(v); markDirty(); }}>
                <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PHASE_LABELS).map(([k, lbl]) => (
                    <SelectItem key={k} value={k}>{lbl}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Column 2: Devices Selection */}
          <div className="space-y-3 lg:col-span-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              {mode === "devices" ? "Appareils Sélec. (Max 4)" : "Appareil Ciblé"}
            </label>
            
            {mode === "devices" ? (
              <div className="space-y-2">
                {selectedDevices.map((dn, idx) => (
                  <div key={`${dn}-${idx}`} className="flex gap-2 items-center">
                    <Select value={dn} onValueChange={(v) => handleDeviceUpdate(idx, v)}>
                      <SelectTrigger className={`h-9 text-xs flex-1 border-l-2 ${idx===0 ? "border-l-blue-500": idx===1 ? "border-l-emerald-500": idx===2 ? "border-l-amber-500": "border-l-purple-500"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICES.map(d => <SelectItem key={d.dn} value={d.dn} disabled={selectedDevices.includes(d.dn) && dn !== d.dn}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedDevices.length > 2 && <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeDevice(idx)}><X className="h-4 w-4"/></Button>}
                  </div>
                ))}
                {selectedDevices.length < 4 && (
                  <Button variant="outline" size="sm" onClick={addDevice} className="w-full text-xs border-dashed gap-1 h-8 mt-1">
                    <Plus className="h-3 w-3" /> Ajouter un appareil
                  </Button>
                )}
              </div>
            ) : (
               <Select value={selectedDevices[0]} onValueChange={(v) => { setSelectedDevices([v]); markDirty(); }}>
                 <SelectTrigger className="h-9 text-xs w-full border-l-2 border-l-blue-500"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   {DEVICES.map(d => <SelectItem key={d.dn} value={d.dn}>{d.name}</SelectItem>)}
                 </SelectContent>
               </Select>
            )}
          </div>

          {/* Column 3: Dates Logic (DYNAMIC) */}
          <div className="lg:col-span-2 space-y-3">
             {mode === "devices" && (
                <div className="p-3 border rounded-md bg-secondary/10">
                   <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block border-l-2 border-l-blue-500 pl-2">Gamme Temporelle Principale</label>
                   <DateRangePicker
                     startDate={startDateA}
                     endDate={endDateA}
                     onStartChange={val => { setStartDateA(val); markDirty(); handleDateBlur(val, setStartDateA, 'start'); }}
                     onEndChange={val => { setEndDateA(val); markDirty(); handleDateBlur(val, setEndDateA, 'end'); }}
                     maxDate={new Date().toISOString().split('T')[0]}
                     minDate="2020-01-01"
                   />
                </div>
             )}

             {mode === "dates" && (
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-3 border rounded-md bg-secondary/10 border-blue-500/20">
                     <label className="text-[10px] uppercase font-bold text-blue-500 tracking-wider mb-2 block">Période A</label>
                     <DateRangePicker
                       startDate={startDateA}
                       endDate={endDateA}
                       onStartChange={val => { setStartDateA(val); markDirty(); handleDateBlur(val, setStartDateA, 'start'); }}
                       onEndChange={val => { setEndDateA(val); markDirty(); handleDateBlur(val, setEndDateA, 'end'); }}
                       startLabel="Début A"
                       endLabel="Fin A"
                       maxDate={new Date().toISOString().split('T')[0]}
                       minDate="2020-01-01"
                     />
                   </div>
                   <div className="p-3 border rounded-md bg-secondary/10 border-emerald-500/20">
                     <label className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider mb-2 block">Période B</label>
                     <DateRangePicker
                       startDate={startDateB}
                       endDate={endDateB}
                       onStartChange={val => { setStartDateB(val); markDirty(); handleDateBlur(val, setStartDateB, 'start'); }}
                       onEndChange={val => { setEndDateB(val); markDirty(); handleDateBlur(val, setEndDateB, 'end'); }}
                       startLabel="Début B"
                       endLabel="Fin B"
                       maxDate={new Date().toISOString().split('T')[0]}
                       minDate="2020-01-01"
                     />
                   </div>
                </div>
             )}

             {mode === "years" && (
                <div className="p-3 border rounded-md bg-secondary/10 space-y-4">
                   <div>
                     <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block">Périmètre Mensuel (Tous les Ans)</label>
                     <div className="flex gap-2 items-center">
                        <Select value={startMonth} onValueChange={v => { setStartMonth(v); markDirty(); }}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"].map((m, i) => <SelectItem key={i+1} value={String(i+1).padStart(2,'0')}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground font-semibold">→</span>
                        <Select value={endMonth} onValueChange={v => { setEndMonth(v); markDirty(); }}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"].map((m, i) => <SelectItem key={i+1} value={String(i+1).padStart(2,'0')}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-blue-500 tracking-wider mb-2 block">Année Primaire (A)</label>
                        <Input type="number" min="2020" max="2026" value={yearA} onChange={e=>{setYearA(e.target.value);markDirty()}} className="h-9 text-xs border-blue-500/30" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider mb-2 block">Année Comparée (B)</label>
                        <Input type="number" min="2020" max="2026" value={yearB} onChange={e=>{setYearB(e.target.value);markDirty()}} className="h-9 text-xs border-emerald-500/30" />
                      </div>
                   </div>
                </div>
             )}
          </div>
        </div>

        {/* Form Action Footer */}
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
             <Info className="h-4 w-4 inline mr-1 text-primary" />
             Si le test signale que les données sont manquantes, ouvrez simplement le <Link to="/dashboard" className="text-primary hover:underline">Dashboard Principal</Link> d'abord.
          </div>
          <Button 
            className={`min-w-[250px] font-semibold transition-all shadow-md ${isDirty ? "bg-primary animate-pulse shadow-primary/30" : "bg-primary/80"}`} 
            onClick={() => handleApply(false)} 
            disabled={loading}
          >
            {loading ? "Recherche en cache..." : "Appliquer la comparaison"}
          </Button>
        </div>

      </div>

      {/* ERROR INFEED */}
      {error && (
         <div className="mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/20 flex gap-3 text-destructive animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="text-sm font-medium">{error}</div>
         </div>
      )}

      {/* ACTIVE VISUALIZATION RENDER TREE */}
      {activeVis && !loading && !error && (
        <div className="space-y-6 animate-in fade-in duration-500">
           
           {/* KPI ROW */}
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card rounded-lg p-5 shadow-sm border border-border flex flex-col justify-center border-l-4" style={{ borderLeftColor: colorA }}>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 whitespace-nowrap overflow-hidden text-ellipsis">{stats.aName}</p>
                <div className="text-2xl font-black tracking-tight text-foreground">
                  {formatKwh(stats.totalA)} <span className="text-xs font-normal text-muted-foreground">kWh</span>
                </div>
              </div>

              <div className="bg-card rounded-lg p-5 shadow-sm border border-border flex flex-col justify-center border-l-4" style={{ borderLeftColor: colorB }}>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 whitespace-nowrap overflow-hidden text-ellipsis">{stats.bName}</p>
                <div className="text-2xl font-black tracking-tight text-foreground">
                  {formatKwh(stats.totalB)} <span className="text-xs font-normal text-muted-foreground">kWh</span>
                </div>
              </div>

              <div className={`rounded-lg p-5 shadow-sm border flex flex-col justify-center items-center text-center ${diffColor}`}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 opacity-80">
                  Différence ({stats.aName.slice(0,3)} vs {stats.bName.slice(0,3)})
                </p>
                <div className="text-3xl font-black tracking-tight">
                  {formatKwh(stats.diffRaw)}
                </div>
                <p className="text-xs font-semibold opacity-90 mt-1">
                  kWh | {stats.ratio.toFixed(1)}× d'écart
                </p>
              </div>

              <div className="bg-card rounded-lg p-5 shadow-sm border border-border flex flex-col justify-center text-right">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Évolution Relative</p>
                <div className="text-3xl font-black tracking-tight text-primary">
                  {stats.diffPercent.toFixed(1)}%
                </div>
                <p className="text-xs font-semibold text-muted-foreground mt-1">
                   {stats.isPos ? `${stats.aName.split(' ')[0]} consomme ${stats.ratio.toFixed(1)}× plus` : `${stats.bName.split(' ')[0]} consomme ${stats.ratio.toFixed(1)}× plus`}
                </p>
              </div>
           </div>

           {/* MAIN CHART */}
           <div className="bg-card border border-border rounded-lg p-6 shadow-sm hover:border-border/80 transition-all">
              <h3 className="text-sm font-bold text-foreground mb-6 flex items-center justify-between">
                <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Évolution Comparative : {PHASE_LABELS[activeVis.phase]}</span>
              </h3>
              <div className="h-[400px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={lineChartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                     <XAxis 
                       dataKey={activeVis.mode === "devices" ? "date" : (activeVis.mode==="dates" ? "index" : "month")} 
                       stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} 
                       tickFormatter={(v) => activeVis.mode === "devices" ? format(new Date(v), "dd/MM") : v} minTickGap={20}
                     />
                     <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatKwh} />
                     <RechartsTooltip contentStyle={{ backgroundColor:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:"8px", fontSize:"12px", boxShadow:"0 10px 15px -3px rgba(0,0,0,0.5)" }} itemStyle={{color:"hsl(var(--foreground))"}} formatter={(val:number)=>[`${formatKwh(val)} kWh`,""]} />
                     <Legend verticalAlign="top" height={36} iconType="circle" />
                     
                     {activeVis.mode === "devices" ? (
                       activeVis.devices.map((dn, idx) => (
                          <Line key={dn} type="monotone" dataKey={dn} name={DEVICES.find(d=>d.dn===dn)?.name||dn} stroke={getDeviceColor(dn)} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                       ))
                     ) : (
                       <>
                          <Line type="monotone" dataKey="A" name={stats.aName} stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                          <Line type="monotone" dataKey="B" name={stats.bName} stroke="#10b981" strokeDasharray="5 5" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                       </>
                     )}
                   </LineChart>
                 </ResponsiveContainer>
              </div>
           </div>

           {/* SECONDARY REPORTS = Multi-Grid */}
           <div className={`grid grid-cols-1 gap-6 ${activeVis.mode === "devices" && activeVis.devices.length >= 2 ? "lg:grid-cols-3" : ""}`}>
              
              {/* Face-A-Face Bar Chart */}
              <div className={`bg-card border border-border rounded-lg p-6 shadow-sm ${activeVis.mode === "devices" && activeVis.devices.length >= 2 ? "lg:col-span-2" : "w-full"}`}>
                 <h3 className="text-sm font-bold text-foreground mb-6 flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> Totaux Globaux Face-à-Face</h3>
                 <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={true} vertical={false} />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatKwh} />
                        <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={100} />
                        <RechartsTooltip cursor={{fill:"hsl(var(--muted))",opacity:0.1}} contentStyle={{ backgroundColor:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:"8px", fontSize:"12px" }} formatter={(v:number)=>[`${formatKwh(v)} kWh`,"Total"]} />
                        <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={40}>
                           {barChartData.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              {/* Radar Chart strictly for multiple devices */}
              {activeVis.mode === "devices" && activeVis.devices.length >= 2 && (
                 <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col justify-center">
                   <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Multi-Dimensionnel</h3>
                   <div className="flex-1 min-h-[300px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                           <PolarGrid stroke="hsl(var(--border))" />
                           <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                           <RechartsTooltip content={({ active, payload }: any) => {
                             if (!active || !payload) return null;
                             return (
                               <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
                                 {payload.map((p: any) => {
                                   const raw = p.payload[p.dataKey.replace('_normalized', '_raw')];
                                   return (
                                      <div key={p.dataKey} style={{ color: p.stroke || p.fill }}>
                                         {p.name}: {formatKwh(raw)} kWh
                                      </div>
                                   );
                                 })}
                               </div>
                             );
                           }} />
                           {activeVis.devices.map((dn, i) => (
                              <Radar key={dn} name={DEVICES.find(d=>d.dn===dn)?.name||dn} dataKey={`${dn}_normalized`} stroke={getDeviceColor(dn)} fill={getDeviceColor(dn)} fillOpacity={0.2} />
                           ))}
                           <Legend verticalAlign="bottom" height={20} iconType="circle" wrapperStyle={{fontSize:'10px'}} />
                        </RadarChart>
                     </ResponsiveContainer>
                   </div>
                 </div>
              )}
           </div>

           {/* STATS TABLE */}
           <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
              <div className="p-4 border-b border-border bg-secondary/30">
                 <h3 className="text-sm font-bold text-foreground">Tableau Récapitulatif</h3>
              </div>
              <div className="overflow-x-auto text-sm">
                 <table className="w-full text-left">
                    <thead className="text-xs uppercase bg-secondary/10 border-b border-border text-muted-foreground">
                       <tr>
                         <th className="px-6 py-4 font-semibold w-1/4">Métrique</th>
                         <th className="px-6 py-4 font-semibold">{stats.aName}</th>
                         <th className="px-6 py-4 font-semibold">{stats.bName}</th>
                         <th className="px-6 py-4 font-semibold text-right">Différence (A-B)</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                       {stats.table.map((row, idx) => (
                          <tr key={idx} className="hover:bg-muted/10 transition-colors">
                            <td className="px-6 py-3 font-medium">{row.label}</td>
                            <td className="px-6 py-3 text-foreground">{row.strA}</td>
                            <td className="px-6 py-3 text-foreground">{row.strB}</td>
                            <td className="px-6 py-3 text-right">
                              {row.formatAsDiff ? (
                                <span className={row.valA > row.valB ? 'text-emerald-500' : row.valA < row.valB ? 'text-destructive' : 'text-muted-foreground'}>
                                   {row.valA > row.valB ? '+' : ''}{formatKwh(row.valA - row.valB)}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>

        </div>
      )}
    </div>
  );
}
