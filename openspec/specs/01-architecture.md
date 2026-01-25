# IoT Middleware Pro Implementation Guide v3.3

**File Name:** `Architecture.md`

**Date:** 1/22/2026
**Type:** Master Blueprint & DB Schema
**Status:** Final for AI Coding
**References:**

1. `V5008Parser_Spec.md` (Binary Parser Specs)
2. `V6800Parser_Spec.md` (JSON Parser Specs)
3. `UnifyNormalizer_Spec.md` (Normalization Specs)

---

## 1. Project Manifest

### 1.1 Directory Structure

```
src/
├── core/
│   ├── EventBus.js          # Events: mqtt.message, data.normalized, command.request
│   ├── Database.js          # Knex.js MySQL connection pool
│   └── ModuleManager.js     # Lifecycle manager
├── modules/
│   ├── ingress/
│   │   └── MqttSubscriber.js # Inbound listener
│   ├── parsers/
│   │   ├── V5008Parser.js    # Implements V5008Parser_Spec
│   │   ├── V6800Parser.js    # Implements V6800Parser_Spec
│   │   └── ParserManager.js  # Router
│   ├── normalizer/
│   │   ├── UnifyNormalizer.js # Implements UnifyNormalizer_Spec
│   │   └── StateCache.js      # Dual-Purpose Cache (Logic + API)
|   |   └── CacheWatchdog.js   # Offline Detection Service
│   ├── storage/
│   │   └── StorageService.js  # Batch Writer & Pivoting Logic
│   ├── command/
│   │   └── CommandService.js  # Outbound Commands (Sync/Control)
│   └── output/
│       ├── MqttRelay.js
│       ├── WebhookService.js
│       ├── ApiServer.js       # Dashboard Backend
│       └── WebSocketServer.js # Real-time feed
└── config/
    └── default.json

```

---

## 2. Architecture & Data Flow

### 2.1 The Pipeline

1. **Ingest:** `MqttSubscriber` → `mqtt.message` event.
2. **Parse:** `ParserManager` selects Parser → Returns **SIF**.
3. **Normalize:** `UnifyNormalizer` converts SIF → **SUO**.
    - *Interaction:* Reads/Writes to `StateCache`.
    - *RFID Logic:* Uses "Diffing" for Snapshots. Uses "Sync Trigger" (emit `command.request`) for Events..
    - *Metadata:* Merges partial data into Cache → Emits consolidated Metadata.
4. **Distribute:** Emits `data.normalized`.
5. **Output:** `StorageService`, `WebSocketServer`, `ApiServer` consume `data.normalized`.

### 2.2 Data Contracts

**SIF (Standard Intermediate Format):**
Output of Parsers. Contains raw device-specific keys (`thIndex`, `u_code`).

- *Structure:* `{ meta, deviceType, messageType, data: [] }`

**SUO (Standard Unified Object):**
Output of Normalizer. Flattened, standardized keys.

- *Structure:*
    
    ```json
    {
      "deviceId": "string",
      "deviceType": "string",
      "messageType": "string", // Unified Enum
      "messageId":"string",
      "payload": [] // ALWAYS an Array of objects
    }
    
    ```
    

---

## 3. Database Schema (Single Source of Truth)

**Engine:** MySQL InnoDB.

### 3.1 Device Metadata

- *Upsert Logic:* On duplicate `device_id`, update fields and `update_at`.

```sql
CREATE TABLE iot_meta_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    device_type  CHAR(5) NOT NULL,
    
    -- Superset of fields (Nullable)
    device_fwVer VARCHAR(32) DEFAULT NULL, -- V5008 Only
    device_mask  VARCHAR(32) DEFAULT NULL, -- V5008 Only
    device_gwIp  VARCHAR(32) DEFAULT NULL, -- V5008 Only
    
    -- Common fields
    device_ip    VARCHAR(32), 
    device_mac   VARCHAR(32),
    
    modules      JSON,  -- e.g. [{ "moduleIndex": 1, "fwVer": "1.0", "moduleId": "...", "uTotal":6}]
    parse_at     DATETIME(3) NOT NULL,
    update_at    DATETIME(3) NOT NULL,
    UNIQUE KEY uk_device_id (device_id) 
);

```

### 3.2 Telemetry (Pivoted)

- *Pivot Logic:* Map `sensorIndex` 10-15 to `temp_indexXX`, 16-18 to `noise_indexXX`.

