import { useParams, useNavigate } from "react-router-dom";
import { DatePicker } from '@/components/ui/DateRangePicker';
import { 
  Zap, 
  Droplets, 
  ArrowLeft, 
  Save, 
  History, 
  Trash2, 
  Calendar as CalendarIcon, 
  AlertCircle 
} from "lucide-react";
import { 
  getDeviceById, 
  getEntryByDeviceAndDate, 
  addEntry, 
  updateEntry, 
  getEntriesByDevice, 
  deleteEntry, 
  ManualDevice, 
  ManualEntry 
} from "@/lib/manualStore";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatKwh } from "@/lib/utils";

export default function ManualEntryForm() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  
  const [device, setDevice] = useState<ManualDevice | null>(null);
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  // Load device and entries
  useEffect(() => {
    if (!deviceId) return;
    const dev = getDeviceById(deviceId);
    if (!dev) {
      toast.error("Appareil non trouvé");
      navigate('/home');
      return;
    }
    setDevice(dev);
    refreshEntries();
  }, [deviceId, navigate]);

  // When date changes, check if an entry already exists
  useEffect(() => {
    if (!deviceId || !date) return;
    const existing = getEntryByDeviceAndDate(deviceId, date);
    if (existing) {
      setValue(existing.value.toString());
    } else {
      setValue("");
    }
  }, [deviceId, date]);

  const refreshEntries = () => {
    if (deviceId) {
      const all = getEntriesByDevice(deviceId);
      // Sort: most recent first
      const sorted = [...all].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(sorted);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !date || value === "") {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setLoading(true);
    try {
      const numValue = parseFloat(value.replace(',', '.'));
      if (isNaN(numValue)) {
        toast.error("Valeur numérique invalide");
        return;
      }

      const existing = getEntryByDeviceAndDate(deviceId, date);
      if (existing) {
        updateEntry(existing.id, numValue);
        toast.success("Valeur mise à jour ✓");
      } else {
        addEntry({ deviceId, date, value: numValue });
        toast.success("Nouvelle valeur enregistrée ✓");
      }
      refreshEntries();
    } catch (err) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = (id: string) => {
    if (window.confirm("Supprimer cette saisie ?")) {
      deleteEntry(id);
      refreshEntries();
      toast.success("Saisie supprimée");
    }
  };

  if (!device) return null;

  const isElectricity = device.type === 'electricity';
  const Icon = isElectricity ? Zap : Droplets;
  const colorClass = isElectricity ? 'text-primary' : 'text-blue-500';
  const bgClass = isElectricity ? 'bg-primary/10' : 'bg-blue-500/10';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => navigate(`/manual-list/${device.type}`)}
          className="rounded-full border-border bg-card/50 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bgClass}`}>
            <Icon className={`h-6 w-6 ${colorClass}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{device.name}</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
              Saisie Manuelle ({device.unit})
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Entry Form */}
        <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Save className="h-16 w-16" />
          </div>

          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Nouveau relevé
          </h3>

          <form onSubmit={handleSave} className="space-y-6 relative z-10">
            <div className="space-y-2">
              <DatePicker
                value={date}
                onChange={setDate}
                label="Date du relevé"
                maxDate={new Date().toISOString().split('T')[0]}
                minDate="2020-01-01"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Valeur ({device.unit})
              </label>
              <div className="relative group">
                <Input 
                  type="number" 
                  step="0.001"
                  value={value} 
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0,000"
                  className="bg-background border-border h-12 text-xl font-bold focus:ring-primary/20"
                  required
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 font-bold">
                  {device.unit}
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full h-12 text-lg font-bold gap-3 shadow-lg shadow-primary/10 transition-transform active:scale-[0.98]"
            >
              <Save className="h-5 w-5" />
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </form>
        </div>

        {/* History Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2 px-1">
            <History className="h-5 w-5 text-muted-foreground" />
            Historique des saisies
          </h3>
          
          <div className="bg-secondary/10 border border-border/40 rounded-2xl overflow-hidden backdrop-blur-sm">
            {entries.length > 0 ? (
              <div className="divide-y divide-border/40">
                {entries.slice(0, 10).map(entry => (
                  <div key={entry.id} className="flex items-center justify-between p-4 group hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-bold text-muted-foreground w-20">
                        {new Date(entry.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div className="text-lg font-black tracking-tight text-foreground flex items-center gap-1.5">
                        {formatKwh(entry.value)}
                        <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                          {device.unit}
                        </span>
                      </div>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all rounded-full h-8 w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground italic flex flex-col items-center gap-2">
                <History className="h-8 w-8 opacity-20" />
                <p>Aucune saisie pour cet appareil</p>
              </div>
            )}
            
            {entries.length > 10 && (
              <div className="p-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-secondary/20">
                Affichage des 10 derniers relevés
              </div>
            )}
          </div>
          
          {entries.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-200/80 leading-relaxed font-medium">
                Les saisies manuelles sont enregistrées localement dans votre navigateur. 
                Elles ne sont pas synchronisées avec le serveur STLR principal.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
