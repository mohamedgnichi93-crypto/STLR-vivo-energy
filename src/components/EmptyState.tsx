import { Zap, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  type: "no-data" | "error";
  errorCode?: string | number;
  errorMessage?: string;
  onRetry?: () => void;
}

const EmptyState = ({ type, errorCode, errorMessage, onRetry }: EmptyStateProps) => {
  if (type === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-10 max-w-md w-full text-center space-y-4">
          <XCircle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-base font-semibold text-destructive uppercase tracking-wider">
            Erreur de connexion API
          </h2>
          {errorCode && (
            <p className="text-sm font-mono text-muted-foreground">
              Code erreur: <span className="text-destructive font-bold">{errorCode}</span>
            </p>
          )}
          {errorMessage && (
            <p className="text-sm text-muted-foreground border border-border rounded-md px-3 py-2 bg-secondary font-mono">
              Message: {errorMessage}
            </p>
          )}
          {onRetry && (
            <Button size="sm" variant="destructive" onClick={onRetry} className="mt-2">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Réessayer
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="bg-card border border-border rounded-xl p-10 max-w-md w-full text-center space-y-4">
        <Zap className="h-10 w-10 text-primary/40 mx-auto" />
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wider">
          Aucune donnée disponible
        </h2>
        <p className="text-sm text-muted-foreground">
          L'API n'a retourné aucune donnée pour la période sélectionnée.
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 text-left inline-block">
          <li className="flex items-center gap-2">
            <span className="text-primary">•</span> Vérifiez la connexion API
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">•</span> Essayez une autre période
          </li>
        </ul>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="mt-2 border-border">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Actualiser
          </Button>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