```sql
CREATE TABLE iot_temp_hum (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    -- Pivoted Columns 10-15
    temp_index10 DECIMAL(5,2), hum_index10 DECIMAL(5,2),
    temp_index11 DECIMAL(5,2), hum_index11 DECIMAL(5,2),
    temp_index12 DECIMAL(5,2), hum_index12 DECIMAL(5,2),
    temp_index13 DECIMAL(5,2), hum_index13 DECIMAL(5,2),
    temp_index14 DECIMAL(5,2), hum_index14 DECIMAL(5,2),
    temp_index15 DECIMAL(5,2), hum_index15 DECIMAL(5,2),
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_th (device_id, module_index, parse_at DESC)
);

CREATE TABLE iot_noise_level (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    -- Pivoted Columns 16-18
    noise_index16 DECIMAL(5,2),
    noise_index17 DECIMAL(5,2),
    noise_index18 DECIMAL(5,2),
    parse_at      DATETIME(3) NOT NULL,
    INDEX idx_noise (device_id, module_index, parse_at DESC)
);

```

### 3.3 RFID & Door

```sql
CREATE TABLE iot_rfid_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    sensor_index INT NOT NULL,
    tag_id       VARCHAR(32) NOT NULL,
    action       CHAR(10) NOT NULL, -- "ATTACHED", "DETACHED"
    alarm        BOOLEAN DEFAULT FALSE,
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_rfid_evt (tag_id, device_id, module_index, parse_at DESC)
);

CREATE TABLE iot_rfid_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    rfid_snapshot JSON, -- Full Array: [{sensorIndex, tagId, isAlarm}]
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_rfid_snap (device_id, module_index, parse_at DESC)
);

CREATE TABLE iot_door_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    doorState    INT, -- Single
    door1State   INT, -- Dual A
    door2State   INT, -- Dual B
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_door (device_id, module_index, parse_at DESC)
);

```

### 3.4 System

```sql
CREATE TABLE iot_heartbeat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    modules      JSON, -- [{moduleIndex, moduleId, uTotal}]
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_hb (device_id, parse_at DESC)
);

CREATE TABLE iot_cmd_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    cmd          VARCHAR(32) NOT NULL,
    result       VARCHAR(32) NOT NULL,
    original_req VARCHAR(512),
    color_map    JSON,
    parse_at     DATETIME(3) NOT NULL
);

CREATE TABLE iot_topchange_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    device_type  CHAR(5) NOT NULL,
    event_desc   VARCHAR(512) NOT NULL, -- The human readable change string
    parse_at     DATETIME(3) NOT NULL,
    update_at    DATETIME(3) DEFAULT TIMESTAMP(3),
    INDEX idx_top_chng (device_id, parse_at DESC)
);
```

---

## 4. Component Logic Specifications

### 4.1 Storage Service Logic

The Storage Service must implement specific routing based on `SUO.messageType`:

| SUO Type | Target Table | Logic Notes |
| --- | --- | --- |
| `HEARTBEAT` | `iot_heartbeat` | Store `payload` array as JSON. |
| `RFID_SNAPSHOT` | `iot_rfid_snapshot` | Store `payload` array as JSON. |
| `RFID_EVENT` | `iot_rfid_event` | **Iterate** `payload` array. Insert 1 row per item. |
| `TEMP_HUM` | `iot_temp_hum` | 1) Pivot Logic: Iterate through the payload array. Construct a dynamic INSERT statement.
2) Mapping: For each item, map `sensorIndex` (e.g., 10) to columns `temp_index10` AND `hum_index10`.
3) Note: Only include columns for indices present in the payload. Let the DB handle missing columns as NULL. |
| `NOISE_LEVEL` | `iot_noise_level` | 1) Pivot Logic: Iterate through the payload array. Construct a dynamic INSERT statement.
2) Mapping: If `sensorIndex` is 16 → map value to `noise_index16`. If 17 →  `noise_index17`.
3) Note: Do not insert `NULL` explicitly for missing indices; let the Database default handle missing columns. |
| `DOOR_STATE` | `iot_door_event` | 1) Action: Read the first item in the payload array.
2) Mapping: Map doorState, door1State, door2State to their respective columns. |
| `DEVICE_METADATA` | `iot_meta_data` | Use `UPSERT` (Insert on Duplicate Key Update). |
| `QRY_CLR_RESP` | `iot_cmd_result` | Map `colorMap` $\to$ `color_map`. |
| `META_CHANGED_EVENT` | `iot_topchange_event` | Iterate through payload array. Insert one row per description string. |

### 4.2 Command Service Logic

- **Trigger:** Listens for `command.request` event from Normalizer.
- **Action:**
    1. Extract `deviceId` and `messageType` (e.g., `QRY_RFID_SNAPSHOT`).
    2. Determine format: V6800 (JSON) or V5008 (Hex).
    3. Construct payload (e.g., `{"msg_type": "u_state_req"}`).
    4. Publish to `V6800Download/{deviceId}`.

### 4.3 Unify Normalizer Logic

