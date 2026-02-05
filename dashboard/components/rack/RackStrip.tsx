import React from "react";
import { RFIDTag } from "../../types/schema";
import { cn } from "../../utils/cn";
import { useIoTStore } from "../../store/useIoTStore";
import { PackageCheck } from "lucide-react";

interface RackStripProps {
  uTotal: number;
  rfidData?: RFIDTag[];
}

export const RackStrip: React.FC<RackStripProps> = ({
  uTotal,
  rfidData = [],
}) => {
  const { isNocMode } = useIoTStore();

  // Create a map of sensor index to RFID tag for quick lookup
  const rfidMap = new Map<number, RFIDTag>(
    rfidData.map((r) => [r.sensorIndex, r]),
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PackageCheck
            className={cn(
              "w-4 h-4",
              isNocMode
                ? "text-sky-400 scale-125 transition-transform"
                : "text-sky-400",
            )}
          />
          <h3
            className={cn(
              "font-bold text-slate-300 uppercase tracking-tight transition-all",
              isNocMode ? "text-lg text-white" : "text-sm",
            )}
          >
            Physical Twin
          </h3>
        </div>
        <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest bg-slate-900 px-2 py-1 rounded border border-slate-800">
          U-Height: {uTotal}
        </div>
      </div>

      {/* Rack Strip Visualization */}
      <div className="flex-1 flex flex-col gap-1 overflow-y-auto scroll-smooth">
        {Array.from({ length: uTotal }).map((_, uIndex) => {
          const uPosition = uIndex + 1; // U positions are numbered from top (1) to bottom (uTotal)
          const rfidTag = rfidMap.get(uPosition);
          const isOccupied = !!rfidTag;

          return (
            <div
              key={uIndex}
              className={cn(
                "h-8 rounded border transition-all duration-300 flex items-center justify-between px-3",
                isOccupied
                  ? rfidTag?.isAlarm
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                    : "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-600",
                isNocMode && "h-12",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold">
                  U{uPosition}
                </span>
                {isOccupied && (
                  <span className="text-[10px] font-mono uppercase tracking-wider">
                    {rfidTag?.tagId}
                  </span>
                )}
              </div>
              {isOccupied && rfidTag?.isAlarm && (
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {rfidData.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-slate-600">
          <div className="text-center">
            <p className="text-sm text-slate-500">No RFID tags detected</p>
          </div>
        </div>
      )}
    </div>
  );
};
