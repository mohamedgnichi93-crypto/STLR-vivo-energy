import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  unit: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
}

const KPICard = ({ title, value, unit, icon: Icon, trend, trendUp, loading }: KPICardProps) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="h-4 w-24 animate-shimmer rounded mb-4" />
        <div className="h-8 w-32 animate-shimmer rounded mb-2" />
        <div className="h-3 w-16 animate-shimmer rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5 transition-all duration-100 hover:border-primary/30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight-kpi tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {trend && (
        <span className={`text-xs mt-2 inline-block ${trendUp ? "text-primary" : "text-destructive"}`}>
          {trend}
        </span>
      )}
    </div>
  );
};

export default KPICard;
