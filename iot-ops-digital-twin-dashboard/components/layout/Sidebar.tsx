
import React, { useState } from 'react';
import { useIoTStore } from '../../store/useIoTStore';
import { Server, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { cn } from '../../utils/cn';

export const Sidebar: React.FC = () => {
  const { deviceList, activeDeviceId, activeModuleIndex, setActiveSelection, isNocMode } = useIoTStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (isNocMode) return null;

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-slate-800 flex items-center gap-2">
        <Server className="w-5 h-5 text-sky-400" />
        <h1 className="font-bold text-slate-100 tracking-tight">IoT Ops <span className="text-sky-500 text-xs font-normal">v1.2</span></h1>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        <p className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Center Map</p>
        
        {deviceList.map(device => (
          <div key={device.deviceId} className="space-y-1">
            <button
              onClick={() => toggleExpand(device.deviceId)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                activeDeviceId === device.deviceId ? "sidebar-item-active" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              {expanded[device.deviceId] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <div className="flex-1 text-left flex items-center gap-2">
                <Circle className={cn("w-2 h-2 fill-current", device.isOnline ? "text-emerald-500" : "text-slate-600")} />
                <span className="truncate font-mono">Dev-{device.deviceId}</span>
              </div>
            </button>

            {expanded[device.deviceId] && (
              <div className="ml-6 border-l border-slate-800 pl-2 space-y-1">
                {device.activeModules.map(module => (
                  <button
                    key={`${device.deviceId}-${module.moduleIndex}`}
                    onClick={() => setActiveSelection(device.deviceId, module.moduleIndex)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-md text-xs transition-all",
                      activeDeviceId === device.deviceId && activeModuleIndex === module.moduleIndex
                        ? "sidebar-subitem-active"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    Mod#{module.moduleIndex} ID#{module.moduleId}({module.uTotal}U)
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 bg-slate-950 mt-auto border-t border-slate-800">
        <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          SYSTEM LIVE
        </div>
        <div className="text-[10px] text-slate-600 font-mono">
          Last Check: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
