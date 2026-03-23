import { RawConsumptionPoint, Granularity } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  device: string;
  index: number;
  date: string;
  message: string;
}

export interface ValidationResult {
  totalPoints: number;
  validPoints: number;
  warnings: number;
  errors: number;
  issues: ValidationIssue[];
}

export interface DeviceStatus {
  dn: string;
  status: "ok" | "delayed" | "error";
}

export function validateDataset(
  points: RawConsumptionPoint[],
  deviceName: string,
  granularity: Granularity,
  startDate: string,
  endDate: string
): { validated: RawConsumptionPoint[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const validated: RawConsumptionPoint[] = [];
  const rangeStart = new Date(startDate).getTime();
  const rangeEnd = new Date(endDate + "T23:59:59").getTime();

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = new Date(p.date);
    let critical = false;

    // Timestamp checks
    if (isNaN(d.getTime())) {
      issues.push({ level: "error", device: deviceName, index: i, date: p.date, message: `Format de date invalide : "${p.date}"` });
      critical = true;
    } else {
      const ts = d.getTime();
      if (ts < rangeStart || ts > rangeEnd) {
        issues.push({ level: "warning", device: deviceName, index: i, date: p.date, message: "Date hors de la plage demandée" });
      }
      if (ts > Date.now()) {
        issues.push({ level: "warning", device: deviceName, index: i, date: p.date, message: "Date dans le futur détectée" });
      }

      // Sequential check
      if (i > 0 && !isNaN(new Date(points[i - 1].date).getTime())) {
        const prevTs = new Date(points[i - 1].date).getTime();
        const gap = ts - prevTs;
        const expectedGap = granularity === "daily" ? 86400000 : 3600000;

        if (gap === 0) {
          issues.push({ level: "warning", device: deviceName, index: i, date: p.date, message: "Horodatage dupliqué" });
        } else if (gap > expectedGap * 1.5) {
          issues.push({ level: "warning", device: deviceName, index: i, date: p.date, message: "Écart de données détecté (données manquantes)" });
        }
      }
    }

    // Value checks
    if (!critical) {
      if (p.phaseA < 0 || p.phaseB < 0 || p.phaseC < 0 || p.total < 0) {
        issues.push({ level: "error", device: deviceName, index: i, date: p.date, message: "Valeur négative détectée" });
        critical = true;
      }

      const sumPhases = p.phaseA + p.phaseB + p.phaseC;
      if (p.total > 0 && Math.abs(sumPhases - p.total) > p.total * 0.05) {
        issues.push({ level: "warning", device: deviceName, index: i, date: p.date, message: `Incohérence total : A+B+C=${sumPhases.toFixed(2)} ≠ total=${p.total}` });
      }
    }

    if (!critical) {
      validated.push(p);
    }
  }

  return { validated, issues };
}

export function aggregateValidation(allIssues: ValidationIssue[], totalPoints: number): ValidationResult {
  const warnings = allIssues.filter(i => i.level === "warning").length;
  const errors = allIssues.filter(i => i.level === "error").length;
  return {
    totalPoints,
    validPoints: totalPoints - errors,
    warnings,
    errors,
    issues: allIssues,
  };
}

export function getDeviceStatus(
  points: RawConsumptionPoint[],
  granularity: Granularity
): "ok" | "delayed" | "error" {
  if (points.length === 0) return "error";
  const last = new Date(points[points.length - 1].date);
  if (isNaN(last.getTime())) return "error";
  // For mock/historical data, just check if data exists and last point is valid
  return "ok";
}

export function logValidation(result: ValidationResult) {
  if (import.meta.env.DEV) {
    console.group(`[STLR Validation] ${new Date().toISOString()}`);
    console.log(`Points: ${result.totalPoints} | Valides: ${result.validPoints} | Avertissements: ${result.warnings} | Erreurs: ${result.errors}`);
    if (result.issues.length > 0) {
      console.table(result.issues.map(i => ({ niveau: i.level, appareil: i.device, date: i.date, message: i.message })));
    }
    console.groupEnd();
  }
}
