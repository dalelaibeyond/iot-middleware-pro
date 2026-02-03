
import React from 'react';
import { RFIDTag } from '../../types/schema';
import { cn } from '../../utils/cn';
import { useIoTStore } from '../../store/useIoTStore';
import { AlertTriangle, PackageCheck } from 'lucide-react';

interface RackStripProps {
  uTotal: number;
  rfidData: RFIDTag[];
}

export const RackStrip: React.FC<RackStripProps> = ({ uTotal, rfidData }) => {
  const { isNocMode } = useIoTStore();
  const rfidMap = new Map<number, RFIDTag>(rfidData.map(r => [r.sensorIndex, r]));

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PackageCheck className={cn("w-4 h-4", isNocMode ? "text-sky-400 scale-125 transition-transform" : "text-sky-400")} />
          <h3 className={cn(
            "font-bold text-slate-300 uppercase tracking-tight transition-all",
            isNocMode ? "text-lg text-white" : "text-sm"
          )}>
            Physical Twin
          </h3>
        </div>
        <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest bg-slate-900 px-2 py-1 rounded border border-slate-800">
          U-Height: {uTotal}
        </div>
      </div>

      <div className={cn(
        "rack-rail-container flex flex-col gap-1 flex-1 overflow-y-auto scroll-smooth transition-all duration-500",
        isNocMode && "border-slate-700/50 shadow-2xl"
      )}>
        {Array.from({ length: uTotal }, (_, i) => uTotal - i).map(u => {
          const slot = rfidMap.get(u);
          const isAlarm = slot?.isAlarm;

          return (
            <div 
              key={u}
              className={cn(
                "group relative border rounded transition-all duration-300 flex items-center px-4",
                isNocMode ? "h-14 min-h-[56px]" : "h-10 min-h-[40px]",
                slot 
                  ? isAlarm 
                    ? "bg-rose-500/20 border-rose-500/50 text-rose-100 animate-blink-red" 
                    : "bg-sky-500/10 border-sky-500/30 text-sky-100 hover:bg-sky-500/20"
                  : "bg-slate-800/30 border-slate-700/50 text-slate-600 border-dashed"
              )}
            >
              <div className="absolute left-[-2px] top-1/2 -translate-y-1/2 flex flex-col gap-[2px]">
                <div className="w-[4px] h-[4px] bg-slate-600 rounded-full" />
                <div className="w-[4px] h-[4px] bg-slate-600 rounded-full" />
              </div>

              <div className={cn(
                "w-8 font-mono font-bold shrink-0 opacity-50",
                isNocMode ? "text-sm" : "text-[10px]"
              )}>
                {u.toString().padStart(2, '0')}
              </div>

              <div className="flex-1 flex items-center gap-4">
                {slot ? (
                  <>
                    <div className={cn(
                      "rounded-full transition-all duration-500",
                      isNocMode ? "w-2.5 h-2.5" : "w-1.5 h-1.5",
                      isAlarm ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]" : "bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.5)]"
                    )} />
                    <span className={cn(
                      "font-mono tracking-wider font-bold transition-all",
                      isNocMode ? "text-sm text-white" : "text-xs"
                    )}>
                      {slot.tagId}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] italic font-medium tracking-tight text-slate-700">Empty Slot</span>
                )}
              </div>

              {isAlarm && (
                <div className="flex items-center gap-1.5 text-rose-400 animate-pulse bg-rose-950/50 px-2 py-1 rounded border border-rose-800">
                   <AlertTriangle className={cn(isNocMode ? "w-5 h-5" : "w-4 h-4")} />
                   <span className="text-[10px] font-black uppercase hidden md:inline tracking-tighter">ALARM</span>
                </div>
              )}

              <div className="absolute right-[-2px] top-1/2 -translate-y-1/2 flex flex-col gap-[2px]">
                <div className="w-[4px] h-[4px] bg-slate-600 rounded-full" />
                <div className="w-[4px] h-[4px] bg-slate-600 rounded-full" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
