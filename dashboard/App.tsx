import React, { useEffect, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { DoorPanel } from "./components/rack/DoorPanel";
import { RackStrip } from "./components/rack/RackStrip";
import { EnvList } from "./components/rack/EnvList";
import { useIoTStore } from "./store/useIoTStore";
import { useSocket } from "./hooks/useSocket";
import { getTopology, getRackState } from "./src/api/endpoints";
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
        const devices = await getTopology();
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
        try {
          const state = await getRackState(activeDeviceId, activeModuleIndex);
          setActiveRack(state);
        } catch (err) {
          console.error("Failed to fetch rack state:", err);
          setActiveRack(null); // Clear rack state on error
        }
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
    <div className="app-root">
      <Sidebar />

      <main className="app-main">
        <TopBar />

        {activeRack ? (
          <div
            className={cn(
              "app-grid",
              isNocMode && "app-grid-noc"
            )}
          >
            {/* Zone A: Security */}
            {!isNocMode && (
              <section className="app-zone-section animate-in fade-in slide-in-from-left duration-500">
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
                "app-rack-section",
                isNocMode && "app-rack-noc"
              )}
            >
              <div className="app-badge">
                <div className="app-badge-inner">
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
              <section className="app-zone-section animate-in fade-in slide-in-from-right duration-500">
                <EnvList
                  tempHum={activeRack.tempHum || activeRack.temp_hum || []}
                  noise={activeRack.noiseLevel || activeRack.noise_level || []}
                />
              </section>
            )}
          </div>
        ) : (
          <div className="app-empty-state">
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
