import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  className?: string;
}

const TotalConsumptionChartSkeleton = ({ className }: Props) => {
  return (
    <div className={`bg-card border border-border rounded-lg p-6 flex flex-col ${className || ""}`}>
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-64 bg-secondary/50" />
          <Skeleton className="h-3 w-48 bg-secondary/30" />
        </div>
        <Skeleton className="h-5 w-16 bg-secondary/40" />
      </div>
      
      <div className="h-[300px] w-full flex items-end gap-1.5 px-2">
        {/* Placeholder for bar/area visual */}
        {[...Array(12)].map((_, i) => (
          <Skeleton 
            key={i} 
            className="flex-1 bg-secondary/20" 
            style={{ 
              height: `${Math.floor(Math.random() * 60) + 20}%`,
              opacity: (i + 1) / 12 * 0.8
            }} 
          />
        ))}
      </div>
    </div>
  );
};

export default TotalConsumptionChartSkeleton;
