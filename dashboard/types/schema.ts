
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

  // Status
  isOnline: boolean;
  lastSeenHb?: string;

  // Sensor Data
  rfidSnapshot?: RFIDTag[];
  tempHum?: TempHum[];
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
  fwVer?: string | null;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  ip: string | null;
  mac?: string | null;
  fwVer: string | null;
  mask?: string | null;
  gwIp?: string | null;
  isOnline: boolean;
  activeModules: ModuleMetadata[];
}

export type MessageType = 
  | 'DEVICE_METADATA'    // Device metadata (ip, mac, fwVer, modules)
  | 'HEARTBEAT'          // Heartbeat with module info
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
  deviceType?: string;
  moduleIndex?: number;
  // Device-level fields (for DEVICE_METADATA)
  ip?: string | null;
  mac?: string | null;
  fwVer?: string | null;
  mask?: string | null;
  gwIp?: string | null;
  payload: any;
}
