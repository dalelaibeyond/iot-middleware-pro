import { useState } from 'react';
import { ChevronDown, Server, Wifi, WifiOff } from 'lucide-react';
import { useIoTStore } from '../../store/useIoTStore';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import type { DeviceWithStatus } from '../../types/schema';

interface DeviceItemProps {
  device: DeviceWithStatus;
  isSelected: boolean;
  onClick: () => void;
}

function DeviceItem({ device, isSelected, onClick }: DeviceItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          onClick();
        }}
        className={cn(
          'w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors',
          isSelected && 'bg-blue-50 border-l-4 border-blue-500'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {device.isOnline ? (
              <Wifi size={16} className="text-green-500" />
            ) : (
              <WifiOff size={16} className="text-gray-400" />
            )}
            <span className="font-medium text-gray-900">{device.deviceId}</span>
          </div>
        </div>
        {device.activeModules && device.activeModules.length > 0 && (
          <ChevronDown
            size={16}
            className={cn('transition-transform', isExpanded && 'rotate-180')}
          />
        )}
      </button>

      {isExpanded && device.activeModules && (
        <div className="bg-gray-50 px-3 pb-2">
          {device.activeModules.map((module) => (
            <button
              key={module.moduleIndex}
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="w-full flex items-center justify-between p-2 text-sm hover:bg-gray-100 rounded transition-colors"
            >
              <span className="text-gray-700">Module {module.moduleIndex}</span>
              <Badge variant="info">{module.uTotal}U</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const deviceList = useIoTStore((state) => state.deviceList);
  const selectedDeviceId = useIoTStore((state) => state.selectedDeviceId);
  const setSelectedDevice = useIoTStore((state) => state.setSelectedDevice);

  const handleDeviceClick = (device: DeviceWithStatus) => {
    const firstModule = device.activeModules?.[0];
    if (firstModule) {
      setSelectedDevice(device.deviceId, firstModule.moduleIndex);
    }
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Server size={20} className="text-blue-600" />
          <h2 className="font-semibold text-gray-900">Devices</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {deviceList.length} device{deviceList.length !== 1 ? 's' : ''} connected
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {deviceList.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No devices available
          </div>
        ) : (
          deviceList.map((device) => (
            <DeviceItem
              key={device.deviceId}
              device={device}
              isSelected={device.deviceId === selectedDeviceId}
              onClick={() => handleDeviceClick(device)}
            />
          ))
        )}
      </div>
    </div>
  );
}
