// TypeScript interfaces matching Middleware SUO (Unified Sensor Object)

export interface RackState {
  deviceId: string;
  moduleIndex: number;
  
  // Status
  isOnline: boolean;
  lastSeen_hb: string;

  // Sensor Data
  rfid_snapshot: Array<{ sensorIndex: number; tagId: string; isAlarm: boolean }>;
  temp_hum: Array<{ sensorIndex: number; temp: number; hum: number }>;
  noise_level: Array<{ sensorIndex: number; noise: number }>;
  
  // Doors
  doorState: number | null;
  door1State: number | null;
  door2State: number | null;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  ip: string;
  fwVer: string;
  activeModules: Array<{ moduleIndex: number, uTotal: number }>;
}

export interface UnifiedSensorObject {
  messageType: string;
  deviceId: string;
  moduleIndex?: number;
  timestamp: string;
  data: any;
}

export interface DeviceListResponse {
  devices: DeviceMetadata[];
}

export interface RackStateResponse {
  rack: RackState;
}

export interface ModuleInfo {
  moduleIndex: number;
  uTotal: number;
}

export interface DeviceWithStatus extends DeviceMetadata {
  isOnline: boolean;
  lastSeen: string;
}
