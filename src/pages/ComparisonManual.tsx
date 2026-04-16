import { useState, useMemo, useEffect } from "react";
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  getDevicesByType, 
  getDeviceById, 
  transformManualEntriesToRawPoints 
} from "@/lib/manualStore";
import { formatKwh, getDefaultDateRange } from "@/lib/utils";
import { exportComparisonToExcel, ComparisonStats } from "@/lib/exportExcel";
import { 
  BarChart2, 
  ArrowLeft, 
  Download, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Droplets,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Legend 
} from "recharts";
import EmptyState from "@/components/EmptyState";

const ComparisonManual = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Determine mode from URL: ?type=electricity or ?type=water
  const type = (searchParams.get('type') ?? 'electricity') as 'electricity' | 'water';
  const unit = type === 'water' ? 'm³' : 'kWh';
  const Icon = type === 'water' ? Droplets : Zap;
  const iconColor = type === 'water' ? 'text-blue-400' : 'text-green-400';

  const [deviceAId, setDeviceAId] = useState<string>("");
  const [deviceBId, setDeviceBId] = useState<string>("");
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate);
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate);
  
  const [hasResults, setHasResults] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<ComparisonStats | null>(null);
  const [lineChartData, setLineChartData] = useState<any[]>([]);

  // Get available manual devices
  const availableDevices = useMemo(() => getDevicesByType(type), [type]);

  // Set default selections
  useEffect(() => {
    if (availableDevices.length >= 2) {
      setDeviceAId(availableDevices[0].id);
      setDeviceBId(availableDevices[1].id);
    } else if (availableDevices.length === 1) {
      setDeviceAId(availableDevices[0].id);
    }
  }, [availableDevices]);

  const handleApply = () => {
    if (!deviceAId || !deviceBId || deviceAId === deviceBId) return;
    
    const devA = getDeviceById(deviceAId);
    const devB = getDeviceById(deviceBId);
    
    const pointsA = transformManualEntriesToRawPoints(deviceAId, startDate, endDate);
    const pointsB = transformManualEntriesToRawPoints(deviceBId, startDate, endDate);
    
    const totalA = pointsA.reduce((s, p) => s + p.total, 0);
    const totalB = pointsB.reduce((s, p) => s + p.total, 0);
    const diffRaw = totalA - totalB;
    const diffPercent = totalB > 0 ? (Math.abs(diffRaw) / totalB) * 100 : 0;
    
    const maxA = pointsA.length > 0 ? Math.max(...pointsA.map(p => p.total)) : 0;
    const maxB = pointsB.length > 0 ? Math.max(...pointsB.map(p => p.total)) : 0;

    const avgA = pointsA.length > 0 ? totalA / pointsA.length : 0;
    const avgB = pointsB.length > 0 ? totalB / pointsB.length : 0;

    const newStats: ComparisonStats = {
      aName: devA?.name ?? 'Appareil A',
      bName: devB?.name ?? 'Appareil B',
      totalA,
      totalB,
      diffRaw,
      diffPercent,
      isPos: diffRaw < 0, // In energy context, - is "good" evolution (savings)
      ratio: totalB > 0 ? totalA / totalB : 0,
      table: [
        { 
          label: 'Total', 
          valA: totalA, 
          valB: totalB, 
          strA: formatKwh(totalA), 
          strB: formatKwh(totalB) 
        },
        { 
          label: 'Moyenne / jour', 
          valA: avgA, 
          valB: avgB, 
          strA: formatKwh(avgA), 
          strB: formatKwh(avgB) 
        },
        { 
          label: 'Pic maximum', 
          valA: maxA, 
          valB: maxB, 
          strA: formatKwh(maxA), 
          strB: formatKwh(maxB) 
        },
      ]
    };

    // Build lineChartData
    const allDates = [...new Set([...pointsA.map(p => p.date), ...pointsB.map(p => p.date)])].sort();
    const chartData = allDates.map(date => ({
      date,
      [deviceAId]: pointsA.find(p => p.date === date)?.total ?? 0,
      [deviceBId]: pointsB.find(p => p.date === date)?.total ?? 0,
    }));

    setStats(newStats);
    setLineChartData(chartData);
    setHasResults(true);
  };

  const handleExport = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      await exportComparisonToExcel({
        stats,
        lineChartData,
        mode: type === 'water' ? 'Eau Manuel' : 'Électricité Manuel',
        phase: 'Total',
        startDate,
        endDate,
        dnToName: {
          [deviceAId]: stats.aName,
          [deviceBId]: stats.bName,
        },
        unit
      });
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  if (availableDevices.length < 2) {
    return (
      <div className="min-h-screen bg-background p-6 flex flex-col items-center justify-center">
        <EmptyState 
          type="no-data" 
          title="Pas assez d'appareils"
          description={`Vous avez besoin d'au moins deux appareils de type "${type}" pour effectuer une comparaison.`}
          onRetry={() => navigate("/parametres")}
          retryLabel="Gérer les appareils"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-3 rounded-xl border border-border shadow-lg">
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Comparaison — {type === 'water' ? 'Eau Manuel' : 'Électricité Manuel'}
            </h1>
            <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium">Analyse comparative des relevés</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExport} 
            disabled={exporting || !hasResults}
            variant="default"
            className="gap-2 shadow-lg shadow-green-900/10"
          >
            {exporting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> <span className="hidden sm:inline">Exportation...</span></>
            ) : (
              <><Download className="h-4 w-4" /> <span className="hidden sm:inline">Exporter Rapport</span></>
            )}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2 border-border/50 hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Retour</span>
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm mb-8">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest pl-1">Appareil A</label>
              <Select value={deviceAId} onValueChange={setDeviceAId}>
                <SelectTrigger className="bg-slate-950 border-slate-800 hover:border-green-500/50 transition-colors">
                  <SelectValue placeholder="Sélectionner A" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800">
                  {availableDevices.map(d => (
                    <SelectItem key={d.id} value={d.id} disabled={d.id === deviceBId}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest pl-1">Appareil B</label>
              <Select value={deviceBId} onValueChange={setDeviceBId}>
                <SelectTrigger className="bg-slate-950 border-slate-800 hover:border-blue-500/50 transition-colors">
                  <SelectValue placeholder="Sélectionner B" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800">
                  {availableDevices.map(d => (
                    <SelectItem key={d.id} value={d.id} disabled={d.id === deviceAId}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest pl-1">Période</label>
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={setStartDate}
                onEndChange={setEndDate}
                startLabel="Début"
                endLabel="Fin"
                maxDate={new Date().toISOString().split('T')[0]}
                minDate="2020-01-01"
              />
            </div>

            <Button 
              onClick={handleApply} 
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-5 h-auto transition-all transform active:scale-95"
              disabled={!deviceAId || !deviceBId || deviceAId === deviceBId}
            >
              Comparer les relevés
            </Button>
          </div>
          
          {deviceAId && deviceBId && deviceAId === deviceBId && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-950/20 p-2 rounded-lg border border-red-900/30">
              <AlertCircle className="h-4 w-4" />
              <span>Veuillez sélectionner deux appareils différents pour effectuer l'analyse.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasResults && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="bg-slate-900/50 p-6 rounded-full border border-slate-800 mb-6">
            <BarChart2 className="h-16 w-16 text-slate-700" />
          </div>
          <h2 className="text-xl font-semibold text-slate-300 mb-2">Prêt pour la comparaison</h2>
          <p className="text-slate-500 max-w-sm">
            Sélectionnez deux appareils et une période pour visualiser les différences de consommation.
          </p>
        </div>
      )}

      {hasResults && stats && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* KPI Summary Rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-slate-900/50 border-green-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Zap className="h-12 w-12 text-green-400" />
              </div>
              <CardHeader className="pb-2">
                <CardDescription className="text-green-500 font-bold uppercase tracking-widest text-[10px]">{stats.aName}</CardDescription>
                <CardTitle className="text-2xl font-black text-white">{formatKwh(stats.totalA)} <span className="text-sm font-normal text-muted-foreground">{unit}</span></CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-slate-900/50 border-blue-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Zap className="h-12 w-12 text-blue-400" />
              </div>
              <CardHeader className="pb-2">
                <CardDescription className="text-blue-500 font-bold uppercase tracking-widest text-[10px]">{stats.bName}</CardDescription>
                <CardTitle className="text-2xl font-black text-white">{formatKwh(stats.totalB)} <span className="text-sm font-normal text-muted-foreground">{unit}</span></CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800 relative overflow-hidden">
              <CardHeader className="pb-2">
                <CardDescription className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Écart Brut</CardDescription>
                <CardTitle className={`text-2xl font-black ${stats.diffRaw < 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.diffRaw >= 0 ? '+' : ''}{formatKwh(stats.diffRaw)} <span className="text-sm font-normal opacity-70">{unit}</span>
                </CardTitle>
              </CardHeader>
              <div className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 ${stats.diffRaw < 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: '100%' }} />
            </Card>

            <Card className="bg-slate-900/50 border-slate-800 relative overflow-hidden">
              <CardHeader className="pb-2">
                <CardDescription className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Évolution Relative</CardDescription>
                <div className="flex items-center gap-2">
                  <CardTitle className={`text-2xl font-black ${stats.isPos ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.diffPercent.toFixed(1)}%
                  </CardTitle>
                  {stats.isPos ? <TrendingDown className="h-5 w-5 text-green-400" /> : <TrendingUp className="h-5 w-5 text-red-400" />}
                </div>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Chart */}
            <Card className="xl:col-span-2 bg-slate-900/40 border-slate-800/60 overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/[0.02]">
                <CardTitle className="text-lg font-bold">Évolution temporelle</CardTitle>
              </CardHeader>
              <CardContent className="p-6 h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lineChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748b" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(val) => `${val}`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="top" height={36} align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Area 
                      type="monotone" 
                      name={stats.aName} 
                      dataKey={deviceAId} 
                      stroke="#10B981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorA)" 
                      animationDuration={1500}
                    />
                    <Area 
                      type="monotone" 
                      name={stats.bName} 
                      dataKey={deviceBId} 
                      stroke="#3B82F6" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorB)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stats Table */}
            <Card className="bg-slate-900/40 border-slate-800/60 overflow-hidden h-fit">
              <CardHeader className="border-b border-white/5 bg-white/[0.02]">
                <CardTitle className="text-lg font-bold">Analyse Détaillée</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-950/50 border-b border-slate-800">
                      <th className="px-5 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-widest">Indicateur</th>
                      <th className="px-4 py-3 font-semibold text-green-500 text-right text-[10px] uppercase tracking-widest">{stats.aName}</th>
                      <th className="px-4 py-3 font-semibold text-blue-500 text-right text-[10px] uppercase tracking-widest">{stats.bName}</th>
                      <th className="px-4 py-3 font-semibold text-gray-400 text-right text-[10px] uppercase tracking-widest">Écart</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {stats.table.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-5 py-4 font-bold text-white group-hover:text-green-400 transition-colors">{row.label}</td>
                        <td className="px-4 py-4 text-right font-mono text-slate-300">{row.strA}</td>
                        <td className="px-4 py-4 text-right font-mono text-slate-300">{row.strB}</td>
                        <td className={`px-4 py-4 text-right font-bold font-mono ${row.valA < row.valB ? 'text-green-500' : 'text-red-500'}`}>
                          {row.valA > row.valB ? '+' : ''}{formatKwh(row.valA - row.valB)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-950/80">
                    <tr>
                      <td colSpan={4} className="px-5 py-3 text-[10px] text-slate-500 font-medium italic">
                        Ratio de consommation : {stats.ratio.toFixed(2)}x (A par rapport à B)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonManual;
