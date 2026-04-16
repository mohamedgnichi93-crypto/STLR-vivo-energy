import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";
import { DEVICES } from "@/lib/devices";
import { fetchAllDevicesSequential } from "@/lib/api";
import { requestQueue } from "@/lib/requestQueue";
import { 
  applyGranularityAggregation, 
  buildAggregatedTimeline, 
  buildTotalTimeline, 
  computeKPIs, 
  buildChartData,
  getAvgLabel
} from "@/lib/dashboardUtils";
import { 
  RawConsumptionPoint, 
  DeviceConsumption, 
  Granularity, 
  Phase, 
  PHASE_LABELS, 
  extractPhaseValue 
} from "@/lib/types";
import { validateDataset, aggregateValidation, logValidation, ValidationResult, ValidationIssue } from "@/lib/validation";
import { exportToExcel } from "@/lib/exportExcel";
import { formatKwh, getDefaultDateRange } from "@/lib/utils";
import ConsumptionLineChart from "@/components/ConsumptionLineChart";
import { ChartErrorBoundary } from "@/components/ChartErrorBoundary";
import AdvancedMetrics from "@/components/AdvancedMetrics";
import DeviceBarChart from "@/components/DeviceBarChart";
import DeviceTreemap from "@/components/DeviceTreemap";
import DeviceRadarChart from "@/components/DeviceRadarChart";
import DistributionPieChart from "@/components/DistributionPieChart";
import DashboardFilters from "@/components/DashboardFilters";
import ValidationReport from "@/components/ValidationReport";
import EmptyState from "@/components/EmptyState";
import TopDevicesCard from "@/components/TopDevicesCard";
import TotalConsumptionChart from "@/components/TotalConsumptionChart";
import { Zap, Download, BarChart2, Loader2, FileText, BookOpen } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { jsPDF as JsPDFType } from 'jspdf'
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

