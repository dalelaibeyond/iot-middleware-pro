import apiClient from "./client";
import { DeviceMetadata, RackState } from "../../types/schema";
import {
  validateDeviceListResponse,
  validateRackStateResponse,
} from "../utils/validation";

/**
 * API endpoint functions for interacting with the IoT Middleware
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
      };

      if (fieldMappings[key]) {
        camelKey = fieldMappings[key];
      }

      result[camelKey] = toCamelCase(obj[key]);
    }
  }
  return result;
}

/**
 * Fetches the list of all devices with their metadata
 * @returns Promise<DeviceMetadata[]> - Array of device metadata
 */
export const getDevices = async (): Promise<DeviceMetadata[]> => {
  const response = await apiClient.get<any[]>("/api/devices");
  // Transform snake_case to camelCase
  const camelCaseData = toCamelCase<any[]>(response.data);
  return validateDeviceListResponse(camelCaseData);
};

/**
 * Fetches the state of a specific rack (device module)
 * @param deviceId - The ID of the device
 * @param moduleIndex - The index of the module/rack
 * @returns Promise<RackState> - The current state of the rack
 */
export const getRackState = async (
  deviceId: string,
  moduleIndex: number,
): Promise<RackState> => {
  const response = await apiClient.get<any>(
    `/api/devices/${deviceId}/modules/${moduleIndex}/state`,
  );
  // Transform snake_case to camelCase
  const camelCaseData = toCamelCase<any>(response.data);
  const validatedData = validateRackStateResponse(camelCaseData);
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