- **Reference:** `UnifyNormalizer_v1.6.2.md`
- **Core Logic:**
    1. **Structure Recognition:** Determine if SIF is Single-Module (V5008) or Multi-Module (V6800) and iterate.
    2. **Field Standardization:** Rename indices (`thIndex` →  `sensorIndex`) and inject timestamps.
    3. **State Logic:**
        - **Stateless:** Pass through `TEMP_HUM`, `NOISE`, `DOOR`.
        - **Global Diffing (Snapshots):** On `RFID_SNAPSHOT`, compare with Cache. Emit `RFID_EVENT` SUO for differences. Update Cache.
        - **Sync Trigger (Events):** On `RFID_EVENT` (V6800), **DO NOT** update Cache. Emit `command.request` to fetch a fresh Snapshot.
        - **Metadata Merge:** On `HEARTBEAT/INFO`, merge partial metadata into Cache, then emit full `DEVICE_METADATA` from Cache.
    

### 4.4 API Server Logic (`src/modules/output/ApiServer.js`)

**Responsibility:** Serve read-only state to the Dashboard and handle control commands.

**Endpoints:**

1. **System Health**
    - **GET** `/api/health`
    - **Logic:** Check DB connection, MQTT status, and process memory.
    - **Response:**
        
        ```json
        {
          "status": "ok",
          "uptime": 12050,
          "memory": { "rss": "45 MB", "heapUsed": "20 MB", "heapTotal": "30 MB" },
          "db": "connected",
          "mqtt": "connected"
        }
        ```
        
2. **System Configuration**
    - **GET** `/api/config`
    - **Logic:** Return `config` object. **CRITICAL:** Redact passwords/secrets before sending.
3. **Device List (Sidebar)**
    - **GET** `/api/devices`
    - **Source:** Database table `iot_meta_data`.
    - **Logic:** `SELECT * FROM iot_meta_data`.
    - **Response:** Array of devices, including the `modules` JSON column (needed for `uTotal`).
4. **Module State (Detail View)**
    - **GET** `/api/devices/:deviceId/modules/:moduleIndex/state`
    - **Source:** `StateCache` (Memory/Redis).
    - **Logic:** Fetch key `device:{deviceId}:module:{moduleIndex}`.
    - **Response:** The UOS (Unified Object Structure) JSON.
5. **Control Commands**
    - **POST** `/api/commands`
    - **Logic:** Emit `command.request` event to EventBus.
    - **Body:**
        
        ```json
        {
          "deviceId": "...",
          "messageType": "CLN_ALARM", // or QRY_RFID_SNAPSHOT, SET_COLOR
          "payload": { "uIndex": 10, "colorCode": 1 }
        }
        
        ```
        

### 4.4 Cache Watchdog Service (src/modules/normalizer/CacheWatchdog.js)

- **Goal:** Detect silent failures (power loss, network disconnect) where devices stop sending data.
- **Logic:**
    1. **Timer:** Runs every config.checkInterval (e.g., 30s).
    2. **Scan:** Iterates through all Module keys in StateCache.
    3. **Check:** Calculates gap = Now - module.lastSeen_hb.
    4. **Expire:** If gap > config.heartbeatTimeout:
        - Set module.isOnline = false in Cache.
        - (Optional) Emit a `DEVICE_STATUS_CHANGE` event if you want the Dashboard to know immediately without polling.

---

## 5. Configuration (`default.json`)

```json
{
  "app": { "name": "IoT Middleware Pro", "version": "2.0.0" },
  "mqtt": {
    "brokerUrl": "mqtt://localhost:1883",
    "topics": { "v5008": "V5008Upload/+/#", "v6800": "V6800Upload/+/#" }
  },
  "database": {
    "client": "mysql2",
    "connection": { "host": "localhost", "user": "root", "database": "iot_middleware" }
  },
  
  //"modules": {
  //  "storage": { "batchSize": 100, "flushInterval": 1000 },
  //  "normalizer": { "cacheType": "memory" },
  //  "command": { "enabled": true }
  //}
    
  "modules": {
    "storage": { 
      "enabled": true,
      "batchSize": 100, 
      "flushInterval": 1000,
      // If empty, allow ALL. If populated, only process these types.
      "filters": [] 
    },
    "webhook": {
      "enabled": true,
      "url": "http://...",
      // Example: Only send Alarms and Door events to Webhook
      "filters": ["RFID_EVENT", "DOOR_STATE", "META_CHANGED_EVENT"]
    },
    "mqttRelay": {
      "enabled": false,
      "filters": []
    },
    "api": { "enabled": true },
    "websocket": { "enabled": true },
    "normalizer": { "cacheType": "memory" },
    "command": { "enabled": true }
  }
  
  "normalizer": { 
        "cacheType": "memory",
        "heartbeatTimeout": 120000, // 120 Seconds (2 minutes)
        "checkInterval": 30000      // Run check every 30s
    }
  
  
}

```

-- END OF FILE ---