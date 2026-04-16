import React, { useState, useMemo } from 'react'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { Loader2, GitCompareArrows } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { fetchReportData } from '@/lib/reportDataFetcher'
import { DEVICES, getDeviceColor } from '@/lib/devices'
import { getDevicesByType } from '@/lib/manualStore'
import { formatKwh } from '@/lib/utils'
import DeviceBarChart from '@/components/DeviceBarChart'
import type { Phase } from '@/lib/types'

// ─── Constants and Colors ───────────────────────────────────────────
const PHASE_DISPLAY: Record<string, string> = {
  total: 'Total',
  phaseA: 'L1',
  phaseB: 'L2',
  phaseC: 'L3',
}

const DEVICE_PALETTE = [
  '#10b981','#3b82f6','#f59e0b','#8b5cf6','#ef4444',
  '#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1',
]

function getDeviceColorById(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return DEVICE_PALETTE[Math.abs(hash) % DEVICE_PALETTE.length]
}

// ─── Unified device shape ───────────────────────────────────────────
interface UnifiedDevice {
  id: string
  name: string
  source: 'iot' | 'manual'
  color: string
  total: number
  daily: { date: string; value: number }[]
}

// ─── Helper for Chart Data ──────────────────────────────────────────
const buildChartData = (devices: UnifiedDevice[]) => {
  const allDates = [...new Set(
    devices.flatMap(d => d.daily.map(p => p.date))
  )].sort()
  
  return allDates.map(date => {
    const point: Record<string, string | number> = { date }
    devices.forEach(device => {
      const dayPoint = device.daily.find(p => p.date === date)
      point[device.id] = dayPoint?.value ?? 0
    })
    return point
  })
}

