/**
 * CacheStatus.tsx
 * ───────────────
 * A modal panel showing the current state of both cache layers:
 *   - IndexedDB (permanent historical data)
 *   - localStorage (today's short-TTL data)
 *
 * Displays per-device, per-granularity coverage ranges and storage sizes.
 * Triggered by a 📦 button in the Dashboard header.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DEVICES } from "@/lib/devices";
import {
  getAllIndexedDBEntries,
  getIndexedDBSizeMB,
} from "@/lib/indexedDbCache";
import { getStorageReport } from "@/lib/storageBudget";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface CoverageRow {
  deviceName: string;
  dn: string;
  granularity: string;
  startDate: string | null;
  endDate: string | null;
  pointCount: number;
}

interface CacheStats {
  rows: CoverageRow[];
  idbSizeMB: number;
  lsSizeKB: number;
  lastRefreshed: Date;
  storageReport?: {
    usedMB: number;
    totalMB: number;
    percentUsed: number;
    entryCount: number;
    oldestEntry: string;
    newestEntry: string;
    recommendation: string;
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const GRANULARITIES = ["daily", "hourly"] as const;

/** Returns localStorage size used by stlr_* keys, in KB. */
function getLocalStorageSizeKB(): number {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("stlr_")) {
        const v = localStorage.getItem(k) ?? "";
        bytes += (k.length + v.length) * 2; // UTF-16
      }
    }
  } catch { /* ignore */ }
  return Math.round((bytes / 1024) * 10) / 10;
}

