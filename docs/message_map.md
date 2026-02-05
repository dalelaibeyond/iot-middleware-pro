# message_map

# IoT Middleware Pro - Message Map Document

**Version:** 2.0.0

**Purpose:** Quick reference for programmers and users showing field transformations through the middleware pipeline.

---

## Table of Contents

1. [Overview](about:blank#overview)
2. [Message Flow](about:blank#message-flow)
3. [Message Type Reference](about:blank#message-type-reference)
4. [Field Mapping by Message Type](about:blank#field-mapping-by-message-type)
5. [Database Schema Reference](about:blank#database-schema-reference)

---

## Overview

This document traces message fields through the entire IoT middleware pipeline:

```
RAW (Device) → SIF (Parser) → SUO (Normalizer) → UOS (Output) → DB (Storage)
```

### Pipeline Stages

| Stage | Description | Module |
| --- | --- | --- |
| **RAW** | Raw binary (V5008) or JSON (V6800) data from device | [`MqttSubscriber`](../src/modules/ingress/MqttSubscriber.js) |
| **SIF** | Standard Intermediate Format - parsed but not normalized | [`V5008Parser`](../src/modules/parsers/V5008Parser.js), [`V6800Parser`](../src/modules/parsers/V6800Parser.js) |
| **SUO** | Standard Unified Object - normalized with standardized field names | [`UnifyNormalizer`](../src/modules/normalizer/UnifyNormalizer.js) |
| **UOS** | Unified Output Structure - ready for output/storage | [`StorageService`](../src/modules/storage/StorageService.js) |
| **DB** | Database tables with pivoted/normalized columns | MySQL (see [`schema.sql`](../database/schema.sql)) |

### Supported Device Types

| Device Type | Protocol | Parser |
| --- | --- | --- |
| V5008 | Binary | [`V5008Parser`](../src/modules/parsers/V5008Parser.js) |
| V6800 | JSON | [`V6800Parser`](../src/modules/parsers/V6800Parser.js) |

---

## Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         IoT Middleware Pro Pipeline                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────┐               │
│  │   RAW    │───▶│     SIF     │───▶│     SUO       │               │
│  │ (Device) │    │ (Parser)     │    │ (Normalizer)  │               │
│  └──────────┘    └──────────────┘    └────────────────┘               │
│       │                  │                     │                          │
│       │                  │                     │                          │
│       ▼                  ▼                     ▼                          │
│  Binary/JSON        Standardized        Normalized                     │
│  Protocol          Intermediate        Unified Object                     │
│                    Format                                                │
│                                                                         │
│                                         ┌─────────────────────────────┐  │
│                                         │          UOS             │  │
│                                         │    (Output Modules)       │  │
│                                         └─────────────────────────────┘  │
│                                          │        │        │              │
│                                          ▼        ▼        ▼              │
│                                    ┌────────┐ ┌──────┐ ┌────────┐         │
│                                    │  WS   │ │ MQTT │ │ Webhook│         │
│                                    │ Server │ │ Relay│ │Service │         │
│                                    └────────┘ └──────┘ └────────┘         │
│                                          │        │        │              │
│                                          └────────┴────────┘              │
│                                                   ▼                      │
│                                            ┌──────────────┐             │
│                                            │   Storage    │             │
│                                            │   Service    │             │
│                                            └──────────────┘             │
│                                                   │                      │
│                                                   ▼                      │
│                                            ┌──────────────┐             │
│                                            │  Database    │             │
│                                            │   (MySQL)    │             │
│                                            └──────────────┘             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Message Type Reference

| Message Type | Description | RAW Source | SIF Type | SUO Type | DB Table |
| --- | --- | --- | --- | --- | --- |
| **HEARTBEAT** | Device heartbeat with module status | V5008: 0xCC/0xCB, V6800: `heart_beat_req` | `HEARTBEAT` | `HEARTBEAT` | `iot_heartbeat` |
| **DEVICE_INFO** | Device-level metadata | V5008: 0xEF01,  V6800: N/A | `DEVICE_INFO` | `DEVICE_METADATA` | `iot_meta_data` |
| **MODULE_INFO** | Module firmware info | V5008: 0xEF02,  V6800: N/A | `MODULE_INFO` | `DEVICE_METADATA` | `iot_meta_data` |
| **DEV_MOD_INFO** | Device & module info combined | V5008: N/A,  V6800: `devies_init_req` | `DEV_MOD_INFO` | `DEVICE_METADATA` | `iot_meta_data` |
| **UTOTAL_CHANGED** | Module topology change | V5008: N/A,  V6800: `devices_changed_req` | `UTOTAL_CHANGED` | `META_CHANGED_EVENT` | `iot_topchange_event` |
|  |  |  |  |  |  |
| **RFID_SNAPSHOT** | Full RFID tag inventory | V5008: 0xBB, Topic: `/LabelState`,  V6800: `u_state_resp` | `RFID_SNAPSHOT` | `RFID_SNAPSHOT` | `iot_rfid_snapshot` |
| **RFID_EVENT** | RFID tag attach/detach event | V5008: N/A (derived from snapshot diff)V6800: `u_state_changed_notify_req` | `RFID_EVENT` | `RFID_EVENT` | `iot_rfid_event` |
| **TEMP_HUM** | Temperature & humidity readings | V5008: Topic: `/TemHum`,  V6800: `temper_humidity_exception_nofity_req`, `temper_humidity_resp` | `TEMP_HUM` | `TEMP_HUM` | `iot_temp_hum` |
| **NOISE_LEVEL** | Noise level readings | V5008: Topic: `/Noise`,   V6800: N/A | `NOISE_LEVEL` | `NOISE_LEVEL` | `iot_noise_level` |
| **DOOR_STATE** | Door state change event | V5008: 0xBA,  V6800: `door_state_changed_notify_req` | `DOOR_STATE` | `DOOR_STATE` | `iot_door_event` |
| **QRY_DOOR_STATE_RESP** | Door state query response | V5008: N/A,  V6800: `door_state_resp` | `QRY_DOOR_STATE_RESP` | `DOOR_STATE` | `iot_door_event` |
|  |  |  |  |  |  |
| **QRY_CLR_RESP** | Query color response | V5008: 0xAA + 0xE4, V6800: `u_color` | `QRY_CLR_RESP` | `QRY_CLR_RESP` | `iot_cmd_result` |
| **SET_CLR_RESP** | Set color response | V5008: 0xAA + 0xE1, V6800: `set_module_property_result_req` | `SET_CLR_RESP` | `SET_CLR_RESP` | `iot_cmd_result` |
| **CLN_ALM_RESP** | Clear alarm response | V5008: 0xAA + 0xE2, V6800: `clear_u_warning` | `CLN_ALM_RESP` | `CLN_ALM_RESP` | `iot_cmd_result` |
|  |  |  |  |  |  |
| **META_CHANGED_EVENT** | Metadata change event (generated) | N/A (generated by normalizer) | `META_CHANGED_EVENT` | `META_CHANGED_EVENT` | `iot_topchange_event` |

---

## Field Mapping by Message Type

### 1. HEARTBEAT

### V5008 (Binary) → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| Header | 0 | 1 | - | 0xCC or 0xCB |  |
| ModAddr | 1 + i×6 | 1 | `data[].moduleIndex` | Module address (1-5) |  |
| ModId | 2 + i×6 | 4 | `data[].moduleId` | Module ID (Big-Endian) |  |
| Total | 6 + i×6 | 1 | `data[].uTotal` | Total units count |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID (Big-Endian) |  |

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "HEARTBEAT",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  data: [
    { moduleIndex: 1, moduleId: "12345678", uTotal: 6 },
    ...
  ]
}
```

### V6800 (JSON) → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `heart_beat_req` → `HEARTBEAT` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].module_u_num` | `data[].uTotal` | number | Total units count |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "HEARTBEAT",
  messageId: "string",
  meta: { topic: "...", rawType: "heart_beat_req" },
  data: [
    { moduleIndex: 0, moduleId: "12345678", uTotal: 6 },
    ...
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `data[].moduleIndex` | `payload[].moduleIndex` | number | Pass through |
| `data[].moduleId` | `payload[].moduleId` | string | Pass through |
| `data[].uTotal` | `payload[].uTotal` | number | Pass through |

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "HEARTBEAT",
  messageId: "string",
  payload: [
    { moduleIndex: 1, moduleId: "12345678", uTotal: 6 },
    ...
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_heartbeat` | VARCHAR(32) |  |
| `payload` | `modules` | `iot_heartbeat` | JSON (stringified) |  |
| (auto) | `parse_at` | `iot_heartbeat` | DATETIME(3) |  |

**DB Record:**

```sql
INSERT INTO iot_heartbeat (device_id, modules, parse_at)
VALUES ('V5008_001', '[{"moduleIndex":1,"moduleId":"12345678","uTotal":6}]', NOW(3));
```

---

### 2. RFID_SNAPSHOT

### V5008 (Binary) → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| Header | 0 | 1 | - | 0xBB |  |
| ModAddr | 1 | 1 | `moduleIndex` | Module address |  |
| ModId | 2 | 4 | `moduleId` | Module ID (Big-Endian) |  |
| Res | 6 | 1 | - | Reserved |  |
| Total | 7 | 1 | `uTotal` | Total units |  |
| Count | 8 | 1 | `onlineCount` | Online units count |  |
| uPos | 9 + i×6 | 1 | `data[].uIndex` | Unit position |  |
| Alarm | 10 + i×6 | 1 | `data[].isAlarm` | Alarm flag (0x01 = true) |  |
| TagId | 11 + i×6 | 4 | `data[].tagId` | Tag ID (hex) |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "RFID_SNAPSHOT",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  moduleIndex: 1,
  moduleId: "12345678",
  uTotal: 6,
  onlineCount: 3,
  data: [
    { uIndex: 1, isAlarm: false, tagId: "AABBCCDD" },
    ...
  ]
}
```

### V6800 (JSON) → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `u_state_resp` → `RFID_SNAPSHOT` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].data[].u_index` | `data[].data[].uIndex` | number | Unit index |
| `data[].data[].tag_code` | `data[].data[].tagId` | string | Tag ID |
| `data[].data[].warning` | `data[].data[].isAlarm` | boolean | Alarm flag |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "RFID_SNAPSHOT",
  messageId: "string",
  meta: { topic: "...", rawType: "u_state_resp" },
  data: [
    {
      moduleIndex: 0,
      moduleId: "12345678",
      data: [
        { uIndex: 1, tagId: "AABBCCDD", isAlarm: false },
        ...
      ]
    }
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `moduleIndex` | `moduleIndex` | number | Pass through |
| `moduleId` | `moduleId` | string | Pass through |
| `data[].uIndex` | `payload[].sensorIndex` | number | Renamed for consistency |
| `data[].tagId` | `payload[].tagId` | string | Pass through |
| `data[].isAlarm` | `payload[].isAlarm` | boolean | Pass through |

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "RFID_SNAPSHOT",
  messageId: "string",
  moduleIndex: 1,
  moduleId: "12345678",
  payload: [
    { sensorIndex: 1, tagId: "AABBCCDD", isAlarm: false },
    ...
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_rfid_snapshot` | VARCHAR(32) |  |
| `moduleIndex` | `module_index` | `iot_rfid_snapshot` | INT |  |
| `payload` | `rfid_snapshot` | `iot_rfid_snapshot` | JSON (stringified) |  |
| (auto) | `parse_at` | `iot_rfid_snapshot` | DATETIME(3) |  |

**DB Record:**

```sql
INSERT INTO iot_rfid_snapshot (device_id, module_index, rfid_snapshot, parse_at)
VALUES ('V5008_001', 1, '[{"sensorIndex":1,"tagId":"AABBCCDD","isAlarm":false}]', NOW(3));
```

---

### 3. RFID_EVENT

### V5008 (Binary) → SIF

**Note:** V5008 does not have native RFID_EVENT. Events are generated by diffing snapshots in [`UnifyNormalizer.diffRfidSnapshots()`](../src/modules/normalizer/UnifyNormalizer.js:1561).

### V6800 (JSON) → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `u_state_changed_notify_req` → `RFID_EVENT` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].data[].u_index` | `data[].data[].uIndex` | number | Unit index |
| `data[].data[].tag_code` | `data[].data[].tagId` | string | Tag ID |
| `data[].data[].warning` | `data[].data[].isAlarm` | boolean | Alarm flag |
| `data[].data[].new_state` | `data[].data[].action` | string | Derived: 1/0 → ATTACHED, 0/1 → DETACHED |
| `data[].data[].old_state` | `data[].data[].action` | string | Used for action derivation |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "RFID_EVENT",
  messageId: "string",
  meta: { topic: "...", rawType: "u_state_changed_notify_req" },
  data: [
    {
      moduleIndex: 0,
      moduleId: "12345678",
      data: [
        { uIndex: 1, tagId: "AABBCCDD", isAlarm: false, action: "ATTACHED" },
        ...
      ]
    }
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `moduleIndex` | `moduleIndex` | number | Pass through |
| `moduleId` | `moduleId` | string | Pass through |
| `data[].uIndex` | `payload[].sensorIndex` | number | Renamed for consistency |
| `data[].tagId` | `payload[].tagId` | string | Pass through |
| `data[].isAlarm` | `payload[].isAlarm` | boolean | Pass through |
| `data[].action` | `payload[].action` | string | Pass through |

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V6800",
  messageType: "RFID_EVENT",
  messageId: "string",
  moduleIndex: 0,
  moduleId: "12345678",
  payload: [
    { sensorIndex: 1, tagId: "AABBCCDD", isAlarm: false, action: "ATTACHED" }
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_rfid_event` | VARCHAR(32) |  |
| `payload[].moduleIndex` | `module_index` | `iot_rfid_event` | INT |  |
| `payload[].sensorIndex` | `sensor_index` | `iot_rfid_event` | INT |  |
| `payload[].tagId` | `tag_id` | `iot_rfid_event` | VARCHAR(32) |  |
| `payload[].action` | `action` | `iot_rfid_event` | CHAR(10) |  |
| `payload[].isAlarm` | `alarm` | `iot_rfid_event` | BOOLEAN |  |
| (auto) | `parse_at` | `iot_rfid_event` | DATETIME(3) |  |

**DB Record:**

```sql
INSERT INTO iot_rfid_event (device_id, module_index, sensor_index, tag_id, action, alarm, parse_at)
VALUES ('V6800_001', 0, 1, 'AABBCCDD', 'ATTACHED', FALSE, NOW(3));
```

---

### 4. TEMP_HUM

### V5008 (Binary) → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| ModAddr | 0 | 1 | `moduleIndex` | Module address |  |
| ModId | 1 | 4 | `moduleId` | Module ID (Big-Endian) |  |
| Addr | 5 + i×5 | 1 | `data[].thIndex` | Sensor address (1-6) |  |
| T_Int | 6 + i×5 | 1 | `data[].temp` | Temperature integer (signed) |  |
| T_Frac | 7 + i×5 | 1 | `data[].temp` | Temperature fraction |  |
| H_Int | 8 + i×5 | 1 | `data[].hum` | Humidity integer (signed) |  |
| H_Frac | 9 + i×5 | 1 | `data[].hum` | Humidity fraction |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**Algorithm A - Signed Sensor Values:**
- If both integer and fraction bytes are 0x00 → return null
- Check sign bit (0x80) for two’s complement
- Combine: signedInt + sign × (fraction / 100)
- Round to 2 decimal places

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "TEMP_HUM",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  moduleIndex: 1,
  moduleId: "12345678",
  data: [
    { thIndex: 1, temp: 25.5, hum: 60.0 },
    ...
  ]
}
```

### V6800 (JSON) → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `temper_humidity_exception_nofity_req` or `temper_humidity_resp` → `TEMP_HUM` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].data[].temper_position` | `data[].data[].thIndex` | number | Sensor position |
| `data[].data[].temper_swot` | `data[].data[].temp` | number/null | 0 → null, otherwise value |
| `data[].data[].hygrometer_swot` | `data[].data[].hum` | number/null | 0 → null, otherwise value |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "TEMP_HUM",
  messageId: "string",
  meta: { topic: "...", rawType: "temper_humidity_exception_nofity_req" },
  data: [
    {
      moduleIndex: 0,
      moduleId: "12345678",
      data: [
        { thIndex: 1, temp: 25.5, hum: 60.0 },
        ...
      ]
    }
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `moduleIndex` | `moduleIndex` | number | Pass through |
| `moduleId` | `moduleId` | string | Pass through |
| `data[].thIndex` | `payload[].sensorIndex` | number | Renamed for consistency |
| `data[].temp` | `payload[].temp` | number/null | Pass through |
| `data[].hum` | `payload[].hum` | number/null | Pass through |

**Filter:** Readings where both temp and hum are 0 or null are filtered out.

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "TEMP_HUM",
  messageId: "string",
  moduleIndex: 1,
  moduleId: "12345678",
  payload: [
    { sensorIndex: 10, temp: 25.5, hum: 60.0 },
    ...
  ]
}
```

### SUO → DB (Pivoted)

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_temp_hum` | VARCHAR(32) |  |
| `moduleIndex` | `module_index` | `iot_temp_hum` | INT |  |
| `payload[].sensorIndex` | `temp_indexXX` | `iot_temp_hum` | DECIMAL(5,2) |  |
| `payload[].sensorIndex` | `hum_indexXX` | `iot_temp_hum` | DECIMAL(5,2) |  |
| (auto) | `parse_at` | `iot_temp_hum` | DATETIME(3) |  |

**Pivot Mapping:** sensorIndex 10-15 → temp_index10-15, hum_index10-15

**DB Record:**

```sql
INSERT INTO iot_temp_hum (device_id, module_index, temp_index10, hum_index10, temp_index11, hum_index11, ..., parse_at)
VALUES ('V5008_001', 1, 25.5, 60.0, NULL, NULL, ..., NOW(3));
```

---

### 5. NOISE_LEVEL

### V5008 (Binary) → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| ModAddr | 0 | 1 | `moduleIndex` | Module address |  |
| ModId | 1 | 4 | `moduleId` | Module ID (Big-Endian) |  |
| Addr | 5 + i×3 | 1 | `data[].nsIndex` | Sensor address (1-3) |  |
| N_Int | 6 + i×3 | 1 | `data[].noise` | Noise integer (signed) |  |
| N_Frac | 7 + i×3 | 1 | `data[].noise` | Noise fraction |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**Algorithm A - Signed Sensor Values:** Same as TEMP_HUM

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "NOISE_LEVEL",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  moduleIndex: 1,
  moduleId: "12345678",
  data: [
    { nsIndex: 1, noise: 45.5 },
    ...
  ]
}
```

### V6800 (JSON) → SIF

**Note:** V6800 does not have native NOISE_LEVEL messages.

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `moduleIndex` | `moduleIndex` | number | Pass through |
| `moduleId` | `moduleId` | string | Pass through |
| `data[].nsIndex` | `payload[].sensorIndex` | number | Renamed for consistency |
| `data[].noise` | `payload[].noise` | number/null | Pass through |

**Filter:** Readings where noise is null are filtered out.

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "NOISE_LEVEL",
  messageId: "string",
  moduleIndex: 1,
  moduleId: "12345678",
  payload: [
    { sensorIndex: 16, noise: 45.5 },
    ...
  ]
}
```

### SUO → DB (Pivoted)

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_noise_level` | VARCHAR(32) |  |
| `moduleIndex` | `module_index` | `iot_noise_level` | INT |  |
| `payload[].sensorIndex` | `noise_indexXX` | `iot_noise_level` | DECIMAL(5,2) |  |
| (auto) | `parse_at` | `iot_noise_level` | DATETIME(3) |  |

**Pivot Mapping:** sensorIndex 16-18 → noise_index16-18

**DB Record:**

```sql
INSERT INTO iot_noise_level (device_id, module_index, noise_index16, noise_index17, noise_index18, parse_at)
VALUES ('V5008_001', 1, 45.5, NULL, NULL, NOW(3));
```

---

### 6. DOOR_STATE

### V5008 (Binary) → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| Header | 0 | 1 | - | 0xBA |  |
| ModAddr | 1 | 1 | `moduleIndex` | Module address |  |
| ModId | 2 | 4 | `moduleId` | Module ID (Big-Endian) |  |
| State | 6 | 1 | `doorState` | Door state |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "DOOR_STATE",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  moduleIndex: 1,
  moduleId: "12345678",
  doorState: 1
}
```

### V6800 (JSON) → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `door_state_changed_notify_req` → `DOOR_STATE` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].new_state` | `data[].doorState` | number | Single door |
| `data[].new_state1` | `data[].door1State` | number | Dual door A |
| `data[].new_state2` | `data[].door2State` | number | Dual door B |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "DOOR_STATE",
  messageId: "string",
  meta: { topic: "...", rawType: "door_state_changed_notify_req" },
  data: [
    {
      moduleIndex: 0,
      moduleId: "12345678",
      doorState: 1,
      door1State: 1,
      door2State: 0
    }
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `moduleIndex` | `moduleIndex` | number | Pass through |
| `moduleId` | `moduleId` | string | Pass through |
| `doorState` | `payload[].doorState` | number/null | Moved to payload |
| `door1State` | `payload[].door1State` | number/null | Moved to payload |
| `door2State` | `payload[].door2State` | number/null | Moved to payload |

**Validation:** moduleIndex must be [1-5] and moduleId must not be “0”

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "DOOR_STATE",
  messageId: "string",
  moduleIndex: 1,
  moduleId: "12345678",
  payload: [
    { doorState: 1, door1State: null, door2State: null }
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_door_event` | VARCHAR(32) |  |
| `moduleIndex` | `module_index` | `iot_door_event` | INT |  |
| `payload[].doorState` | `doorState` | `iot_door_event` | INT |  |
| `payload[].door1State` | `door1State` | `iot_door_event` | INT |  |
| `payload[].door2State` | `door2State` | `iot_door_event` | INT |  |
| (auto) | `parse_at` | `iot_door_event` | DATETIME(3) |  |

**DB Record:**

```sql
INSERT INTO iot_door_event (device_id, module_index, doorState, door1State, door2State, parse_at)
VALUES ('V5008_001', 1, 1, NULL, NULL, NOW(3));
```

---

### 7. DEVICE_METADATA (DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO)

### V5008 (Binary) - DEVICE_INFO → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| Header | 0 | 2 | - | 0xEF01 |  |
| Model | 2 | 2 | `model` | Model (hex) |  |
| Fw | 4 | 4 | `fwVer` | Firmware version |  |
| IP | 8 | 4 | `ip` | IP address |  |
| Mask | 12 | 4 | `mask` | Subnet mask |  |
| Gw | 16 | 4 | `gwIp` | Gateway IP |  |
| Mac | 20 | 6 | `mac` | MAC address |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "DEVICE_INFO",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  model: "5008",
  fwVer: "12345678",
  ip: "192.168.1.100",
  mask: "255.255.255.0",
  gwIp: "192.168.1.1",
  mac: "AA:BB:CC:DD:EE:FF"
}
```

### V5008 (Binary) - MODULE_INFO → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| Header | 0 | 2 | - | 0xEF02 |  |
| ModAddr | 2 + i×5 | 1 | `data[].moduleIndex` | Module address |  |
| Fw | 3 + i×5 | 4 | `data[].fwVer` | Firmware version |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "MODULE_INFO",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  data: [
    { moduleIndex: 1, fwVer: "12345678" },
    ...
  ]
}
```

### V6800 (JSON) - DEV_MOD_INFO → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `devies_init_req` → `DEV_MOD_INFO` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `gateway_ip` | `ip` | string | IP address |
| `gateway_mac` | `mac` | string | MAC address |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].module_sw_version` | `data[].fwVer` | string | Firmware version |
| `data[].module_u_num` | `data[].uTotal` | number | Total units |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "DEV_MOD_INFO",
  messageId: "string",
  meta: { topic: "...", rawType: "devies_init_req" },
  ip: "192.168.1.100",
  mac: "AA:BB:CC:DD:EE:FF",
  data: [
    { moduleIndex: 0, moduleId: "12345678", fwVer: "1.0", uTotal: 6 },
    ...
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `ip` | `ip` | string/null | Pass through |
| `mac` | `mac` | string/null | Pass through |
| `fwVer` | `fwVer` | string/null | Device-level firmware |
| `mask` | `mask` | string/null | V5008 only |
| `gwIp` | `gwIp` | string/null | V5008 only |
| `data[].moduleIndex` | `payload[].moduleIndex` | number | Pass through |
| `data[].moduleId` | `payload[].moduleId` | string | Pass through |
| `data[].fwVer` | `payload[].fwVer` | string/null | Module-level firmware |
| `data[].uTotal` | `payload[].uTotal` | number | Pass through |

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "DEVICE_METADATA",
  messageId: "string",
  ip: "192.168.1.100",
  mac: "AA:BB:CC:DD:EE:FF",
  fwVer: "12345678",
  mask: "255.255.255.0",
  gwIp: "192.168.1.1",
  payload: [
    { moduleIndex: 1, moduleId: "12345678", fwVer: "1.0", uTotal: 6 },
    ...
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_meta_data` | VARCHAR(32) |  |
| `deviceType` | `device_type` | `iot_meta_data` | CHAR(5) |  |
| `fwVer` | `device_fwVer` | `iot_meta_data` | VARCHAR(32) |  |
| `mask` | `device_mask` | `iot_meta_data` | VARCHAR(32) |  |
| `gwIp` | `device_gwIp` | `iot_meta_data` | VARCHAR(32) |  |
| `ip` | `device_ip` | `iot_meta_data` | VARCHAR(32) |  |
| `mac` | `device_mac` | `iot_meta_data` | VARCHAR(32) |  |
| `payload` | `modules` | `iot_meta_data` | JSON (stringified) |  |
| (auto) | `parse_at` | `iot_meta_data` | DATETIME(3) |  |
| (auto) | `update_at` | `iot_meta_data` | DATETIME(3) |  |

**DB Record (UPSERT):**

```sql
INSERT INTO iot_meta_data (device_id, device_type, device_fwVer, device_mask, device_gwIp, device_ip, device_mac, modules, parse_at, update_at)
VALUES ('V5008_001', 'V5008', '12345678', '255.255.255.0', '192.168.1.1', '192.168.1.100', 'AA:BB:CC:DD:EE:FF', '[{"moduleIndex":1,"moduleId":"12345678","fwVer":"1.0","uTotal":6}]', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  device_fwVer = VALUES(device_fwVer),
  device_mask = VALUES(device_mask),
  device_gwIp = VALUES(device_gwIp),
  device_ip = VALUES(device_ip),
  device_mac = VALUES(device_mac),
  modules = VALUES(modules),
  update_at = VALUES(update_at);
```

---

### 8. Command Responses (QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP)

### V5008 (Binary) - QRY_CLR_RESP → SIF

| RAW (Binary) | Offset | Size | SIF Field | Type | Notes |
| --- | --- | --- | --- | --- | --- |
| Header | 0 | 1 | - | 0xAA |  |
| DeviceId | 1 | 4 | - | Device ID |  |
| Result | 6 | 1 | `result` | 0xA1 = Success |  |
| OriginalReq | 7 | 2 | `originalReq` | Echoed command |  |
| ModuleIndex | 8 | 1 | `moduleIndex` | From originalReq |  |
| ColorCode | 9 + i | 1 | `data[]` | Color code array |  |
| MsgId | Last 4 | 4 | `messageId` | Message ID |  |

**SIF Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008",
  messageType: "QRY_CLR_RESP",
  messageId: "string",
  meta: { topic: "...", rawHex: "..." },
  result: "Success",
  originalReq: "E401",
  moduleIndex: 1,
  data: [1, 2, 3, 4, 5, 6]
}
```

### V6800 (JSON) - QRY_CLR_RESP → SIF

| RAW (JSON) | SIF Field | Type | Notes |
| --- | --- | --- | --- |
| `msg_type` | `messageType` | string | Mapped: `u_color` → `QRY_CLR_RESP` |
| `gateway_sn` / `gateway_id` | `deviceId` | string | Device serial number |
| `uuid_number` | `messageId` | string | UUID/message ID |
| `data[].module_index` | `data[].moduleIndex` | number | Module index |
| `data[].module_sn` | `data[].moduleId` | string | Module serial number |
| `data[].module_u_num` | `data[].uTotal` | number | Total units |
| `data[].data[].u_index` | `data[].data[].uIndex` | number | Unit index |
| `data[].data[].color` | `data[].data[].colorName` | string | Color name |
| `data[].data[].code` | `data[].data[].colorCode` | number | Color code |

**SIF Structure:**

```jsx
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "QRY_CLR_RESP",
  messageId: "string",
  meta: { topic: "...", rawType: "u_color" },
  data: [
    {
      moduleIndex: 0,
      moduleId: "12345678",
      uTotal: 6,
      data: [
        { uIndex: 1, colorName: "Red", colorCode: 1 },
        ...
      ]
    }
  ]
}
```

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| `result` | `payload[].result` | string | Pass through |
| `originalReq` | `payload[].originalReq` | string | Pass through |
| `moduleIndex` | `payload[].moduleIndex` | number | Pass through |
| `data[]` | `payload[].colorMap` | array/null | Renamed |

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "QRY_CLR_RESP",
  messageId: "string",
  moduleIndex: 0,
  moduleId: "0",
  payload: [
    {
      moduleIndex: 1,
      moduleId: null,
      result: "Success",
      originalReq: "E401",
      colorMap: [1, 2, 3, 4, 5, 6]
    }
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_cmd_result` | VARCHAR(32) |  |
| `messageType` | `cmd` | `iot_cmd_result` | VARCHAR(32) |  |
| `payload[].result` | `result` | `iot_cmd_result` | VARCHAR(32) |  |
| `payload[].originalReq` | `original_req` | `iot_cmd_result` | VARCHAR(512) |  |
| `payload[].colorMap` | `color_map` | `iot_cmd_result` | JSON (stringified) |  |
| (auto) | `parse_at` | `iot_cmd_result` | DATETIME(3) |  |

**DB Record:**

```sql
INSERT INTO iot_cmd_result (device_id, cmd, result, original_req, color_map, parse_at)
VALUES ('V5008_001', 'QRY_CLR_RESP', 'Success', 'E401', '[1,2,3,4,5,6]', NOW(3));
```

---

### 9. META_CHANGED_EVENT (Generated)

**Note:** This message type is generated internally by the normalizer when metadata changes are detected.

### SIF → SUO

| SIF Field | SUO Field | Type | Notes |
| --- | --- | --- | --- |
| `deviceId` | `deviceId` | string | Pass through |
| `deviceType` | `deviceType` | string | Pass through |
| `messageType` | `messageType` | string | Pass through |
| `messageId` | `messageId` | string | Pass through |
| (generated) | `payload[].description` | string | Human-readable change description |

**SUO Structure:**

```jsx
{
  deviceId: "string",
  deviceType: "V5008" | "V6800",
  messageType: "META_CHANGED_EVENT",
  messageId: "string",
  payload: [
    { description: "Module 1 firmware updated" },
    ...
  ]
}
```

### SUO → DB

| SUO Field | DB Column | Table | Type | Notes |
| --- | --- | --- | --- | --- |
| `deviceId` | `device_id` | `iot_topchange_event` | VARCHAR(32) |  |
| `deviceType` | `device_type` | `iot_topchange_event` | CHAR(5) |  |
| `payload[].description` | `event_desc` | `iot_topchange_event` | VARCHAR(512) |  |
| (auto) | `parse_at` | `iot_topchange_event` | DATETIME(3) |  |
| (auto) | `update_at` | `iot_topchange_event` | DATETIME(3) |  |

**DB Record:**

```sql
INSERT INTO iot_topchange_event (device_id, device_type, event_desc, parse_at, update_at)
VALUES ('V5008_001', 'V5008', 'Module 1 firmware updated', NOW(3), NOW(3));
```

---

## Database Schema Reference

### Table: `iot_meta_data`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `device_type` | CHAR(5) NOT NULL | Device type (V5008/V6800) | SUO.deviceType |
| `device_fwVer` | VARCHAR(32) | Device firmware (V5008) | SUO.fwVer |
| `device_mask` | VARCHAR(32) | Subnet mask (V5008) | SUO.mask |
| `device_gwIp` | VARCHAR(32) | Gateway IP (V5008) | SUO.gwIp |
| `device_ip` | VARCHAR(32) | Device IP | SUO.ip |
| `device_mac` | VARCHAR(32) | Device MAC | SUO.mac |
| `modules` | JSON | Module info array | SUO.payload |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |
| `update_at` | DATETIME(3) NOT NULL | Update timestamp | Auto |

**Indexes:** `uk_device_id` (unique), `idx_meta_type` (device_type, update_at DESC)

---

### Table: `iot_temp_hum`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `module_index` | INT NOT NULL | Module index | SUO.moduleIndex |
| `temp_index10` | DECIMAL(5,2) | Temperature sensor 10 | SUO.payload[0].temp |
| `hum_index10` | DECIMAL(5,2) | Humidity sensor 10 | SUO.payload[0].hum |
| `temp_index11` | DECIMAL(5,2) | Temperature sensor 11 | SUO.payload[1].temp |
| `hum_index11` | DECIMAL(5,2) | Humidity sensor 11 | SUO.payload[1].hum |
| `temp_index12` | DECIMAL(5,2) | Temperature sensor 12 | SUO.payload[2].temp |
| `hum_index12` | DECIMAL(5,2) | Humidity sensor 12 | SUO.payload[2].hum |
| `temp_index13` | DECIMAL(5,2) | Temperature sensor 13 | SUO.payload[3].temp |
| `hum_index13` | DECIMAL(5,2) | Humidity sensor 13 | SUO.payload[3].hum |
| `temp_index14` | DECIMAL(5,2) | Temperature sensor 14 | SUO.payload[4].temp |
| `hum_index14` | DECIMAL(5,2) | Humidity sensor 14 | SUO.payload[4].hum |
| `temp_index15` | DECIMAL(5,2) | Temperature sensor 15 | SUO.payload[5].temp |
| `hum_index15` | DECIMAL(5,2) | Humidity sensor 15 | SUO.payload[5].hum |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_th` (device_id, module_index, parse_at DESC)

---

### Table: `iot_noise_level`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `module_index` | INT NOT NULL | Module index | SUO.moduleIndex |
| `noise_index16` | DECIMAL(5,2) | Noise sensor 16 | SUO.payload[0].noise |
| `noise_index17` | DECIMAL(5,2) | Noise sensor 17 | SUO.payload[1].noise |
| `noise_index18` | DECIMAL(5,2) | Noise sensor 18 | SUO.payload[2].noise |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_noise` (device_id, module_index, parse_at DESC)

---

### Table: `iot_rfid_event`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `module_index` | INT NOT NULL | Module index | SUO.payload[].moduleIndex |
| `sensor_index` | INT NOT NULL | Sensor index | SUO.payload[].sensorIndex |
| `tag_id` | VARCHAR(32) NOT NULL | Tag ID | SUO.payload[].tagId |
| `action` | CHAR(10) NOT NULL | Action (ATTACHED/DETACHED/ALARM_ON/ALARM_OFF) | SUO.payload[].action |
| `alarm` | BOOLEAN DEFAULT FALSE | Alarm flag | SUO.payload[].isAlarm |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_rfid_evt` (tag_id, device_id, module_index, parse_at DESC), `idx_rfid_device` (device_id, parse_at DESC)

---

### Table: `iot_rfid_snapshot`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `module_index` | INT NOT NULL | Module index | SUO.moduleIndex |
| `rfid_snapshot` | JSON | Full snapshot array | SUO.payload |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_rfid_snap` (device_id, module_index, parse_at DESC)

---

### Table: `iot_door_event`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `module_index` | INT NOT NULL | Module index | SUO.moduleIndex |
| `doorState` | INT | Single door state | SUO.payload[].doorState |
| `door1State` | INT | Dual door A state | SUO.payload[].door1State |
| `door2State` | INT | Dual door B state | SUO.payload[].door2State |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_door` (device_id, module_index, parse_at DESC)

---

### Table: `iot_heartbeat`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `modules` | JSON | Module info array | SUO.payload |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_hb` (device_id, parse_at DESC)

---

### Table: `iot_cmd_result`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `cmd` | VARCHAR(32) NOT NULL | Command type | SUO.messageType |
| `result` | VARCHAR(32) NOT NULL | Result (Success/Failure) | SUO.payload[].result |
| `original_req` | VARCHAR(512) | Original request | SUO.payload[].originalReq |
| `color_map` | JSON | Color map array | SUO.payload[].colorMap |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |

**Indexes:** `idx_cmd` (device_id, parse_at DESC)

---

### Table: `iot_topchange_event`

| Column | Type | Description | Source |
| --- | --- | --- | --- |
| `id` | BIGINT AUTO_INCREMENT | Primary key | - |
| `device_id` | VARCHAR(32) NOT NULL | Device ID | SUO.deviceId |
| `device_type` | CHAR(5) NOT NULL | Device type | SUO.deviceType |
| `event_desc` | VARCHAR(512) NOT NULL | Event description | SUO.payload[].description |
| `parse_at` | DATETIME(3) NOT NULL | Parse timestamp | Auto |
| `update_at` | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) | Update timestamp | Auto |

**Indexes:** `idx_top_chng` (device_id, parse_at DESC)

---

## Quick Reference: Field Name Mappings

### Sensor Index Mappings

| Sensor Type | SIF Index | SUO Index | DB Column |
| --- | --- | --- | --- |
| Temperature/Humidity | `thIndex` | `sensorIndex` | `temp_indexXX`, `hum_indexXX` (XX=10-15) |
| Noise | `nsIndex` | `sensorIndex` | `noise_indexXX` (XX=16-18) |
| RFID | `uIndex` | `sensorIndex` | `sensor_index` |

### Module Index Mappings

| Stage | Field Name |
| --- | --- |
| RAW (V5008) | `ModAddr` |
| RAW (V6800) | `module_index`, `host_gateway_port_index` |
| SIF | `moduleIndex` |
| SUO | `moduleIndex` |
| DB | `module_index` |

### Module ID Mappings

| Stage | Field Name |
| --- | --- |
| RAW (V5008) | `ModId` |
| RAW (V6800) | `module_sn`, `extend_module_sn` |
| SIF | `moduleId` |
| SUO | `moduleId` |
| DB | Inside `modules` JSON |

---

## Related Documentation

- [Architecture Specification](../openspec/specs/01-architecture.md)
- [V5008 Parser Specification](../openspec/specs/02-v5008-parser.md)
- [V6800 Parser Specification](../openspec/specs/03-V6800-parser.md)
- [Normalizer Specification](../openspec/specs/04-normalizer.md)
- [API Specification](../openspec/specs/07-API_Spec.md)
- [Database Schema](../database/schema.sql)

---

**Document Version:** 2.0.0

**Last Updated:** 2026-02-05

**Maintainer:** IoT Middleware Pro Team