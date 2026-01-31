# IoT Middleware Pro - Data Workflow

## Overview

This document describes the complete data flow from raw MQTT messages to storage in the IoT Middleware Pro system, focusing on the transformation pipeline: **Raw → SIF → SUO/UOS → StorageService**.

## Data Flow Diagram

```
┌─────────────────┐
│  IoT Devices    │
│  (V5008/V6800) │
└────────┬────────┘
         │ MQTT Messages
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. MqttSubscriber (Ingress)                                  │
│    - Receives raw MQTT messages                               │
│    - Extracts deviceId, deviceType, messageType from topic    │
│    - Parses payload (binary for V5008, JSON for V6800)       │
│    - Emits: mqtt.message                                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ParserManager (Parser Router)                              │
│    - Subscribes to: mqtt.message                              │
│    - Routes to appropriate parser based on deviceType          │
│    - Emits: data.parsed (SIF)                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│ V5008Parser     │     │ V6800Parser     │
│ (Binary)        │     │ (JSON)          │
└────────┬─────────┘     └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SIF (Standard Intermediate Format)                          │
│    - Device-specific parsed format                              │
│    - Contains: deviceId, deviceType, messageType, messageId,    │
│      data/meta fields                                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. UnifyNormalizer (Normalization)                            │
│    - Subscribes to: data.parsed                               │
│    - Converts SIF to SUO (Standard Unified Object)            │
│    - Uses StateCache for diffing and state management          │
│    - Emits: data.normalized (SUO)                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SUO/UOS (Standard Unified Object)                          │
│    - Unified format for all device types                       │
│    - Contains: deviceId, deviceType, messageType, messageId,    │
│      moduleIndex, moduleId, payload                            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. StorageService (Batch Writer & Pivoting)                   │
│    - Subscribes to: data.normalized                           │
│    - Routes SUO to appropriate handler based on messageType    │
│    - Batches data for efficient database writes                 │
│    - Uses Database module for MySQL operations                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Database (MySQL)                                          │
│    - Stores normalized data in appropriate tables               │
│    - Tables: iot_heartbeat, iot_rfid_snapshot, etc.          │
└─────────────────────────────────────────────────────────────────┘
```

## Module Dependencies

### Initialization Order (ModuleManager)

```javascript
const initOrder = [
  "database", // 1. Database connection pool
  "eventBus", // 2. Event emitter
  "mqttSubscriber", // 3. MQTT ingress
  "parserManager", // 4. Parser router
  "normalizer", // 5. Normalizer (SIF → SUO)
  "storage", // 6. Storage service (SUO → DB)
  "command", // 7. Command service
  "mqttRelay", // 8. MQTT relay (egress)
  "webhook", // 9. Webhook service (egress)
  "apiServer", // 10. API server (egress)
  "webSocketServer", // 11. WebSocket server (egress)
  "cacheWatchdog", // 12. Cache watchdog
];
```

### Who Depends on Whom

| Module              | Depends On                             | Referenced By                              |
| ------------------- | -------------------------------------- | ------------------------------------------ |
| **Database**        | config                                 | All modules that need DB access            |
| **EventBus**        | events (Node.js)                       | All modules (event-driven communication)   |
| **MqttSubscriber**  | mqtt, EventBus                         | ParserManager (via mqtt.message event)     |
| **ParserManager**   | EventBus, V5008Parser, V6800Parser     | UnifyNormalizer (via data.parsed event)    |
| **V5008Parser**     | (none)                                 | ParserManager                              |
| **V6800Parser**     | (none)                                 | ParserManager                              |
| **UnifyNormalizer** | config, EventBus, StateCache           | StorageService (via data.normalized event) |
| **StateCache**      | (none)                                 | UnifyNormalizer, StorageService            |
| **StorageService**  | EventBus, Database, StateCache, config | (Consumer of SUO events)                   |

## Event Flow

### EventBus Events

| Event Name        | Emitted By                      | Consumed By                                                | Payload                                                          |
| ----------------- | ------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `mqtt.message`    | MqttSubscriber                  | ParserManager                                              | `{topic, deviceId, deviceType, messageType, payload, timestamp}` |
| `data.parsed`     | ParserManager                   | UnifyNormalizer                                            | SIF (Standard Intermediate Format)                               |
| `data.normalized` | UnifyNormalizer                 | StorageService, MqttRelay, WebhookService, WebSocketServer | SUO (Standard Unified Object)                                    |
| `command.request` | UnifyNormalizer, CommandService | MqttRelay                                                  | `{deviceId, messageType, ...}`                                   |
| `error`           | All modules                     | Error handlers                                             | `{error, source, timestamp}`                                     |

## Detailed Data Transformations

### 1. Raw → SIF (ParserManager + Device Parsers)

#### V5008Parser (Binary Protocol)

**Input:** Raw binary buffer from MQTT

**Message Types:**

