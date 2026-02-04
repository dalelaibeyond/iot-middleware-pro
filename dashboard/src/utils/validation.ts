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
 * Validates structure of a DeviceMetadata object
 * Supports both camelCase (dashboard) and snake_case (middleware) field names
 */
export const validateDeviceMetadata = (data: any): data is DeviceMetadata => {
  // Support both camelCase and snake_case field names
  const deviceId = data.deviceId || data.device_id;
  const deviceType = data.deviceType || data.device_type;
  const ip = data.ip || data.device_ip;
  const fwVer = data.fwVer || data.device_fwVer;
  const modules = data.activeModules || data.modules;

  return (
    data &&
    typeof deviceId === "string" &&
    typeof deviceType === "string" &&
    typeof ip === "string" &&
    // fwVer can be null for V6800 devices
    (fwVer === null || typeof fwVer === "string") &&
    // isOnline is optional in middleware response
    (data.isOnline === undefined || typeof data.isOnline === "boolean") &&
    Array.isArray(modules) &&
    modules.every(
      (module: any) =>
        typeof module.moduleIndex === "number" &&
        typeof module.moduleId === "string" &&
        typeof module.uTotal === "number",
    )
  );
};

/**
 * Validates structure of a RackState object
 * Supports both camelCase and snake_case field names
 */
export const validateRackState = (data: any): data is RackState => {
  // Add comprehensive logging for debugging
  console.log("validateRackState input:", JSON.stringify(data, null, 2));

  const checks = {
    deviceId: typeof data.deviceId === "string",
    moduleIndex: typeof data.moduleIndex === "number",
    isOnline: typeof data.isOnline === "boolean",
    lastSeenHb: data.lastSeenHb === undefined || data.lastSeenHb === null || typeof data.lastSeenHb === "string",
    lastSeen_hb: data.lastSeenHb === undefined || data.lastSeenHb === null || typeof data.lastSeenHb === "string",
    lastSeen_hb_camelCase: data.lastSeenHb === undefined || data.lastSeen_hb === null || typeof data.lastSeenHb === "string",
    rfidSnapshot: Array.isArray(data.rfidSnapshot) || Array.isArray(data.rfid_snapshot),
    rfidSnapshot_camelCase: Array.isArray(data.rfidSnapshot) || Array.isArray(data.rfid_snapshot),
    tempHum: Array.isArray(data.tempHum) || Array.isArray(data.temp_hum),
    tempHum_camelCase: Array.isArray(data.tempHum) || Array.isArray(data.temp_hum),
    noiseLevel: Array.isArray(data.noiseLevel) || Array.isArray(data.noise_level),
    noiseLevel_camelCase: Array.isArray(data.noiseLevel) || Array.isArray(data.noise_level),
    doorState: data.doorState === null || typeof data.doorState === "number",
    door1State: data.door1State === null || typeof data.door1State === "number",
    door2State: data.door2State === null || typeof data.door2State === "number",
  };

  console.log("validateRackState checks:", checks);

  const result = (
    data &&
    typeof data.deviceId === "string" &&
    typeof data.moduleIndex === "number" &&
    typeof data.isOnline === "boolean" &&
    // Support both camelCase and snake_case field names
    // camelCase: lastSeenHb, tempHum, noiseLevel, rfidSnapshot, lastSeenTh, lastSeenNs, lastSeenRfid, lastSeenDoor, uTotal
    // snake_case: lastSeen_hb, temp_hum, noise_level, rfid_snapshot, lastSeen_th, lastSeen_ns, lastSeen_rfid, lastSeen_door
    (data.lastSeenHb === undefined || data.lastSeenHb === null || typeof data.lastSeenHb === "string") &&
    (data.lastSeen_hb === undefined || data.lastSeenHb === null || typeof data.lastSeenHb === "string") &&
    // Arrays can be empty - support both naming conventions
    (Array.isArray(data.rfidSnapshot) || Array.isArray(data.rfid_snapshot)) &&
    (Array.isArray(data.tempHum) || Array.isArray(data.temp_hum)) &&
    (Array.isArray(data.noiseLevel) || Array.isArray(data.noise_level)) &&
    // Door states can be null - support both naming conventions
    (data.doorState === null || typeof data.doorState === "number") &&
    (data.door1State === null || typeof data.door1State === "number") &&
    (data.door2State === null || typeof data.door2State === "number")
  );

  console.log("validateRackState result:", result);

  return result;
};

/**
 * Validates structure of a SUOUpdate object
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
 * Supports both middleware format and dashboard format
 */
export const validateWebSocketMessage = (message: string): SUOUpdate | null => {
  try {
    const parsed = JSON.parse(message);

    // Handle middleware WebSocket server message format
    // Middleware sends: {type: "data", data: {messageType, deviceId, ...}}
    // Dashboard expects: {messageType, deviceId, ...}
    if (parsed.type === "data" && parsed.data) {
      // Extract the data payload from middleware message format
      const data = parsed.data;
      if (validateSUOUpdate(data)) {
        return data;
      }
      console.error("Invalid WebSocket data payload:", data);
      return null;
    }

    // Handle direct dashboard format (for compatibility)
    if (validateSUOUpdate(parsed)) {
      return parsed;
    }

    // Ignore middleware control messages (connected, ready, command_ack, etc.)
    if (parsed.type === "connected" || parsed.type === "ready" || parsed.type === "command_ack") {
      return null; // These are control messages, not data updates
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
