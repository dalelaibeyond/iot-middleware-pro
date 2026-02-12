import React from "react";
import { TempHum, NoiseLevel } from "../../types/schema";
import { Thermometer, Wind, Volume2 } from "lucide-react";
import { cn } from "../../utils/cn";

interface EnvListProps {
  tempHum?: TempHum[];
  noise?: NoiseLevel[];
}

export const EnvList: React.FC<EnvListProps> = ({
  tempHum,
  noise,
}) => {
  const tempHumData = tempHum || [];
  const noiseData = noise || [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-tight">
            Environmental
          </h3>
        </div>

        <div className="space-y-3">
          {tempHumData.map((data, i) => (
            <div
              key={i}
              className={cn(
                "p-4 rounded-xl border hardware-card",
                data.temp > 35
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-100"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-100",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  Zone #{data.sensorIndex}
                </span>
                {data.temp > 35 && (
                  <span className="text-[10px] font-bold uppercase text-amber-400 animate-pulse">
                    Warning: High
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="text-2xl font-bold tracking-tighter">
                    {data.temp.toFixed(1)}
                    <span className="text-sm font-normal text-slate-500 ml-0.5">
                      °C
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Wind className="w-3.5 h-3.5" />
                    <span className="text-xl font-bold tracking-tighter">
                      {Math.round(data.hum)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-1000",
                    data.temp > 35 ? "bg-amber-500" : "bg-sky-500",
                  )}
                  style={{ width: `${Math.min(100, (data.temp / 60) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-tight">
            Acoustic Logic
          </h3>
        </div>

        {noiseData.map((n, i) => (
          <div key={i} className="p-4 rounded-xl hardware-card">
            <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
              Noise Level #{n.sensorIndex}
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold tracking-tighter text-sky-100">
                {Math.round(n.noise)}
              </span>
              <span className="text-sm text-slate-500 pb-1">dB</span>
            </div>
            <div className="flex gap-1 mt-3">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex-1 h-3 rounded-sm transition-all duration-300",
                    idx / 12 < n.noise / 100 ? "bg-sky-500" : "bg-slate-700",
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
