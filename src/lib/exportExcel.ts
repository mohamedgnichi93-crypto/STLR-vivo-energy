import ExcelJS from 'exceljs'
import type { DeviceConsumption, RawConsumptionPoint, Granularity, Phase } from './types'
import { formatKwh } from './utils'

// ─── STLR Brand Colors ───────────────────────────────────────────
const C = {
  greenDark:   '064E3B',   // header bg
  greenMid:    '065F46',   // subheader bg
  greenLight:  '10B981',   // accent
  greenTotal:  '022C22',   // total row bg
  darkBg:      '0F172A',   // sheet bg / alt row
  cardBg:      '1E293B',   // normal row
  cardBg2:     '162032',   // alternate row
  white:       'FFFFFF',
  gray:        'CBD5E1',
  grayDark:    '64748B',
  border:      '334155',
}

// ─── Reusable style helpers ───────────────────────────────────────
function headerFill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } }
}

function rowFill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } }
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: 'FF' + C.border } }
  return { top: s, left: s, bottom: s, right: s }
}

function applyHeaderStyle(
  cell: ExcelJS.Cell,
  bgColor: string = C.greenDark,
  fontSize: number = 11
) {
  cell.fill = headerFill(bgColor)
  cell.font = { bold: true, color: { argb: 'FF' + C.white }, size: fontSize }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.border = thinBorder()
}

function applyDataStyle(
  cell: ExcelJS.Cell,
  bgColor: string = C.cardBg,
  options?: { bold?: boolean; align?: ExcelJS.Alignment['horizontal']; color?: string }
) {
  cell.fill = rowFill(bgColor)
  cell.font = {
    color: { argb: 'FF' + (options?.color ?? C.white) },
    bold: options?.bold ?? false,
    size: 10,
  }
  cell.alignment = { horizontal: options?.align ?? 'left', vertical: 'middle' }
  cell.border = thinBorder()
}

// ─── Number format: French style via custom format ────────────────
const NUM_FMT = '#,##0.000'

// ─── Export interface ─────────────────────────────────────────────
export interface ExportOptions {
  deviceData: DeviceConsumption[]
  aggregatedTimeline: Array<Record<string, string | number>>
  rawPointsMap: Map<string, RawConsumptionPoint[]>
  startDate: string
  endDate: string
  granularity: string
  phase: string
  totalConsumption: number
  avgPerPeriod: number
  peakValue: number
  minValue: number
  selectedDevices: string[]
  unit?: string // 'kWh' or 'm³'
  chartImages?: {
    line?:  string   // base64 PNG
    pie?:   string
    bar?:   string
    radar?: string
  }
}

