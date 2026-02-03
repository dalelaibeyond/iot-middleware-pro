import { useIoTStore } from '../../store/useIoTStore';
import { Badge } from '../ui/Badge';
import { Wifi, WifiOff, Server } from 'lucide-react';

export function TopBar() {
  const isConnected = useIoTStore((state) => state.isConnected);
  const deviceList = useIoTStore((state) => state.deviceList);
  const selectedDeviceId = useIoTStore((state) => state.selectedDeviceId);
  const selectedModuleIndex = useIoTStore((state) => state.selectedModuleIndex);

  const selectedDevice = deviceList.find((d) => d.deviceId === selectedDeviceId);
  const selectedModule = selectedDevice?.activeModules?.find(
    (m) => m.moduleIndex === selectedModuleIndex
  );

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Left: Breadcrumbs and Device Info */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Server size={16} />
          <span className="font-medium text-gray-900">
            {selectedDeviceId || 'No Device Selected'}
          </span>
          {selectedDevice && (
            <>
              <span>/</span>
              <span className="font-medium text-gray-900">
                Module {selectedModuleIndex}
              </span>
            </>
          )}
        </div>

        {selectedDevice && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-gray-600">
              <span className="font-medium">IP:</span>
              <span>{selectedDevice.ip}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <span className="font-medium">FW:</span>
              <span>{selectedDevice.fwVer}</span>
            </div>
            {selectedModule && (
              <div className="flex items-center gap-1 text-gray-600">
                <span className="font-medium">Size:</span>
                <span>{selectedModule.uTotal}U</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Connection Status */}
      <div className="flex items-center gap-3">
        {isConnected ? (
          <Badge variant="success" className="gap-1">
            <Wifi size={14} />
            Live
          </Badge>
        ) : (
          <Badge variant="danger" className="gap-1">
            <WifiOff size={14} />
            Disconnected
          </Badge>
        )}
      </div>
    </div>
  );
}
