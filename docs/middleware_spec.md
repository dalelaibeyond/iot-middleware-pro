# middleware_spec

# IoT Middleware Pro - As-Built Specification

> **Version:** 2.0.0
> 
> 
> **Last Updated:** 2026-02-12
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
  }
}
```

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
| `POST` | `/api/commands` | Submit control command (returns 202 Accepted) |

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

### 5.1 Device Metadata

```sql
CREATE TABLE iot_meta_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    device_type CHAR(5) NOT NULL,
    device_fwVer VARCHAR(32),
    device_mask VARCHAR(32),
    device_gwIp VARCHAR(32),
    device_ip VARCHAR(32),
    device_mac VARCHAR(32),
    modules JSON,
    parse_at DATETIME(3) NOT NULL,
    update_at DATETIME(3) NOT NULL,
    UNIQUE KEY uk_device_id (device_id)
);
```

### 5.2 Telemetry Tables (Pivoted)

```sql
-- Temperature/Humidity (sensor indices 10-15)
CREATE TABLE iot_temp_hum (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    temp_index10 DECIMAL(5,2), hum_index10 DECIMAL(5,2),
    temp_index11 DECIMAL(5,2), hum_index11 DECIMAL(5,2),
    temp_index12 DECIMAL(5,2), hum_index12 DECIMAL(5,2),
    temp_index13 DECIMAL(5,2), hum_index13 DECIMAL(5,2),
    temp_index14 DECIMAL(5,2), hum_index14 DECIMAL(5,2),
    temp_index15 DECIMAL(5,2), hum_index15 DECIMAL(5,2),
    parse_at DATETIME(3) NOT NULL,
    INDEX idx_th (device_id, module_index, parse_at DESC)
);

-- Noise Level (sensor indices 16-18)
CREATE TABLE iot_noise_level (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    noise_index16 DECIMAL(5,2),
    noise_index17 DECIMAL(5,2),
    noise_index18 DECIMAL(5,2),
    parse_at DATETIME(3) NOT NULL,
    INDEX idx_noise (device_id, module_index, parse_at DESC)
);
```

### 5.3 Event Tables

```sql
CREATE TABLE iot_rfid_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    sensor_index INT NOT NULL,
    tag_id VARCHAR(32) NOT NULL,
    action CHAR(10) NOT NULL, -- "ATTACHED" or "DETACHED"
    alarm BOOLEAN DEFAULT FALSE,
    parse_at DATETIME(3) NOT NULL,
    INDEX idx_rfid_evt (tag_id, device_id, module_index, parse_at DESC)
);

CREATE TABLE iot_door_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    doorState INT,
    door1State INT,
    door2State INT,
    parse_at DATETIME(3) NOT NULL,
    INDEX idx_door (device_id, module_index, parse_at DESC)
);

CREATE TABLE iot_topchange_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(32) NOT NULL,
    device_type CHAR(5) NOT NULL,
    event_desc VARCHAR(512) NOT NULL,
    parse_at DATETIME(3) NOT NULL,
    INDEX idx_top_chng (device_id, parse_at DESC)
);
```

---

## 6. Storage Service Routing

| SUO Type | Target Table | Logic |
| --- | --- | --- |
| `HEARTBEAT` | `iot_heartbeat` | Store payload as JSON |
| `RFID_SNAPSHOT` | `iot_rfid_snapshot` | Store payload as JSON |
| `RFID_EVENT` | `iot_rfid_event` | Insert 1 row per payload item |
| `TEMP_HUM` | `iot_temp_hum` | Pivot: map sensorIndex to columns |
| `NOISE_LEVEL` | `iot_noise_level` | Pivot: map sensorIndex to columns |
| `DOOR_STATE` | `iot_door_event` | Map doorState/door1State/door2State |
| `DEVICE_METADATA` | `iot_meta_data` | UPSERT on device_id |
| `META_CHANGED_EVENT` | `iot_topchange_event` | Insert per description |
| `QRY_CLR_RESP` | `iot_cmd_result` | Map colorMap to `iot_cmd_result.color_map` JSON column |

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