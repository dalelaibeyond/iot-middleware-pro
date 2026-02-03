
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
  lastSeen_hb: string;

  // Sensor Data
  rfid_snapshot: RFIDTag[];
  temp_hum: TempHum[];
  noise_level: NoiseLevel[];
  
  // Doors (0=Closed, 1=Open)
  doorState: number | null;
  door1State: number | null;
  door2State: number | null;
}

export interface ModuleMetadata {
  moduleIndex: number;
  moduleId: string;
  uTotal: number;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  ip: string;
  fwVer: string;
  isOnline: boolean;
  activeModules: ModuleMetadata[];
}

export type MessageType = 
  | 'DEVICE_METADATA' 
  | 'HEARTBEAT' 
  | 'TEMP_HUM' 
  | 'RFID_SNAPSHOT' 
  | 'DOOR_STATE' 
  | 'NOISE'
  | 'META_CHANGED_EVENT';

export interface SUOUpdate {
  messageType: MessageType;
  deviceId: string;
  moduleIndex?: number;
  payload: any;
}
