import { DEVICES, DEPARTMENTS } from "@/lib/devices";
import { Granularity, Phase, PHASE_LABELS } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

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
  isDirty, onApply, loading, deviceStatuses = {},
}: Props) => {
  const filteredDevices = selectedDepartment === "all"
    ? DEVICES
    : DEVICES.filter(d => d.department === selectedDepartment);

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

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtres</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Phase Toggle */}
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

          {/* Granularity Toggle — 4 options */}
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
            {isDirty ? "Appliquer les filtres" : "Appliquer les filtres"}
            {isDirty && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Date debut</Label>
          <Input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} className="bg-secondary border-border text-sm font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Date fin</Label>
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} className="bg-secondary border-border text-sm font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Departement</Label>
          <select
            value={selectedDepartment}
            onChange={(e) => {
              onDepartmentChange(e.target.value);
              const devs = e.target.value === "all" ? DEVICES : DEVICES.filter(d => d.department === e.target.value);
              onDevicesChange(devs.map(d => d.dn));
            }}
            className="w-full h-10 rounded-md border border-border bg-secondary px-3 text-sm"
          >
            <option value="all">Tous les departements</option>
            {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Appareils ({selectedDevices.length}/{filteredDevices.length})</Label>
          <button onClick={handleSelectAll} className="w-full h-10 rounded-md border border-border bg-secondary px-3 text-sm text-left hover:border-primary/40 transition-colors duration-100">
            {selectedDevices.length === filteredDevices.length ? "Tout deselectionner" : "Tout selectionner"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filteredDevices.map(device => {
          const status = deviceStatuses[device.dn];
          const dotColor = status === "ok" ? "bg-primary" : status === "delayed" ? "bg-[hsl(var(--warning))]" : status === "error" ? "bg-destructive" : "";
          return (
            <button
              key={device.dn}
              onClick={() => handleDeviceToggle(device.dn)}
              className={`relative px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-100 active:scale-[0.98] ${
                selectedDevices.includes(device.dn)
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:border-primary/20"
              }`}
            >
              {dotColor && (
                <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${dotColor}`} />
              )}
              {device.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardFilters;