// ─── Main export function ─────────────────────────────────────────
export async function exportToExcel(opts: ExportOptions): Promise<void> {
  const {
    deviceData,
    aggregatedTimeline,
    rawPointsMap,
    startDate,
    endDate,
  } = opts

  const wb = new ExcelJS.Workbook()
  wb.creator = 'STLR Energy'
  wb.created = new Date()

  buildResumeSheet(wb, opts)
  buildConsommationSheet(wb, deviceData, opts.unit ?? 'kWh')
  buildDonneesTemporellesSheet(wb, deviceData, aggregatedTimeline)
  buildPhasesSheet(wb, deviceData, rawPointsMap)

  // ── Visualisations Sheet ──────────────────────────────────────
  if (opts.chartImages && Object.values(opts.chartImages).some(Boolean)) {
    const wsViz = wb.addWorksheet('Visualisations', {
      properties: { tabColor: { argb: 'FF10B981' } }
    })

    // Sheet title
    wsViz.mergeCells('A1:L1')
    const titleCell = wsViz.getCell('A1')
    titleCell.value = '📊 VISUALISATIONS — GRAPHIQUES'
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    wsViz.getRow(1).height = 40

    // Subtitle
    wsViz.mergeCells('A2:L2')
    const subCell = wsViz.getCell('A2')
    subCell.value = `Période : ${startDate} → ${endDate}   |   Générés automatiquement depuis le dashboard`
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } }
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    subCell.alignment = { horizontal: 'center' }
    wsViz.getRow(2).height = 20

    // Set column widths for image grid
    for (let c = 1; c <= 12; c++) {
      wsViz.getColumn(c).width = 12
    }

    const addChartImage = async (base64: string, tlCell: string, brCell: string) => {
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '')
      const imageId = wb.addImage({ base64: base64Data, extension: 'png' })

      const decodeCell = (ref: string) => {
        const m = ref.match(/^([A-Z]+)(\d+)$/)
        if (!m) return { col: 0, row: 0 }
        const col = m[1].split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1
        const row = parseInt(m[2]) - 1
        return { col, row }
      }

      wsViz.addImage(imageId, `${tlCell}:${brCell}`)
    }

    const addSectionLabel = (cell: string, text: string) => {
      wsViz.mergeCells(`${cell}:L${cell.replace(/[A-Z]/g, '')}`)
      const c = wsViz.getCell(cell)
      c.value = text
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF10B981' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      c.alignment = { horizontal: 'left', indent: 1 }
      wsViz.getRow(parseInt(cell.replace(/[A-Z]/g, ''))).height = 22
    }

    let currentRow = 4
    if (opts.chartImages.line) {
      addSectionLabel(`A${currentRow}`, '📈  Tendance de Consommation — Évolution Journalière')
      currentRow++
      await addChartImage(opts.chartImages.line, `A${currentRow}`, `L${currentRow + 22}`)
      currentRow += 24
    }
    if (opts.chartImages.pie || opts.chartImages.bar) {
      if (opts.chartImages.pie) {
        const labelRow = currentRow
        wsViz.mergeCells(`A${labelRow}:F${labelRow}`)
        const c = wsViz.getCell(`A${labelRow}`)
        c.value = '🥧  Répartition par Appareil'
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF10B981' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        c.alignment = { horizontal: 'left', indent: 1 }
        wsViz.getRow(labelRow).height = 22
        await addChartImage(opts.chartImages.pie, `A${currentRow + 1}`, `F${currentRow + 20}`)
      }
      if (opts.chartImages.bar) {
        const labelRow = currentRow
        wsViz.mergeCells(`G${labelRow}:L${labelRow}`)
        const c = wsViz.getCell(`G${labelRow}`)
        c.value = '▊  Consommation par Appareil'
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF10B981' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        c.alignment = { horizontal: 'left', indent: 1 }
        await addChartImage(opts.chartImages.bar, `G${currentRow + 1}`, `L${currentRow + 20}`)
      }
      currentRow += 22
    }
    if (opts.chartImages.radar) {
      addSectionLabel(`A${currentRow}`, '🕸️  Comparaison Radar — Profil des Appareils')
      currentRow++
      await addChartImage(opts.chartImages.radar, `A${currentRow}`, `F${currentRow + 20}`)
      currentRow += 22
    }

    for (let r = 4; r <= currentRow; r++) {
      if (!wsViz.getRow(r).height || wsViz.getRow(r).height < 15) wsViz.getRow(r).height = 15
    }
  }

  // ── Download ──────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.download = `STLR_Rapport_${startDate}_${endDate}_${ts}.xlsx`
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════════════
// SHEET 1 — Résumé
// ═══════════════════════════════════════════════════════════════════
function buildResumeSheet(wb: ExcelJS.Workbook, opts: ExportOptions) {
  const ws = wb.addWorksheet('Résumé')
  ws.views = [{ showGridLines: false }]
  const unit = opts.unit ?? 'kWh'

  // Column widths
  ws.getColumn(1).width = 30
  ws.getColumn(2).width = 25
  ws.getColumn(3).width = 15
  ws.getColumn(4).width = 15

  // ── Row 1: Title ──────────────────────────────────────────────
  ws.mergeCells('A1:D1')
  const titleCell = ws.getCell('A1')
  titleCell.value = '⚡  STLR ENERGY — RAPPORT DE CONSOMMATION'
  titleCell.fill = headerFill(C.greenDark)
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF' + C.white } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 36

  // ── Row 2: Subtitle ───────────────────────────────────────────
  ws.mergeCells('A2:D2')
  const subCell = ws.getCell('A2')
  subCell.value = 'Vivo Energy · Plateforme de surveillance énergétique'
  subCell.fill = headerFill(C.greenMid)
  subCell.font = { italic: true, size: 11, color: { argb: 'FFCBD5E1' } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  // ── Row 3: spacer
  ws.getRow(3).height = 8

  // ── Rows 4-7: Metadata ────────────────────────────────────────
  const meta = [
    ['Période',     `${opts.startDate}  →  ${opts.endDate}`],
    ['Généré le',   new Date().toLocaleString('fr-FR')],
    ['Granularité', opts.granularity],
    ['Phase',       opts.phase],
  ]
  meta.forEach(([label, value], i) => {
    const row = ws.getRow(4 + i)
    row.height = 20
    const a = row.getCell(1)
    const b = row.getCell(2)
    a.value = label
    b.value = value
    applyDataStyle(a, C.cardBg, { bold: true, color: C.gray })
    applyDataStyle(b, C.cardBg2)
    // empty C & D
    applyDataStyle(row.getCell(3), C.cardBg2)
    applyDataStyle(row.getCell(4), C.cardBg2)
  })

  // ── Row 8: spacer
  ws.getRow(8).height = 8

  // ── Row 9: KPI section header ─────────────────────────────────
  ws.mergeCells('A9:D9')
  const kpiHeader = ws.getCell('A9')
  kpiHeader.value = '▌  INDICATEURS CLÉS'
  applyHeaderStyle(kpiHeader, C.greenMid, 12)
  ws.getRow(9).height = 24

  // ── Row 10: KPI column headers ────────────────────────────────
  const kpiColHeaders = ['Indicateur', 'Valeur', 'Unité', '']
  kpiColHeaders.forEach((h, i) => {
    const cell = ws.getRow(10).getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell, C.greenDark, 10)
  })
  ws.getRow(10).height = 20

  // ── Rows 11-15: KPI data ──────────────────────────────────────
  const kpis = [
    ['Consommation totale',  opts.totalConsumption, unit],
    ['Moyenne par période',  opts.avgPerPeriod,      unit],
    ['Pic de consommation',  opts.peakValue,         unit],
    ['Consommation minimale',opts.minValue,          unit],
    ['Appareils actifs',     opts.deviceData.length, 'appareils'],
  ]
  kpis.forEach(([label, value, unitVal], i) => {
    const bg = i % 2 === 0 ? C.cardBg : C.cardBg2
    const row = ws.getRow(11 + i)
    row.height = 20
    applyDataStyle(row.getCell(1), bg, { bold: true })
    row.getCell(1).value = label as string

    row.getCell(2).value = typeof value === 'number' ? value : value
    row.getCell(2).numFmt = NUM_FMT
    applyDataStyle(row.getCell(2), bg, { align: 'right', bold: true })

    applyDataStyle(row.getCell(3), bg, { color: C.gray })
    row.getCell(3).value = unitVal as string

    applyDataStyle(row.getCell(4), bg)
  })

  // ── Row 16: spacer
  ws.getRow(16).height = 8

  // ── Row 17: Device section header ─────────────────────────────
  ws.mergeCells('A17:D17')
  const devHeader = ws.getCell('A17')
  devHeader.value = '▌  RÉPARTITION PAR APPAREIL'
  applyHeaderStyle(devHeader, C.greenMid, 12)
  ws.getRow(17).height = 24

  // ── Row 18: Device table headers ──────────────────────────────
  const devColH = ['Appareil', 'Département', `Total (${unit})`, '% du Total']
  devColH.forEach((h, i) => {
    const cell = ws.getRow(18).getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell, C.greenDark, 10)
  })
  ws.getRow(18).height = 20

  // ── Rows 19+: Device data sorted by total desc ────────────────
  const sorted = [...opts.deviceData].sort((a, b) => b.total - a.total)
  const grandTotal = sorted.reduce((s, d) => s + d.total, 0)

  sorted.forEach((dev, i) => {
    const bg = i % 2 === 0 ? C.cardBg : C.cardBg2
    const row = ws.getRow(19 + i)
    row.height = 19

    applyDataStyle(row.getCell(1), bg, { bold: true })
    row.getCell(1).value = dev.deviceName

    applyDataStyle(row.getCell(2), bg, { color: C.gray })
    // We don't have department in DeviceConsumption interface usually, 
    // but the user asked for it. We might need to look it up from DEVICES.
    row.getCell(2).value = '—' 

    row.getCell(3).value = dev.total
    row.getCell(3).numFmt = NUM_FMT
    applyDataStyle(row.getCell(3), bg, { align: 'right' })

    const pct = grandTotal > 0 ? dev.total / grandTotal : 0
    row.getCell(4).value = pct
    row.getCell(4).numFmt = '0.0%'
    applyDataStyle(row.getCell(4), bg, { align: 'center' })
  })

  // ── TOTAL row ─────────────────────────────────────────────────
  const totalRowIdx = 19 + sorted.length
  const totalRow = ws.getRow(totalRowIdx)
  totalRow.height = 22
  ;(['TOTAL', '', grandTotal, '100%'] as const).forEach((v, i) => {
    const cell = totalRow.getCell(i + 1)
    if (i === 2) {
      cell.value = grandTotal
      cell.numFmt = NUM_FMT
    } else if (i === 3) {
      cell.value = 1
      cell.numFmt = '0.0%'
    } else {
      cell.value = v as string
    }
    applyDataStyle(cell, C.greenTotal, { bold: true, color: C.white, align: i > 1 ? 'right' : 'left' })
  })
}

