# middleware_spec

# IoT Middleware Pro - As-Built Specification

> **Version:** 2.2.1
> 
> 
> **Last Updated:** 2026-02-14 (v2.2.1 - Separated Self-Healing from SmartHeartbeat, added moduleIndex to debug logs)
> 
> **Status:** As-Built (Verified against source code)
> 

---

## 1. Architecture Overview

### 1.1 System Architecture

The IoT Middleware Pro is a **headless, modular integration layer** that unifies data from heterogeneous IoT Gateways into a standardized format.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        IoT Middleware Pro v2.0                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Ingress → Parse → Normalize → Distribute → Output                     │
│                                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  MQTT    │ → │ V5008/   │ → │ Unify        │ → │ StorageService  │  │
│  │  Sub     │   │ V6800    │   │ Normalizer   │   │ (MySQL)         │  │
│  └──────────┘   │ Parser   │   │              │   └─────────────────┘  │
│                 └──────────┘   │ - StateCache │   ┌─────────────────┐  │
│                                │ - SmartHB    │ → │ ApiServer       │  │
│                                │ - Watchdog   │   │ (REST API)      │  │
│                                └──────────────┘   └─────────────────┘  │
│                                                   ┌─────────────────┐  │
│                                                   │ WebSocketServer │  │
│                                                   └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Module Initialization Order

```jsx
database → eventBus → stateCache → mqttSubscriber → parserManager →
normalizer → storage → command → apiServer → webSocketServer → cacheWatchdog
```

### 1.3 Data Contracts

**SIF (Standard Intermediate Format)** - Output of Parsers:

```jsx
{
  deviceType: "V5008|V6800",
  deviceId: "string",
  messageType: "HEARTBEAT|RFID_SNAPSHOT|...",
  messageId: "string",
  meta: { topic, rawHex|rawType },
  data: [],           // Parsed payload array
  moduleIndex?: number,
  moduleId?: string
}
```

**SUO (Standard Unified Object)** - Output of Normalizer:

```jsx
{
  deviceId: "string",
  deviceType: "V5008|V6800",
  messageType: "string",
  messageId: "string",
  moduleIndex: number,
  moduleId: "string",
  payload: []         // ALWAYS an array
}
```

---

## 2. Configuration

Location: `config/default.json`

```json
{
  "app": { "name": "IoT Middleware Pro", "version": "2.0.0" },
  "mqtt": {
    "brokerUrl": "mqtt://localhost:1883",
    "topics": { "v5008": "V5008Upload/#", "v6800": "V6800Upload/#" }
  },
  "modules": {
    "storage": { "enabled": true, "batchSize": 100, "flushInterval": 1000 },
    "apiServer": { "enabled": true, "port": 3000, "features": { "management": true, "history": true } },
    "webSocketServer": { "enabled": true, "port": 3001 },
    "normalizer": { "cacheType": "memory", "heartbeatTimeout": 120000, "checkInterval": 30000 },
    "command": { "enabled": true },
    "cacheWatchdog": { "enabled": false }
  },
  "logging": {
    "level": "debug",
    "dir": "logs",
    "maxSize": "20m",
    "maxFiles": "14d",
    "console": true,
    "file": false
  },
  "debug": {
    "logRawMessage": true,
    "logSif": true,
    "logSuo": true,
    "logUos": true,
    "logDb": true
  }
}
```

### 2.1 Debug Configuration

The `debug` section controls message flow logging through the pipeline:

| Option | Description | Output |
|--------|-------------|--------|
| `logRawMessage` | Log raw MQTT messages | RAW (hex/JSON) |
| `logSif` | Log parsed SIF | SIF object |
| `logSuo` | Log normalized SUO | SUO object |
| `logUos` | Log UOS cache access/update | UOS telemetry |
| `logDb` | Log database operations | SQL table, record count |

**Pipeline Flow with Debug:**
```
RAW → SIF → SUO → UOS → DB
  ↓     ↓     ↓     ↓     ↓
 log   log   log   log   log
```

**Note:** Debug logs use compact JSON format with arrays collapsed to single lines for readability.

---

## 3. REST API Specification

### 3.1 Group S: System API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | System status (DB, MQTT, memory usage) |
| `GET` | `/api/config` | System config (passwords redacted) |

**Health Response:**

