import apiClient from './client';
import type { DeviceListResponse, RackStateResponse, DeviceMetadata } from '../types/schema';

export const api = {
  // Get all devices
  getDevices: async (): Promise<DeviceMetadata[]> => {
    const response = await apiClient.get<DeviceListResponse>('/devices');
    return response.data.devices;
  },

  // Get device by ID
  getDevice: async (deviceId: string): Promise<DeviceMetadata> => {
    const response = await apiClient.get<DeviceMetadata>(`/devices/${deviceId}`);
    return response.data;
  },

  // Get rack state for a specific device and module
  getRackState: async (deviceId: string, moduleIndex: number) => {
    const response = await apiClient.get<RackStateResponse>(
      `/devices/${deviceId}/modules/${moduleIndex}/state`
    );
    return response.data.rack;
  },

  // Send command to device
  sendCommand: async (deviceId: string, command: any) => {
    const response = await apiClient.post(`/devices/${deviceId}/commands`, command);
    return response.data;
  },

  // Get device health status
  getDeviceHealth: async (deviceId: string) => {
    const response = await apiClient.get(`/devices/${deviceId}/health`);
    return response.data;
  },
};

export default api;