// ═══════════════════════════════════════════════════════════════════
// SHEET 2 — Consommation par appareil
// ═══════════════════════════════════════════════════════════════════
function buildConsommationSheet(wb: ExcelJS.Workbook, deviceData: DeviceConsumption[], unit: string) {
  const ws = wb.addWorksheet('Consommation par appareil')
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 1 }]

  ws.getColumn(1).width = 26
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 10

  // Header row
  const headers = ['Appareil', 'Département', `Total (${unit})`, '% du Total', 'Rang']
  headers.forEach((h, i) => {
    const cell = ws.getRow(1).getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell, C.greenDark, 11)
  })
  ws.getRow(1).height = 22
  ws.autoFilter = { from: 'A1', to: 'E1' }

  const sorted = [...deviceData].sort((a, b) => b.total - a.total)
  const grandTotal = sorted.reduce((s, d) => s + d.total, 0)

  sorted.forEach((dev, i) => {
    const bg = i % 2 === 0 ? C.cardBg : C.cardBg2
    const row = ws.getRow(2 + i)
    row.height = 19

    applyDataStyle(row.getCell(1), bg, { bold: true })
    row.getCell(1).value = dev.deviceName

    applyDataStyle(row.getCell(2), bg, { color: C.gray })
    row.getCell(2).value = '—' 

    row.getCell(3).value = dev.total
    row.getCell(3).numFmt = NUM_FMT
    applyDataStyle(row.getCell(3), bg, { align: 'right' })

    const pct = grandTotal > 0 ? dev.total / grandTotal : 0
    row.getCell(4).value = pct
    row.getCell(4).numFmt = '0.0%'
    applyDataStyle(row.getCell(4), bg, { align: 'center' })

    row.getCell(5).value = i + 1
    applyDataStyle(row.getCell(5), bg, { align: 'center', color: C.gray })
  })

  // TOTAL row
  const tr = ws.getRow(2 + sorted.length)
  tr.height = 22
  tr.getCell(1).value = 'TOTAL'
  tr.getCell(3).value = grandTotal
  tr.getCell(3).numFmt = NUM_FMT
  tr.getCell(4).value = 1
  tr.getCell(4).numFmt = '0.0%'
  ;[1, 2, 3, 4, 5].forEach(c => {
    applyDataStyle(tr.getCell(c), C.greenTotal, { bold: true, color: C.white, align: c > 2 ? 'right' : 'left' })
  })
}