```json
{
  "status": "ok",
  "uptime": 12050,
  "memory": { "rss": "45 MB", "heapUsed": "20 MB" },
  "db": "connected",
  "mqtt": "connected"
}
```

### 3.2 Group A: Management API (Hot Path)

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/live/topology` | List all devices & modules (DB + Cache merge) |
| `GET` | `/api/live/devices/:deviceId/modules/:moduleIndex` | Get module state from StateCache |
| `GET` | `/api/meta/:deviceId` | Get device metadata from cache |
| `POST` | `/api/commands` | Submit control command (returns 202 Accepted) |

**Topology Response (`/api/live/topology`):**

```json
[
  {
    "deviceId": "2437871205",
    "deviceType": "V5008",
    "ip": "192.168.0.211",
    "mac": "80:82:91:4E:F6:65",
    "fwVer": "2509101151",
    "mask": "255.255.0.0",
    "gwIp": "192.168.0.1",
    "isOnline": true,
    "lastSeenInfo": "2026-02-14T14:06:37.952Z",
    "activeModules": [
      {
        "moduleIndex": 1,
        "moduleId": "3963041727",
        "uTotal": 6,
        "fwVer": "2307101644",
        "isOnline": true,
        "lastSeenHb": "2026-02-14T14:06:37.952Z"
      }
    ]
  }
]
```

**Note:** `moduleId` and `fwVer` may be `null` initially until `MODULE_INFO` response is received.

### 3.4 Field Naming Convention

| Field | Type | Description |
|-------|------|-------------|
| `deviceId` | string | Device identifier (numeric string) |
| `deviceType` | string | `"V5008"` or `"V6800"` |
| `activeModules` | array | List of modules currently present in device |
| `moduleIndex` | number | Module slot position (1-based) |
| `moduleId` | string\|null | Module identifier (null until known) |
| `uTotal` | number | Number of sensor units in module |
| `fwVer` | string\|null | Firmware version (null until known) |
| `isOnline` | boolean | Whether module/device is online |

**Unified Field Name:** All endpoints use `activeModules` (not `modules`) to represent the list of modules currently present in the device.

**Module State Response (`/api/live/devices/:deviceId/modules/:moduleIndex`):**

```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "isOnline": true,
  "lastSeenHb": "2026-02-14T14:06:37.952Z",
  "tempHum": [
    { "sensorIndex": 10, "temp": 24.5, "hum": 60.0 }
  ],
  "lastSeenTh": "2026-02-14T14:01:05.727Z",
  "noiseLevel": [
    { "sensorIndex": 16, "noise": 45.5 }
  ],
  "lastSeenNs": "2026-02-14T14:02:20.274Z",
  "rfidSnapshot": [
    { "sensorIndex": 1, "tagId": "DD344A44", "isAlarm": false }
  ],
  "lastSeenRfid": "2026-02-14T14:07:16.008Z",
  "doorState": 0,
  "door1State": null,
  "door2State": null,
  "lastSeenDoor": "2026-02-14T14:06:26.193Z",
  "uTotal": 6
}
```

**Command Request:**

```json
POST /api/commands
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "messageType": "SET_COLOR",
  "payload": {
    "moduleIndex": 1,
    "sensorIndex": 10,
    "colorCode": 1
  }
}
```

**Command Response:**

```json
{ "status": "sent", "commandId": "cmd_1707654321_abc123" }
```

### 3.3 Group E: History API (Cold Path - requires storage)

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/history/events` | RFID/Door events with pagination |
| `GET` | `/api/history/telemetry` | Temp/Hum/Noise with time range |
| `GET` | `/api/history/audit` | Config change audit log |
| `GET` | `/api/history/devices` | Devices from database |

---

## 4. Command Service

### 4.1 Command Request Format

```jsx
{
  deviceId: "string",
  deviceType: "V5008|V6800",
  messageType: "QRY_RFID_SNAPSHOT|QRY_TEMP_HUM|SET_COLOR|...",
  payload: {
    moduleIndex: number,
    sensorIndex?: number,
    colorCode?: number
  }
}
```

### 4.2 Supported Commands

