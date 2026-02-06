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
    // Normalize types to handle string/number mismatch (e.g., from URL params vs WebSocket)
    const suoDeviceId = String(suo.deviceId);
    const storeDeviceId = activeDeviceId ? String(activeDeviceId) : null;
    const suoModuleIndex = suo.moduleIndex !== undefined ? Number(suo.moduleIndex) : undefined;
    const storeModuleIndex = activeModuleIndex !== null ? Number(activeModuleIndex) : null;

    // Debug logging to diagnose update issues
    console.log("[mergeUpdate] Context check:", {
      suoDeviceId,
      storeDeviceId,
      suoModuleIndex,
      storeModuleIndex,
      deviceMatch: suoDeviceId === storeDeviceId,
      moduleMatch: suoModuleIndex === storeModuleIndex,
    });

    if (
      suoDeviceId !== storeDeviceId ||
      (suoModuleIndex !== undefined && suoModuleIndex !== storeModuleIndex)
    ) {
      console.log("[mergeUpdate] Ignored - context mismatch");
      return; // Ignore if not currently viewed
    }

    if (!activeRack) return;

    let newRack = { ...activeRack };

    switch (suo.messageType) {
      case "TEMP_HUM":
      case "QRY_TEMP_HUM_RESP":
        // Backend sends payload as array of all temp/hum readings
        if (Array.isArray(suo.payload)) {
          newRack.temp_hum = suo.payload;
          newRack.tempHum = suo.payload;
        }
        break;
      case "HEARTBEAT":
        newRack.isOnline = true;
        newRack.lastSeen_hb = new Date().toISOString();
        newRack.lastSeenHb = newRack.lastSeen_hb;
        break;
      case "RFID_SNAPSHOT":
      case "RFID_EVENT":
        // Update both snake_case and camelCase field names for consistency
        // RFID_SNAPSHOT: Full array replacement | RFID_EVENT: Single tag update
        if (Array.isArray(suo.payload)) {
          // Full snapshot replacement
          newRack.rfid_snapshot = suo.payload;
          newRack.rfidSnapshot = suo.payload;
        } else if (suo.payload && typeof suo.payload === 'object') {
          // Single RFID event - merge into existing array
          const currentRfid = newRack.rfidSnapshot || newRack.rfid_snapshot || [];
          const updatedRfid = currentRfid.map((tag) =>
            tag.sensorIndex === suo.payload.sensorIndex
              ? { ...tag, ...suo.payload }
              : tag,
          );
          newRack.rfid_snapshot = updatedRfid;
          newRack.rfidSnapshot = updatedRfid;
        }
        break;
      case "DOOR_STATE":
        // Backend sends payload as array: [{doorState, door1State, door2State}]
        // Extract the first element from the array
        const doorData = Array.isArray(suo.payload) ? suo.payload[0] : suo.payload;
        
        console.log("[mergeUpdate] DOOR_STATE payload:", suo.payload);
        console.log("[mergeUpdate] Extracted doorData:", doorData);
        console.log("[mergeUpdate] Current rack door states:", {
          doorState: newRack.doorState,
          door1State: newRack.door1State,
          door2State: newRack.door2State,
        });
        
        if (doorData && doorData.door1State !== undefined) {
          newRack.door1State = doorData.door1State;
          console.log("[mergeUpdate] Updated door1State:", doorData.door1State);
        }
        if (doorData && doorData.door2State !== undefined) {
          newRack.door2State = doorData.door2State;
          console.log("[mergeUpdate] Updated door2State:", doorData.door2State);
        }
        if (doorData && doorData.doorState !== undefined) {
          newRack.doorState = doorData.doorState;
          console.log("[mergeUpdate] Updated doorState:", doorData.doorState);
        }
        break;
      case "NOISE":
      case "NOISE_LEVEL":
        // Backend sends payload as array of all noise readings
        if (Array.isArray(suo.payload)) {
          newRack.noise_level = suo.payload;
          newRack.noiseLevel = suo.payload;
        }
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
