import { DEVICES, DEPARTMENTS, getDeviceColor } from "@/lib/devices";
import { DatePicker } from '@/components/ui/DateRangePicker';
import { Granularity, Phase, PHASE_LABELS } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { clampDate, ensureDateOrder } from "@/lib/utils";
import { useState } from "react";

interface Props {
  startDate: string;
  endDate: string;
  selectedDevices: string[];
  selectedDepartment: string;
  granularity: Granularity;
  phase: Phase;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onDevicesChange: (dns: string[]) => void;
  onDepartmentChange: (dept: string) => void;
  onGranularityChange: (g: Granularity) => void;
  onPhaseChange: (p: Phase) => void;
  isDirty: boolean;
  onApply: () => void;
  loading: boolean;
  deviceStatuses?: Record<string, "ok" | "delayed" | "error">;
  /** DNs of devices that returned HTTP 429 in the last fetch cycle */
  rateLimitedDns?: string[];
  hidePhase?: boolean;
  hideDepartment?: boolean;
  availableDevices?: { dn: string; name: string; department?: string }[];
}

const PHASES: Phase[] = ["phaseA", "phaseB", "phaseC", "total"];

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "hourly",   label: "Horaire" },
  { value: "daily",    label: "Journalier" },
  { value: "weekly",   label: "Hebdomadaire" },
  { value: "monthly",  label: "Mensuel" },
];

