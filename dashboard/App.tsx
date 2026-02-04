import React, { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { DoorPanel } from "./components/rack/DoorPanel";
import { RackStrip } from "./components/rack/RackStrip";
import { EnvList } from "./components/rack/EnvList";
import { useIoTStore } from "./store/useIoTStore";
import { useSocket } from "./hooks/useSocket";
import { getDevices, getRackState } from "./src/api/endpoints";
import { FullPageLoader } from "./components/ui/LoadingIndicator";
import {
  DeviceListSkeleton,
  RackViewSkeleton,
} from "./components/ui/SkeletonLoader";
import { Loader2, MonitorOff, Activity, Maximize2 } from "lucide-react";
import { cn } from "./utils/cn";

const App: React.FC = () => {
  const {
    activeDeviceId,
    activeModuleIndex,
    activeRack,
    deviceList,
    isNocMode,
    setDeviceList,
    setActiveRack,
    setActiveSelection,
  } = useIoTStore();

  const [loading, setLoading] = useState(true);

  useSocket();

  useEffect(() => {
    const init = async () => {
      try {
        const devices = await getDevices();
        setDeviceList(devices);
        if (devices.length > 0) {
          setActiveSelection(
            devices[0].deviceId,
            devices[0].activeModules[0].moduleIndex,
          );
        }
      } catch (err) {
        console.error("Initialization failed", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [setDeviceList, setActiveSelection]);

  useEffect(() => {
    if (activeDeviceId && activeModuleIndex !== null) {
      const fetchDetail = async () => {
        const state = await getRackState(activeDeviceId, activeModuleIndex);
        setActiveRack(state);
      };
      fetchDetail();
    }
  }, [activeDeviceId, activeModuleIndex, setActiveRack]);

  if (loading) {
    return <FullPageLoader text="Digital Twin Initializing..." />;
  }

  const activeDeviceMeta = deviceList.find(
    (d) => d.deviceId === activeDeviceId,
  );
  const uTotal =
    activeDeviceMeta?.activeModules.find(
      (m) => m.moduleIndex === activeModuleIndex,
    )?.uTotal || 42;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-500">
        <TopBar />

        {activeRack ? (
          <div
            className={cn(
              "flex-1 p-6 gap-6 overflow-hidden transition-all duration-500",
              isNocMode
                ? "grid grid-cols-1 max-w-4xl mx-auto w-full"
                : "grid grid-cols-1 lg:grid-cols-[320px_1fr_320px]",
            )}
          >
            {/* Zone A: Security */}
            {!isNocMode && (
              <section className="glass-panel overflow-y-auto animate-in fade-in slide-in-from-left duration-500">
                <DoorPanel
                  doorState={activeRack.doorState}
                  door1State={activeRack.door1State}
                  door2State={activeRack.door2State}
                />
              </section>
            )}

            {/* Zone B: Rack Visualizer - Center Stage */}
            <section
              className={cn(
                "glass-panel flex flex-col overflow-hidden relative transition-all duration-500",
                isNocMode &&
                  "ring-2 ring-sky-500/20 shadow-[0_0_50px_rgba(14,165,233,0.1)]",
              )}
            >
              <div className="absolute top-0 right-0 p-4 z-20">
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/80 rounded-full border border-slate-800 backdrop-blur-sm shadow-xl">
                  {isNocMode ? (
                    <Maximize2 className="w-3 h-3 text-sky-400" />
                  ) : (
                    <Activity className="w-3 h-3 text-emerald-400" />
                  )}
                  <span className="text-[10px] font-black text-slate-200 tracking-widest uppercase">
                    {isNocMode ? "NOC FOCUS" : "LIVE TWIN"}
                  </span>
                </div>
              </div>
              <RackStrip uTotal={uTotal} rfidData={activeRack.rfidSnapshot || activeRack.rfid_snapshot || []} />
            </section>

            {/* Zone C: Environment */}
            {!isNocMode && (
              <section className="glass-panel overflow-y-auto animate-in fade-in slide-in-from-right duration-500">
                <EnvList
                  tempHum={activeRack.tempHum || activeRack.temp_hum || []}
                  noise={activeRack.noiseLevel || activeRack.noise_level || []}
                />
              </section>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
            <MonitorOff className="w-16 h-16 opacity-20" />
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-400">
                No Active Stream
              </h2>
              <p className="text-sm max-w-xs">
                Select a device and module from the sidebar to initialize the
                digital twin visualization.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
