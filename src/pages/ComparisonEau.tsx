import React, { useState, useMemo, useCallback } from 'react'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { Droplets, Loader2, GitCompareArrows } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { fetchReportData, getReportColor } from '@/lib/reportDataFetcher'
import { getDevicesByType } from '@/lib/manualStore'
import { WATER_DEVICES } from '@/lib/devices'
import { formatKwh } from '@/lib/utils'
import DeviceBarChart from '@/components/DeviceBarChart'
import { ChartErrorBoundary } from '@/components/ChartErrorBoundary'

interface UnifiedDevice {
  id: string
  name: string
  source: 'iot' | 'manual'
  color: string
  total: number
  daily: { date: string; value: number }[]
}

const computeKPIs = (devices: UnifiedDevice[]) => {
  const total = devices.reduce((s, d) => s + d.total, 0)
  const allPoints = devices.flatMap(d => d.daily)
  const uniqueDays = new Set(allPoints.map(p => p.date)).size
  const avg = uniqueDays > 0 ? total / uniqueDays : 0
  const active = devices.filter(d => d.total > 0).length
  return { total, avg, active }
}

const CombinedLineChart = React.memo(({
  iotData,
  manualData,
  loading,
}: {
  iotData: UnifiedDevice[]
  manualData: UnifiedDevice[]
  loading: boolean
}) => {
  const allDevices = [...iotData, ...manualData]

  if (loading) return (
    <div className="h-full bg-secondary/20 rounded-xl animate-pulse" />
  )

  if (allDevices.every(d => d.daily.length === 0)) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Aucune donnée pour la période sélectionnée
    </div>
  )

  // Build unified timeline
  const allDates = [...new Set(
    allDevices.flatMap(d => d.daily.map(p => p.date))
  )].sort()

  const chartData = allDates.map(date => {
    const point: Record<string, string | number> = { date }
    allDevices.forEach(device => {
      const dayPoint = device.daily.find(p => p.date === date)
      point[device.id] = dayPoint?.value ?? 0
    })
    return point
  })

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(d: string) => {
            const date = new Date(d)
            return `${date.getDate()}/${date.getMonth() + 1}`
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) => formatKwh(v)}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '11px',
          }}
          formatter={(value: number, name: string) => {
            const device = allDevices.find(d => d.id === name)
            return [
              `${formatKwh(value)} m³`,
              `${device?.name ?? name} ${device?.source === 'manual' ? '(Manuel)' : '(IoT)'}`
            ]
          }}
          labelFormatter={(d: string) => `Date: ${d}`}
        />
        <Legend
          formatter={(value: string) => {
            const device = allDevices.find(d => d.id === value)
            return device?.name ?? value
          }}
          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
        />
        {/* IoT devices — solid lines */}
        {iotData.map(device => (
          <Line
            key={device.id}
            type="monotone"
            dataKey={device.id}
            stroke={device.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
        {/* Manuel devices — dashed lines */}
        {manualData.map(device => (
          <Line
            key={device.id}
            type="monotone"
            dataKey={device.id}
            stroke={device.color}
            strokeWidth={2}
            dot={false}
            strokeDasharray="6 3"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
})
CombinedLineChart.displayName = 'CombinedLineChart'

export default function ComparisonEau() {
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })

  // Device selections
  const [selectedIotIds, setSelectedIotIds] = useState<string[]>(
    WATER_DEVICES.map(d => d.dn)
  )
  const [selectedManualIds, setSelectedManualIds] = useState<string[]>([])

  // Data
  const [iotData, setIotData] = useState<UnifiedDevice[]>([])
  const [manualData, setManualData] = useState<UnifiedDevice[]>([])
  const [loadingIot, setLoadingIot] = useState(false)
  const [loadingManual, setLoadingManual] = useState(false)
  const [applied, setApplied] = useState(false)

  // Get manual water devices for checkboxes
  const manualWaterDevices = useMemo(() => getDevicesByType('water'), [])

  const loading = loadingIot || loadingManual
  const allDevices = [...iotData, ...manualData]

  const handleApply = useCallback(async () => {
    setApplied(true)

    // Fetch IoT water data
    if (selectedIotIds.length > 0) {
      setLoadingIot(true)
      try {
        const iotResult = await fetchReportData('wattnow_water', startDate, endDate, 'total')
        setIotData(
          iotResult
            .filter(d => selectedIotIds.includes(d.dn))
            .map(d => ({
              id: d.dn,
              name: d.name,
              source: 'iot' as const,
              color: WATER_DEVICES.find(w => w.dn === d.dn)?.color ?? '#0EA5E9',
              total: d.total,
              daily: d.daily.map(p => ({ date: p.date, value: p.value })),
            }))
        )
      } catch {
        setIotData([])
      } finally {
        setLoadingIot(false)
      }
    } else {
      setIotData([])
    }

    // Fetch Manuel water data
    if (selectedManualIds.length > 0) {
      setLoadingManual(true)
      try {
        const manualResult = await fetchReportData('water', startDate, endDate, 'total')
        setManualData(
          manualResult
            .filter(d => selectedManualIds.includes(d.dn))
            .map(d => ({
              id: d.dn,
              name: d.name,
              source: 'manual' as const,
              color: getReportColor(d.dn),
              total: d.total,
              daily: d.daily.map(p => ({ date: p.date, value: p.value })),
            }))
        )
      } catch {
        setManualData([])
      } finally {
        setLoadingManual(false)
      }
    } else {
      setManualData([])
    }
  }, [startDate, endDate, selectedIotIds, selectedManualIds])

  return (
    <div className="p-6 space-y-6 max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-medium text-cyan-400 uppercase tracking-widest mb-1">
            Analyse comparative
          </p>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">
            Comparaison Eau
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            WattNow IoT · Manuel — même période, même vue
          </p>
        </div>

        {/* Source legend */}
        {applied && (
          <div className="flex gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-xs font-bold text-cyan-400">WattNow IoT</span>
              <span className="text-xs text-muted-foreground">
                ({iotData.filter(d => d.total > 0).length} appareil{iotData.filter(d=>d.total>0).length!==1?'s':''})
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 border-dashed">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-xs font-bold text-blue-400">Manuel</span>
              <span className="text-xs text-muted-foreground">
                ({manualData.filter(d => d.total > 0).length} appareil{manualData.filter(d=>d.total>0).length!==1?'s':''})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-5 p-5 bg-card border border-border rounded-2xl">
        <div className="flex flex-wrap gap-4 items-end">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
            maxDate={new Date().toISOString().split('T')[0]}
            minDate="2020-01-01"
          />

          <div className="flex-1" />

          {/* Compare button */}
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-[10px] opacity-0 select-none hidden md:block">.</label>
            <button
              onClick={handleApply}
              disabled={loading || (selectedIotIds.length === 0 && selectedManualIds.length === 0)}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 text-white text-sm font-bold hover:bg-cyan-400 transition-all disabled:opacity-50 h-[42px]"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</>
                : <><GitCompareArrows className="h-4 w-4" /> Comparer</>
              }
            </button>
          </div>
        </div>

        {/* Device Selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-border/40">
          {/* WattNow IoT device checkboxes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">
              WattNow IoT
            </label>
            <div className="flex flex-wrap gap-2">
              {WATER_DEVICES.map(device => {
                const isSelected = selectedIotIds.includes(device.dn)
                return (
                  <button
                    key={device.dn}
                    onClick={() => setSelectedIotIds(prev =>
                      isSelected
                        ? prev.filter(id => id !== device.dn)
                        : [...prev, device.dn]
                    )}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isSelected
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    💧 {device.name}
                  </button>
                )
              })}
            </div>
            <button 
                onClick={() => setSelectedIotIds(
                  selectedIotIds.length === WATER_DEVICES.length ? [] : WATER_DEVICES.map(d => d.dn)
                )}
                className="text-xs text-muted-foreground hover:text-foreground underline w-fit mt-1"
              >
                {selectedIotIds.length === WATER_DEVICES.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          {/* Manuel water device checkboxes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1">
              Manuel Eau
            </label>
            {manualWaterDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucun appareil manuel. <a href="/home/water" className="text-blue-400 hover:underline">Ajouter →</a>
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {manualWaterDevices.map(device => {
                    const isSelected = selectedManualIds.includes(device.id)
                    return (
                      <button
                        key={device.id}
                        onClick={() => setSelectedManualIds(prev =>
                          isSelected
                            ? prev.filter(id => id !== device.id)
                            : [...prev, device.id]
                        )}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isSelected
                          ? 'bg-blue-500/20 border-blue-500/60 text-blue-300'
                          : 'border-border/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        📋 {device.name}
                      </button>
                    )
                  })}
                </div>
                <button 
                  onClick={() => setSelectedManualIds(
                    selectedManualIds.length === manualWaterDevices.length ? [] : manualWaterDevices.map(d => d.id)
                  )}
                  className="text-xs text-muted-foreground hover:text-foreground underline w-fit mt-1"
                >
                  {selectedManualIds.length === manualWaterDevices.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Initial state */}
      {!applied && (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border/40 rounded-2xl">
          <Droplets className="h-12 w-12 mb-4 text-cyan-400/30" />
          <p className="text-sm font-semibold text-foreground mb-1">
            Prêt pour la comparaison
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Sélectionnez vos appareils et cliquez sur &quot;Comparer&quot;
          </p>
        </div>
      )}

      {/* Results — only when applied */}
      {applied && (
        <div className="space-y-4">
          {/* KPI comparison row */}
          {(() => {
            const iotKPIs = computeKPIs(iotData)
            const manualKPIs = computeKPIs(manualData)
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* IoT KPIs */}
                <div className="bg-card border border-cyan-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                      WattNow IoT
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total', value: formatKwh(iotKPIs.total), unit: 'm³' },
                      { label: 'Actifs', value: String(iotKPIs.active), unit: '' },
                      { label: 'Moy. jour', value: formatKwh(iotKPIs.avg), unit: 'm³/j' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-secondary/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {stat.label}
                        </p>
                        <p className="text-xl font-black tabular-nums text-foreground mt-0.5">
                          {loadingIot ? '...' : stat.value}
                          {stat.unit && (
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              {stat.unit}
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Manuel KPIs */}
                <div className="bg-card border border-blue-500/20 border-dashed rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      Manuel Eau
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total', value: formatKwh(manualKPIs.total), unit: 'm³' },
                      { label: 'Actifs', value: String(manualKPIs.active), unit: '' },
                      { label: 'Moy. jour', value: formatKwh(manualKPIs.avg), unit: 'm³/j' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-secondary/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {stat.label}
                        </p>
                        <p className="text-xl font-black tabular-nums text-foreground mt-0.5">
                          {loadingManual ? '...' : stat.value}
                          {stat.unit && (
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              {stat.unit}
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Combined line chart */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  TENDANCE JOURNALIÈRE — VOLUME
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lignes continues = WattNow IoT · Lignes pointillées = Manuel
                </p>
              </div>
            </div>
            <div className="h-[400px]">
              <ChartErrorBoundary>
                <CombinedLineChart
                  iotData={iotData}
                  manualData={manualData}
                  loading={loading}
                />
              </ChartErrorBoundary>
            </div>
          </div>

          {/* Bar chart — total per device */}
          {allDevices.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                CONSOMMATION TOTALE PAR APPAREIL
              </h3>
              <div className="h-[300px]">
                <ChartErrorBoundary>
                  <DeviceBarChart
                    data={allDevices.map(d => ({
                      name: `${d.name}${d.source === 'manual' ? ' (M)' : ''}`,
                      total: d.total,
                      color: d.color,
                    }))}
                    loading={loading}
                    phaseLabel="Volume"
                    unit="m³"
                  />
                </ChartErrorBoundary>
              </div>
            </div>
          )}

          {/* Comparison table */}
          {allDevices.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border/40">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  TABLEAU COMPARATIF — TOUS APPAREILS
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-secondary/20">
                      {['Appareil', 'Source', 'Volume total', '% du total', 'Moy. journalière'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...allDevices]
                      .sort((a, b) => b.total - a.total)
                      .map(device => {
                        const grandTotal = allDevices.reduce((s, d) => s + d.total, 0)
                        const pct = grandTotal > 0 ? (device.total / grandTotal * 100) : 0
                        const uniqueDays = new Set(device.daily.map(p => p.date)).size
                        const avg = uniqueDays > 0 ? device.total / uniqueDays : 0
                        return (
                          <tr key={device.id} className="border-b border-border/20 hover:bg-secondary/10 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: device.color }} />
                                <span className="font-semibold" style={{ color: device.color }}>
                                  {device.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-left">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                device.source === 'iot'
                                  ? 'bg-cyan-500/15 text-cyan-400'
                                  : 'bg-blue-500/15 text-blue-400'
                              }`}>
                                {device.source === 'iot' ? '💧 WattNow' : '📋 Manuel'}
                              </span>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <span className="font-bold tabular-nums">{formatKwh(device.total)}</span>
                              <span className="text-xs text-muted-foreground ml-1">m³</span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-secondary rounded-full h-1.5 overflow-hidden">
                                  <div className="h-full rounded-full transition-all"
                                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: device.color }} />
                                </div>
                                <span className="text-xs font-mono text-muted-foreground w-10">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <span className="tabular-nums text-muted-foreground">
                                {formatKwh(avg)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">m³/j</span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state after compare */}
          {allDevices.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border/40 rounded-2xl">
              <Droplets className="h-10 w-10 mb-3 text-cyan-400/30" />
              <p className="text-sm font-medium text-foreground">Aucune donnée disponible</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Vérifiez la période et les appareils sélectionnés
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
