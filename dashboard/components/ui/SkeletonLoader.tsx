import React from "react";

interface SkeletonLoaderProps {
  className?: string;
  height?: string;
  width?: string;
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  className = "",
  height = "h-4",
  width = "w-full",
  count = 1,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`animate-pulse bg-slate-700 rounded ${height} ${width} ${className}`}
        />
      ))}
    </>
  );
};

export const DeviceListSkeleton: React.FC = () => {
  return (
    <div className="space-y-2 p-4">
      <SkeletonLoader height="h-8" width="w-3/4" className="mb-4" />
      {Array.from({ length: 5 }).map((_, deviceIndex) => (
        <div
          key={deviceIndex}
          className="space-y-2 p-2 border border-slate-800 rounded"
        >
          <SkeletonLoader height="h-6" width="w-2/3" />
          <div className="pl-4 space-y-1">
            {Array.from({ length: 2 }).map((_, moduleIndex) => (
              <SkeletonLoader key={moduleIndex} height="h-4" width="w-1/2" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const RackViewSkeleton: React.FC = () => {
  return (
    <div className="flex-1 p-6 gap-6 overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr_320px]">
      {/* Security Panel Skeleton */}
      <div className="glass-panel p-4 space-y-4">
        <SkeletonLoader height="h-6" width="w-1/2" />
        <div className="flex justify-around">
          <SkeletonLoader height="h-16" width="w-16" className="rounded-full" />
          <SkeletonLoader height="h-16" width="w-16" className="rounded-full" />
        </div>
      </div>

      {/* Rack Visualizer Skeleton */}
      <div className="glass-panel p-4 space-y-4">
        <div className="flex justify-between items-center">
          <SkeletonLoader height="h-6" width="w-1/3" />
          <SkeletonLoader height="h-8" width="w-24" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, index) => (
            <SkeletonLoader key={index} height="h-8" width="w-full" />
          ))}
        </div>
      </div>

      {/* Environment Monitor Skeleton */}
      <div className="glass-panel p-4 space-y-4">
        <SkeletonLoader height="h-6" width="w-1/2" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex justify-between">
              <SkeletonLoader height="h-4" width="w-8" />
              <SkeletonLoader height="h-4" width="w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