- `HEARTBEAT` (Header: 0xCC or 0xCB)
- `RFID_SNAPSHOT` (Header: 0xBB or topic ends with `/LabelState`)
- `TEMP_HUM` (Topic ends with `/TemHum`)
- `NOISE_LEVEL` (Topic ends with `/Noise`)
- `DOOR_STATE` (Header: 0xBA)
- `DEVICE_INFO` (Header: 0xEF01)
- `MODULE_INFO` (Header: 0xEF02)
- `QRY_CLR_RESP` (Header: 0xAA, Command: 0xE4)
- `SET_CLR_RESP` (Header: 0xAA, Command: 0xE1)
- `CLN_ALM_RESP` (Header: 0xAA, Command: 0xE2)

**SIF Output Structure:**

```javascript
{
  deviceId: "ABC123",
  deviceType: "V5008",
  messageType: "HEARTBEAT",
  messageId: "12345",
  meta: {
    topic: "V5008Upload/ABC123/heartbeat",
    rawHex: "CC..."
  },
  data: [
    { moduleIndex: 1, moduleId: "123", uTotal: 10 },
    ...
  ]
}
```

#### V6800Parser (JSON Protocol)

**Input:** JSON string from MQTT

**Message Types:**

- `HEARTBEAT` (msg_type: heart_beat_req)
- `RFID_SNAPSHOT` (msg_type: u_state_resp)
- `RFID_EVENT` (msg_type: u_state_changed_notify_req)
- `TEMP_HUM` (msg_type: temper_humidity_exception_nofity_req or temper_humidity_resp)
- `DOOR_STATE` (msg_type: door_state_changed_notify_req)
- `QRY_DOOR_STATE_RESP` (msg_type: door_state_resp)
- `DEV_MOD_INFO` (msg_type: devies_init_req)
- `UTOTAL_CHANGED` (msg_type: devices_changed_req)
- `QRY_CLR_RESP` (msg_type: u_color)
- `SET_CLR_RESP` (msg_type: set_module_property_result_req)
- `CLN_ALM_RESP` (msg_type: clear_u_warning)

**SIF Output Structure:**

```javascript
{
  deviceId: "ABC123",
  deviceType: "V6800",
  messageType: "HEARTBEAT",
  messageId: "12345",
  ip: "192.168.1.100",
  mac: "00:11:22:33:44:55",
  meta: {
    topic: "V6800Upload/ABC123/heartbeat",
    rawType: "heart_beat_req"
  },
  data: [
    { moduleIndex: 1, moduleId: "123", uTotal: 10 },
    ...
  ]
}
```

### 2. SIF → SUO (UnifyNormalizer)

**Input:** SIF from ParserManager

**Output:** SUO (Standard Unified Object)

**SUO Structure:**

```javascript
{
  deviceId: "ABC123",
  deviceType: "V5008",
  messageType: "HEARTBEAT",
  messageId: "12345",
  moduleIndex: 1,
  moduleId: "123",
  payload: [
    { moduleIndex: 1, moduleId: "123", uTotal: 10 },
    ...
  ]
}
```

**Message Type Handlers:**

| Message Type                                     | Handler                    | Output SUO                                                  |
| ------------------------------------------------ | -------------------------- | ----------------------------------------------------------- |
| `HEARTBEAT`                                      | `handleHeartbeat()`        | Emits HEARTBEAT SUO + updates cache + emits DEVICE_METADATA |
| `RFID_SNAPSHOT`                                  | `handleRfidSnapshot()`     | Emits RFID_SNAPSHOT SUO + emits RFID_EVENT for changes      |
| `RFID_EVENT`                                     | `handleRfidEvent()`        | Emits RFID_EVENT SUO (V5008) or triggers sync (V6800)       |
| `TEMP_HUM`                                       | `handleTempHum()`          | Emits TEMP_HUM SUO                                          |
| `NOISE_LEVEL`                                    | `handleNoiseLevel()`       | Emits NOISE_LEVEL SUO                                       |
| `DOOR_STATE`                                     | `handleDoorState()`        | Emits DOOR_STATE SUO                                        |
| `DEVICE_INFO` / `MODULE_INFO` / `DEV_MOD_INFO`   | `handleMetadata()`         | Emits DEVICE_METADATA SUO + emits META_CHANGED_EVENT        |
| `UTOTAL_CHANGED`                                 | `handleUtotalChanged()`    | Emits DEVICE_METADATA SUO + emits META_CHANGED_EVENT        |
| `QRY_CLR_RESP` / `SET_CLR_RESP` / `CLN_ALM_RESP` | `handleCommandResponses()` | Emits command response SUO                                  |

**StateCache Usage:**

- Stores telemetry data (RFID snapshots, temp/hum, noise, door state)
- Stores metadata (device info, active modules)
- Used for diffing (RFID snapshot comparison)
- Used for change detection (metadata changes)

