import { useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useIoTStore } from './store/useIoTStore';
import { api } from './api/endpoints';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/Card';
import { DoorPanel } from './components/rack/DoorPanel';
import { RackStrip } from './components/rack/RackStrip';
import { EnvList } from './components/rack/EnvList';

function App() {
  useSocket();
  const setDeviceList = useIoTStore((state) => state.setDeviceList);
  const activeRack = useIoTStore((state) => state.activeRack);
  const selectedDeviceId = useIoTStore((state) => state.selectedDeviceId);
  const selectedModuleIndex = useIoTStore((state) => state.selectedModuleIndex);
  const deviceList = useIoTStore((state) => state.deviceList);

  // Fetch initial device list on mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devices = await api.getDevices();
        setDeviceList(devices);
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      }
    };

    fetchDevices();
  }, [setDeviceList]);

  // Fetch rack state when device/module is selected
  useEffect(() => {
    const fetchRackState = async () => {
      if (selectedDeviceId && selectedModuleIndex !== null) {
        try {
          const rackState = await api.getRackState(selectedDeviceId, selectedModuleIndex);
          useIoTStore.getState().setActiveRack(rackState);
        } catch (error) {
          console.error('Failed to fetch rack state:', error);
        }
      }
    };

    fetchRackState();
  }, [selectedDeviceId, selectedModuleIndex]);

  const selectedDevice = deviceList.find((d) => d.deviceId === selectedDeviceId);
  const selectedModule = selectedDevice?.activeModules?.find(
    (m) => m.moduleIndex === selectedModuleIndex
  );
  const uTotal = selectedModule?.uTotal || 42;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Panel */}
        <main className="flex-1 overflow-auto p-6">
          {activeRack ? (
            <div className="grid grid-cols-3 gap-6 h-full">
              {/* Zone A: Security (Left) */}
              <div>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Security</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DoorPanel
                      doorState={activeRack.doorState}
                      door1State={activeRack.door1State}
                      door2State={activeRack.door2State}
                      className="py-8"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Zone B: Rack Visualizer (Center) */}
              <div>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Rack View</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RackStrip
                      uTotal={uTotal}
                      rfidData={activeRack.rfid_snapshot}
                      className="overflow-y-auto max-h-[calc(100vh-200px)]"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Zone C: Environment Monitor (Right) */}
              <div>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Environment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EnvList
                      tempHumData={activeRack.temp_hum}
                      noiseData={activeRack.noise_level}
                      className="overflow-y-auto max-h-[calc(100vh-200px)]"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-lg font-medium">No rack selected</p>
                <p className="text-sm mt-2">Select a device and module from the sidebar to view rack details</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
