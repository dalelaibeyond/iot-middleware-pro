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
      const existingDeviceIndex = deviceList.findIndex(
        (d) => d.deviceId === suo.deviceId
      );

      let updatedList;
      if (existingDeviceIndex >= 0) {
        // Update existing device
        updatedList = deviceList.map((d) => {
          if (d.deviceId === suo.deviceId) {
            let updatedModules = d.activeModules;
            
            if (suo.messageType === "DEVICE_METADATA") {
              // DEVICE_METADATA: payload is the complete activeModules array
              if (Array.isArray(suo.payload)) {
                updatedModules = suo.payload;
              }
            } else if (
              suo.messageType === "HEARTBEAT" &&
              suo.moduleIndex !== undefined
            ) {
              // HEARTBEAT: module info is at root level, payload may contain moduleId/uTotal
              const hbModuleId = suo.payload?.moduleId;
              const hbUTotal = suo.payload?.uTotal;
              const moduleIdx = d.activeModules.findIndex(
                (m) => m.moduleIndex === suo.moduleIndex
              );
              
              if (moduleIdx >= 0) {
                // Update existing module
                updatedModules = d.activeModules.map((m) =>
                  m.moduleIndex === suo.moduleIndex
                    ? {
                        ...m,
                        ...(hbModuleId && { moduleId: String(hbModuleId) }),
                        ...(hbUTotal !== undefined && { uTotal: Number(hbUTotal) }),
                      }
                    : m
                );
              } else {
                // Add new module from HEARTBEAT
                updatedModules = [
                  ...d.activeModules,
                  {
                    moduleIndex: suo.moduleIndex,
                    moduleId: hbModuleId ? String(hbModuleId) : "",
                    fwVer: null,
                    uTotal: hbUTotal !== undefined ? Number(hbUTotal) : 0,
                  },
                ];
              }
            }

            return {
              ...d,
              deviceType: suo.deviceType || d.deviceType,
              ip: suo.ip !== undefined ? suo.ip : d.ip,
              mac: suo.mac !== undefined ? suo.mac : d.mac,
              fwVer: suo.fwVer !== undefined ? suo.fwVer : d.fwVer,
              mask: suo.mask !== undefined ? suo.mask : d.mask,
              gwIp: suo.gwIp !== undefined ? suo.gwIp : d.gwIp,
              activeModules: updatedModules,
              isOnline: suo.messageType === "HEARTBEAT" ? true : d.isOnline,
            };
          }
          return d;
        });
      } else {
        // Add new device to the list
        const newDevice: DeviceMetadata = {
          deviceId: String(suo.deviceId),
          deviceType: suo.deviceType || "V5008",
          ip: suo.ip || null,
          mac: suo.mac || null,
          fwVer: suo.fwVer || null,
          mask: suo.mask || null,
          gwIp: suo.gwIp || null,
          isOnline: suo.messageType === "HEARTBEAT",
          activeModules: Array.isArray(suo.payload) ? suo.payload : [],
        };
        updatedList = [...deviceList, newDevice];
      }
      set({ deviceList: updatedList });
    }

    // Branch 2: Rack Update (Context-Aware)
    // Normalize types to handle string/number mismatch (e.g., from URL params vs WebSocket)
    const suoDeviceId = String(suo.deviceId);
    const storeDeviceId = activeDeviceId ? String(activeDeviceId) : null;
    const suoModuleIndex = suo.moduleIndex !== undefined ? Number(suo.moduleIndex) : undefined;
    const storeModuleIndex = activeModuleIndex !== null ? Number(activeModuleIndex) : null;

    if (
      suoDeviceId !== storeDeviceId ||
      (suoModuleIndex !== undefined && suoModuleIndex !== storeModuleIndex)
    ) {
      return; // Ignore if not currently viewed
    }

    // If no activeRack exists, create a minimal one for this device/module
    let newRack;
    if (!activeRack) {
      newRack = {
        deviceId: suoDeviceId,
        moduleIndex: suoModuleIndex || 0,
        isOnline: true,
        rfid_snapshot: [],
        rfidSnapshot: [],
        temp_hum: [],
        tempHum: [],
        noise_level: [],
        noiseLevel: [],
        doorState: null,
        door1State: null,
        door2State: null,
      };
    } else {
      newRack = { ...activeRack };
    }

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
        
        if (doorData && doorData.door1State !== undefined) {
          newRack.door1State = doorData.door1State;
        }
        if (doorData && doorData.door2State !== undefined) {
          newRack.door2State = doorData.door2State;
        }
        if (doorData && doorData.doorState !== undefined) {
          newRack.doorState = doorData.doorState;
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
        // Metadata change notification - refresh device metadata from backend
        // The payload contains change descriptions we could show in a toast
        // For now, we just log it - the next DEVICE_METADATA will update the UI
        console.log("[Dashboard] Metadata changed:", suo.payload);
        break;
    }

    set({ activeRack: newRack });
  },
}));
