import { useParams, useNavigate } from "react-router-dom";
import { Zap, Droplets, ArrowLeft, ChevronRight, AlertCircle, Settings } from "lucide-react";
import { getDevicesByType, getEntriesByDevice, ManualDevice } from "@/lib/manualStore";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function ManualDeviceList() {
  const { type } = useParams<{ type: 'electricity' | 'water' }>();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<(ManualDevice & { lastEntry?: string })[]>([]);

  useEffect(() => {
    if (type !== 'electricity' && type !== 'water') {
      navigate('/home');
      return;
    }

    const filtered = getDevicesByType(type);
    const enriched = filtered.map(d => {
      const entries = getEntriesByDevice(d.id);
      const lastEntry = entries.length > 0 
        ? entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
        : undefined;
      return { ...d, lastEntry };
    });
    setDevices(enriched);
  }, [type, navigate]);

  const isElectricity = type === 'electricity';
  const Icon = isElectricity ? Zap : Droplets;
  const colorClass = isElectricity ? 'text-primary' : 'text-blue-500';
  const bgClass = isElectricity ? 'bg-primary/10' : 'bg-blue-500/10';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => navigate('/home')}
          className="rounded-full border-border bg-card/50 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bgClass}`}>
            <Icon className={`h-6 w-6 ${colorClass}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isElectricity ? "Électricité" : "Eau"}
            </h1>
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
              Appareils manuels ({devices.length})
            </p>
          </div>
        </div>
      </div>

      {/* Device List */}
      <div className="space-y-4">
        {devices.length > 0 ? (
          devices.map(device => (
            <div 
              key={device.id}
              onClick={() => navigate(`/manual-entry/${device.id}`)}
              className="group relative flex items-center justify-between p-6 rounded-2xl bg-card border border-border/40 cursor-pointer overflow-hidden transition-all hover:scale-[1.01] hover:border-primary/30 hover:bg-secondary/20 shadow-sm"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className={`p-3 rounded-xl bg-background border border-border/60 group-hover:border-primary/40 group-hover:scale-105 transition-all`}>
                  <Icon className={`h-5 w-5 ${colorClass}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{device.name}</h3>
                  <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                    <span className="px-2 py-0.5 rounded-full bg-secondary/50 border border-border/50 uppercase">
                      Unité: {device.unit}
                    </span>
                    {device.lastEntry && (
                      <span className="flex items-center gap-1 italic">
                        Dernière saisie: {new Date(device.lastEntry).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-wide opacity-0 transform translate-x-[-10px] transition-all group-hover:opacity-100 group-hover:translate-x-0 relative z-10">
                Saisir <ChevronRight className="h-4 w-4" />
              </div>
              
              {/* Subtle background glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center p-12 bg-secondary/10 border-2 border-dashed border-border/60 rounded-3xl text-center space-y-4">
            <div className="p-4 bg-background rounded-full border border-border/40 shadow-inner">
              <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-1">Aucun appareil configuré</h3>
              <p className="text-muted-foreground mb-6">Vous devez d'abord ajouter un appareil dans les paramètres.</p>
              <Button 
                onClick={() => navigate('/parametres')}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Aller aux paramètres
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
