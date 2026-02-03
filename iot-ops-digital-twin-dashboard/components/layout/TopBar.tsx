
import React from 'react';
import { useIoTStore } from '../../store/useIoTStore';
import { Cpu, Globe, Hash, Zap, MonitorPlay, Layout } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

export const TopBar: React.FC = () => {
  const { deviceList, activeDeviceId, activeModuleIndex, socketConnected, isNocMode, toggleNocMode } = useIoTStore();
  const activeDevice = deviceList.find(d => d.deviceId === activeDeviceId);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="font-mono text-sky-400">{activeDeviceId ? `Dev-${activeDeviceId}` : 'Select Device'}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-100 font-medium">
            Mod {activeModuleIndex !== null ? `#${activeModuleIndex}` : '-'}
          </span>
        </div>

        {activeDevice && !isNocMode && (
          <div className="flex items-center gap-6 ml-8 text-xs text-slate-500 border-l border-slate-800 pl-8 transition-opacity duration-300">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>{activeDevice.ip}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>FW: {activeDevice.fwVer}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" />
              <span>{activeDevice.deviceType}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {!isNocMode && (
          <Badge variant={socketConnected ? 'success' : 'danger'} className="flex items-center gap-1.5 px-3">
            <Zap className={cn("w-3 h-3", socketConnected && "fill-current")} />
            {socketConnected ? 'LIVE FEED' : 'DISCONNECTED'}
          </Badge>
        )}

        <button 
          onClick={toggleNocMode}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all border",
            isNocMode 
              ? "bg-sky-500 text-white border-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.3)]" 
              : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
          )}
        >
          {isNocMode ? <Layout className="w-3.5 h-3.5" /> : <MonitorPlay className="w-3.5 h-3.5" />}
          {isNocMode ? 'EXIT NOC MODE' : 'ENTER NOC MODE'}
        </button>
      </div>
    </header>
  );
};