| Command | V5008 | V6800 | Required Params |
| --- | --- | --- | --- |
| `QRY_RFID_SNAPSHOT` | ✓ | ✓ | `moduleIndex` (V5008), `moduleIndex` + `moduleId` (V6800) |
| `QRY_TEMP_HUM` | ✓ | ✓ | `moduleIndex` |
| `QRY_DOOR_STATE` | ✓ | ✓ | `moduleIndex` |
| `QRY_NOISE_LEVEL` | ✓ | ✗ | `moduleIndex` |
| `QRY_COLOR` | ✓ | ✓ | `moduleIndex` |
| `QRY_DEVICE_INFO` | ✓ | ✗ | - |
| `QRY_MODULE_INFO` | ✓ | ✗ | - |
| `QRY_DEV_MOD_INFO` | ✗ | ✓ | - |
| `SET_COLOR` | ✓ | ✓ | `moduleIndex`, `sensorIndex`, `colorCode` |
| `CLN_ALARM` | ✓ | ✓ | `moduleIndex`, `sensorIndex` |

### 4.3 V5008 Binary Command Format

| Command | Hex Structure |
| --- | --- |
| `QRY_RFID_SNAPSHOT` | `0xE9, 0x01, moduleIndex` |
| `QRY_TEMP_HUM` | `0xE9, 0x02, moduleIndex` |
| `QRY_DOOR_STATE` | `0xE9, 0x03, moduleIndex` |
| `QRY_NOISE_LEVEL` | `0xE9, 0x04, moduleIndex` |
| `QRY_DEVICE_INFO` | `0xEF, 0x01, 0x00` |
| `QRY_MODULE_INFO` | `0xEF, 0x02, 0x00` |
| `QRY_COLOR` | `0xE4, moduleIndex` |
| `CLN_ALARM` | `0xE2, moduleIndex, sensorIndex` |
| `SET_COLOR` | `0xE1, moduleIndex, sensorIndex, colorCode` |

### 4.4 V6800 JSON Command Format

**SET_COLOR:**

```json
{
  "msg_type": "set_module_property_req",
  "gateway_sn": "{deviceId}",
  "set_property_type": 8001,
  "data": [{
    "host_gateway_port_index": "{moduleIndex}",
    "extend_module_sn": null,
    "module_type": 2,
    "u_color_data": [{"u_index": "{sensorIndex}", "color_code": "{colorCode}"}]
  }]
}
```

**CLN_ALARM:**

```json
{
  "msg_type": "clear_u_warning",
  "gateway_id": "{deviceId}",
  "code": 123456,
  "data": [{"index": "{moduleIndex}", "warning_data": ["{sensorIndex}"]}]
}
```

**QRY_RFID_SNAPSHOT (V6800):**

```json
{
  "msg_type": "u_state_req",
  "gateway_sn": "{deviceId}",
  "data": [{
    "host_gateway_port_index": "{moduleIndex}",
    "extend_module_sn": "{moduleId}",
    "u_index_list": null
  }]
}
```

**Note:** V6800 requires `moduleId` (mapped to `extend_module_sn`), while V5008 only needs `moduleIndex`.

---

## 5. Database Schema

> **Single Source of Truth:** `database/schema.sql` (Schema Version 2.1.0)

> **Field Mappings:** See `docs/message_map_spec.md` for RAW → SIF → SUO → DB field transformations

The database schema is maintained in `database/schema.sql`. Below is the complete schema for reference:

