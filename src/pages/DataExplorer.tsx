import { useState, useMemo, useEffect, useRef } from 'react';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Table2, Download, Search, Loader2, AlertCircle, Droplets, FileText, BookOpen } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchReportData, ReportDeviceEntry, getReportColor, ReportSource } from '@/lib/reportDataFetcher';
import { formatKwh } from '@/lib/utils';
import { Phase, PHASE_LABELS } from '@/lib/types';
import { MONTH_NAMES_FR, DAY_NAMES_FR, getISOWeek } from '@/lib/dateUtils';

type SourceType = ReportSource;

export interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
}

interface TableRow {
  id: string;          // unique key
  date: string;        // YYYY-MM-DD
  deviceName: string;  // "TGBT Principal"
  deviceDn: string;    // "DN001"
  value: number;       // raw kWh or m³ (selected phase)
  phaseA: number;      // raw L1
  phaseB: number;      // raw L2
  phaseC: number;      // raw L3
  unit: string;        // "kWh" or "m³"
  source: string;      // "WattNow" | "Électricité" | "Eau"
  dayOfWeek: string;   // "Lundi", "Mardi"...
  weekNumber: number;  // ISO week
  month: string;       // "Janvier 2025"
  cumulative?: number; // running total per device
  phase: string;       // "Phase A" | "Total" etc.
}

const PHASE_DISPLAY: Record<string, string> = {
  total: 'Total',
  phaseA: 'L1',
  phaseB: 'L2',
  phaseC: 'L3',
};

const PHASE_SHORT: Record<string, string> = {
  total: 'Total',
  phaseA: 'Phase A',
  phaseB: 'Phase B',
  phaseC: 'Phase C',
};

