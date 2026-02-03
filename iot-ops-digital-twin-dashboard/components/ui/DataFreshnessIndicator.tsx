import React, { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface DataFreshnessIndicatorProps {
  lastUpdate: string;
  staleThreshold?: number; // in minutes, default 2
  className?: string;
}

export const DataFreshnessIndicator: React.FC<DataFreshnessIndicatorProps> = ({
  lastUpdate,
  staleThreshold = 2,
  className = "",
}) => {
  const [timeSinceUpdate, setTimeSinceUpdate] = useState(0);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    const calculateTimeSinceUpdate = () => {
      const now = new Date().getTime();
      const updateTime = new Date(lastUpdate).getTime();
      const diffMinutes = Math.floor((now - updateTime) / (1000 * 60));

      setTimeSinceUpdate(diffMinutes);
      setIsStale(diffMinutes > staleThreshold);
    };

    // Calculate immediately
    calculateTimeSinceUpdate();

    // Update every minute
    const interval = setInterval(calculateTimeSinceUpdate, 60000);

    return () => clearInterval(interval);
  }, [lastUpdate, staleThreshold]);

  const formatTimeAgo = (minutes: number): string => {
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  };

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <Clock
        className={`w-3 h-3 ${isStale ? "text-yellow-500" : "text-emerald-500"}`}
      />
      <span className={`${isStale ? "text-yellow-500" : "text-emerald-500"}`}>
        Updated {formatTimeAgo(timeSinceUpdate)}
      </span>
      {isStale && (
        <div className="flex items-center gap-1 text-yellow-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Stale</span>
        </div>
      )}
    </div>
  );
};

interface LastUpdateBadgeProps {
  lastUpdate: string;
  className?: string;
}

export const LastUpdateBadge: React.FC<LastUpdateBadgeProps> = ({
  lastUpdate,
  className = "",
}) => {
  return (
    <div
      className={`bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs flex items-center gap-1 ${className}`}
    >
      <Clock className="w-3 h-3" />
      <span>{new Date(lastUpdate).toLocaleTimeString()}</span>
    </div>
  );
};