const initDates = getDefaultDateRange();
const DEFAULT_START = initDates.startDate;
const DEFAULT_END = initDates.endDate;
const ALL_DEVICES = DEVICES.map(d => d.dn);

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code?: string | number; message: string } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  /** DNs of devices that returned HTTP 429 in the last fetch cycle */
  const [rateLimitedDns, setRateLimitedDns] = useState<string[]>([]);

  const rawPointsMapRef = useRef<Map<string, RawConsumptionPoint[]>>(new Map());
  const lineChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);
  const radarChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!isAuthenticated()) navigate("/"); }, [navigate]);

  const isDirty = useMemo(() => (
    pendingStartDate !== appliedFilters.startDate ||
    pendingEndDate !== appliedFilters.endDate ||
    pendingDepartment !== appliedFilters.department ||
    pendingGranularity !== appliedFilters.granularity ||
    pendingPhase !== appliedFilters.phase ||
    JSON.stringify([...pendingDevices].sort()) !== JSON.stringify([...appliedFilters.devices].sort())
  ), [pendingStartDate, pendingEndDate, pendingDevices, pendingDepartment, pendingGranularity, pendingPhase, appliedFilters]);

  /**
   * Transforms raw consumption points into a DeviceConsumption object.
   */
  const processDeviceData = useCallback((dn: string, rawPoints: RawConsumptionPoint[], filters: AppliedFilters) => {
    const device = DEVICES.find(d => d.dn === dn)!;
    const fetchGranularity: Granularity = (filters.granularity === "weekly" || filters.granularity === "monthly") ? "daily" : filters.granularity;
    
    const { validated, issues } = validateDataset(rawPoints, device.name, fetchGranularity, filters.startDate, filters.endDate);
    const pts = validated.map(p => ({ date: p.date, value: extractPhaseValue(p, filters.phase) }));
    const agg = applyGranularityAggregation(pts, filters.granularity);
    
    return {
      device: {
        deviceName: device.name,
        deviceDn: dn,
        total: agg.reduce((s, d) => s + d.value, 0),
        daily: agg
      },
      issues
    };
  }, []);

  /**
   * Core data loader.
   */
  const fetchAllData = useCallback(async (filters: AppliedFilters, forceRefresh: boolean = false) => {
    const { startDate, endDate, devices, granularity } = filters;

    if (devices.length === 0 || !startDate || !endDate || startDate > endDate) {
      setDeviceData([]); setLoading(false); setValidationResult(null); return;
    }

    if (granularity === "hourly") {
      const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
      if (diff > 90) {
        toast.warning(
          "L'affichage horaire est limité à 90 jours. Passage en mode journalier.",
          { duration: 4000 }
        );
        const corrected = { ...filters, granularity: "daily" as Granularity };
        setAppliedFilters(corrected); setPendingGranularity("daily");
        fetchAllData(corrected); return;
      }
    }

    const fetchGranularity: Granularity = (granularity === "weekly" || granularity === "monthly") ? "daily" : granularity;

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

      const fetchMap = await fetchAllDevicesSequential(
        devices, startDate, endDate, fetchGranularity,
        (loaded, total) => setLoadProgress({ loaded, total }),
        forceRefresh,
        (dn, result) => {
          const processed = processDeviceData(dn, result.data, filters);
          if (processed) {
            // Store raw points for Excel export
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
          .map(dn => DEVICES.find(d => d.dn === dn)?.name ?? dn)
          .join(", ");
        toast.warning(`⚠️ Limite API atteinte pour : ${names}. Réessayez dans quelques minutes.`, {
          duration: 8000,
        });
      }

      if (partialResults.size === 0) {
        throw new Error("Aucune donnée disponible pour les appareils sélectionnés");
      }

      const validation = aggregateValidation(allIssues, totalPoints);
      setValidationResult(validation);
      setLastUpdate(new Date());
      logValidation(validation);

      const cachedCount = [...fetchMap.values()].filter(r => r.fromCache).length;
      if (cachedCount > 0 && !forceRefresh) {
        toast.info(`${cachedCount} appareil(s) chargés depuis le cache`);
      }
      if (forceRefresh) {
        toast.success("Données actualisées depuis l'API ✓");
      }

    } catch (err) {
      const errorObj = err as { status?: number; message?: string };
      const code = errorObj.status ?? "ERR";
      const message = errorObj.message || (err instanceof Error ? err.message : "Erreur inconnue");
      setError({ code, message });
      setDeviceData([]);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadProgress(null);
    }
  }, [deviceData.length, processDeviceData]);

  const handleGranularityChange = useCallback((newGranularity: Granularity) => {
    if (newGranularity === "hourly") {
      const diffDays = Math.ceil(
        (new Date(pendingEndDate).getTime() - new Date(pendingStartDate).getTime()) / 86400000
      );
      if (diffDays > 90) {
        // Auto-set to last 7 days
        const end = new Date();
        end.setDate(end.getDate() - 1); // yesterday
        const start = new Date(end);
        start.setDate(start.getDate() - 6); // 7 days ago
        
        setPendingStartDate(start.toISOString().split("T")[0]);
        setPendingEndDate(end.toISOString().split("T")[0]);
        
        toast.info(
          "Période ajustée à 7 jours pour le mode horaire",
          { duration: 3000 }
        );
      }
    }
    setPendingGranularity(newGranularity);
  }, [pendingStartDate, pendingEndDate]);

  const handleApplyFilters = useCallback(() => {
    const next: AppliedFilters = {
      startDate: pendingStartDate, endDate: pendingEndDate,
      devices: pendingDevices, department: pendingDepartment,
      granularity: pendingGranularity, phase: pendingPhase,
    };
    
    pendingDevices.forEach(dn => {
      const cacheKey = `stlr_${dn}_${pendingStartDate}_${pendingEndDate}_${pendingGranularity}`;
      requestQueue.setPriority(cacheKey, 'high');
    });
    
    requestQueue.cancelLowPriority();
    
    setAppliedFilters(next);
    fetchAllData(next);
  }, [pendingStartDate, pendingEndDate, pendingDevices, pendingDepartment, pendingGranularity, pendingPhase, fetchAllData]);

  useEffect(() => {
    fetchAllData(appliedFilters);
  }, []); // intentional: run only on mount

  const phaseLabel = PHASE_LABELS[appliedFilters.phase];
  const avgLabel = getAvgLabel(appliedFilters.granularity);

  const filteredDevices = useMemo(() => {
    return DEVICES.filter(device => appliedFilters.devices.includes(device.dn))
      .map(device => ({ dn: device.dn, name: device.name, color: device.color }));
  }, [appliedFilters.devices]);

  const { totalConsumption, avgPerPeriod, peakValue, minValue } = useMemo(() => computeKPIs(deviceData), [deviceData]);
  const aggregatedTimeline = useMemo(() => buildAggregatedTimeline(deviceData), [deviceData]);
  const totalTimeline = useMemo(() => buildTotalTimeline(aggregatedTimeline), [aggregatedTimeline]);
  const { barData, pieData } = useMemo(() => buildChartData(deviceData), [deviceData]);
  
  const captureChart = async (ref: React.RefObject<HTMLDivElement>): Promise<string | null> => {
    if (!ref.current) return null;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(ref.current, {
        backgroundColor: '#0f172a', // match app dark bg (slate-900)
        scale: 2,                  // 2x resolution for crisp images
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const handleExport = useCallback(async () => {
    if (deviceData.length === 0) {
      toast.warning("Aucune donnée à exporter.");
      return;
    }
    setExporting(true);
    try {
      // Capture all charts as base64 images
      const [lineImage, pieImage, barImage, radarImage] = await Promise.all([
        captureChart(lineChartRef),
        captureChart(pieChartRef),
        captureChart(barChartRef),
        captureChart(radarChartRef),
      ]);

      await exportToExcel({
        deviceData,
        aggregatedTimeline: aggregatedTimeline as any[],
        rawPointsMap: rawPointsMapRef.current,
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        granularity: appliedFilters.granularity,
        phase: appliedFilters.phase,
        totalConsumption,
        avgPerPeriod,
        peakValue,
        minValue,
        selectedDevices: appliedFilters.devices,
        chartImages: {
          line:  lineImage  ?? undefined,
          pie:   pieImage   ?? undefined,
          bar:   barImage   ?? undefined,
          radar: radarImage ?? undefined,
        }
      });
      toast.success("Rapport exporté avec succès ✓");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "inconnue";
      toast.error(`Erreur export : ${msg}`);
    } finally {
      setExporting(false);
    }
  }, [deviceData, aggregatedTimeline, appliedFilters, totalConsumption, avgPerPeriod, peakValue, minValue]);

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })

    // ── Header band ───────────────────────────────
    doc.setFillColor(16, 185, 129)
    doc.rect(0, 0, pageW, 18, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('STLR Énergie', 14, 11)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Dashboard WattNow — Export', 14, 16)
    doc.setFontSize(7)
    doc.text(`Généré le ${now}`, pageW - 14, 11, { align: 'right' })

    // ── Filter summary ────────────────────────────
    doc.setTextColor(80, 80, 80)
    doc.setFontSize(8)
    const phaseLabelVal = appliedFilters.phase === 'total' ? 'Total'
      : appliedFilters.phase === 'phaseA' ? 'L1'
        : appliedFilters.phase === 'phaseB' ? 'L2' : 'L3'
    doc.text(
      `Période : ${appliedFilters.startDate} → ${appliedFilters.endDate}   |   Granularité : ${appliedFilters.granularity}   |   Phase : ${phaseLabelVal}   |   ${deviceData.length} appareils`,
      14, 26
    )

    // ── KPI boxes ────────────────────────────────
    const kpis = [
      { label: 'Consommation totale', value: `${totalConsumption.toFixed(2)} kWh` },
      { label: 'Moyenne / période', value: `${avgPerPeriod.toFixed(2)} kWh` },
      { label: 'Pic maximum', value: `${peakValue.toFixed(2)} kWh` },
      { label: 'Valeur minimale', value: `${minValue.toFixed(2)} kWh` },
      { label: 'Appareils actifs', value: String(deviceData.length) },
      { label: 'Points de données', value: String(aggregatedTimeline.length) },
    ]

    const boxW = (pageW - 28) / kpis.length
    const boxY = 30

    kpis.forEach((kpi, i) => {
      const x = 14 + i * boxW
      doc.setFillColor(245, 247, 250)
      doc.roundedRect(x, boxY, boxW - 2, 18, 2, 2, 'F')
      doc.setTextColor(120, 120, 120)
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.label.toUpperCase(), x + (boxW - 2) / 2, boxY + 6, { align: 'center' })
      doc.setTextColor(20, 20, 20)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.value, x + (boxW - 2) / 2, boxY + 13, { align: 'center' })
    })

    // ── Device table ──────────────────────────────
    autoTable(doc, {
      startY: boxY + 22,
      head: [['Appareil', 'Total (kWh)', 'Moy/jour (kWh)', 'Points']],
      body: deviceData.map(d => [
        d.deviceName,
        d.total.toFixed(2),
        d.daily.length > 0 ? (d.total / d.daily.length).toFixed(2) : '0',
        String(d.daily.length),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 70 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'center' },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages()
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${data.pageNumber} / ${pageCount}  —  STLR Énergie`,
          pageW / 2, pageH - 6, { align: 'center' }
        )
        doc.setDrawColor(16, 185, 129)
        doc.setLineWidth(0.5)
        doc.line(14, pageH - 9, pageW - 14, pageH - 9)
      },
    })

    const filename = `STLR_Dashboard_${appliedFilters.startDate}_${appliedFilters.endDate}.pdf`
    doc.save(filename)
  }

  const handleExportReport = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
    const phaseLabelVal = appliedFilters.phase === 'total' ? 'Total'
      : appliedFilters.phase === 'phaseA' ? 'L1'
        : appliedFilters.phase === 'phaseB' ? 'L2' : 'L3'

    // ══════════════════════════════════════════════
    // PAGE 1 — Cover + Executive Summary
    // ══════════════════════════════════════════════

    // Dark header
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, 60, 'F')
    doc.setFillColor(16, 185, 129)
    doc.rect(0, 0, 4, 60, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('STLR Énergie', 14, 22)

    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(16, 185, 129)
    doc.text('Rapport WattNow — Vue d\'ensemble', 14, 32)

    doc.setFontSize(9)
    doc.setTextColor(180, 180, 180)
    doc.text(`Période : ${appliedFilters.startDate}  →  ${appliedFilters.endDate}`, 14, 42)
    doc.text(`Granularité : ${appliedFilters.granularity}   |   Phase : ${phaseLabelVal}`, 14, 49)
    doc.text(`Généré le ${now}`, 14, 56)

    // ── KPI cards 2×3 ────────────────────────────
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('INDICATEURS CLÉS', 14, 75)
    doc.setDrawColor(16, 185, 129)
    doc.setLineWidth(0.8)
    doc.line(14, 77, 65, 77)

    const kpiData = [
      { label: 'Consommation totale', value: totalConsumption.toFixed(2), unit: 'kWh' },
      { label: 'Moyenne par période', value: avgPerPeriod.toFixed(2), unit: 'kWh' },
      { label: 'Pic de consommation', value: peakValue.toFixed(2), unit: 'kWh' },
      { label: 'Valeur minimale', value: minValue.toFixed(2), unit: 'kWh' },
      { label: 'Appareils actifs', value: String(deviceData.length), unit: 'appareils' },
      { label: 'Points de données', value: String(aggregatedTimeline.length), unit: 'points' },
    ]

    const cols = 3
    const cardW = (pageW - 28 - (cols - 1) * 4) / cols
    const cardH = 24
    const startYValue = 82

    kpiData.forEach((kpi, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 14 + col * (cardW + 4)
      const y = startYValue + row * (cardH + 4)

      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F')
      doc.setDrawColor(220, 220, 220)
      doc.setLineWidth(0.2)
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'S')
      doc.setFillColor(16, 185, 129)
      doc.roundedRect(x, y, 3, cardH, 1, 1, 'F')

      doc.setTextColor(100, 100, 100)
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.label.toUpperCase(), x + 7, y + 7)

      doc.setTextColor(15, 23, 42)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.value, x + 7, y + 16)

      doc.setTextColor(16, 185, 129)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(kpi.unit, x + 7 + doc.getTextWidth(kpi.value) + 2, y + 16)
    })

    // ── Device breakdown ──────────────────────────
    const tableStartY = startYValue + 2 * (cardH + 4) + 12

    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('CONSOMMATION PAR APPAREIL', 14, tableStartY)
    doc.setDrawColor(16, 185, 129)
    doc.line(14, tableStartY + 2, 110, tableStartY + 2)

    const grandTotal = deviceData.reduce((s, d) => s + d.total, 0)

    autoTable(doc, {
      startY: tableStartY + 6,
      head: [['Appareil', 'Total (kWh)', '% du total', 'Moy/jour (kWh)', 'Jours']],
      body: [...deviceData]
        .sort((a, b) => b.total - a.total)
        .map(d => [
          d.deviceName,
          d.total.toFixed(2),
          grandTotal > 0 ? `${((d.total / grandTotal) * 100).toFixed(1)}%` : '0%',
          d.daily.length > 0 ? (d.total / d.daily.length).toFixed(2) : '0',
          String(d.daily.length),
        ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 65 },
        1: { halign: 'right' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'center' },
      },
    })

    // ── Monthly aggregation ───────────────────────
    const monthMap = new Map<string, number>()
    deviceData.forEach(d => {
      d.daily.forEach(pt => {
        const date = new Date(pt.date)
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
        const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`
        monthMap.set(key, (monthMap.get(key) ?? 0) + pt.value)
      })
    })

    if (monthMap.size > 1) {
      const afterTableY = (doc as any).lastAutoTable.finalY + 10
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('ÉVOLUTION MENSUELLE', 14, afterTableY)
      doc.setDrawColor(16, 185, 129)
      doc.line(14, afterTableY + 2, 85, afterTableY + 2)

      autoTable(doc, {
        startY: afterTableY + 6,
        head: [['Mois', 'Consommation (kWh)']],
        body: Array.from(monthMap.entries()).map(([m, v]) => [m, v.toFixed(2)]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { halign: 'right', fontStyle: 'bold' },
        },
        tableWidth: 100,
      })
    }

    // ══════════════════════════════════════════════
    // PAGE 2 — Daily timeline table
    // ══════════════════════════════════════════════
    doc.addPage()

    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, 14, 'F')
    doc.setFillColor(16, 185, 129)
    doc.rect(0, 0, 3, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('DONNÉES JOURNALIÈRES PAR APPAREIL', 10, 9)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 180, 180)
    const totalPointsCount = deviceData.reduce((s, d) => s + d.daily.length, 0)
    doc.text(`${totalPointsCount.toLocaleString('fr-FR')} points`, pageW - 14, 9, { align: 'right' })

    // Flatten all daily points
    const allDaily: { date: string; device: string; value: number }[] = []
    deviceData.forEach(d => {
      d.daily.forEach(pt => {
        allDaily.push({ date: pt.date, device: d.deviceName, value: pt.value })
      })
    })
    allDaily.sort((a, b) => a.date.localeCompare(b.date))

    autoTable(doc, {
      startY: 18,
      head: [['Date', 'Appareil', 'Consommation (kWh)']],
      body: allDaily.map(pt => [pt.date, pt.device, pt.value.toFixed(2)]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 30 },
        1: { fontStyle: 'bold', cellWidth: 90 },
        2: { halign: 'right' },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages()
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${data.pageNumber} / ${pageCount}  —  STLR Énergie  —  ${appliedFilters.startDate} → ${appliedFilters.endDate}`,
          pageW / 2, pageH - 6, { align: 'center' }
        )
        doc.setDrawColor(16, 185, 129)
        doc.setLineWidth(0.4)
        doc.line(14, pageH - 9, pageW - 14, pageH - 9)
      },
    })

    const filename = `STLR_Rapport_WattNow_${appliedFilters.startDate}_${appliedFilters.endDate}.pdf`
    doc.save(filename)
  }

  const renderMainContent = () => {
    if (error && !loading) {
      return <EmptyState type="error" errorCode={error.code} errorMessage={error.message} onRetry={() => fetchAllData(appliedFilters)} />;
    }

    const hasAnyData = deviceData.some(d => d.daily.length > 0);
    


    if (!loading && !hasAnyData) {
      return <EmptyState type="no-data" onRetry={() => fetchAllData(appliedFilters)} />;
    }

    const loadingBanner = loading ? (
      <div className="mb-4 bg-secondary/50 border border-border rounded-lg p-3 text-center text-sm font-medium text-foreground flex items-center justify-center">
        <span className="animate-pulse flex items-center gap-2">
          ⏳ {loadProgress
            ? `Chargement en cours... (${loadProgress.loaded}/${loadProgress.total} appareils)`
            : "Initialisation..."}
        </span>
      </div>
    ) : null;

    return (
      <div className={`overflow-x-hidden w-full ${refreshing ? "opacity-50 pointer-events-none transition-opacity duration-300" : "transition-opacity duration-300"}`}>
        {loadingBanner}
        <AdvancedMetrics 
          deviceData={deviceData} 
          loading={loading} 
          granularity={appliedFilters.granularity} 
        />

        <div className="mt-3">
          <TopDevicesCard
            deviceData={deviceData}
            loading={loading}
            totalConsumption={totalConsumption}
            unit="kWh"
          />
        </div>

        {/* Row 1: Line chart (full width left) + Pie chart (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <div className="lg:col-span-2" ref={lineChartRef}>
            <ChartErrorBoundary>
              <ConsumptionLineChart
                data={aggregatedTimeline}
                devices={filteredDevices}
                loading={loading}
                granularity={appliedFilters.granularity}
                phaseLabel={phaseLabel}
                unit="kWh"
                className="h-[400px]"
              />
            </ChartErrorBoundary>
          </div>
          <div ref={pieChartRef}>
            <ChartErrorBoundary>
              <DistributionPieChart 
                data={pieData} 
                loading={loading} 
                phaseLabel={phaseLabel} 
                unit="kWh" 
                className="h-[400px]" 
              />
            </ChartErrorBoundary>
          </div>
        </div>

        {/* Row 2: Bar chart (Top) */}
        <div className="mt-4 w-full" ref={barChartRef}>
          <ChartErrorBoundary>
            <DeviceBarChart 
              data={barData} 
              loading={loading} 
              phaseLabel={phaseLabel} 
              unit="kWh"
              className="h-[480px]"
            />
          </ChartErrorBoundary>
        </div>

        {/* Row 3: Radar chart (Bottom) */}
        <div className="mt-6 w-full h-[420px]" style={{ minHeight: '420px' }} ref={radarChartRef}>
          <ChartErrorBoundary>
            <DeviceRadarChart 
              loading={loading}
              className="h-full"
              deviceData={deviceData.map(d => ({
                dn: d.deviceDn,
                name: d.deviceName,
                total: d.total,
                daily: d.daily.map(p => ({ timestamp: p.date, value: p.value }))
              }))}
            />
          </ChartErrorBoundary>
        </div>
        <div className="mt-12 w-full">
          <ChartErrorBoundary>
            <DeviceTreemap 
              loading={loading}
              deviceData={deviceData.map(d => ({
                dn: d.deviceDn,
                name: d.deviceName,
                total: d.total,
                daily: d.daily.map(p => ({ timestamp: p.date, value: p.value }))
              }))}
            />
          </ChartErrorBoundary>
        </div>

        <div className="mt-6 w-full">
          <ChartErrorBoundary>
            <TotalConsumptionChart 
              data={totalTimeline}
              granularity={appliedFilters.granularity}
              loading={loading}
              unit="kWh"
            />
          </ChartErrorBoundary>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Vue d'ensemble — Wattnow</h1>
              {refreshing && (
                <span className="text-[10px] font-bold text-primary animate-pulse bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 uppercase tracking-tighter">
                  Mise à jour...
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">STLR Energie Intelligente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Details link */}
          <Button
            variant="outline"
            size="sm"
            asChild
            className="flex items-center gap-2 border-border bg-card hover:bg-secondary/80 text-foreground transition-all duration-200 shadow-sm whitespace-nowrap"
          >
            <Link to="/comparison">
              <BarChart2 className="h-4 w-4 text-blue-500" />
              <span className="hidden sm:inline">Details</span>
            </Link>
          </Button>

          {/* PDF button — NEW */}
          {!loading && deviceData.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="flex items-center gap-2 border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all shadow-sm active:scale-95 group"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
          )}

          {/* Rapport button — NEW */}
          {!loading && deviceData.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportReport}
              className="flex items-center gap-2 border-violet-500/20 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-all shadow-sm active:scale-95 group"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Rapport</span>
            </Button>
          )}

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
        startDate={pendingStartDate} endDate={pendingEndDate}
        selectedDevices={pendingDevices} selectedDepartment={pendingDepartment}
        granularity={pendingGranularity} phase={pendingPhase}
        onStartDateChange={setPendingStartDate} onEndDateChange={setPendingEndDate}
        onDevicesChange={setPendingDevices} onDepartmentChange={setPendingDepartment}
        onGranularityChange={handleGranularityChange} onPhaseChange={setPendingPhase}
        isDirty={isDirty} onApply={handleApplyFilters} loading={loading}
        rateLimitedDns={rateLimitedDns}
      />

      <ValidationReport result={validationResult} lastUpdate={lastUpdate} />

      {renderMainContent()}
    </div>
  );
};

export default Dashboard;