const DataExplorer = () => {
  const [source, setSource] = useState<SourceType>('wattnow_elec');
  const [selectedPhase, setSelectedPhase] = useState<Phase>('total');
  const [exportingPdf, setExportingPdf] = useState(false);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });

  const [rawData, setRawData] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [sortField, setSortField] = useState<keyof TableRow>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterDevice, setFilterDevice] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  // Reset phase when non-electricity IoT or manual source is selected
  useEffect(() => {
    if (source !== 'wattnow_elec') {
      setSelectedPhase('total');
    }
  }, [source]);

  // Auto-refetch when phase changes
  useEffect(() => {
    if (applied) {
      handleApply();
    }
  }, [selectedPhase]);

  const SOURCE_OPTIONS = [
    { value: 'wattnow_elec', label: 'WattNow Élec', icon: '⚡', color: 'emerald' },
    { value: 'wattnow_water', label: 'WattNow Eau', icon: '💧', color: 'blue' },
    { value: 'electricity', label: 'Manuel Élec', icon: '🔌', color: 'violet' },
    { value: 'water', label: 'Manuel Eau', icon: '💧', color: 'cyan' },
  ];

  const activeSourceOpt = SOURCE_OPTIONS.find(o => o.value === source);

  const handleApply = async () => {
    setLoading(true);
    setPage(1);
    setError(null);
    try {
      const data: ReportDeviceEntry[] = await fetchReportData(source, startDate, endDate, selectedPhase);

      const rows: TableRow[] = [];

      data.forEach(device => {
        let cumulative = 0;
        const sortedDaily = [...device.daily].sort((a, b) => a.date.localeCompare(b.date));

        sortedDaily.forEach(point => {
          cumulative += point.value;
          const dateObj = new Date(point.date);
          const weekNumber = getISOWeek(dateObj);

          rows.push({
            id: `${device.dn}_${point.date}`,
            date: point.date,
            deviceName: device.name,
            deviceDn: device.dn,
            value: point.value,
            phaseA: point.phaseA,
            phaseB: point.phaseB,
            phaseC: point.phaseC,
            unit: (source === 'water' || source === 'wattnow_water') ? 'm³' : 'kWh',
            source: source === 'wattnow_elec' ? 'WattNow Élec'
              : source === 'wattnow_water' ? 'WattNow Eau'
                : source === 'electricity' ? 'Manuel Élec' : 'Manuel Eau',
            dayOfWeek: DAY_NAMES_FR[dateObj.getDay()],
            weekNumber,
            month: `${MONTH_NAMES_FR[dateObj.getMonth()]} ${dateObj.getFullYear()}`,
            cumulative,
            phase: PHASE_LABELS[selectedPhase],
          });
        });
      });

      setRawData(rows);
      setApplied(true);
    } catch (err) {
      console.error('Error fetching data explorer data:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des données. Veuillez réessayer.');
      setRawData([]);
    } finally {
      setLoading(false);
    }
  };

  const unitStr = (source === 'water' || source === 'wattnow_water') ? 'm³' : 'kWh';

  const handleExportExcel = () => {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();

      const headers = [
        'Date', 'Jour', 'Semaine', 'Mois', 'Appareil',
        'Source', 'Phase',
        `Valeur (${unitStr})`,
        `Phase A (${unitStr})`,
        `Phase B (${unitStr})`,
        `Phase C (${unitStr})`,
        `Cumulé (${unitStr})`,
      ];

      const dataRows = filtered.map(row => [
        row.date,
        row.dayOfWeek,
        `S${row.weekNumber}`,
        row.month,
        row.deviceName,
        row.source,
        row.phase,
        row.value,
        row.phaseA,
        row.phaseB,
        row.phaseC,
        row.cumulative ?? 0,
      ]);

      const wsData = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

      wsData['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 16 },
        { wch: 22 }, { wch: 14 }, { wch: 10 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      ];

      const headerRange = XLSX.utils.decode_range(wsData['!ref'] ?? 'A1');
      for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!wsData[cellAddress]) continue;
        wsData[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: '1a1a2e' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            bottom: { style: 'medium', color: { rgb: '10b981' } }
          }
        };
      }

      const deviceColors: Record<string, string> = {};
      const palette = ['EFF6FF', 'F0FDF4', 'FFFBEB', 'FDF4FF', 'FFF1F2', 'ECFEFF'];
      let colorIdx = 0;
      filtered.forEach(row => {
        if (!deviceColors[row.deviceDn]) {
          deviceColors[row.deviceDn] = palette[colorIdx % palette.length];
          colorIdx++;
        }
      });

      dataRows.forEach((_, rowIdx) => {
        const row = filtered[rowIdx];
        const bgColor = deviceColors[row.deviceDn] ?? 'FFFFFF';
        for (let C = 0; C < headers.length; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIdx + 1, c: C });
          if (!wsData[cellAddress]) continue;
          wsData[cellAddress].s = {
            fill: { fgColor: { rgb: bgColor } },
            alignment: { vertical: 'center' },
            border: {
              bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
            }
          };
        }
        const valCell = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 7 });
        if (wsData[valCell]) {
          wsData[valCell].s = {
            ...wsData[valCell].s,
            font: { bold: true },
            numFmt: '0.00',
          };
        }
      });

      XLSX.utils.book_append_sheet(wb, wsData, 'Données Brutes');

      const deviceSummary = new Map<string, {
        name: string; total: number; days: number; max: number; maxDate: string
      }>();

      filtered.forEach(row => {
        const existing = deviceSummary.get(row.deviceDn);
        if (!existing) {
          deviceSummary.set(row.deviceDn, {
            name: row.deviceName,
            total: row.value,
            days: 1,
            max: row.value,
            maxDate: row.date,
          });
        } else {
          existing.total += row.value;
          existing.days++;
          if (row.value > existing.max) {
            existing.max = row.value;
            existing.maxDate = row.date;
          }
        }
      });

      const summaryHeaders = [
        'Appareil', 'Jours de données',
        `Total (${unitStr})`,
        `Moyenne/jour (${unitStr})`,
        `Pic (${unitStr})`, 'Date du pic',
      ];
      const summaryRows = Array.from(deviceSummary.values()).map(d => [
        d.name,
        d.days,
        +d.total.toFixed(2),
        +(d.total / d.days).toFixed(2),
        +d.max.toFixed(2),
        d.maxDate,
      ]);

      const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
      wsSummary['!cols'] = [
        { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
      ];

      for (let C = 0; C < summaryHeaders.length; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!wsSummary[cellAddress]) continue;
        wsSummary[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: '1a1a2e' } },
          alignment: { horizontal: 'center' },
          border: { bottom: { style: 'medium', color: { rgb: '10b981' } } }
        };
      }

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé Appareils');

      const monthSummary = new Map<string, number>();
      filtered.forEach(row => {
        monthSummary.set(row.month, (monthSummary.get(row.month) ?? 0) + row.value);
      });

      const monthHeaders = [
        'Mois', `Consommation totale (${unitStr})`
      ];
      const monthRows = Array.from(monthSummary.entries())
        .map(([month, total]) => [month, +total.toFixed(2)]);

      const wsMonth = XLSX.utils.aoa_to_sheet([monthHeaders, ...monthRows]);
      wsMonth['!cols'] = [{ wch: 18 }, { wch: 24 }];

      for (let C = 0; C < monthHeaders.length; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!wsMonth[cellAddress]) continue;
        wsMonth[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: '1a1a2e' } },
          alignment: { horizontal: 'center' },
          border: { bottom: { style: 'medium', color: { rgb: '10b981' } } }
        };
      }

      XLSX.utils.book_append_sheet(wb, wsMonth, 'Résumé Mensuel');

      const filename = `STLR_${source}_${PHASE_LABELS[selectedPhase]}_${startDate}_${endDate}.xlsx`;
      XLSX.writeFile(wb, filename, { cellStyles: true });
    });
  };

  const handleExportPDFWrapper = async () => {
    setExportingPdf(true);
    try {
      await new Promise(r => setTimeout(r, 0));
      handleExportPDF();
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })

    // ── Header band ───────────────────────────────────────────
    doc.setFillColor(16, 185, 129)   // emerald-500
    doc.rect(0, 0, pageW, 18, 'F')

    // App name
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('STLR Énergie', 14, 11)

    // Subtitle
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Explorateur de Données — Export', 14, 16)

    // Date top right
    doc.setFontSize(7)
    doc.text(`Généré le ${now}`, pageW - 14, 11, { align: 'right' })

    // ── Filter summary line ───────────────────────────────────
    doc.setTextColor(80, 80, 80)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const sourceLabel = SOURCE_OPTIONS.find(s => s.value === source)?.label ?? source
    const phaseLabel = PHASE_SHORT[selectedPhase]
    doc.text(
      `Période : ${startDate} → ${endDate}   |   Source : ${sourceLabel}   |   Phase : ${phaseLabel}   |   ${filtered.length.toLocaleString('fr-FR')} enregistrements`,
      14, 24
    )

    // ── KPI boxes ────────────────────────────────────────────
    const kpis = [
      { label: 'Total lignes', value: stats.totalRows.toLocaleString('fr-FR') },
      { label: 'Appareils', value: String(stats.uniqueDevices) },
      { label: 'Jours analysés', value: String(stats.uniqueDays) },
      { label: 'Volume total', value: `${formatKwh(stats.totalValue)} ${unitStr}` },
      { label: 'Moyenne / jour', value: `${formatKwh(stats.avgValue)} ${unitStr}` },
      { label: 'Pic maximum', value: `${formatKwh(stats.maxRow?.value ?? 0)} ${unitStr}` },
      { label: 'Valeur min', value: `${formatKwh(stats.minRow?.value ?? 0)} ${unitStr}` },
    ]

    const boxW = (pageW - 28) / kpis.length
    const boxY = 28

    kpis.forEach((kpi, i) => {
      const x = 14 + i * boxW
      // box background
      doc.setFillColor(245, 247, 250)
      doc.roundedRect(x, boxY, boxW - 2, 16, 2, 2, 'F')
      // label
      doc.setTextColor(120, 120, 120)
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.label.toUpperCase(), x + (boxW - 2) / 2, boxY + 5, { align: 'center' })
      // value
      doc.setTextColor(20, 20, 20)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.value, x + (boxW - 2) / 2, boxY + 11, { align: 'center' })
    })

    // ── Data table ────────────────────────────────────────────
    autoTable(doc, {
      startY: boxY + 20,
      head: [[
        'Date', 'Jour', 'Sem.', 'Mois', 'Appareil', 'Source', 'Phase',
        `Valeur (${unitStr})`, `Cumulé (${unitStr})`
      ]],
      body: filtered.map(row => [
        row.date,
        row.dayOfWeek,
        `S${row.weekNumber}`,
        row.month,
        row.deviceName,
        row.source,
        row.phase,
        formatKwh(row.value),
        formatKwh(row.cumulative ?? 0),
      ]),
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineColor: [230, 230, 230],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'center', cellWidth: 12 },
        3: { cellWidth: 28 },
        4: { fontStyle: 'bold', cellWidth: 40 },
        5: { halign: 'center', cellWidth: 24 },
        6: { halign: 'center', cellWidth: 16 },
        7: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
        8: { halign: 'right', cellWidth: 22 },
      },
      didParseCell: (data) => {
        // Highlight weekend rows
        if (data.section === 'body') {
          const row = filtered[data.row.index]
          if (row && (row.dayOfWeek === 'Samedi' || row.dayOfWeek === 'Dimanche')) {
            data.cell.styles.textColor = [180, 130, 0]
          }
        }
      },
      // Footer with page numbers
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages()
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${data.pageNumber} / ${pageCount}  —  STLR Énergie`,
          pageW / 2,
          pageH - 6,
          { align: 'center' }
        )
        // bottom line
        doc.setDrawColor(16, 185, 129)
        doc.setLineWidth(0.5)
        doc.line(14, pageH - 9, pageW - 14, pageH - 9)
      },
    })

    const filename = `STLR_${source}_${selectedPhase}_${startDate}_${endDate}.pdf`
    doc.save(filename)
  }

  const handleExportReport = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const now = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
    const sourceLabel = SOURCE_OPTIONS.find(s => s.value === source)?.label ?? source

    // ══════════════════════════════════════════════
    // PAGE 1 — Cover / Executive Summary
    // ══════════════════════════════════════════════

    // Full dark header
    doc.setFillColor(15, 23, 42)   // slate-900
    doc.rect(0, 0, pageW, 60, 'F')

    // Green accent bar left
    doc.setFillColor(16, 185, 129)
    doc.rect(0, 0, 4, 60, 'F')

    // App name
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('STLR Énergie', 14, 22)

    // Report title
    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(16, 185, 129)
    doc.text('Rapport d\'Analyse Énergétique', 14, 32)

    // Meta info
    doc.setFontSize(9)
    doc.setTextColor(180, 180, 180)
    doc.text(`Période : ${startDate}  →  ${endDate}`, 14, 42)
    doc.text(`Source : ${sourceLabel}   |   Phase : ${PHASE_SHORT[selectedPhase]}`, 14, 49)
    doc.text(`Généré le ${now}`, 14, 56)

    // ── Executive KPI section ─────────────────────
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('INDICATEURS CLÉS', 14, 75)
    doc.setDrawColor(16, 185, 129)
    doc.setLineWidth(0.8)
    doc.line(14, 77, 60, 77)

    // 2×3 KPI grid
    const kpiData = [
      { label: 'Volume total consommé', value: `${formatKwh(stats.totalValue)}`, unit: unitStr },
      { label: 'Moyenne journalière', value: `${formatKwh(stats.avgValue)}`, unit: unitStr },
      { label: 'Pic de consommation', value: `${formatKwh(stats.maxRow?.value ?? 0)}`, unit: unitStr, sub: stats.maxRow?.date },
      { label: 'Valeur minimale', value: `${formatKwh(stats.minRow?.value ?? 0)}`, unit: unitStr, sub: stats.minRow?.date },
      { label: 'Appareils actifs', value: String(stats.uniqueDevices), unit: 'appareils' },
      { label: 'Jours analysés', value: String(stats.uniqueDays), unit: 'jours' },
    ]

    const cols = 3
    const cardW = (pageW - 28 - (cols - 1) * 4) / cols
    const cardH = 24
    const startKpiY = 82

    kpiData.forEach((kpi, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 14 + col * (cardW + 4)
      const y = startKpiY + row * (cardH + 4)

      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F')
      doc.setDrawColor(220, 220, 220)
      doc.setLineWidth(0.2)
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'S')

      // Colored left accent
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

      if (kpi.sub) {
        doc.setTextColor(150, 150, 150)
        doc.setFontSize(6)
        doc.text(kpi.sub, x + 7, y + 21)
      }
    })

    // ── Device breakdown table ────────────────────
    const deviceBreakdownY = startKpiY + 2 * (cardH + 4) + 12

    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('CONSOMMATION PAR APPAREIL', 14, deviceBreakdownY)
    doc.setDrawColor(16, 185, 129)
    doc.line(14, deviceBreakdownY + 2, 100, deviceBreakdownY + 2)

    // Build per-device summary
    const deviceMap = new Map<string, { name: string; total: number; days: number; max: number }>()
    filtered.forEach(row => {
      const ex = deviceMap.get(row.deviceDn)
      if (!ex) {
        deviceMap.set(row.deviceDn, { name: row.deviceName, total: row.value, days: 1, max: row.value })
      } else {
        ex.total += row.value
        ex.days++
        if (row.value > ex.max) ex.max = row.value
      }
    })
    const deviceSummary = Array.from(deviceMap.values())
      .sort((a, b) => b.total - a.total)
    const grandTotalValue = deviceSummary.reduce((s, d) => s + d.total, 0)

    autoTable(doc, {
      startY: deviceBreakdownY + 6,
      head: [['Appareil', `Total (${unitStr})`, '% du total', `Moy/jour (${unitStr})`, `Pic (${unitStr})`]],
      body: deviceSummary.map(d => [
        d.name,
        formatKwh(d.total),
        grandTotalValue > 0 ? `${((d.total / grandTotalValue) * 100).toFixed(1)}%` : '0%',
        formatKwh(d.total / d.days),
        formatKwh(d.max),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55 },
        1: { halign: 'right' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    })

    // ── Monthly summary ───────────────────────────
    const monthMap = new Map<string, number>()
    filtered.forEach(row => {
      monthMap.set(row.month, (monthMap.get(row.month) ?? 0) + row.value)
    })
    const monthSummary = Array.from(monthMap.entries())

    if (monthSummary.length > 1) {
      const afterDeviceY = (doc as any).lastAutoTable.finalY + 10
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('ÉVOLUTION MENSUELLE', 14, afterDeviceY)
      doc.setDrawColor(16, 185, 129)
      doc.line(14, afterDeviceY + 2, 80, afterDeviceY + 2)

      autoTable(doc, {
        startY: afterDeviceY + 6,
        head: [['Mois', `Consommation (${unitStr})`]],
        body: monthSummary.map(([month, val]) => [month, formatKwh(val)]),
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
    // PAGE 2+ — Full data table
    // ══════════════════════════════════════════════
    doc.addPage()

    // Page header
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, 14, 'F')
    doc.setFillColor(16, 185, 129)
    doc.rect(0, 0, 3, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('DONNÉES BRUTES COMPLÈTES', 10, 9)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 180, 180)
    doc.text(`${filtered.length.toLocaleString('fr-FR')} enregistrements`, pageW - 14, 9, { align: 'right' })

    autoTable(doc, {
      startY: 18,
      head: [['Date', 'Jour', 'Mois', 'Appareil', 'Phase', `Valeur (${unitStr})`, `Cumulé (${unitStr})`]],
      body: filtered.map(row => [
        row.date,
        row.dayOfWeek,
        row.month,
        row.deviceName,
        row.phase,
        formatKwh(row.value),
        formatKwh(row.cumulative ?? 0),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'center', cellWidth: 20 },
        2: { cellWidth: 30 },
        3: { fontStyle: 'bold', cellWidth: 50 },
        4: { halign: 'center', cellWidth: 16 },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const row = filtered[data.row.index]
          if (row?.dayOfWeek === 'Samedi' || row?.dayOfWeek === 'Dimanche') {
            data.cell.styles.textColor = [180, 130, 0]
          }
        }
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages()
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${data.pageNumber} / ${pageCount}  —  STLR Énergie  —  ${startDate} → ${endDate}`,
          pageW / 2, pageH - 6, { align: 'center' }
        )
        doc.setDrawColor(16, 185, 129)
        doc.setLineWidth(0.4)
        doc.line(14, pageH - 9, pageW - 14, pageH - 9)
      },
    })

    const filename = `STLR_Rapport_${source}_${startDate}_${endDate}.pdf`
    doc.save(filename)
  }

  const deviceOptions = useMemo(() => {
    const names = Array.from(new Set(rawData.map(r => r.deviceName)));
    return ['all', ...names.sort()];
  }, [rawData]);

  const filtered = useMemo(() => {
    let rows = [...rawData];

    if (filterDevice !== 'all') {
      rows = rows.filter(r => r.deviceName === filterDevice);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.date.includes(q) ||
        r.deviceName.toLowerCase().includes(q) ||
        r.month.toLowerCase().includes(q) ||
        r.dayOfWeek.toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const dir = sortDir === 'asc' ? 1 : -1;

      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });

    return rows;
  }, [rawData, filterDevice, search, sortField, sortDir]);

  const stats = useMemo(() => {
    if (filtered.length === 0) return { totalRows: 0, totalValue: 0, avgValue: 0, maxRow: null, minRow: null, uniqueDevices: 0, uniqueDays: 0 };

    const totalValue = filtered.reduce((s, r) => s + r.value, 0);
    const maxRow = filtered.reduce((max, r) => r.value > max.value ? r : max, filtered[0]);
    const minRow = filtered.filter(r => r.value > 0).reduce((min, r) => r.value < min.value ? r : min, filtered.find(r => r.value > 0) || filtered[0]);

    return {
      totalRows: filtered.length,
      totalValue,
      avgValue: totalValue / filtered.length,
      maxRow,
      minRow: minRow.value === Infinity ? null : minRow,
      uniqueDevices: new Set(filtered.map(r => r.deviceName)).size,
      uniqueDays: new Set(filtered.map(r => r.date)).size,
    };
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1 drop-shadow-sm">
            Exploration Analytique
          </p>
          <h1 className="text-4xl font-black tracking-tighter text-foreground leading-none">
            Explorateur <span className="text-muted-foreground/30 font-light">de</span> Données
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            Accès complet aux données granulaires · Audit & Export
          </p>
        </div>

        {applied && rawData.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Export PDF simple */}
            <button
              onClick={handleExportPDFWrapper}
              disabled={exportingPdf}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl 
                         bg-red-500/10 border border-red-500/20 
                         text-red-400 text-sm font-black hover:bg-red-500/20 
                         transition-all shadow-sm active:scale-95 group disabled:opacity-50"
            >
              {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              PDF
            </button>

            {/* Rapport complet */}
            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl 
                         bg-violet-500/10 border border-violet-500/20 
                         text-violet-400 text-sm font-black hover:bg-violet-500/20 
                         transition-all shadow-sm active:scale-95 group"
            >
              <BookOpen className="h-4 w-4" />
              Rapport
            </button>

            {/* Excel (existing) */}
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl 
                         bg-emerald-500/10 border border-emerald-500/20 
                         text-emerald-500 text-sm font-black hover:bg-emerald-500/20 
                         transition-all shadow-sm active:scale-95 group"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-end p-5 
                      bg-card border border-border shadow-xl rounded-2xl relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 transition-colors" />

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          maxDate={new Date().toISOString().split('T')[0]}
          minDate="2020-01-01"
        />

        {/* Source selector */}
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
            Source de données
          </label>
          <select
            value={source}
            onChange={e => setSource(e.target.value as typeof source)}
            className="bg-secondary border border-border/60 rounded-xl px-3 py-2.5 
                       text-sm text-foreground focus:outline-none focus:border-primary/50
                       cursor-pointer appearance-none"
            style={{ backgroundImage: 'none' }}
          >
            <option value="wattnow_elec">⚡ WattNow Électricité</option>
            <option value="wattnow_water">💧 WattNow Eau</option>
            <option value="electricity">🔌 Manuel Électricité</option>
            <option value="water">💧 Manuel Eau</option>
          </select>
        </div>

        {/* Phase selector — only for wattnow sources */}
        {(source === 'wattnow_elec' || source === 'wattnow_water') && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Phase
            </label>
            <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 border border-border/40 h-[42px] items-center">
              {(['total', 'phaseA', 'phaseB', 'phaseC'] as const).map(ph => (
                <button
                  key={ph}
                  onClick={() => setSelectedPhase(ph)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${selectedPhase === ph
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {PHASE_DISPLAY[ph] ?? ph}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Apply button */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
          <label className="text-[10px] opacity-0 select-none">.</label>
          <button
            onClick={handleApply}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 
                       rounded-xl bg-emerald-500 text-white text-sm font-bold 
                       hover:bg-emerald-400 transition-all disabled:opacity-50
                       h-[42px]"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</>
              : <><Search className="h-4 w-4" /> Charger les données</>
            }
          </button>
        </div>
      </div>

      {applied && !loading && rawData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 
                        border border-dashed border-border/40 rounded-2xl bg-card/10">
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center 
                          justify-center mb-4">
            {source === 'wattnow_water'
              ? <Droplets className="h-8 w-8 text-blue-400/50" />
              : <Table2 className="h-8 w-8 text-muted-foreground/40" />
            }
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">
            {source === 'wattnow_water'
              ? 'Compteurs d\'eau IoT non configurés'
              : 'Aucune donnée trouvée'
            }
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-xs mt-1">
            {source === 'wattnow_water'
              ? 'Les compteurs d\'eau WattNow ne sont pas encore connectés. Utilisez "Manuel Eau" pour saisir vos données manuellement.'
              : 'Aucune donnée pour cette période et cette source.'
            }
          </p>
          {source === 'wattnow_water' && (
            <button
              onClick={() => setSource('water')}
              className="mt-4 px-4 py-2 rounded-xl bg-blue-500/10 border 
                         border-blue-500/30 text-blue-400 text-xs font-bold
                         hover:bg-blue-500/20 transition-all active:scale-95"
            >
              💧 Basculer vers Manuel Eau →
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {applied && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
          {[
            { label: 'Total Lignes', value: stats.totalRows.toLocaleString('fr-FR'), icon: Table2 },
            { label: 'Appareils', value: stats.uniqueDevices },
            { label: 'Période (j)', value: stats.uniqueDays },
            { label: 'Volume Total', value: formatKwh(stats.totalValue), unit: unitStr },
            { label: 'Tendance Moy.', value: formatKwh(stats.avgValue), unit: unitStr },
            { label: 'Pic Maximum', value: stats.maxRow ? formatKwh(stats.maxRow.value) : '—', sub: stats.maxRow?.deviceName },
            { label: 'Valeur Min.', value: stats.minRow ? formatKwh(stats.minRow.value) : '—', sub: stats.minRow?.deviceName },
          ].map((stat: StatItem, i) => (
            <div key={i} className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-1">
                {stat.label}
              </p>
              <p className="text-xl font-black tabular-nums text-foreground leading-tight">
                {stat.value}
                {stat.unit && <span className="text-[10px] font-bold text-muted-foreground ml-1">{stat.unit}</span>}
              </p>
              {stat.sub && (
                <p className="text-[9px] text-muted-foreground font-bold truncate mt-1 uppercase opacity-60">
                  {stat.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {applied && !loading && rawData.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-[260px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Filtrer date, appareil..."
                  className="w-full pl-10 pr-4 py-2.5 bg-card border border-border/80 
                             rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              <select
                value={filterDevice}
                onChange={e => { setFilterDevice(e.target.value); setPage(1); }}
                className="bg-card border border-border/80 rounded-xl px-4 py-2.5 
                           text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              >
                <option value="all">Tous les Appareils</option>
                {deviceOptions.slice(1).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] whitespace-nowrap">
              Visualisation : {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} entrées
            </span>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl relative">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary/30 border-b border-border">
                  <tr>
                    {[
                      { key: 'date', label: 'Date', width: 'min-w-[100px]' },
                      { key: 'dayOfWeek', label: 'Jour', width: 'min-w-[90px]' },
                      { key: 'month', label: 'Période', width: 'min-w-[130px]' },
                      { key: 'deviceName', label: 'Point de mesure', width: 'min-w-[160px]' },
                      { key: 'source', label: 'Source', width: 'min-w-[110px]' },
                      { key: 'phase', label: 'Phase', width: 'min-w-[80px]' },
                      { key: 'value', label: 'Quantité', width: 'min-w-[120px]' },
                      { key: 'cumulative', label: 'Total Cumulé', width: 'min-w-[120px]' },
                    ].map(col => (
                      <th key={col.key}
                        onClick={() => {
                          if (sortField === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                          else { setSortField(col.key as keyof TableRow); setSortDir('desc'); }
                          setPage(1);
                        }}
                        className={`${col.width} px-5 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 cursor-pointer hover:bg-primary/5 transition-colors group`}
                      >
                        <div className="flex items-center gap-1.5">
                          {col.label}
                          <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                            {sortField === col.key
                              ? (sortDir === 'asc' ? <span className="text-primary text-[8px]">▲</span> : <span className="text-primary text-[8px]">▼</span>)
                              : <span className="text-muted-foreground/30 text-[8px]">↕</span>}
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {paginated.map((row) => {
                    const devColor = getReportColor(row.deviceDn);
                    const isMax = stats.maxRow && row.id === stats.maxRow.id;
                    const isMin = stats.minRow && row.id === stats.minRow.id;
                    const isWeekend = row.dayOfWeek === 'Samedi' || row.dayOfWeek === 'Dimanche';

                    return (
                      <tr key={row.id} className={`hover:bg-secondary/20 transition-all font-medium ${isWeekend ? 'bg-secondary/10' : ''}`}>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-[11px] tabular-nums text-foreground/80">{row.date}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[10px] font-black uppercase ${isWeekend ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            {row.dayOfWeek}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">{row.month}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: devColor }} />
                            <span className="text-xs font-bold tracking-tight" style={{ color: devColor }}>
                              {row.deviceName}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[9px] font-black px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground/70 uppercase">
                            {row.source}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${row.phase === 'Phase A' ? 'bg-emerald-500/15 text-emerald-400' :
                              row.phase === 'Phase B' ? 'bg-blue-500/15 text-blue-400' :
                                row.phase === 'Phase C' ? 'bg-amber-500/15 text-amber-400' :
                                  'bg-secondary text-muted-foreground opacity-60'
                            }`}>
                            {row.phase}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-black tabular-nums ${isMax ? 'text-red-500 underline underline-offset-4' : isMin ? 'text-emerald-500' : 'text-foreground'}`}>
                              {formatKwh(row.value)}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground italic leading-none">{row.unit}</span>
                            {isMax && <span className="text-[8px] bg-red-500 text-white font-black px-1 rounded uppercase animate-pulse">MAX</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-baseline gap-1 opacity-70">
                            <span className="text-xs font-mono font-bold tracking-tighter">{formatKwh(row.cumulative ?? 0)}</span>
                            <span className="text-[9px] font-bold text-muted-foreground">{row.unit}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 bg-secondary/20 border-t border-border">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest border border-border hover:bg-card disabled:opacity-30 transition-all active:scale-95"
                >
                  ← Précédent
                </button>
                <div className="hidden lg:flex items-center gap-1.5 font-bold text-xs text-muted-foreground">
                  Page <span className="text-foreground">{page}</span> sur {totalPages}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest border border-border hover:bg-card disabled:opacity-30 transition-all active:scale-95"
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!applied && !loading && (
        <div className="flex flex-col items-center justify-center py-32 bg-card/30 border-2 border-dashed border-border/50 rounded-[2rem] text-center px-6">
          <div className="w-24 h-24 bg-primary/5 rounded-[2rem] flex items-center justify-center mb-8">
            <Table2 className="h-12 w-12 text-primary/40" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3 tracking-tighter">Exploration Prête</h3>
          <p className="text-muted-foreground max-w-sm font-medium">Sélectionnez vos critères pour extraire l'audit détaillé.</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3 pt-6 animate-pulse">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 bg-card rounded-2xl border border-border/20 flex items-center px-6 gap-4" />
          ))}
        </div>
      )}
    </div>
  );
};

export default DataExplorer;
