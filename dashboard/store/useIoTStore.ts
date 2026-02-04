import { create } from "zustand";
import { DeviceMetadata, RackState, SUOUpdate } from "../types/schema";

interface IoTStore {
  deviceList: DeviceMetadata[];
  activeRack: RackState | null;
  activeDeviceId: string | null;
  activeModuleIndex: number | null;
  socketConnected: boolean;
  isNocMode: boolean;

  // Actions
  setDeviceList: (devices: DeviceMetadata[]) => void;
  setActiveSelection: (deviceId: string, moduleIndex: number) => void;
  setActiveRack: (rack: RackState) => void;
  setSocketConnected: (connected: boolean) => void;
  toggleNocMode: () => void;
  mergeUpdate: (suo: SUOUpdate) => void;
}

export const useIoTStore = create<IoTStore>((set, get) => ({
  deviceList: [],
  activeRack: null,
  activeDeviceId: null,
  activeModuleIndex: null,
  socketConnected: false,
  isNocMode: false,

  setDeviceList: (devices) => set({ deviceList: devices }),

  setActiveSelection: (deviceId, moduleIndex) =>
    set({
      activeDeviceId: deviceId,
      activeModuleIndex: moduleIndex,
    }),

  setActiveRack: (rack) => set({ activeRack: rack }),

  setSocketConnected: (connected) => set({ socketConnected: connected }),

  toggleNocMode: () => set((state) => ({ isNocMode: !state.isNocMode })),

  mergeUpdate: (suo) => {
    const { deviceList, activeRack, activeDeviceId, activeModuleIndex } = get();

    // Branch 1: Metadata Update (Global)
    if (
      suo.messageType === "DEVICE_METADATA" ||
      suo.messageType === "HEARTBEAT"
    ) {
      const updatedList = deviceList.map((d) => {
        if (d.deviceId === suo.deviceId) {
          return {
            ...d,
            ...suo.payload,
            isOnline: suo.messageType === "HEARTBEAT" ? true : d.isOnline,
          };
        }
        return d;
      });
      set({ deviceList: updatedList });
    }

    // Branch 2: Rack Update (Context-Aware)
    if (
      suo.deviceId !== activeDeviceId ||
      (suo.moduleIndex !== undefined && suo.moduleIndex !== activeModuleIndex)
    ) {
      return; // Ignore if not currently viewed
    }

    if (!activeRack) return;

    let newRack = { ...activeRack };

    switch (suo.messageType) {
      case "TEMP_HUM":
        newRack.temp_hum = newRack.temp_hum.map((th) =>
          th.sensorIndex === suo.payload.sensorIndex
            ? { ...th, ...suo.payload }
            : th,
        );
        break;
      case "HEARTBEAT":
        newRack.isOnline = true;
        newRack.lastSeen_hb = new Date().toISOString();
        break;
      case "RFID_SNAPSHOT":
        newRack.rfid_snapshot = suo.payload; // Usually full array update
        break;
      case "DOOR_STATE":
        if (suo.payload.door1State !== undefined)
          newRack.door1State = suo.payload.door1State;
        if (suo.payload.door2State !== undefined)
          newRack.door2State = suo.payload.door2State;
        if (suo.payload.doorState !== undefined)
          newRack.doorState = suo.payload.doorState;
        break;
      case "NOISE":
        newRack.noise_level = newRack.noise_level.map((n) =>
          n.sensorIndex === suo.payload.sensorIndex
            ? { ...n, ...suo.payload }
            : n,
        );
        break;
      case "META_CHANGED_EVENT":
        // This is a notification that metadata has changed
        // We could trigger a toast notification here
        console.log("Metadata changed event received:", suo.payload);
        break;
    }

    set({ activeRack: newRack });
  },
}));