const DashboardFilters = ({
  startDate, endDate, selectedDevices, selectedDepartment, granularity, phase,
  onStartDateChange, onEndDateChange, onDevicesChange, onDepartmentChange, onGranularityChange, onPhaseChange,
  isDirty, onApply, loading, deviceStatuses = {}, rateLimitedDns = [],
  hidePhase = false, hideDepartment = false, availableDevices,
}: Props) => {
  const sourceDevices = availableDevices || DEVICES;

  const filteredDevices = selectedDepartment === "all"
    ? sourceDevices
    : sourceDevices.filter(d => d.department === selectedDepartment);

  const handleDeviceToggle = (dn: string) => {
    if (selectedDevices.includes(dn)) {
      onDevicesChange(selectedDevices.filter(d => d !== dn));
    } else {
      onDevicesChange([...selectedDevices, dn]);
    }
  };

  const handleSelectAll = () => {
    if (selectedDevices.length === filteredDevices.length) {
      onDevicesChange([]);
    } else {
      onDevicesChange(filteredDevices.map(d => d.dn));
    }
  };

  const [startFlashing, setStartFlashing] = useState(false);
  const [endFlashing, setEndFlashing] = useState(false);

  const handleStartChange = (val: string) => {
    onStartDateChange(val);
  };

  const handleStartBlur = (val: string) => {
    if (!val) return;
    const corrected = clampDate(val, 'start');
    const ordered = ensureDateOrder(corrected, endDate);
    
    if (ordered.startDate !== val) {
      setStartFlashing(true);
      setTimeout(() => setStartFlashing(false), 1200);
    }
    onStartDateChange(ordered.startDate);
    if (ordered.endDate !== endDate) {
      setEndFlashing(true);
      setTimeout(() => setEndFlashing(false), 1200);
      onEndDateChange(ordered.endDate);
    }
  };

  const handleEndChange = (val: string) => {
    onEndDateChange(val);
  };

  const handleEndBlur = (val: string) => {
    if (!val) return;
    const corrected = clampDate(val, 'end');
    const ordered = ensureDateOrder(startDate, corrected);
    
    if (ordered.endDate !== val) {
      setEndFlashing(true);
      setTimeout(() => setEndFlashing(false), 1200);
    }
    onEndDateChange(ordered.endDate);
    if (ordered.startDate !== startDate) {
      setStartFlashing(true);
      setTimeout(() => setStartFlashing(false), 1200);
      onStartDateChange(ordered.startDate);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtres</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Phase Toggle */}
          {!hidePhase && (
            <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => onPhaseChange(p)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-all duration-100 ${
                    phase === p
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>
          )}

          {/* Granularity Toggle */}
          <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
            {GRANULARITY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onGranularityChange(value)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-100 ${
                  granularity === value
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Apply Filters Button */}
          <Button
            size="sm"
            onClick={onApply}
            disabled={loading}
            className="relative bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs px-4"
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            {isDirty ? "Appliquer les filtres ●" : "Appliquer les filtres"}
            {isDirty && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5 relative">
          <DatePicker
            value={startDate}
            label="Date début"
            onChange={(date) => { handleStartChange(date); handleStartBlur(date); }}
            maxDate={endDate}
            minDate="2020-01-01"
          />
          {startFlashing && <span className="absolute -bottom-4 left-0 text-[10px] text-orange-400 animate-out fade-out duration-1000 pointer-events-none">Date corrigée</span>}
        </div>
        <div className="space-y-1.5 relative">
          <DatePicker
            value={endDate}
            label="Date fin"
            onChange={(date) => { handleEndChange(date); handleEndBlur(date); }}
            minDate={startDate}
            maxDate={new Date().toISOString().split('T')[0]}
          />
          {endFlashing && <span className="absolute -bottom-4 left-0 text-[10px] text-orange-400 animate-out fade-out duration-1000 pointer-events-none">Date corrigée</span>}
        </div>
        {!hideDepartment && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Departement</Label>
            <select
              value={selectedDepartment}
              onChange={(e) => {
                onDepartmentChange(e.target.value);
                const devs = e.target.value === "all" ? sourceDevices : sourceDevices.filter(d => d.department === e.target.value);
                onDevicesChange(devs.map(d => d.dn));
              }}
              className="w-full h-10 rounded-md border border-border bg-secondary px-3 text-sm"
            >
              <option value="all">Tous les departements</option>
              {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Appareils ({selectedDevices.length}/{filteredDevices.length})</Label>
          <button onClick={handleSelectAll} className="w-full h-10 rounded-md border border-border bg-secondary px-3 text-sm text-left hover:border-primary/40 transition-colors duration-100">
            {selectedDevices.length === filteredDevices.length ? "Tout deselectionner" : "Tout selectionner"}
          </button>
        </div>
      </div>

      {/* Device Chip Grid */}
      <div className="flex flex-wrap gap-2">
        {filteredDevices.map(device => {
          const deptColor = getDeviceColor(device.name);
          const isSelected = selectedDevices.includes(device.dn);
          const isRateLimited = rateLimitedDns.includes(device.dn);

          return (
            <button
              key={device.dn}
              onClick={() => handleDeviceToggle(device.dn)}
              className="relative px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-100 active:scale-[0.98]"
              style={isSelected ? {
                backgroundColor: `${deptColor}1A`,
                borderColor: `${deptColor}66`,
                color: deptColor,
              } : {}}
              title={isRateLimited ? "⚠️ Limite API — données indisponibles pour cet appareil" : undefined}
            >
              {!isSelected && (
                <span className="absolute inset-0 rounded-md bg-secondary border border-border" style={{ zIndex: 0 }} />
              )}
              <span className={`relative z-10 flex items-center gap-1.5 ${isSelected ? "" : "text-muted-foreground hover:text-foreground"}`}>
                {device.name}
                {/* ⚠️ Rate-limit badge — shown for devices that returned HTTP 429 */}
                {isRateLimited && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold bg-orange-500/15 text-orange-500 border border-orange-500/30"
                    aria-label="Limite API atteinte"
                  >
                    ⚠️ limite API
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Rate-limit summary row */}
      {rateLimitedDns.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-500">
          <span className="font-semibold">⚠️ Limite API atteinte</span>
          <span className="text-orange-400">—</span>
          <span>
            {rateLimitedDns.length} appareil{rateLimitedDns.length > 1 ? "s" : ""} sans données.
            Réessayez dans quelques minutes.
          </span>
        </div>
      )}
    </div>
  );
};

export default DashboardFilters;
