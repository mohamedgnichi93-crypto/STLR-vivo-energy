import { useState, useEffect } from "react";
import { Zap, Droplets, Trash2, PlusCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  getAllDevices, 
  addDevice, 
  deleteDevice, 
  ManualDevice 
} from "@/lib/manualStore";
import { toast } from "sonner";

export default function ManualDeviceConfig() {
  const [devices, setDevices] = useState<ManualDevice[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<'electricity' | 'water'>('electricity');

  // Load devices on mount
  useEffect(() => {
    setDevices(getAllDevices());
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Veuillez entrer un nom d'appareil");
      return;
    }

    const unit = type === 'electricity' ? 'kWh' : 'm³';
    const newDevice = addDevice({ name: name.trim(), type, unit });
    setDevices(prev => [...prev, newDevice]);
    setName("");
    toast.success(`Appareil "${newDevice.name}" ajouté ✓`);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Supprimer l'appareil "${name}" et toutes ses données de relevés ?`)) {
      deleteDevice(id);
      setDevices(prev => prev.filter(d => d.id !== id));
      toast.success("Appareil supprimé");
    }
  };

  const electricityDevices = devices.filter(d => d.type === 'electricity');
  const waterDevices = devices.filter(d => d.type === 'water');

  return (
    <div className="space-y-8">
      {/* Form Section */}
      <div className="bg-secondary/30 border border-border/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-primary" />
          Ajouter un appareil manuel
        </h3>
        
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nom de l'appareil
            </label>
            <Input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Compteur Cave"
              className="bg-background/50 border-border"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type d'énergie
            </label>
            <div className="flex bg-background/50 border border-border rounded-lg p-1">
              <button
                type="button"
                onClick={() => setType('electricity')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-all ${
                  type === 'electricity' 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'hover:bg-secondary text-muted-foreground'
                }`}
              >
                <Zap className="h-4 w-4" />
                Électricité
              </button>
              <button
                type="button"
                onClick={() => setType('water')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm transition-all ${
                  type === 'water' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'hover:bg-secondary text-muted-foreground'
                }`}
              >
                <Droplets className="h-4 w-4" />
                Eau
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Ajouter l'appareil
            </Button>
          </div>
        </form>
      </div>

      {/* List Section */}
      <div className="space-y-6">
        {/* Electricity */}
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            <Zap className="h-4 w-4 text-primary" />
            Électricité (kWh)
          </h4>
          <div className="space-y-2">
            {electricityDevices.length > 0 ? (
              electricityDevices.map(device => (
                <DeviceRow key={device.id} device={device} onDelete={handleDelete} />
              ))
            ) : (
              <EmptyList message="Aucun appareil d'électricité configuré" />
            )}
          </div>
        </div>

        {/* Water */}
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            <Droplets className="h-4 w-4 text-blue-500" />
            Eau (m³)
          </h4>
          <div className="space-y-2">
            {waterDevices.length > 0 ? (
              waterDevices.map(device => (
                <DeviceRow key={device.id} device={device} onDelete={handleDelete} />
              ))
            ) : (
              <EmptyList message="Aucun appareil d'eau configuré" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceRow({ device, onDelete }: { 
  device: ManualDevice, 
  onDelete: (id: string, name: string) => void 
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/20 border border-border/40 hover:bg-secondary/40 transition-colors group">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md ${device.type === 'electricity' ? 'bg-primary/10' : 'bg-blue-500/10'}`}>
          {device.type === 'electricity' ? (
            <Zap className="h-4 w-4 text-primary" />
          ) : (
            <Droplets className="h-4 w-4 text-blue-500" />
          )}
        </div>
        <div>
          <h5 className="font-medium">{device.name}</h5>
          <p className="text-xs text-muted-foreground italic">Unité: {device.unit}</p>
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(device.id, device.name)}
        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyList({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/10 border border-dashed border-border/60 text-muted-foreground italic text-sm">
      <AlertCircle className="h-4 w-4 opacity-50" />
      {message}
    </div>
  );
}
