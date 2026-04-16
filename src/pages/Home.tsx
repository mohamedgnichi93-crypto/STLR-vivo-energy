import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { DatePicker } from '@/components/ui/DateRangePicker'
import { useNavigate, useParams } from 'react-router-dom'
import { 
  Zap, Droplets, Plus, Trash2, PenLine, X,
  Cpu, Database, Clock, Upload, CheckCircle2, RefreshCw, AlertTriangle, FileDown, Loader2, Download
} from 'lucide-react'
import { 
  getAllDevices, addDevice, deleteDevice,
  getAllEntries, getEntriesByDevice, addEntry, upsertEntry,
  type ManualDevice
} from '@/lib/manualStore'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

// ── Types ────────────────────────────────────────────────────
interface ImportRow {
  date: string
  deviceName: string
  value: number
}

interface ImportResult {
  created: number
  updated: number
  skipped: { row: number; reason: string; raw: string }[]
}

// ── Constants ────────────────────────────────────────────────
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function parseDate(raw: string): string | null {
  if (!raw) return null
  const cleaned = String(raw).trim()
  
  // Already YYYY-MM-DD
  if (DATE_REGEX.test(cleaned)) return cleaned
  
  // DD/MM/YYYY → YYYY-MM-DD
  const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  
  // MM/DD/YYYY → YYYY-MM-DD
  const mdyMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  
  // Try native Date parse as last resort
  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }
  
  return null
}

const DEVICE_PALETTE = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#84cc16', // lime
  '#a855f7', // purple
]

