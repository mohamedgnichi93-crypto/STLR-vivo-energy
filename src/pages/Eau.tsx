import { Droplets } from "lucide-react";

export default function Eau() {
  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Eau</h1>
        <p className="text-muted-foreground">Surveillance des ressources hydriques</p>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center bg-card border border-border border-dashed rounded-lg p-12 text-center opacity-80">
        <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
          <Droplets className="h-8 w-8 text-blue-500" />
        </div>
        <h2 className="text-2xl font-semibold mb-3">💧 Eau — En cours de développement</h2>
        <p className="text-muted-foreground max-w-md">
          Ce module permettra de suivre en temps réel la consommation d'eau pour tous les secteurs du bâtiment.
        </p>
      </div>
    </div>
  );
}
