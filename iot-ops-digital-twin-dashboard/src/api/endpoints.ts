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
 * Fetches the list of all devices with their metadata
 * @returns Promise<DeviceMetadata[]> - Array of device metadata
 */
export const getDevices = async (): Promise<DeviceMetadata[]> => {
  const response = await apiClient.get<DeviceMetadata[]>("/api/devices");
  return validateDeviceListResponse(response.data);
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
  const response = await apiClient.get<RackState>(
    `/api/devices/${deviceId}/modules/${moduleIndex}/state`,
  );
  const validatedData = validateRackStateResponse(response.data);
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