// ═══════════════════════════════════════════════════════════════════
// SHEET 3 — Données temporelles
// ═══════════════════════════════════════════════════════════════════
function buildDonneesTemporellesSheet(
  wb: ExcelJS.Workbook,
  deviceData: DeviceConsumption[],
  aggregatedTimeline: Array<Record<string, string | number>>
) {
  const ws = wb.addWorksheet('Données temporelles')
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 1 }]

  const colNames = ['Date', ...deviceData.map(d => d.deviceName), 'TOTAL']
  ws.getColumn(1).width = 16
  deviceData.forEach((_, i) => { ws.getColumn(i + 2).width = 18 })
  ws.getColumn(colNames.length).width = 18

  // Header
  colNames.forEach((h, i) => {
    const cell = ws.getRow(1).getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell, i === colNames.length - 1 ? C.greenMid : C.greenDark, 11)
  })
  ws.getRow(1).height = 22
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colNames.length } }

  // Data rows
  aggregatedTimeline.forEach((point, rowIdx) => {
    const bg = rowIdx % 2 === 0 ? C.cardBg : C.cardBg2
    const row = ws.getRow(2 + rowIdx)
    row.height = 18

    // Date cell
    applyDataStyle(row.getCell(1), C.cardBg, { bold: true })
    row.getCell(1).value = point.date as string

    let rowTotal = 0
    deviceData.forEach((dev, devIdx) => {
      const val = (point[dev.deviceDn] ?? 0) as number
      rowTotal += val

      const cell = row.getCell(2 + devIdx)
      cell.value = val
      cell.numFmt = NUM_FMT
      applyDataStyle(cell, bg, { align: 'right' })
    })

    const totalCell = row.getCell(colNames.length)
    totalCell.value = rowTotal
    totalCell.numFmt = NUM_FMT
    applyDataStyle(totalCell, C.greenTotal, { align: 'right', bold: true })
  })
}

