import {
  DeviceMetadata,
  RackState,
  SUOUpdate,
  MessageType,
} from "../../types/schema";

/**
 * Type guard to check if a value is a valid MessageType
 */
export const isValidMessageType = (value: string): value is MessageType => {
  return [
    "DEVICE_METADATA",
    "HEARTBEAT",
    "TEMP_HUM",
    "RFID_SNAPSHOT",
    "DOOR_STATE",
    "NOISE",
    "META_CHANGED_EVENT",
  ].includes(value);
};

/**
 * Validates the structure of a DeviceMetadata object
 */
export const validateDeviceMetadata = (data: any): data is DeviceMetadata => {
  return (
    data &&
    typeof data.deviceId === "string" &&
    typeof data.deviceType === "string" &&
    typeof data.ip === "string" &&
    typeof data.fwVer === "string" &&
    typeof data.isOnline === "boolean" &&
    Array.isArray(data.activeModules) &&
    data.activeModules.every(
      (module: any) =>
        typeof module.moduleIndex === "number" &&
        typeof module.moduleId === "string" &&
        typeof module.uTotal === "number",
    )
  );
};

/**
 * Validates the structure of a RackState object
 */
export const validateRackState = (data: any): data is RackState => {
  return (
    data &&
    typeof data.deviceId === "string" &&
    typeof data.moduleIndex === "number" &&
    typeof data.isOnline === "boolean" &&
    typeof data.lastSeen_hb === "string" &&
    Array.isArray(data.rfid_snapshot) &&
    Array.isArray(data.temp_hum) &&
    Array.isArray(data.noise_level) &&
    (data.doorState === null || typeof data.doorState === "number") &&
    (data.door1State === null || typeof data.door1State === "number") &&
    (data.door2State === null || typeof data.door2State === "number")
  );
};

/**
 * Validates the structure of a SUOUpdate object
 */
export const validateSUOUpdate = (data: any): data is SUOUpdate => {
  return (
    data &&
    typeof data.deviceId === "string" &&
    isValidMessageType(data.messageType) &&
    (data.moduleIndex === undefined || typeof data.moduleIndex === "number") &&
    data.payload !== undefined
  );
};

/**
 * Validates and parses a WebSocket message
 */
export const validateWebSocketMessage = (message: string): SUOUpdate | null => {
  try {
    const parsed = JSON.parse(message);
    if (validateSUOUpdate(parsed)) {
      return parsed;
    }
    console.error("Invalid WebSocket message structure:", parsed);
    return null;
  } catch (error) {
    console.error("Error parsing WebSocket message:", error);
    return null;
  }
};

/**
 * Validates an API response for device list
 */
export const validateDeviceListResponse = (data: any): DeviceMetadata[] => {
  if (!Array.isArray(data)) {
    console.error("Device list response is not an array");
    return [];
  }

  return data.filter(validateDeviceMetadata);
};

/**
 * Validates an API response for rack state
 */
export const validateRackStateResponse = (data: any): RackState | null => {
  if (validateRackState(data)) {
    return data;
  }

  console.error("Invalid rack state response:", data);
  return null;
};