```sql
-- IoT Middleware Pro Database Schema
-- Version: 2.1.0
-- Engine: MySQL InnoDB
-- 
-- Alignment Rules:
-- - parse_at: SUO creation time (when message was parsed)
-- - update_at: DB operation time (when record was inserted/updated)
-- - All tables have both columns for consistency

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS iot_middleware CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE iot_middleware;

-- ============================================
-- CLEANUP: Drop existing tables
-- ============================================

DROP TABLE IF EXISTS iot_topchange_event;
DROP TABLE IF EXISTS iot_cmd_result;
DROP TABLE IF EXISTS iot_heartbeat;
DROP TABLE IF EXISTS iot_door_event;
DROP TABLE IF EXISTS iot_rfid_snapshot;
DROP TABLE IF EXISTS iot_rfid_event;
DROP TABLE IF EXISTS iot_noise_level;
DROP TABLE IF EXISTS iot_temp_hum;
DROP TABLE IF EXISTS iot_meta_data;

-- ============================================
-- TABLE: Device Metadata (UPSERT)
-- ============================================
-- Source: DEVICE_METADATA SUO
-- Strategy: UPSERT on device_id
-- Notes: Tracks device info and module list from HEARTBEAT + DEVICE_INFO/MODULE_INFO

CREATE TABLE IF NOT EXISTS iot_meta_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    device_type   CHAR(5) NOT NULL,
    
    -- Device-level fields from SUO (root level)
    device_fwVer  VARCHAR(32) DEFAULT NULL,  -- SUO.fwVer (V5008 only)
    device_mask   VARCHAR(32) DEFAULT NULL,  -- SUO.mask (V5008 only)
    device_gwIp   VARCHAR(32) DEFAULT NULL,  -- SUO.gwIp (V5008 only)
    device_ip     VARCHAR(32) DEFAULT NULL,  -- SUO.ip
    device_mac    VARCHAR(32) DEFAULT NULL,  -- SUO.mac
    
    -- SUO.payload[] as JSON (module list with moduleIndex, moduleId, fwVer, uTotal)
    modules       JSON,
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3) 
                  ON UPDATE CURRENT_TIMESTAMP(3),  -- DB operation time
    
    UNIQUE KEY uk_device_id (device_id),
    INDEX idx_meta_type (device_type, update_at DESC),
    INDEX idx_parse_at (parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Temperature & Humidity (Append-only)
-- ============================================
-- Source: TEMP_HUM SUO
-- Strategy: Append-only, pivoted storage
-- Notes: One row per module, sensorIndex 10-15 → temp_indexXX/hum_indexXX columns

CREATE TABLE IF NOT EXISTS iot_temp_hum (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- Pivoted from SUO.payload[]: sensorIndex 10-15
    temp_index10  DECIMAL(5,2), hum_index10  DECIMAL(5,2),
    temp_index11  DECIMAL(5,2), hum_index11  DECIMAL(5,2),
    temp_index12  DECIMAL(5,2), hum_index12  DECIMAL(5,2),
    temp_index13  DECIMAL(5,2), hum_index13  DECIMAL(5,2),
    temp_index14  DECIMAL(5,2), hum_index14  DECIMAL(5,2),
    temp_index15  DECIMAL(5,2), hum_index15  DECIMAL(5,2),
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_th (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Noise Level (Append-only, V5008 only)
-- ============================================
-- Source: NOISE_LEVEL SUO
-- Strategy: Append-only, pivoted storage
-- Notes: One row per module, sensorIndex 16-18 → noise_indexXX columns

CREATE TABLE IF NOT EXISTS iot_noise_level (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- Pivoted from SUO.payload[]: sensorIndex 16-18
    noise_index16 DECIMAL(5,2),
    noise_index17 DECIMAL(5,2),
    noise_index18 DECIMAL(5,2),
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_noise (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: RFID Events (Append-only)
-- ============================================
-- Source: RFID_EVENT SUO
-- Strategy: Append-only, one row per event
-- Notes: message_id for traceability - links to original message that triggered this event

CREATE TABLE IF NOT EXISTS iot_rfid_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (for event traceability)
    
    -- From SUO.payload[]
    sensor_index  INT NOT NULL,              -- payload.sensorIndex
    tag_id        VARCHAR(32) NOT NULL,      -- payload.tagId
    action        CHAR(10) NOT NULL,         -- payload.action (ATTACHED/DETACHED/ALARM_ON/ALARM_OFF)
    alarm         BOOLEAN DEFAULT FALSE,     -- payload.isAlarm
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_rfid_evt (tag_id, device_id, module_index, parse_at DESC),
    INDEX idx_rfid_device (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_action (action, parse_at DESC),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: RFID Snapshots (Append-only)
-- ============================================
-- Source: RFID_SNAPSHOT SUO
-- Strategy: Append-only, JSON storage
-- Notes: Stores full snapshot as JSON for history

CREATE TABLE IF NOT EXISTS iot_rfid_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- SUO.payload[] as JSON: [{sensorIndex, tagId, isAlarm}]
    rfid_snapshot JSON,
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_rfid_snap (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Door Events (Append-only)
-- ============================================
-- Source: DOOR_STATE SUO
-- Strategy: Append-only
-- Notes: message_id for traceability - links to original message

CREATE TABLE IF NOT EXISTS iot_door_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (for event traceability)
    
    -- From SUO.payload[] (expanded to columns)
    doorState     INT,                       -- payload.doorState (single door)
    door1State    INT,                       -- payload.door1State (dual door A)
    door2State    INT,                       -- payload.door2State (dual door B)
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_door (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Heartbeats (Append-only)
-- ============================================
-- Source: HEARTBEAT SUO
-- Strategy: Append-only, JSON storage
-- Notes: Stores all modules from heartbeat

CREATE TABLE IF NOT EXISTS iot_heartbeat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- SUO.payload[] as JSON: [{moduleIndex, moduleId, uTotal}]
    modules       JSON,
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_hb (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Command Results (Append-only)
-- ============================================
-- Source: QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP SUO
-- Strategy: Append-only
-- Notes: message_id links response to original command

CREATE TABLE IF NOT EXISTS iot_cmd_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (response message ID)
    
    -- SUO.messageType
    cmd           VARCHAR(32) NOT NULL,      -- QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP
    
    -- From SUO.payload[]
    result        VARCHAR(32) NOT NULL,      -- payload.result (Success/Failure)
    original_req  VARCHAR(512),              -- payload.originalReq (echoed command)
    color_map     JSON,                      -- payload.colorMap (QRY_CLR_RESP only)
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_cmd (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_cmd_type (cmd, result),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Topology Change Events (Append-only)
-- ============================================
-- Source: META_CHANGED_EVENT SUO
-- Strategy: Append-only
-- Notes: One row per change description

CREATE TABLE IF NOT EXISTS iot_topchange_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    device_type   CHAR(5) NOT NULL,          -- SUO.deviceType
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (for traceability)
    
    -- From SUO.payload[].description
    event_desc    VARCHAR(512) NOT NULL,     -- Human-readable change description
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3) 
                  ON UPDATE CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_top_chng (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_device_type (device_type, parse_at DESC),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 6. Storage Service Routing

| SUO Type | Target Table | Storage Strategy | `message_id` |
| --- | --- | --- | --- |
| `HEARTBEAT` | `iot_heartbeat` | Store payload as JSON | Optional |
| `RFID_SNAPSHOT` | `iot_rfid_snapshot` | Store payload as JSON | Optional |
| `RFID_EVENT` | `iot_rfid_event` | Insert 1 row per payload item | **Required** |
| `TEMP_HUM` | `iot_temp_hum` | Pivot: map sensorIndex to columns | Optional |
| `NOISE_LEVEL` | `iot_noise_level` | Pivot: map sensorIndex to columns | Optional |
| `DOOR_STATE` | `iot_door_event` | Map doorState/door1State/door2State | **Required** |
| `DEVICE_METADATA` | `iot_meta_data` | UPSERT on device_id | - |
| `META_CHANGED_EVENT` | `iot_topchange_event` | Insert per description | **Required** |
| Command Responses | `iot_cmd_result` | Map colorMap to JSON column | **Required** |

**Field Mappings:** See `docs/message_map_spec.md` for complete RAW → SIF → SUO → DB field transformations.

---

## 7. WebSocket Protocol

**Endpoint:** `ws://localhost:3001`

**Behavior:** Broadcasts SUO JSON immediately after normalization.

**Client Reconnection Strategy:**
- Initial delay: 2 seconds
- Exponential backoff: 2s → 4s → 8s
- Max attempts: 5

---

## 8. Source Code Locations

| Component | Path |
| --- | --- |
| EventBus | `src/core/EventBus.js` |
| Database | `src/core/Database.js` |
| ModuleManager | `src/core/ModuleManager.js` |
| MqttSubscriber | `src/modules/ingress/MqttSubscriber.js` |
| V5008Parser | `src/modules/parsers/V5008Parser.js` |
| V6800Parser | `src/modules/parsers/V6800Parser.js` |
| UnifyNormalizer | `src/modules/normalizer/UnifyNormalizer.js` |
| StateCache | `src/modules/normalizer/StateCache.js` |
| SmartHeartbeat | `src/modules/normalizer/SmartHeartbeat.js` |
| CacheWatchdog | `src/modules/normalizer/CacheWatchdog.js` |
| StorageService | `src/modules/storage/StorageService.js` |
| CommandService | `src/modules/command/CommandService.js` |
| ApiServer | `src/modules/output/ApiServer.js` |
| WebSocketServer | `src/modules/output/WebSocketServer.js` |