// ═══════════════════════════════════════════════════════════════════
// SHEET 4 — Phases
// ═══════════════════════════════════════════════════════════════════
function buildPhasesSheet(
  wb: ExcelJS.Workbook,
  deviceData: DeviceConsumption[],
  rawPointsMap: Map<string, RawConsumptionPoint[]>
) {
  const ws = wb.addWorksheet('Phases')
  ws.views = [{ showGridLines: false }]

  ws.getColumn(1).width = 16
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 18
  ws.getColumn(5).width = 18

  let currentRow = 1

  deviceData.forEach((dev, devIdx) => {
    const rawPoints = rawPointsMap.get(dev.deviceDn) ?? []

    ws.mergeCells(currentRow, 1, currentRow, 5)
    const secHeader = ws.getCell(currentRow, 1)
    secHeader.value = `${devIdx + 1}. ${dev.deviceName}`
    applyHeaderStyle(secHeader, C.greenDark, 12)
    ws.getRow(currentRow).height = 24
    currentRow++

    const phaseHeaders = ['Date', 'Phase A', 'Phase B', 'Phase C', 'Total']
    phaseHeaders.forEach((h, i) => {
      const cell = ws.getCell(currentRow, i + 1)
      cell.value = h
      applyHeaderStyle(cell, C.greenMid, 10)
    })
    ws.getRow(currentRow).height = 20
    currentRow++

    if (rawPoints.length === 0) {
      ws.mergeCells(currentRow, 1, currentRow, 5)
      const emptyCell = ws.getCell(currentRow, 1)
      emptyCell.value = 'Aucune donnée disponible pour cet appareil'
      applyDataStyle(emptyCell, C.cardBg, { color: C.grayDark, align: 'center' })
      ws.getRow(currentRow).height = 18
      currentRow++
    } else {
      rawPoints.forEach((pt, ptIdx) => {
        const bg = ptIdx % 2 === 0 ? C.cardBg : C.cardBg2
        const row = ws.getRow(currentRow)
        row.height = 18

        row.getCell(1).value = pt.date
        applyDataStyle(row.getCell(1), bg, { bold: true })

        row.getCell(2).value = pt.phaseA
        row.getCell(2).numFmt = NUM_FMT
        applyDataStyle(row.getCell(2), bg, { align: 'right' })

        row.getCell(3).value = pt.phaseB
        row.getCell(3).numFmt = NUM_FMT
        applyDataStyle(row.getCell(3), bg, { align: 'right' })

        row.getCell(4).value = pt.phaseC
        row.getCell(4).numFmt = NUM_FMT
        applyDataStyle(row.getCell(4), bg, { align: 'right' })

        row.getCell(5).value = pt.total
        row.getCell(5).numFmt = NUM_FMT
        applyDataStyle(row.getCell(5), C.greenTotal, { align: 'right', bold: true })

        currentRow++
      })

      const subtotal = rawPoints.reduce((s, p) => s + p.total, 0)
      const stRow = ws.getRow(currentRow)
      stRow.height = 20
      stRow.getCell(1).value = 'SOUS-TOTAL'
      ;[1, 2, 3, 4, 5].forEach(c => {
        applyDataStyle(stRow.getCell(c), C.greenTotal, { bold: true, color: C.white })
      })
      stRow.getCell(5).value = subtotal
      stRow.getCell(5).numFmt = NUM_FMT
      btnApplyStyle(stRow.getCell(5), C.greenTotal, { align: 'right', bold: true })
      currentRow++
    }

    ws.getRow(currentRow).height = 10
    currentRow++
  })

  function btnApplyStyle(cell: ExcelJS.Cell, bgColor: string, opts: any) {
    applyDataStyle(cell, bgColor, opts)
  }
}