/** Formats a YYYY-MM-DD string to a locale-friendly display. */
function fmt(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

/** Returns "HH:MM" for a Date. */
function fmtTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ── Main Component ───────────────────────────────────────────────────────── */

interface CacheStatusProps {
  /** Controls modal visibility */
  open: boolean;
  /** Called when the user closes the modal */
  onClose: () => void;
}

/**
 * CacheStatus modal panel.
 * Shows per-device/granularity cache coverage, IndexedDB size, and localStorage size.
 */
export default function CacheStatus({ open, onClose }: CacheStatusProps) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [entries, idbSizeMB, storageReport] = await Promise.all([
        getAllIndexedDBEntries(),
        getIndexedDBSizeMB(),
        getStorageReport(),
      ]);

      // Build a lookup: { [dn_gran]: { minStart, maxEnd, pointCount } }
      const lookup: Record<string, { minStart: string; maxEnd: string; points: number }> = {};

      for (const entry of entries) {
        const key = `${entry.dn}__${entry.granularity}`;
        if (!lookup[key]) {
          lookup[key] = { minStart: entry.startDate, maxEnd: entry.endDate, points: 0 };
        }
        if (entry.startDate < lookup[key].minStart) lookup[key].minStart = entry.startDate;
        if (entry.endDate   > lookup[key].maxEnd)   lookup[key].maxEnd   = entry.endDate;
        lookup[key].points += entry.data?.length ?? 0;
      }

      // Build rows for every device × granularity
      const rows: CoverageRow[] = [];
      for (const device of DEVICES) {
        for (const gran of GRANULARITIES) {
          const key    = `${device.dn}__${gran}`;
          const cached = lookup[key];
          rows.push({
            deviceName: device.name,
            dn:         device.dn,
            granularity: gran,
            startDate:   cached?.minStart ?? null,
            endDate:     cached?.maxEnd   ?? null,
            pointCount:  cached?.points   ?? 0,
          });
        }
      }

      setStats({
        rows,
        idbSizeMB,
        lsSizeKB: getLocalStorageSizeKB(),
        lastRefreshed: new Date(),
        storageReport,
      });
    } catch (err) {
      console.error("[Cache] CacheStatus refresh error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload every time the modal opens
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    /* ── Backdrop ── */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* ── Panel ── */}
      <div
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <h2 className="text-base font-semibold tracking-tight">Données en cache</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
              className="text-xs"
            >
              {loading ? "⏳ Actualisation..." : "↻ Actualiser"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground"
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Coverage table */}
        {stats ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-border mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Appareil</th>
                    <th className="text-left px-4 py-2.5">Granularité</th>
                    <th className="text-left px-4 py-2.5">Couverture (IndexedDB)</th>
                    <th className="text-right px-4 py-2.5">Points</th>
                    <th className="text-center px-4 py-2.5">État</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rows.map((row) => {
                    const hasCoverage = row.startDate !== null && row.endDate !== null;
                    return (
                      <tr
                        key={`${row.dn}_${row.granularity}`}
                        className="border-t border-border hover:bg-secondary/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-medium">{row.deviceName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground capitalize">
                          {row.granularity}
                        </td>
                        <td className="px-4 py-2.5">
                          {hasCoverage ? (
                            <span className="font-mono text-xs text-foreground">
                              {fmt(row.startDate)} → {fmt(row.endDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Pas de cache</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs font-mono">
                          {hasCoverage ? row.pointCount.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {hasCoverage ? (
                            <span className="text-emerald-500 text-sm" title="Données disponibles hors ligne">✅</span>
                          ) : (
                            <span className="text-red-400 text-sm" title="Aucune donnée en cache">❌</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Storage Budget */}
            {stats.storageReport && (
              <div className="mb-4 rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground mb-3">
                  💾 Stockage IndexedDB
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Utilisé:</span>
                    <span className="font-mono font-medium">
                      {stats.storageReport.usedMB.toFixed(1)} MB / {stats.storageReport.totalMB.toFixed(0)} MB 
                      ({(stats.storageReport.percentUsed * 100).toFixed(1)}%)
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        stats.storageReport.percentUsed > 0.95 
                          ? 'bg-red-500' 
                          : stats.storageReport.percentUsed > 0.80 
                            ? 'bg-yellow-500' 
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(stats.storageReport.percentUsed * 100, 100)}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={`font-medium ${
                      stats.storageReport.percentUsed > 0.95 
                        ? 'text-red-500' 
                        : stats.storageReport.percentUsed > 0.80 
                          ? 'text-yellow-500' 
                          : 'text-green-500'
                    }`}>
                      {stats.storageReport.percentUsed > 0.95 
                        ? '⚠️ Stockage critique' 
                        : stats.storageReport.percentUsed > 0.80 
                          ? '⚠️ Stockage presque plein' 
                          : '✅ Stockage sain'
                      }
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-border">
                    <div>
                      <span className="text-muted-foreground">Entrées:</span>
                      <span className="ml-2 font-mono">{stats.storageReport.entryCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Plus ancienne:</span>
                      <span className="ml-2 font-mono">{stats.storageReport.oldestEntry}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Plus récente:</span>
                      <span className="ml-2 font-mono">{stats.storageReport.newestEntry}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Recommandation:</span>
                      <span className="ml-2 text-xs">{stats.storageReport.recommendation}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* localStorage coverage */}
            {(() => {
              const lsKeys: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k?.startsWith("stlr_")) lsKeys.push(k);
              }
              return lsKeys.length > 0 ? (
                <div className="mb-4 rounded-lg border border-border bg-secondary/20 p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                    💾 localStorage (données récentes — TTL 5 min)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {lsKeys.map(k => (
                      <span
                        key={k}
                        className="font-mono text-[10px] bg-secondary rounded px-1.5 py-0.5 text-muted-foreground"
                      >
                        {k.replace("stlr_", "")}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Storage summary footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4">
              <div className="flex gap-5">
                <span>
                  <span className="font-medium text-foreground">💾 IndexedDB:</span>{" "}
                  {stats.idbSizeMB} MB
                </span>
                <span>
                  <span className="font-medium text-foreground">💾 localStorage:</span>{" "}
                  {stats.lsSizeKB} KB
                </span>
              </div>
              <span>
                🕐 Actualisé aujourd&apos;hui à {fmtTime(stats.lastRefreshed)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <span className="animate-pulse">⏳ Chargement des statistiques...</span>
          </div>
        )}
      </div>
    </div>
  );
}
