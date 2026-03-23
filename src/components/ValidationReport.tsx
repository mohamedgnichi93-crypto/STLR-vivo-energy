import { useState } from "react";
import { ValidationResult } from "@/lib/validation";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  result: ValidationResult | null;
  lastUpdate: Date | null;
}

const ValidationReport = ({ result, lastUpdate }: Props) => {
  const [open, setOpen] = useState(false);

  if (!result) return null;

  const { totalPoints, validPoints, warnings, errors, issues } = result;
  const allGood = warnings === 0 && errors === 0;

  return (
    <div className="bg-card border border-border rounded-lg p-4 mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allGood ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : errors > 0 ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
          )}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Validation des données — {totalPoints.toLocaleString()} points vérifiés
          </span>
        </div>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground font-mono">
            Dernière mise à jour : {lastUpdate.toLocaleDateString("fr-FR")} à {lastUpdate.toLocaleTimeString("fr-FR")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {validPoints} points valides
        </span>
        {warnings > 0 && (
          <span className="flex items-center gap-1.5 text-[hsl(var(--warning))]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {warnings} avertissement{warnings > 1 ? "s" : ""}
          </span>
        )}
        {errors > 0 && (
          <span className="flex items-center gap-1.5 text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            {errors} erreur{errors > 1 ? "s" : ""} critique{errors > 1 ? "s" : ""}
          </span>
        )}
        {allGood && (
          <span className="text-muted-foreground">
            Tous les horodatages sont valides et séquentiels
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-100"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            {open ? "Masquer les détails" : "Voir détails"}
          </button>

          {open && (
            <ScrollArea className="max-h-48 border border-border rounded-md bg-secondary/50">
              <div className="p-3 space-y-1.5">
                {issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs font-mono"
                  >
                    {issue.level === "error" ? (
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    )}
                    <span className="text-muted-foreground">
                      <span className="text-foreground">{issue.device}</span>
                      {" · "}
                      <span className="text-foreground/70">{issue.date}</span>
                      {" — "}
                      {issue.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
};

export default ValidationReport;