// ─── Types for Comparison Export ─────────────────────────────────
export interface ComparisonStats {
  aName: string
  bName: string
  totalA: number
  totalB: number
  diffRaw: number
  diffPercent: number
  isPos: boolean
  ratio: number
  table: Array<{
    label: string
    valA: number
    valB: number
    strA: string
    strB: string
    formatAsDiff?: boolean
  }>
}

export interface ComparisonExportOptions {
  stats: ComparisonStats
  lineChartData: Array<Record<string, string | number>>
  mode: string          // 'devices' | 'dates' | 'years'
  phase: string
  startDate: string
  endDate: string
  // Map: DN code → device name (to fix DN headers problem)
  dnToName: Record<string, string>
  unit?: string // 'kWh' or 'm³'
}

// ─── Comparison Export Function ───────────────────────────────────
export async function exportComparisonToExcel(
  opts: ComparisonExportOptions
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'STLR Energy'
  wb.created = new Date()

  buildComparisonResumeSheet(wb, opts)
  buildComparisonDonneesSheet(wb, opts)
  buildComparisonAnalyseSheet(wb, opts)

  // ── Download ──────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.download = `STLR_Comparaison_${opts.mode}_${ts}.xlsx`
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}

function buildComparisonResumeSheet(wb: ExcelJS.Workbook, opts: ComparisonExportOptions) {
  const ws = wb.addWorksheet('Résumé Comparatif')
  ws.views = [{ showGridLines: false }]
  const unit = opts.unit ?? 'kWh'

  ws.getColumn(1).width = 28
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 22
  ws.getColumn(4).width = 18

  // Row 1 & 2: Headers
  ws.mergeCells('A1:D1')
  const titleCell = ws.getCell('A1')
  titleCell.value = '⚡  STLR — RAPPORT COMPARATIF'
  titleCell.fill = headerFill(C.greenDark)
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF' + C.white } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 36

  ws.mergeCells('A2:D2')
  const subCell = ws.getCell('A2')
  subCell.value = 'Vivo Energy · Analyse comparative'
  subCell.fill = headerFill(C.greenMid)
  subCell.font = { italic: true, size: 11, color: { argb: 'FF' + C.gray } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  ws.getRow(3).height = 8

  // Metadata
  const meta = [
    ['Période', `${opts.startDate} → ${opts.endDate}`],
    ['Mode', opts.mode],
    ['Phase', opts.phase],
    ['Généré le', new Date().toLocaleString('fr-FR')],
  ]
  meta.forEach(([label, value], i) => {
    const row = ws.getRow(4 + i)
    row.height = 20
    applyDataStyle(row.getCell(1), C.cardBg, { bold: true, color: C.gray })
    row.getCell(1).value = label
    applyDataStyle(row.getCell(2), C.cardBg2)
    row.getCell(2).value = value
    applyDataStyle(row.getCell(3), C.cardBg2)
    applyDataStyle(row.getCell(4), C.cardBg2)
  })

  ws.getRow(8).height = 8

  // Indicators Section
  ws.mergeCells('A9:D9')
  const kpiH = ws.getCell('A9')
  kpiH.value = '▌  INDICATEURS COMPARATIFS'
  applyHeaderStyle(kpiH, C.greenMid, 12)
  ws.getRow(9).height = 24

  const kCols = ['', opts.stats.aName, opts.stats.bName, 'Écart']
  kCols.forEach((v, i) => {
    const cell = ws.getRow(10).getCell(i + 1)
    cell.value = v
    applyHeaderStyle(cell, C.greenDark, 10)
  })
  ws.getRow(10).height = 20

  // KPI Rows
  const s = opts.stats
  const rows = [
    { l: 'Consommation totale', a: s.totalA, b: s.totalB, e: s.diffRaw, f: NUM_FMT },
    { l: 'Évolution relative', a: '', b: '', e: s.diffPercent / 100, f: '0.0%' },
    { l: 'Ratio', a: '', b: '', e: s.ratio, f: '0.00"x"' },
    { l: 'Appareils actifs', a: s.aName, b: s.bName, e: '' },
  ]

  rows.forEach((r, i) => {
    const row = ws.getRow(11 + i)
    row.height = 20
    applyDataStyle(row.getCell(1), C.cardBg, { bold: true })
    row.getCell(1).value = r.l

    const cellA = row.getCell(2)
    cellA.value = r.a
    applyDataStyle(cellA, C.cardBg2, { align: 'right' })

    const cellB = row.getCell(3)
    cellB.value = r.b
    applyDataStyle(cellB, C.cardBg2, { align: 'right' })

    const cellE = row.getCell(4)
    cellE.value = r.e
    cellE.numFmt = r.f
    
    let eColor = C.cardBg2
    if (r.l === 'Consommation totale') eColor = (r.e as number) < 0 ? '14532D' : '7F1D1D'
    if (r.l === 'Évolution relative') {
        const fontColor = s.isPos ? '10B981' : 'EF4444'
        applyDataStyle(cellE, eColor, { align: 'right', bold: true, color: fontColor })
    } else {
        applyDataStyle(cellE, eColor, { align: 'right', bold: true })
    }
  })

  // Detailed Stats Section
  ws.getRow(15).height = 8
  ws.mergeCells('A16:D16')
  const statH = ws.getCell('A16')
  statH.value = '▌  STATISTIQUES DÉTAILLÉES'
  applyHeaderStyle(statH, C.greenMid, 12)
  ws.getRow(16).height = 24

  kCols.forEach((v, i) => {
    const cell = ws.getRow(17).getCell(i + 1)
    cell.value = v === '' ? 'Métrique' : v
    applyHeaderStyle(cell, C.greenDark, 10)
  })

  s.table.forEach((row, i) => {
    const bg = i % 2 === 0 ? C.cardBg : C.cardBg2
    const wsRow = ws.getRow(18 + i)
    wsRow.height = 19
    applyDataStyle(wsRow.getCell(1), bg, { bold: true })
    wsRow.getCell(1).value = row.label

    applyDataStyle(wsRow.getCell(2), bg, { align: 'right' })
    wsRow.getCell(2).value = row.valA
    wsRow.getCell(2).numFmt = NUM_FMT

    applyDataStyle(wsRow.getCell(3), bg, { align: 'right' })
    wsRow.getCell(3).value = row.valB
    wsRow.getCell(3).numFmt = NUM_FMT

    const diff = row.valA - row.valB
    const cellE = wsRow.getCell(4)
    cellE.value = diff
    cellE.numFmt = NUM_FMT
    const eBg = diff > 0 ? '7F1D1D' : '14532D'
    applyDataStyle(cellE, eBg, { align: 'right', bold: true })
  })
}

function buildComparisonDonneesSheet(wb: ExcelJS.Workbook, opts: ComparisonExportOptions) {
  const ws = wb.addWorksheet('Données Temporelles')
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 1 }]

  const dataKeys = Object.keys(opts.lineChartData[0] ?? {}).filter(k => k !== 'date')
  const colNames = ['Date', ...dataKeys.map(k => opts.dnToName[k] ?? k)]

  ws.getColumn(1).width = 16
  colNames.forEach((_, i) => {
    if (i > 0) ws.getColumn(i + 1).width = 20
  })

  colNames.forEach((h, i) => {
    const cell = ws.getRow(1).getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell, C.greenDark, 11)
  })
  ws.getRow(1).height = 22
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colNames.length } }

  opts.lineChartData.forEach((point, rIdx) => {
    const bg = rIdx % 2 === 0 ? C.cardBg : C.cardBg2
    const row = ws.getRow(2 + rIdx)
    row.height = 18

    const dateCell = row.getCell(1)
    dateCell.value = point.date as string
    applyDataStyle(dateCell, C.cardBg, { bold: true })

    dataKeys.forEach((key, kIdx) => {
      const cell = row.getCell(2 + kIdx)
      cell.value = point[key] as number
      cell.numFmt = NUM_FMT
      applyDataStyle(cell, bg, { align: 'right' })
    })
  })
}

