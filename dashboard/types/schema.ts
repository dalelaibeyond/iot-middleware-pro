
export interface RFIDTag {
  sensorIndex: number;
  tagId: string;
  isAlarm: boolean;
}

export interface TempHum {
  sensorIndex: number;
  temp: number;
  hum: number;
}

export interface NoiseLevel {
  sensorIndex: number;
  noise: number;
}

export interface RackState {
  deviceId: string;
  moduleIndex: number;

  // Status - Support both camelCase and snake_case
  isOnline: boolean;
  lastSeen_hb?: string;
  lastSeenHb?: string;

  // Sensor Data - Support both camelCase and snake_case
  rfid_snapshot?: RFIDTag[];
  rfidSnapshot?: RFIDTag[];
  temp_hum?: TempHum[];
  tempHum?: TempHum[];
  noise_level?: NoiseLevel[];
  noiseLevel?: NoiseLevel[];

  // Doors (0=Closed, 1=Open)
  doorState?: number | null;
  door1State?: number | null;
  door2State?: number | null;
}

export interface ModuleMetadata {
  moduleIndex: number;
  moduleId: string;
  uTotal: number;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  ip: string | null;
  fwVer: string | null;
  isOnline: boolean;
  activeModules: ModuleMetadata[];
}

export type MessageType = 
  | 'DEVICE_METADATA' 
  | 'HEARTBEAT' 
  | 'TEMP_HUM' 
  | 'QRY_TEMP_HUM_RESP'  // Query response for temp/hum
  | 'RFID_SNAPSHOT' 
  | 'RFID_EVENT'         // Individual RFID tag event
  | 'DOOR_STATE' 
  | 'NOISE'              // Short alias
  | 'NOISE_LEVEL'        // Full message type from backend
  | 'META_CHANGED_EVENT';

export interface SUOUpdate {
  messageType: MessageType;
  deviceId: string;
  moduleIndex?: number;
  payload: any;
}
