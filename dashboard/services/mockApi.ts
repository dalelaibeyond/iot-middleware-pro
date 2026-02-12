
import { DeviceMetadata, RackState } from '../types/schema';

const MOCK_DEVICES: DeviceMetadata[] = [
  {
    deviceId: 'DC01-RACK-08',
    deviceType: 'V6800-IoT',
    ip: '192.168.1.108',
    fwVer: 'v2.4.1-stable',
    isOnline: true,
    activeModules: [
      { moduleIndex: 0, moduleId: 'R08-A', uTotal: 42 },
      { moduleIndex: 1, moduleId: 'R08-B', uTotal: 42 }
    ]
  },
  {
    deviceId: 'DC01-RACK-09',
    deviceType: 'V5008-Edge',
    ip: '192.168.1.109',
    fwVer: 'v1.9.0-rc2',
    isOnline: false,
    activeModules: [
      { moduleIndex: 0, moduleId: 'E09-P', uTotal: 24 }
    ]
  }
];

export const mockApi = {
  getDevices: async (): Promise<DeviceMetadata[]> => {
    await new Promise(r => setTimeout(r, 500));
    return MOCK_DEVICES;
  },

  getRackState: async (deviceId: string, moduleIndex: number): Promise<RackState> => {
    await new Promise(r => setTimeout(r, 300));
    const device = MOCK_DEVICES.find(d => d.deviceId === deviceId);
    const uTotal = device?.activeModules.find(m => m.moduleIndex === moduleIndex)?.uTotal || 42;

    return {
      deviceId,
      moduleIndex,
      isOnline: device?.isOnline || false,
      lastSeenHb: new Date().toISOString(),
      rfidSnapshot: Array.from({ length: 5 }, (_, i) => ({
        sensorIndex: i * 5 + 2,
        tagId: `TAG-${Math.random().toString(36).substring(7).toUpperCase()}`,
        isAlarm: Math.random() > 0.9
      })),
      // Updated to generate 6 zones as requested
      tempHum: Array.from({ length: 6 }, (_, i) => ({
        sensorIndex: i,
        temp: 22 + Math.random() * 5,
        hum: 45 + Math.random() * 10
      })),
      noiseLevel: [
        { sensorIndex: 0, noise: 45 + Math.random() * 20 }
      ],
      doorState: device?.deviceType === 'V5008-Edge' ? 0 : null,
      door1State: device?.deviceType === 'V6800-IoT' ? 0 : null,
      door2State: device?.deviceType === 'V6800-IoT' ? 0 : null,
    };
  }
};