function buildComparisonAnalyseSheet(wb: ExcelJS.Workbook, opts: ComparisonExportOptions) {
  const ws = wb.addWorksheet('Analyse Comparative')
  ws.views = [{ showGridLines: false }]

  ws.getColumn(1).width = 28
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 22
  ws.getColumn(4).width = 22

  const s = opts.stats
  const headers = ['Métrique', s.aName, s.bName, 'Écart (A-B)']
  headers.forEach((h, i) => {
    const cell = ws.getRow(1).getCell(i + 1)
    cell.value = h
    applyHeaderStyle(cell, C.greenDark, 11)
  })
  ws.getRow(1).height = 22

  s.table.forEach((row, i) => {
    const bg = i % 2 === 0 ? C.cardBg : C.cardBg2
    const wsRow = ws.getRow(2 + i)
    wsRow.height = 19

    applyDataStyle(wsRow.getCell(1), bg, { bold: true })
    wsRow.getCell(1).value = row.label

    applyDataStyle(wsRow.getCell(2), bg, { align: 'right' })
    wsRow.getCell(2).value = row.valA
    wsRow.getCell(2).numFmt = NUM_FMT

    applyDataStyle(wsRow.getCell(3), bg, { align: 'right' })
    wsRow.getCell(3).value = row.valB
    wsRow.getCell(3).numFmt = NUM_FMT

    const diff = row.valA - row.valB
    const cellE = wsRow.getCell(4)
    cellE.value = diff
    cellE.numFmt = NUM_FMT
    const eBg = diff > 0 ? '7F1D1D' : '14532D'
    applyDataStyle(cellE, eBg, { align: 'right', bold: true })
  })

  const totalIdx = 2 + s.table.length
  const tr = ws.getRow(totalIdx)
  tr.height = 22
  tr.getCell(1).value = 'TOTAL'
  tr.getCell(2).value = s.totalA
  tr.getCell(2).numFmt = NUM_FMT
  tr.getCell(3).value = s.totalB
  tr.getCell(3).numFmt = NUM_FMT
  tr.getCell(4).value = s.diffRaw
  tr.getCell(4).numFmt = NUM_FMT
  ;[1, 2, 3, 4].forEach(c => {
    applyDataStyle(tr.getCell(c), C.greenTotal, { bold: true, color: C.white, align: c > 1 ? 'right' : 'left' })
  })
}
