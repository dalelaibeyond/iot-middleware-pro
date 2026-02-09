import apiClient from "./client";
import { DeviceMetadata, RackState } from "../../types/schema";
import {
  validateDeviceListResponse,
  validateRackStateResponse,
} from "../utils/validation";

/**
 * API endpoint functions for interacting with the IoT Middleware
 * Updated for API Spec v1.2 (10-api_spec.md)
 */

/**
 * Transform snake_case object keys to camelCase
 * Uses specific field name mappings for compatibility with dashboard
 */
function toCamelCase<T>(obj: any): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item)) as any;
  }

  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Use specific field name mappings for dashboard compatibility
      let camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

      // Apply specific field name mappings
      const fieldMappings: Record<string, string> = {
        device_id: "deviceId",
        device_type: "deviceType",
        device_ip: "ip",
        device_mac: "mac",
        device_fwVer: "fwVer",
        device_mask: "mask",
        device_gwIp: "gwIp",
        modules: "activeModules",
        // Rack state field mappings
        rfid_snapshot: "rfidSnapshot",
        temp_hum: "tempHum",
        noise_level: "noiseLevel",
        last_seen_hb: "lastSeenHb",
        last_seen_th: "lastSeenTh",
        last_seen_ns: "lastSeenNs",
        last_seen_rfid: "lastSeenRfid",
        last_seen_door: "lastSeenDoor",
      };

      if (fieldMappings[key]) {
        camelKey = fieldMappings[key];
      }

      result[camelKey] = toCamelCase(obj[key]);
    }
  }
  return result;
}

// ============================================================================
// Group A: Management API (Hot Path)
// ============================================================================

/**
 * Fetches the topology of all devices and their modules
 * NEW in API v1.2: Replaces getDevices()
 * @returns Promise<DeviceMetadata[]> - Array of device metadata with online status
 */
export const getTopology = async (): Promise<DeviceMetadata[]> => {
  const response = await apiClient.get<any[]>("/api/live/topology");
  // Transform snake_case to camelCase
  const camelCaseData = toCamelCase<any[]>(response.data);
  return validateDeviceListResponse(camelCaseData);
};

/**
 * Fetches the state of a specific rack (device module)
 * NEW in API v1.2: Updated endpoint path
 * @param deviceId - The ID of the device
 * @param moduleIndex - The index of the module/rack
 * @returns Promise<RackState> - The current state of the rack
 */
export const getRackState = async (
  deviceId: string,
  moduleIndex: number,
): Promise<RackState> => {
  const response = await apiClient.get<any>(
    `/api/live/devices/${deviceId}/modules/${moduleIndex}`,
  );
  // Transform snake_case to camelCase
  const camelCaseData = toCamelCase<any>(response.data);
  
  // Provide defaults for missing fields to ensure complete RackState
  const completeData = {
    deviceId: camelCaseData.deviceId || deviceId,
    moduleIndex: camelCaseData.moduleIndex ?? moduleIndex,
    isOnline: camelCaseData.isOnline ?? true,
    // Sensor arrays with defaults
    rfidSnapshot: camelCaseData.rfidSnapshot || camelCaseData.rfid_snapshot || [],
    tempHum: camelCaseData.tempHum || camelCaseData.temp_hum || [],
    noiseLevel: camelCaseData.noiseLevel || camelCaseData.noise_level || [],
    // Door states
    doorState: camelCaseData.doorState ?? null,
    door1State: camelCaseData.door1State ?? null,
    door2State: camelCaseData.door2State ?? null,
    // Timestamps
    lastSeenHb: camelCaseData.lastSeenHb || camelCaseData.lastSeen_hb || null,
    lastSeenTh: camelCaseData.lastSeenTh || camelCaseData.lastSeen_th || null,
    lastSeenNs: camelCaseData.lastSeenNs || camelCaseData.lastSeen_ns || null,
    lastSeenRfid: camelCaseData.lastSeenRfid || camelCaseData.lastSeen_rfid || null,
    lastSeenDoor: camelCaseData.lastSeenDoor || camelCaseData.lastSeen_door || null,
    ...camelCaseData, // Spread original data to preserve any additional fields
  };
  
  const validatedData = validateRackStateResponse(completeData);
  if (!validatedData) {
    throw new Error(
      `Invalid rack state data for device ${deviceId}, module ${moduleIndex}`,
    );
  }
  return validatedData;
};

/**
 * Sends a control command to a specific device
 * @param deviceId - The ID of the device
 * @param deviceType - The type of device (V5008 or V6800)
 * @param messageType - The type of command (e.g., SET_COLOR)
 * @param payload - The command payload
 * @returns Promise<{ status: string; commandId: string }> - Command confirmation
 */
export const sendCommand = async (
  deviceId: string,
  deviceType: string,
  messageType: string,
  payload: any,
): Promise<{ status: string; commandId: string }> => {
  const response = await apiClient.post<{ status: string; commandId: string }>(
    "/api/commands",
    {
      deviceId,
      deviceType,
      messageType,
      payload,
    },
  );
  return response.data;
};

// ============================================================================
// Group S: System API
// ============================================================================

/**
 * Checks the health status of the middleware
 * @returns Promise<{ status: string; services: any }> - Health status
 */
export const getHealthStatus = async (): Promise<{
  status: string;
  services: any;
}> => {
  const response = await apiClient.get<{ status: string; services: any }>(
    "/api/health",
  );
  return response.data;
};

// ============================================================================
// Group E: History API (Cold Path)
// ============================================================================

/**
 * Fetches historical events (RFID/Door) from the database
 * @param params - Query parameters
 * @returns Promise<any[]> - Array of historical events
 */
export const getHistoryEvents = async (params?: {
  deviceId?: string;
  moduleIndex?: number;
  eventType?: "rfid" | "door";
  limit?: number;
  offset?: number;
}): Promise<any[]> => {
  const response = await apiClient.get<any[]>("/api/history/events", {
    params,
  });
  return response.data;
};

/**
 * Fetches historical telemetry data (Temp/Hum/Noise) from the database
 * @param params - Query parameters
 * @returns Promise<any[]> - Array of historical telemetry data
 */
export const getHistoryTelemetry = async (params?: {
  deviceId?: string;
  moduleIndex?: number;
  type?: "temp_hum" | "noise";
  startTime?: string;
  endTime?: string;
  limit?: number;
}): Promise<any[]> => {
  const response = await apiClient.get<any[]>("/api/history/telemetry", {
    params,
  });
  return response.data;
};

/**
 * Fetches audit log (config changes) from the database
 * @param params - Query parameters
 * @returns Promise<any[]> - Array of audit events
 */
export const getHistoryAudit = async (params?: {
  deviceId?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> => {
  const response = await apiClient.get<any[]>("/api/history/audit", {
    params,
  });
  return response.data;
};

/**
 * Fetches device list from database history
 * @param params - Query parameters
 * @returns Promise<any[]> - Array of devices from history
 */
export const getHistoryDevices = async (params?: {
  limit?: number;
  offset?: number;
}): Promise<any[]> => {
  const response = await apiClient.get<any[]>("/api/history/devices", {
    params,
  });
  return response.data;
};

// ============================================================================
// Backward Compatibility (Deprecated)
// ============================================================================

/**
 * @deprecated Use getTopology() instead
 * Fetches the list of all devices with their metadata
 */
export const getDevices = async (): Promise<DeviceMetadata[]> => {
  console.warn("[DEPRECATED] getDevices() is deprecated, use getTopology() instead");
  return getTopology();
};
