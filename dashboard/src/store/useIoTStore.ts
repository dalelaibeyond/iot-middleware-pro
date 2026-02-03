import { create } from 'zustand';
import type { DeviceMetadata, RackState, UnifiedSensorObject, DeviceWithStatus } from '../types/schema';

interface IoTStore {
  // State
  deviceList: DeviceWithStatus[];
  activeRack: RackState | null;
  isConnected: boolean;
  selectedDeviceId: string | null;
  selectedModuleIndex: number | null;

  // Actions
  setDeviceList: (devices: DeviceMetadata[]) => void;
  setActiveRack: (rack: RackState) => void;
  setSelectedDevice: (deviceId: string, moduleIndex: number) => void;
  setConnected: (connected: boolean) => void;
  mergeUpdate: (suo: UnifiedSensorObject) => void;
  clearActiveRack: () => void;
}

const createDefaultRackState = (deviceId: string, moduleIndex: number): RackState => ({
  deviceId,
  moduleIndex,
  isOnline: false,
  lastSeen_hb: '',
  rfid_snapshot: [],
  temp_hum: [],
  noise_level: [],
  doorState: null,
  door1State: null,
  door2State: null,
});

export const useIoTStore = create<IoTStore>((set, get) => ({
  // Initial State
  deviceList: [],
  activeRack: null,
  isConnected: false,
  selectedDeviceId: null,
  selectedModuleIndex: null,

  // Actions
  setDeviceList: (devices: DeviceMetadata[]) => {
    const devicesWithStatus: DeviceWithStatus[] = devices.map(device => ({
      ...device,
      isOnline: false,
      lastSeen: '',
    }));
    set({ deviceList: devicesWithStatus });
  },

  setActiveRack: (rack: RackState) => {
    set({ activeRack: rack });
  },

  setSelectedDevice: (deviceId: string, moduleIndex: number) => {
    set({ 
      selectedDeviceId: deviceId, 
      selectedModuleIndex: moduleIndex,
      activeRack: createDefaultRackState(deviceId, moduleIndex),
    });
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  clearActiveRack: () => {
    set({ activeRack: null, selectedDeviceId: null, selectedModuleIndex: null });
  },

  mergeUpdate: (suo: UnifiedSensorObject) => {
    const state = get();
    
    // Branch 1: Metadata Update (Global)
    if (suo.messageType === 'DEVICE_METADATA' || suo.messageType === 'HEARTBEAT') {
      set((state) => ({
        deviceList: state.deviceList.map(device => {
          if (device.deviceId === suo.deviceId) {
            const updatedDevice = { ...device };
            
            if (suo.messageType === 'HEARTBEAT') {
              updatedDevice.isOnline = true;
              updatedDevice.lastSeen = suo.timestamp;
            }
            
            if (suo.messageType === 'DEVICE_METADATA' && suo.data) {
              if (suo.data.ip) updatedDevice.ip = suo.data.ip;
              if (suo.data.fwVer) updatedDevice.fwVer = suo.data.fwVer;
              if (suo.data.activeModules) updatedDevice.activeModules = suo.data.activeModules;
            }
            
            return updatedDevice;
          }
          return device;
        }),
      }));
    }

    // Branch 2: Rack Update (Context-Aware)
    // Guard: Only update if this message is for the currently selected device/module
    if (
      state.selectedDeviceId &&
      state.selectedModuleIndex !== null &&
      state.activeRack
    ) {
      if (
        suo.deviceId !== state.selectedDeviceId ||
        (suo.moduleIndex !== undefined && suo.moduleIndex !== state.selectedModuleIndex)
      ) {
        return; // Ignore messages for other devices/modules
      }

      set((state) => {
        if (!state.activeRack) return state;

        const updatedRack = { ...state.activeRack };

        // Handle different message types
        switch (suo.messageType) {
          case 'HEARTBEAT':
            updatedRack.isOnline = true;
            updatedRack.lastSeen_hb = suo.timestamp;
            break;

          case 'TEMP_HUM':
            if (suo.data) {
              const { sensorIndex, temp, hum } = suo.data;
              const existingIndex = updatedRack.temp_hum.findIndex(
                t => t.sensorIndex === sensorIndex
              );
              if (existingIndex >= 0) {
                updatedRack.temp_hum[existingIndex] = { sensorIndex, temp, hum };
              } else {
                updatedRack.temp_hum.push({ sensorIndex, temp, hum });
              }
            }
            break;

          case 'NOISE':
            if (suo.data) {
              const { sensorIndex, noise } = suo.data;
              const existingIndex = updatedRack.noise_level.findIndex(
                n => n.sensorIndex === sensorIndex
              );
              if (existingIndex >= 0) {
                updatedRack.noise_level[existingIndex] = { sensorIndex, noise };
              } else {
                updatedRack.noise_level.push({ sensorIndex, noise });
              }
            }
            break;

          case 'RFID_SNAPSHOT':
            if (suo.data && Array.isArray(suo.data)) {
              updatedRack.rfid_snapshot = suo.data.map((item: any) => ({
                sensorIndex: item.sensorIndex,
                tagId: item.tagId,
                isAlarm: item.isAlarm || false,
              }));
            }
            break;

          case 'DOOR_STATE':
            if (suo.data) {
              if (suo.data.doorState !== undefined) {
                updatedRack.doorState = suo.data.doorState;
              }
              if (suo.data.door1State !== undefined) {
                updatedRack.door1State = suo.data.door1State;
              }
              if (suo.data.door2State !== undefined) {
                updatedRack.door2State = suo.data.door2State;
              }
            }
            break;

          case 'RFID_TAG_DETECTED':
          case 'RFID_TAG_REMOVED':
            if (suo.data) {
              const { sensorIndex, tagId, isAlarm } = suo.data;
              const existingIndex = updatedRack.rfid_snapshot.findIndex(
                r => r.sensorIndex === sensorIndex
              );
              if (existingIndex >= 0) {
                if (suo.messageType === 'RFID_TAG_REMOVED') {
                  updatedRack.rfid_snapshot.splice(existingIndex, 1);
                } else {
                  updatedRack.rfid_snapshot[existingIndex] = { sensorIndex, tagId, isAlarm };
                }
              } else if (suo.messageType === 'RFID_TAG_DETECTED') {
                updatedRack.rfid_snapshot.push({ sensorIndex, tagId, isAlarm });
              }
            }
            break;
        }

        return { activeRack: updatedRack };
      });
    }
  },
}));