### 3. SUO → StorageService (StorageService)

**Input:** SUO from UnifyNormalizer

**Output:** Database records (batched)

**Message Type Handlers:**

| Message Type         | Handler                    | Database Table              |
| -------------------- | -------------------------- | --------------------------- |
| `HEARTBEAT`          | `handleHeartbeat()`        | `iot_heartbeat`             |
| `RFID_SNAPSHOT`      | `handleRfidSnapshot()`     | `iot_rfid_snapshot`         |
| `RFID_EVENT`         | `handleRfidEvent()`        | `iot_rfid_event`            |
| `TEMP_HUM`           | `handleTempHum()`          | `iot_temp_hum` (pivoted)    |
| `NOISE_LEVEL`        | `handleNoiseLevel()`       | `iot_noise_level` (pivoted) |
| `DOOR_STATE`         | `handleDoorState()`        | `iot_door_event`            |
| `DEVICE_METADATA`    | `handleDeviceMetadata()`   | `iot_meta_data` (upsert)    |
| `QRY_CLR_RESP`       | `handleCmdResult()`        | `iot_cmd_result`            |
| `META_CHANGED_EVENT` | `handleMetaChangedEvent()` | `iot_topchange_event`       |

**Batching Logic:**

- Buffers data in memory (`batchBuffer` Map)
- Flushes when batch size reached (default: 100)
- Periodic flush interval (default: 1000ms)
- One batch per table

**Pivoting Logic:**

- `TEMP_HUM`: Groups by moduleIndex, pivots sensorIndex → `temp_indexXX`, `hum_indexXX`
- `NOISE_LEVEL`: Groups by moduleIndex, pivots sensorIndex → `noise_indexXX`

## Database Tables

| Table                 | Message Type       | Key Fields                                                                                                                 |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `iot_heartbeat`       | HEARTBEAT          | device_id, modules (JSON), parse_at                                                                                        |
| `iot_rfid_snapshot`   | RFID_SNAPSHOT      | device_id, module_index, rfid_snapshot (JSON), parse_at                                                                    |
| `iot_rfid_event`      | RFID_EVENT         | device_id, module_index, sensor_index, tag_id, action, alarm, parse_at                                                     |
| `iot_temp_hum`        | TEMP_HUM           | device_id, module_index, temp_index10-15, hum_index10-15, parse_at                                                         |
| `iot_noise_level`     | NOISE_LEVEL        | device_id, module_index, noise_index16-18, parse_at                                                                        |
| `iot_door_event`      | DOOR_STATE         | device_id, module_index, doorState, door1State, door2State, parse_at                                                       |
| `iot_meta_data`       | DEVICE_METADATA    | device_id, device_type, device_fwVer, device_mask, device_gwIp, device_ip, device_mac, modules (JSON), parse_at, update_at |
| `iot_cmd_result`      | QRY_CLR_RESP       | device_id, cmd, result, original_req, color_map (JSON), parse_at                                                           |
| `iot_topchange_event` | META_CHANGED_EVENT | device_id, device_type, event_desc, parse_at, update_at                                                                    |

## File References

| Component       | File Path                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------- |
| EventBus        | [`src/core/EventBus.js`](../src/core/EventBus.js)                                           |
| ModuleManager   | [`src/core/ModuleManager.js`](../src/core/ModuleManager.js)                                 |
| Database        | [`src/core/Database.js`](../src/core/Database.js)                                           |
| MqttSubscriber  | [`src/modules/ingress/MqttSubscriber.js`](../src/modules/ingress/MqttSubscriber.js)         |
| ParserManager   | [`src/modules/parsers/ParserManager.js`](../src/modules/parsers/ParserManager.js)           |
| V5008Parser     | [`src/modules/parsers/V5008Parser.js`](../src/modules/parsers/V5008Parser.js)               |
| V6800Parser     | [`src/modules/parsers/V6800Parser.js`](../src/modules/parsers/V6800Parser.js)               |
| UnifyNormalizer | [`src/modules/normalizer/UnifyNormalizer.js`](../src/modules/normalizer/UnifyNormalizer.js) |
| StateCache      | [`src/modules/normalizer/StateCache.js`](../src/modules/normalizer/StateCache.js)           |
| StorageService  | [`src/modules/storage/StorageService.js`](../src/modules/storage/StorageService.js)         |

## Summary

1. **Raw Data**: MQTT messages from IoT devices (binary for V5008, JSON for V6800)
2. **SIF**: Device-specific parsed format (Standard Intermediate Format)
3. **SUO/UOS**: Unified format for all devices (Standard Unified Object)
4. **StorageService**: Batch writer that routes SUO to appropriate database tables

**Key Points:**

- Event-driven architecture via EventBus
- Decoupled modules with clear dependencies
- State caching for diffing and change detection
- Batch writing for efficient database operations
- Pivoting for sensor data (temp/hum, noise)
