import { DEVICES } from "@/lib/devices";
import { getDeviceColor } from "@/lib/devices";
import { DeviceConsumption } from "@/lib/types";
import { formatKwh } from "@/lib/utils";

interface Props {
  deviceData: DeviceConsumption[];
  loading: boolean;
  totalConsumption: number;
  unit?: string;
}

const TopDevicesCard = ({ deviceData, loading, totalConsumption, unit = "kWh" }: Props) => {
  if (loading) {
    return (
      <div className="space-y-4">
        

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((rank) => (
            <div key={rank} className="bg-card border border-border rounded-lg p-4 relative overflow-hidden animate-shimmer">
              <div className="text-6xl font-bold absolute -right-2 -top-2 opacity-5 text-muted-foreground">
                {rank}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                  </span>
                  <div className="h-4 w-24 animate-shimmer rounded" />
                </div>
                <div className="h-3 w-20 animate-shimmer rounded" />
                <div className="h-6 w-16 animate-shimmer rounded" />
                <div className="h-3 w-12 animate-shimmer rounded" />
                <div className="h-2 w-full animate-shimmer rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sort devices by consumption and take top 3
  const sortedDevices = [...deviceData]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  if (sortedDevices.length === 0) {
    return null;
  }

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-4">
      

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedDevices.map((device, index) => {
          const rank = index + 1;
          const deviceInfo = DEVICES.find(d => d.dn === device.deviceDn);
          const departmentName = deviceInfo?.department || "Inconnu";
          const deviceColor = getDeviceColor(device.deviceName);
          const percentage = totalConsumption > 0 ? (device.total / totalConsumption) * 100 : 0;
          const progressPercentage = Math.min(percentage, 100); // Cap at 100% for display

          return (
            <div
              key={device.deviceDn}
              className="bg-card border border-border rounded-lg p-4 relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-opacity-60"
              style={{
                borderLeftWidth: rank === 1 ? "4px" : "2px",
                borderLeftColor: deviceColor,
                transform: rank === 1 ? "scale(1.02)" : "scale(1)",
              }}
            >
              {/* Rank watermark */}
              <div 
                className="text-8xl font-bold absolute -right-4 -top-2 opacity-5 select-none"
                style={{ color: deviceColor }}
              >
                {rank}
              </div>

              <div className="space-y-3">
                {/* Medal and device name */}
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{medals[index]}</span>
                  <div className="flex-1">
                    <h4 className="font-bold text-foreground text-lg leading-tight">
                      {device.deviceName}
                    </h4>
                  </div>
                </div>

                {/* Department */}
                <div 
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: deviceColor }}
                >
                  {departmentName}
                </div>

                {/* Consumption value */}
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-foreground tabular-nums">
                    {formatKwh(device.total)} {unit}
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {percentage.toFixed(1)}% du total
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${progressPercentage}%`,
                        backgroundColor: deviceColor,
                        minWidth: progressPercentage > 0 ? "2px" : "0",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TopDevicesCard;