// ═════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════
const ComparisonElec = () => {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [phase, setPhase] = useState<Phase>('total')
  
  // Selection states
  const [selectedIotDns, setSelectedIotDns] = useState<string[]>([]) 
  const [selectedManualIds, setSelectedManualIds] = useState<string[]>([])
  
  const manualDevices = useMemo(() => getDevicesByType('electricity'), [])

  // Data states
  const [allDevices, setAllDevices] = useState<UnifiedDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [applied, setApplied] = useState(false)

  const toggleIotDevice = (dn: string) => {
    setSelectedIotDns(prev => 
      prev.includes(dn) ? prev.filter(id => id !== dn) : [...prev, dn]
    )
  }

  const toggleManualDevice = (id: string) => {
    setSelectedManualIds(prev => 
      prev.includes(id) ? prev.filter(dId => dId !== id) : [...prev, id]
    )
  }

  const handleApply = async () => {
    if (selectedIotDns.length === 0 && selectedManualIds.length === 0) return
    setApplied(true)
    setLoading(true)

    try {
      // Fetch ALL IoT data then filter to selected devices
      const iotResult = await fetchReportData('wattnow_elec', startDate, endDate, phase)
      const filteredIot = iotResult
        .filter(d => selectedIotDns.includes(d.dn))
        .map(d => ({
          id: d.dn,
          name: d.name,
          source: 'iot' as const,
          color: getDeviceColor(d.dn),
          total: d.total,
          daily: d.daily.map(p => ({ date: p.date, value: p.value }))
        }))

      // Fetch ALL Manuel data then filter to selected devices
      const manualResult = await fetchReportData('electricity', startDate, endDate, 'total')
      const filteredManual = manualResult
        .filter(d => selectedManualIds.includes(d.dn))
        .map(d => ({
          id: d.dn,
          name: d.name,
          source: 'manual' as const,
          color: getDeviceColorById(d.dn),
          total: d.total,
          daily: d.daily.map(p => ({ date: p.date, value: p.value }))
        }))

      setAllDevices([...filteredIot, ...filteredManual])
    } catch (err) {
      console.error('Fetch error:', err)
      setAllDevices([])
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(() => buildChartData(allDevices), [allDevices])

  const canCompare = selectedIotDns.length > 0 || selectedManualIds.length > 0

  return (
    <div className="p-6 space-y-6 max-w-full">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-primary uppercase tracking-widest mb-1">
            Analyse comparative
          </p>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">
            Comparaison Électricité
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualisez et comparez la consommation de tous vos appareils sur un même graphique
          </p>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────── */}
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

          {/* Phase (IoT only) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Phase (WattNow)
            </label>
            <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 border border-border/40 h-[42px] items-center">
              {(['total', 'phaseA', 'phaseB', 'phaseC'] as Phase[]).map(ph => (
                <button
                  key={ph}
                  onClick={() => setPhase(ph)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    phase === ph
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {PHASE_DISPLAY[ph] ?? ph}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1" />
          
          {/* Apply Button */}
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-[10px] opacity-0 select-none hidden md:block">.</label>
            <button
              onClick={handleApply}
              disabled={loading || !canCompare}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 h-[42px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
                </>
              ) : (
                <>
                  <GitCompareArrows className="h-4 w-4" /> Comparer
                </>
              )}
            </button>
          </div>
        </div>

        {/* Device Selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-border/40">
          
          {/* WattNow */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              WattNow IoT
            </label>
            <div className="flex flex-wrap gap-2">
              {DEVICES.map(device => {
                const isSelected = selectedIotDns.includes(device.dn)
                const color = getDeviceColor(device.dn)
                return (
                  <button
                    key={device.dn}
                    onClick={() => toggleIotDevice(device.dn)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border transition-all"
                    style={isSelected ? {
                      backgroundColor: `${color}20`,
                      borderColor: `${color}60`,
                      color,
                    } : {
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--muted-foreground))'
                    }}
                  >
                    {device.name}
                  </button>
                )
              })}
            </div>
            <button 
              onClick={() => setSelectedIotDns(
                selectedIotDns.length === DEVICES.length ? [] : DEVICES.map(d => d.dn)
              )}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {selectedIotDns.length === DEVICES.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          {/* Manuel */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
              Manuel
            </label>
            {manualDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucun appareil manuel.{' '}
                <button onClick={() => navigate('/home/electricity')} className="text-blue-400 hover:underline">
                  Ajouter →
                </button>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {manualDevices.map(device => {
                  const isSelected = selectedManualIds.includes(device.id)
                  const color = getDeviceColorById(device.id)
                  return (
                    <button
                      key={device.id}
                      onClick={() => toggleManualDevice(device.id)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border transition-all"
                      style={isSelected ? {
                        backgroundColor: `${color}20`,
                        borderColor: `${color}60`,
                        color,
                      } : {
                        borderColor: 'hsl(var(--border))',
                        color: 'hsl(var(--muted-foreground))'
                      }}
                    >
                      {device.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI comparison ────────────────────────────── */}
      {applied && !loading && allDevices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {allDevices.map(device => (
            <div 
              key={device.id}
              className="bg-card border rounded-xl p-4"
              style={{ borderColor: `${device.color}40` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: device.color }} />
                <span className="text-xs font-bold text-muted-foreground truncate">{device.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto whitespace-nowrap ${
                  device.source === 'iot' 
                    ? 'bg-emerald-500/15 text-emerald-400' 
                    : 'bg-blue-500/15 text-blue-400'
                }`}>
                  {device.source === 'iot' ? 'IoT' : 'Manuel'}
                </span>
              </div>
              <p className="text-xl font-black tabular-nums" style={{ color: device.color }}>
                {formatKwh(device.total)}
              </p>
              <p className="text-xs text-muted-foreground">kWh total</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts section ────────────────────────────── */}
      {applied && !loading && allDevices.length > 0 && (
        <div className="space-y-4">
          
          {/* CHART 1: Unified Line Chart */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                TENDANCE JOURNALIÈRE
              </h3>
            </div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={d => {
                      if (!d) return '';
                      const dt = new Date(d);
                      if (isNaN(dt.getTime())) return d;
                      return `${dt.getDate()}/${dt.getMonth() + 1}`;
                    }}
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => formatKwh(v as number)}
                    width={80}
                    tickLine={false}
                    axisLine={false}
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
                        `${formatKwh(value)} kWh`,
                        `${device?.name ?? name} ${device?.source === 'manual' ? '(Manuel)' : '(IoT)'}`,
                      ]
                    }}
                    labelFormatter={d => `Date: ${d}`}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value, entry) => {
                      const device = allDevices.find(d => d.id === entry.dataKey);
                      return <span style={{ color: device?.color }}>{device?.name || value}</span>;
                    }}
                  />
                  
                  {allDevices.map(device => (
                    <Line
                      key={device.id}
                      type="monotone"
                      dataKey={device.id}
                      name={device.name}
                      stroke={device.color}
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray={device.source === 'manual' ? '6 3' : undefined}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CHART 2: Unified Bar Chart */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
              CONSOMMATION GLOBALE PAR APPAREIL
            </h3>
            <div className="h-[350px]">
              <DeviceBarChart
                data={allDevices.map(d => ({ 
                  name: `${d.name}${d.source === 'manual' ? ' (M)' : ''}`, 
                  total: d.total, 
                  color: d.color 
                }))}
                loading={loading}
                phaseLabel="Comparaison"
                unit="kWh"
              />
            </div>
          </div>

          {/* CHART 3: Comparison table — all devices */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                TABLEAU COMPARATIF
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/20">
                    <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Appareil
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Source
                    </th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Consommation totale
                    </th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      % du total
                    </th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Moy. journalière
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...allDevices]
                    .sort((a, b) => b.total - a.total)
                    .map(device => {
                      const grandTotal = allDevices.reduce((s, d) => s + d.total, 0)
                      const pct = grandTotal > 0 ? (device.total / grandTotal) * 100 : 0
                      const uniqueDays = new Set(device.daily.map(p => p.date)).size
                      const avg = uniqueDays > 0 ? device.total / uniqueDays : 0

                      return (
                        <tr
                          key={device.id}
                          className="border-b border-border/20 hover:bg-secondary/10 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                  device.source === 'manual'
                                    ? 'ring-1 ring-offset-1 ring-offset-card'
                                    : ''
                                }`}
                                style={{ backgroundColor: device.color }}
                              />
                              <span className="text-sm font-semibold" style={{ color: device.color }}>
                                {device.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                device.source === 'iot'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-blue-500/15 text-blue-400'
                              }`}
                            >
                              {device.source === 'iot' ? '⚡ WattNow' : '📋 Manuel'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="font-bold tabular-nums text-foreground">
                              {formatKwh(device.total)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">kWh</span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-secondary rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, pct)}%`,
                                    backgroundColor: device.color,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {formatKwh(avg)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">kWh/j</span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty states handling */}
      {applied && !loading && allDevices.length === 0 && (
         <div className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-card border border-border border-dashed rounded-2xl">
           <GitCompareArrows className="h-10 w-10 text-muted-foreground/30" />
           <div>
             <p className="text-base font-semibold text-foreground">Aucune donnée trouvée</p>
             <p className="text-sm text-muted-foreground mt-1">
               Aucune consommation détectée pour les appareils sélectionnés.
             </p>
           </div>
         </div>
      )}

    </div>
  )
}

export default ComparisonElec