function getDeviceColorById(deviceId: string): string {
  let hash = 0
  for (let i = 0; i < deviceId.length; i++) {
    hash = deviceId.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  const index = Math.abs(hash) % DEVICE_PALETTE.length
  return DEVICE_PALETTE[index]
}

export default function Home() {
  const navigate = useNavigate()
  const { type } = useParams<{ type: 'electricity' | 'water' }>()
  const viewType = (type === 'water' ? 'water' : 'electricity') as 'electricity' | 'water'
  const { t, i18n } = useTranslation()

  // Core Data State
  const [allDevices, setAllDevices] = useState<ManualDevice[]>([])
  const [newDeviceName, setNewDeviceName] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Popover Visibility States
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Global Entry States
  const [entryDeviceId, setEntryDeviceId] = useState<string>('')
  const [entryDate, setEntryDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [entryValue, setEntryValue] = useState<string>('')

  // Derived Values
  const loadDevices = useCallback(() => {
    setAllDevices(getAllDevices())
  }, [])

  useEffect(() => { loadDevices() }, [loadDevices, refreshKey])

  // Cross-tab sync: listen for storage events to trigger re-load
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1)
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const electricityDevices = useMemo(
    () => allDevices.filter(d => d.type === 'electricity'),
    [allDevices]
  )
  const waterDevices = useMemo(
    () => allDevices.filter(d => d.type === 'water'),
    [allDevices]
  )

  const activeDevices = useMemo(
    () => viewType === 'electricity' ? electricityDevices : waterDevices,
    [viewType, electricityDevices, waterDevices]
  )

  const activeEntries = useMemo(() => {
    const allEntries = getAllEntries()
    const activeIds = new Set(activeDevices.map(d => d.id))
    return allEntries.filter(e => activeIds.has(e.deviceId))
  }, [activeDevices])

  const kpiTotalEntries = useMemo(() => activeEntries.length, [activeEntries])

  const kpiLastEntryDate = useMemo(() => {
    const sorted = [...activeEntries].sort((a, b) => b.date.localeCompare(a.date))
    return sorted[0]?.date ?? null
  }, [activeEntries])

  const recentEntries = useMemo(() => {
    const typeDeviceIds = new Set(activeDevices.map(d => d.id))
    const allEntries = getAllEntries()
    return allEntries
      .filter(e => typeDeviceIds.has(e.deviceId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map(entry => ({
        ...entry,
        deviceName: allDevices.find(d => d.id === entry.deviceId)?.name ?? entry.deviceId,
        deviceColor: getDeviceColorById(entry.deviceId),
      }))
  }, [activeDevices, allDevices])

  // Handlers
  const handleAddDevice = () => {
    const name = newDeviceName.trim()
    if (!name) return
    
    addDevice({ 
      name, 
      type: viewType, 
      unit: viewType === 'electricity' ? 'kWh' : 'm³'
    })
    
    setNewDeviceName('')
    setShowAddDevice(false)
    loadDevices()
    setRefreshKey(k => k + 1)
    
    // Notify other pages
    window.dispatchEvent(new Event('storage'))
    
    toast.success(t('home.ajouter_appareil') + ` "${name}" ` + t('home.ajouter').toLowerCase())
  }

  const handleDeleteDevice = (id: string) => {
    const confirmMsg = i18n.language === 'fr' 
      ? "Êtes-vous sûr de vouloir supprimer cet appareil et toutes ses données ?" 
      : "Are you sure you want to delete this device and all its data?"
    
    if (window.confirm(confirmMsg)) {
      deleteDevice(id)
      loadDevices()
      setRefreshKey(k => k + 1)
      
      // Notify other pages
      window.dispatchEvent(new Event('storage'))
      
      toast.success(i18n.language === 'fr' ? "Appareil supprimé" : "Device deleted")
    }
  }

  const handleSaveEntry = () => {
    const value = parseFloat(entryValue)
    if (!entryDeviceId || !entryDate || isNaN(value) || value < 0) {
      toast.error(i18n.language === 'fr' ? "Veuillez remplir tous les champs correctement." : "Please fill all fields correctly.")
      return
    }
    
    addEntry({
      deviceId: entryDeviceId,
      date: entryDate,
      value,
    })
    
    setEntryValue('')
    setEntryDeviceId('')
    setShowAddEntry(false)
    loadDevices()
    setRefreshKey(k => k + 1)
    
    // Notify other pages
    window.dispatchEvent(new Event('storage'))
    
    toast.success(t('home.enregistrer'))
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    setImportResult(null)
    
    try {
      const XLSX = await import('xlsx')
      
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
      
      // Use first sheet
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      
      // Parse to JSON — raw:false converts dates to strings
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        dateNF: 'yyyy-mm-dd',
        defval: '',
      })
      
      if (rows.length === 0) {
        toast.error('Le fichier est vide ou ne contient aucune donnée.')
        return
      }
      
      // Detect column names (case-insensitive)
      const firstRow = rows[0]
      const keys = Object.keys(firstRow)
      
      const findCol = (candidates: string[]) =>
        keys.find(k => candidates.some(c => 
          k.toLowerCase().trim() === c.toLowerCase()
        )) ?? null
      
      const dateCol    = findCol(['date', 'jour', 'day'])
      const deviceCol  = findCol(['appareil', 'device', 'nom', 'name', 'compteur'])
      const valueCol   = findCol(['valeur', 'value', 'consommation', 'volume', 'kwh', 'm3', 'm³'])
      
      if (!dateCol || !deviceCol || !valueCol) {
        toast.error(
          `Colonnes introuvables. Attendu: Date, Appareil, Valeur. ` +
          `Trouvé: ${keys.join(', ')}`
        )
        return
      }
      
      // Get devices for current viewType
      const devices = getAllDevices().filter(d => d.type === viewType)
      
      const result: ImportResult = { created: 0, updated: 0, skipped: [] }
      
      rows.forEach((row, idx) => {
        const rawDate   = String(row[dateCol] ?? '').trim()
        const rawDevice = String(row[deviceCol] ?? '').trim()
        const rawValue  = String(row[valueCol] ?? '').trim()
        const rowNum    = idx + 2 // +2 because row 1 = header
        
        // Validate date
        const parsedDate = parseDate(rawDate)
        if (!parsedDate) {
          result.skipped.push({
            row: rowNum,
            reason: `Date invalide: "${rawDate}"`,
            raw: `${rawDate} | ${rawDevice} | ${rawValue}`
          })
          return
        }
        
        // Validate value
        const parsedValue = parseFloat(rawValue.replace(',', '.'))
        if (isNaN(parsedValue) || parsedValue < 0) {
          result.skipped.push({
            row: rowNum,
            reason: `Valeur invalide: "${rawValue}"`,
            raw: `${rawDate} | ${rawDevice} | ${rawValue}`
          })
          return
        }
        
        // Match device by name (case-insensitive)
        const device = devices.find(
          d => d.name.toLowerCase().trim() === rawDevice.toLowerCase()
        )
        
        if (!device) {
          result.skipped.push({
            row: rowNum,
            reason: `Appareil introuvable: "${rawDevice}"`,
            raw: `${rawDate} | ${rawDevice} | ${rawValue}`
          })
          return
        }
        
        // Upsert entry
        const { action } = upsertEntry({
          deviceId: device.id,
          date: parsedDate,
          value: parsedValue,
        })
        
        if (action === 'created') result.created++
        else result.updated++
      })
      
      setImportResult(result)
      
      // Refresh UI
      loadDevices()
      setRefreshKey(k => k + 1)
      window.dispatchEvent(new Event('storage'))
      
      const total = result.created + result.updated
      if (total > 0) {
        toast.success(
          `${total} entrées importées (${result.created} nouvelles, ${result.updated} mises à jour)`
        )
      }
      if (result.skipped.length > 0) {
        toast.warning(`${result.skipped.length} ligne(s) ignorée(s) — voir le rapport`)
      }
      
    } catch (err) {
      toast.error(`Erreur lors de l'import: ${err instanceof Error ? err.message : 'Inconnue'}`)
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownloadTemplate = () => {
    import('xlsx').then(XLSX => {
      const devices = getAllDevices().filter(d => d.type === viewType)
      const unit = viewType === 'electricity' ? 'kWh' : 'm³'
      
      // Header row
      const headers = ['Date', 'Appareil', `Valeur (${unit})`]
      
      // Example rows — one per device + 3 example dates
      const exampleDates = ['2025-01-01', '2025-01-02', '2025-01-03']
      const exampleRows: string[][] = []
      
      if (devices.length > 0) {
        devices.forEach(device => {
          exampleDates.forEach(date => {
            exampleRows.push([date, device.name, '0.000'])
          })
        })
      } else {
        // No devices yet — show generic example
        exampleDates.forEach(date => {
          exampleRows.push([date, 'Nom de votre appareil', '0.000'])
        })
      }
      
      const wsData = [headers, ...exampleRows]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      
      // Column widths
      ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 16 }]
      
      // Bold header
      ws['A1'].s = { font: { bold: true } }
      ws['B1'].s = { font: { bold: true } }
      ws['C1'].s = { font: { bold: true } }
      
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Données')
      
      const filename = `STLR_modele_import_${viewType}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, filename)
    })
  }

  const currentDateLabel = new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div className="min-h-screen bg-background p-6 space-y-8">
      
      {/* 1. HEADER */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs font-medium text-emerald-400 uppercase tracking-widest mb-1">{t('home.system')}</p>
          <h1 className="text-4xl font-black text-white tracking-tighter">{t('home.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('home.subtitle')} — {currentDateLabel}</p>
        </div>

        <div className="flex items-center gap-1 bg-secondary/60 rounded-xl p-1 mt-2">
          <button
            onClick={() => navigate('/home/electricity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              viewType === 'electricity' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="h-4 w-4" /> {t('home.electricite')}
          </button>
          <button
            onClick={() => navigate('/home/water')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              viewType === 'water' ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Droplets className="h-4 w-4" /> {t('home.eau')}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* 3. ACTION BUTTONS & POPOVERS */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              onClick={() => { setShowAddDevice(!showAddDevice); setShowAddEntry(false) }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 text-sm text-muted-foreground hover:text-foreground transition-all bg-card/40 ${showAddDevice ? 'border-primary/40 text-foreground ring-1 ring-primary/20' : ''}`}
            >
              <Plus className="h-4 w-4" /> {t('home.ajouter_appareil')}
            </button>
            <button
              onClick={() => { setShowAddEntry(!showAddEntry); setShowAddDevice(false) }}
              disabled={activeDevices.length === 0}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                viewType === 'electricity'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
              } ${showAddEntry ? 'ring-2 ring-primary/20' : ''}`}
            >
              <PenLine className="h-4 w-4" /> {t('home.saisir_donnee')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleImportFile(file)
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm 
                         font-medium transition-all border border-border/60 
                         bg-card/40 hover:border-primary/40 hover:bg-primary/5
                         text-muted-foreground hover:text-foreground
                         disabled:opacity-50"
            >
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Import en cours...</>
              ) : (
                <><Upload className="h-4 w-4" /> Importer CSV / Excel</>
              )}
            </button>
          </div>

          {importResult && (
            <div className="mt-3 p-4 bg-card border border-border rounded-xl space-y-3">
              
              {/* Summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {importResult.created > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-bold">{importResult.created}</span>
                      <span className="text-xs">nouvelles</span>
                    </div>
                  )}
                  {importResult.updated > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-blue-400">
                      <RefreshCw className="h-4 w-4" />
                      <span className="font-bold">{importResult.updated}</span>
                      <span className="text-xs">mises à jour</span>
                    </div>
                  )}
                  {importResult.skipped.length > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-bold">{importResult.skipped.length}</span>
                      <span className="text-xs">ignorées</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setImportResult(null)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground 
                             hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Skipped rows detail */}
              {importResult.skipped.length > 0 && (
                <div className="border-t border-border/40 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider 
                                text-muted-foreground mb-2">
                    Lignes ignorées
                  </p>
                  <div className="space-y-1 max-h-[160px] overflow-y-auto">
                    {importResult.skipped.map((s, i) => (
                      <div key={i} 
                        className="flex items-start gap-2 text-xs px-2 py-1.5 
                                   bg-amber-500/5 border border-amber-500/15 rounded-lg">
                        <span className="text-amber-400 font-mono font-bold 
                                         flex-shrink-0">
                          L{s.row}
                        </span>
                        <span className="text-amber-300/80">{s.reason}</span>
                        <span className="text-muted-foreground ml-auto font-mono 
                                         text-[10px] flex-shrink-0">
                          {s.raw}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Template download hint */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground 
                              border-t border-border/40 pt-2">
                <FileDown className="h-3.5 w-3.5" />
                <span>Format attendu : colonnes </span>
                <code className="bg-secondary px-1 rounded text-[10px]">Date</code>
                <code className="bg-secondary px-1 rounded text-[10px]">Appareil</code>
                <code className="bg-secondary px-1 rounded text-[10px]">Valeur</code>
                <button
                  onClick={handleDownloadTemplate}
                  className="ml-auto text-primary hover:underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Télécharger le modèle
                </button>
              </div>
            </div>
          )}

          {/* Add Device Popover */}
          {showAddDevice && (
            <div className="mt-2 p-4 bg-card border border-border rounded-xl flex gap-3 items-center backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
              <input
                autoFocus
                value={newDeviceName}
                onChange={e => setNewDeviceName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDevice()}
                placeholder={t('home.nom_appareil')}
                className="flex-1 bg-secondary border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 text-foreground"
              />
              <button
                onClick={handleAddDevice}
                disabled={!newDeviceName.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 transition-all active:scale-95"
              >
                {t('home.ajouter')}
              </button>
              <button
                onClick={() => { setShowAddDevice(false); setNewDeviceName('') }}
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Add Entry Popover */}
          {showAddEntry && (
            <div className="mt-2 p-4 bg-card border border-border rounded-xl backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex flex-col gap-1">
                  <DatePicker
                    value={entryDate}
                    onChange={setEntryDate}
                    label={t('home.date')}
                    maxDate={new Date().toISOString().split('T')[0]}
                    minDate="2020-01-01"
                  />
                </div>
                
                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">{t('home.appareil')}</label>
                  <select
                    value={entryDeviceId}
                    onChange={e => setEntryDeviceId(e.target.value)}
                    className="bg-secondary border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 text-foreground w-full appearance-none cursor-pointer"
                  >
                    <option value="">{t('home.selectionner')}</option>
                    {activeDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                    {viewType === 'electricity' ? t('home.consommation_kwh') : t('home.volume_m3')}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={entryValue}
                    onChange={e => setEntryValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEntry()}
                    placeholder="0,000"
                    autoFocus
                    className="w-36 bg-secondary border border-border/60 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 text-foreground [appearance:textfield]"
                  />
                </div>
                
                <div className="flex flex-col gap-1 justify-end pt-5">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEntry}
                      disabled={!entryDeviceId || !entryDate || !entryValue}
                      className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 transition-all active:scale-95"
                    >
                      {t('home.enregistrer')}
                    </button>
                    <button
                      onClick={() => { setShowAddEntry(false); setEntryValue(''); setEntryDeviceId('') }}
                      className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* 2. KPI STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card/30 border border-border/50 rounded-2xl p-6 flex items-center gap-5 backdrop-blur-sm transition-all hover:bg-card/50">
          <div className="p-4 bg-emerald-500/10 rounded-xl relative">
             <div className="absolute -top-1 -right-1">
                {viewType === 'electricity' ? <Zap className="h-3 w-3 text-emerald-400" /> : <Droplets className="h-3 w-3 text-blue-400" />}
             </div>
            <Cpu className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-3xl font-black text-white leading-none">{activeDevices.length}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wider">
              {viewType === 'electricity' ? t('home.appareils_electricite') : t('home.appareils_eau')}
            </p>
          </div>
        </div>

        <div className="bg-card/30 border border-border/50 rounded-2xl p-6 flex items-center gap-5 backdrop-blur-sm transition-all hover:bg-card/50">
          <div className="p-4 bg-blue-500/10 rounded-xl">
            <Database className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <p className="text-3xl font-black text-white leading-none">{kpiTotalEntries}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wider">{t('home.releves')}</p>
          </div>
        </div>

        <div className="bg-card/30 border border-border/50 rounded-2xl p-6 flex items-center gap-5 backdrop-blur-sm transition-all hover:bg-card/50">
          <div className="p-4 bg-amber-500/10 rounded-xl">
            <Clock className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white leading-none">{kpiLastEntryDate ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wider">{t('home.dernier_releve')}</p>
          </div>
        </div>
      </div>

        {/* 4. COMPACT DEVICE CHIPS */}
        <div className="flex flex-wrap gap-2">
          {activeDevices.map(device => {
            const color = getDeviceColorById(device.id)
            const entries = getEntriesByDevice(device.id)
            const entryCount = entries.length
            
            return (
              <div
                key={device.id}
                className="group relative flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold transition-all hover:scale-[1.02] cursor-default"
                style={{
                  backgroundColor: `${color}10`,
                  borderColor: `${color}30`,
                  color,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span>{device.name}</span>
                <span className="text-[10px] opacity-60 font-medium px-1.5 py-0.5 bg-black/10 rounded">
                  {entryCount} {entryCount === 1 ? t('home.releve_count') : t('home.releves_count')}
                </span>
                
                <button
                  onClick={() => handleDeleteDevice(device.id)}
                  className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 rounded hover:bg-red-500/20 text-red-400 transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          
          {activeDevices.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 italic">
              {viewType === 'electricity' 
                ? t('home.aucun_electricite')
                : t('home.aucun_eau')}
            </p>
          )}
        </div>

        {/* 5. LAST 10 ENTRIES TABLE */}
        {recentEntries.length > 0 && (
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-2">
              <div className={`h-px flex-1 ${viewType === 'electricity' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`} />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-4">{t('home.derniers_releves')}</span>
              <div className={`h-px flex-1 ${viewType === 'electricity' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`} />
            </div>

            <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/20">
                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('table.appareil')}</th>
                    <th className="text-left px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('table.date')}</th>
                    <th className="text-right px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('table.consommation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map((entry, index) => (
                    <tr key={entry.id} className={`border-b border-border/20 transition-colors hover:bg-secondary/40 ${index === recentEntries.length - 1 ? 'border-0' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.deviceColor }} />
                          <span className="text-sm font-semibold" style={{ color: entry.deviceColor }}>{entry.deviceName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-muted-foreground font-mono">{entry.date}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-black text-foreground">
                          {entry.value.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2 font-bold uppercase">{viewType === 'electricity' ? 'kWh' : 'm³'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => navigate(viewType === 'electricity' ? '/electricity/manuel' : '/eau/manuel')}
                className="text-xs font-bold text-muted-foreground hover:text-primary transition-all underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-primary/50"
              >
                {t('home.voir_analyse')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
