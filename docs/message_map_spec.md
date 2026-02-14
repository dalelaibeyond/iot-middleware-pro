# message_map_spec

# Message Map - Field Reference

> **Version:** 2.3.0
> 
> **Purpose:** Quick reference for message field transformations through the pipeline
> 
> **Pipeline:** RAW → SIF → SUO → DB/UOS

---

## Overview

| Stage | Format | Module | Description |
| --- | --- | --- | --- |
| **RAW** | Binary/JSON | `MqttSubscriber` | Device payload |
| **SIF** | Object | `V5008Parser`, `V6800Parser` | Standard Intermediate Format |
| **SUO** | Object | `UnifyNormalizer` | Standard Unified Object (message) |
| **DB** | SQL | `StorageService` | MySQL tables |
| **UOS** | Object | `StateCache` | Unified Object State (cache) |

**UOS (Unified Object State):** The current state of devices stored in memory cache.
- **Structure:** See [normalizer_spec.md Section 5: UOS Data Structure](normalizer_spec.md#5-uos-unified-object-state-data-structure)
- **Key:** `device:{deviceId}:info` (metadata) and `device:{deviceId}:module:{index}` (telemetry)
- **Used by:** Normalizer (read/write), ApiServer (read-only), SmartHeartbeat (read)

---

## Message Type Matrix

| Message Type | V5008 | V6800 | SUO Type | DB Table |
| --- | --- | --- | --- | --- |
| `HEARTBEAT` | 0xCC/0xCB | `heart_beat_req` | `HEARTBEAT` | `iot_heartbeat` |
| `RFID_SNAPSHOT` | 0xBB | `u_state_resp` | `RFID_SNAPSHOT` | `iot_rfid_snapshot` |
| `RFID_EVENT` | (diff) | `u_state_changed_notify_req` | `RFID_EVENT` | `iot_rfid_event` |
| `TEMP_HUM` | `/TemHum` | `temper_humidity_*` | `TEMP_HUM` | `iot_temp_hum` |
| `NOISE_LEVEL` | `/Noise` | N/A | `NOISE_LEVEL` | `iot_noise_level` |
| `DOOR_STATE` | 0xBA | `door_state_changed_*` | `DOOR_STATE` | `iot_door_event` |
| `DEVICE_METADATA` | 0xEF01/0xEF02 | `devies_init_req` | `DEVICE_METADATA` | `iot_meta_data` |
| `META_CHANGED_EVENT` | N/A | `devices_changed_req` | `META_CHANGED_EVENT` | `iot_topchange_event` |
| `QRY_CLR_RESP` | 0xAA+0xE4 | `u_color` | `QRY_CLR_RESP` | `iot_cmd_result` |
| `SET_CLR_RESP` | 0xAA+0xE1 | `set_module_property_result_req` | `SET_CLR_RESP` | `iot_cmd_result` |
| `CLN_ALM_RESP` | 0xAA+0xE2 | `clear_u_warning` | `CLN_ALM_RESP` | `iot_cmd_result` |

---

## Notation Guide

| Notation | Meaning | Example |
|----------|---------|---------|
| `field` | Root-level scalar | `messageId` |
| `data[]` | Array of objects | `data[].moduleIndex` |
| `data[].field` | Field within array item | `payload[].sensorIndex` |
| `→` | Field transformation | `uIndex → sensorIndex` |

---

## Common SUO Fields

All SUO messages contain these root-level fields:

| Field | SIF Source | SUO Field | Description |
|-------|------------|-----------|-------------|
| Device ID | `deviceId` | `deviceId` | Device identifier (extracted from topic or payload) |
| Device Type | `deviceType` | `deviceType` | `V5008` or `V6800` |
| Message Type | `messageType` | `messageType` | Message type identifier (e.g., `HEARTBEAT`, `RFID_SNAPSHOT`) |
| Message ID | `messageId` | `messageId` | Unique message identifier (from raw payload) |
| Module Index | `moduleIndex` | `moduleIndex` | Module index at SUO root level (0 for device-level messages) |
| Module ID | `moduleId` | `moduleId` | Module identifier at SUO root level (`"0"` for device-level messages) |
| Payload | `data[]` | `payload[]` | **ALWAYS an array** containing message-specific data items |

**Important:** 

1. `moduleIndex` and `moduleId` are **ONLY** at SUO root level, never duplicated inside `payload[]` items.

2. **Multi-module handling by message type:**

| Message Type | Multi-module Strategy | SUO `moduleIndex` | `payload[]` Content |
|--------------|----------------------|-------------------|---------------------|
| `HEARTBEAT` | Keep all modules in one SUO | `0` (device-level) | Multiple modules: `payload[].moduleIndex` |
| `DEVICE_METADATA` | Keep all modules in one SUO | `0` (device-level) | Multiple modules: `payload[].moduleIndex` |
| `RFID_SNAPSHOT` | **Flatten** → one SUO per module | Per module | Single module's sensor data only |
| `TEMP_HUM` | **Flatten** → one SUO per module | Per module | Single module's sensor data only |
| `NOISE_LEVEL` | **Flatten** → one SUO per module | Per module | Single module's sensor data only |
| `DOOR_STATE` | **Flatten** → one SUO per module | Per module | Single module's door states |
| `RFID_EVENT` | **Flatten** → one SUO per event | Per module | Single event data |
| Command Responses | Device-level | `0` | Command result data |

---

## Message Type Details

### 1. HEARTBEAT

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| `data[].ModAddr` | `data[].module_index` | `data[].moduleIndex` | `moduleIndex` | `active_modules[].moduleIndex` (JSON) | `:info.activeModules[].moduleIndex` |
| `data[].ModId` | `data[].module_sn` | `data[].moduleId` | `moduleId` | `active_modules[].moduleId` (JSON) | `:info.activeModules[].moduleId` |
| `data[].Total` | `data[].module_u_num` | `data[].uTotal` | `uTotal` | `active_modules[].uTotal` (JSON) | `:info.activeModules[].uTotal` |

> **Note:** Device-level message (`moduleIndex=0`, `moduleId="0"` at root). Multiple modules in `payload[]`. 
> 
> **Self-Healing (Always On):**
> - emits `QRY_DEVICE_INFO` (V5008) or `QRY_DEV_MOD_INFO` (V6800) if `ip`/`mac` missing
> - emits `QRY_MODULE_INFO` (V5008 only) if module `fwVer` missing
> 
> **SmartHeartbeat (Optional):** If enabled, also emits `QRY_TEMP_HUM`, `QRY_RFID_SNAPSHOT`, `QRY_DOOR_STATE` for cache warmup.
> 
> Emits `META_CHANGED_EVENT` if module list changes. Updates `:info.lastSeenHb`.

---

### 2. RFID_SNAPSHOT

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| `ModAddr` | `module_index` | `moduleIndex` | (root field) | `module_index` | Key `:module:{idx}` |
| `ModId` | `module_sn` | `moduleId` | (root field) | - | `moduleId` |
| `Count` | - | `onlineCount` | - | - | - |
| `data[].uPos` | `data[].u_index` | `data[].uIndex` | `sensorIndex` (`uIndex → sensorIndex`) | `sensor_index` | `rfidSnapshot[].sensorIndex` |
| `data[].TagId` | `data[].tag_code` | `data[].tagId` | `tagId` | `tag_id` | `rfidSnapshot[].tagId` |
| `data[].Alarm` | `data[].warning` | `data[].isAlarm` | `isAlarm` | `alarm` | `rfidSnapshot[].isAlarm` |

> **Note:** Module-level message. V5008: Normalizer diffs against cache → generates `RFID_EVENT` for changes, then emits `RFID_SNAPSHOT`. V6800: Emits `RFID_SNAPSHOT` only (no diffing), triggers `QRY_RFID_SNAPSHOT` command on `RFID_EVENT`. Updates `:module:{idx}.rfidSnapshot` and `lastSeenRfid`.

---

### 3. RFID_EVENT

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| (diff result) | `data[].u_index` | `data[].uIndex` | `sensorIndex` | `sensor_index` | V5008: Updates `rfidSnapshot[]` |
| (diff result) | `data[].tag_code` | `data[].tagId` | `tagId` | `tag_id` | V6800: No update |
| (diff result) | `data[].new_state`/`old_state` | `data[].action` | `action` (`ATTACHED`/`DETACHED`) | `action` | |
| (diff result) | `data[].warning` | `data[].isAlarm` | `isAlarm` | `alarm` | |

> **Note:** Module-level message. V5008: Generated by `UnifyNormalizer.diffRfidSnapshots()`; emits SUO and updates cache. V6800: Received from device; triggers `QRY_RFID_SNAPSHOT` command only, does NOT emit SUO or update cache.

---

### 4. TEMP_HUM

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| `ModAddr` | `module_index` | `moduleIndex` | (root field) | `module_index` | Key `:module:{idx}` |
| `ModId` | `module_sn` | `moduleId` | (root field) | - | `moduleId` |
| `data[].Addr` | `data[].temper_position` | `data[].thIndex` | `sensorIndex` (`thIndex+9 → 10-15`) | Column `temp_indexXX` / `hum_indexXX` | `tempHum[].sensorIndex` |
| `data[].T_Int+T_Frac` | `data[].temper_swot` | `data[].temp` | `temp` | Column `temp_indexXX` | `tempHum[].temp` |
| `data[].H_Int+H_Frac` | `data[].hygrometer_swot` | `data[].hum` | `hum` | Column `hum_indexXX` | `tempHum[].hum` |

> **Note:** Module-level message. Pivoting: `sensorIndex` 10-15 → columns `temp_index10-15`, `hum_index10-15`. Filtering: Readings with both `temp=0/null` AND `hum=0/null` are skipped. Updates `:module:{idx}.tempHum` and `lastSeenTh`.

---

### 5. NOISE_LEVEL (V5008 Only)

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| `ModAddr` | N/A | `moduleIndex` | (root field) | `module_index` | Key `:module:{idx}` |
| `ModId` | N/A | `moduleId` | (root field) | - | `moduleId` |
| `data[].Addr` | N/A | `data[].nsIndex` | `sensorIndex` (`nsIndex+15 → 16-18`) | Column `noise_indexXX` | `noiseLevel[].sensorIndex` |
| `data[].N_Int+N_Frac` | N/A | `data[].noise` | `noise` | Column `noise_index16-18` | `noiseLevel[].noise` |

> **Note:** V5008 only. Module-level message. Pivoting: `sensorIndex` 16-18 → columns `noise_index16-18`. Filtering: `noise=null` (raw 0x00) is skipped. Updates `:module:{idx}.noiseLevel` and `lastSeenNs`.

---

### 6. DOOR_STATE

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| `ModAddr` | `module_index` | `moduleIndex` | (root field) | `module_index` | Key `:module:{idx}` |
| `ModId` | `module_sn` | `moduleId` | (root field) | - | `moduleId` |
| `State` | `new_state` | `doorState` | `doorState` | `doorState` | `doorState` |
| - | `new_state1` | `door1State` | `door1State` | `door1State` | `door1State` |
| - | `new_state2` | `door2State` | `door2State` | `door2State` | `door2State` |

> **Note:** Module-level message. Validation: `moduleIndex` must be 1-5 and `moduleId` ≠ "0", otherwise skipped. Single-door uses `doorState`; dual-door uses `door1State`/`door2State`. Updates `:module:{idx}.doorState/door1State/door2State` and `lastSeenDoor`.

---

### 7. DEVICE_METADATA

**Source:** `DEVICE_INFO` (V5008 0xEF01) + `MODULE_INFO` (V5008 0xEF02), or `DEV_MOD_INFO` (V6800)

| RAW (V5008) | RAW (V6800) | SIF | **SUO Fields** | DB | UOS Cache |
|-------------|-------------|-----|----------------|-----|-----------|
| `Model` | - | `model` | - | - | - |
| `Fw` | `module_sw_version` | `fwVer` | `fwVer` (root) | `device_fwVer` | `:info.fwVer` |
| `IP` | `gateway_ip` | `ip` | `ip` (root) | `device_ip` | `:info.ip` |
| `Mac` | `gateway_mac` | `mac` | `mac` (root) | `device_mac` | `:info.mac` |
| `Mask` | - | `mask` | `mask` (root) | `device_mask` | `:info.mask` |
| `Gw` | - | `gwIp` | `gwIp` (root) | `device_gwIp` | `:info.gwIp` |
| `data[].ModAddr` | `data[].module_index` | `data[].moduleIndex` | `payload[].moduleIndex` | `active_modules[].moduleIndex` (JSON) | `:info.activeModules[].moduleIndex` |
| - | `data[].module_sn` | `data[].moduleId` | `payload[].moduleId` | `active_modules[].moduleId` (JSON) | `:info.activeModules[].moduleId` |
| `data[].Fw` | `data[].module_sw_version` | `data[].fwVer` | `payload[].fwVer` | `active_modules[].fwVer` (JSON) | `:info.activeModules[].fwVer` |
| `data[].Total` | `data[].module_u_num` | `data[].uTotal` | `payload[].uTotal` | `active_modules[].uTotal` (JSON) | `:info.activeModules[].uTotal` |

> **Note:** Device-level message (`moduleIndex=0`, `moduleId="0"` at root). Root fields (`ip`, `mac`, `fwVer`, etc.) are device-level. Merging strategy: `DEVICE_INFO` (device fields) + `MODULE_INFO`/`HEARTBEAT` (module list) + cache = complete metadata. Emits `META_CHANGED_EVENT` if IP, firmware, or modules changed. DB: UPSERT on `device_id`. Updates `:info.lastSeenInfo`.

---

### 8. META_CHANGED_EVENT

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| (HEARTBEAT diff) | `devices_changed_req` | (change desc) | `description` | `event_desc` | No change |

> **Note:** Device-level message (`moduleIndex=0`, `moduleId="0"` at root). Generated by `UnifyNormalizer` when metadata changes detected (module added/removed, IP changed, firmware changed, uTotal changed). One DB row per change description. No cache update.

---

### 9. Command Responses (QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP)

| RAW (V5008) | RAW (V6800) | SIF | **SUO Payload** | DB | UOS Cache |
|-------------|-------------|-----|-----------------|-----|-----------|
| `Result` | `result`/`set_property_result` | `result` | `result` (`Success`/`Failure`) | `result` | No update |
| `OriginalReq` | - | `originalReq` | `originalReq` | `original_req` | No update |
| `ModuleIndex` | `module_index` | `moduleIndex` | `moduleIndex` | - | No update |
| `data[]` (color codes) | `data[].code` | `data[]`/`data[].colorCode` | `colorMap` | `color_map` (JSON) | No update |

> **Note:** Device-level message (`moduleIndex=0`, `moduleId="0"` at root). `QRY_CLR_RESP` includes color map array in payload; `SET_CLR_RESP`/`CLN_ALM_RESP` have no color data. **No cache update** for command responses.

---

## Field Transformation Summary

### Sensor Index Mapping

| Sensor Type | SIF Field | SUO Field | Transform Rule | DB Columns |
|-------------|-----------|-----------|----------------|------------|
| RFID | `uIndex` | `sensorIndex` | Copy as-is (1-6) | `sensor_index` |
| Temperature/Humidity | `thIndex` | `sensorIndex` | `thIndex + 9` (1-6 → 10-15) | `temp_index10-15`, `hum_index10-15` |
| Noise | `nsIndex` | `sensorIndex` | `nsIndex + 15` (1-3 → 16-18) | `noise_index16-18` |

### Common Field Mappings

| Concept | V5008 Raw | V6800 Raw | SIF | SUO |
|---------|-----------|-----------|-----|-----|
| Module Index | `ModAddr` | `module_index` | `moduleIndex` | `moduleIndex` |
| Module ID | `ModId` | `module_sn` | `moduleId` | `moduleId` |
| U-Total | `Total` | `module_u_num` | `uTotal` | `uTotal` |
| Message ID | (last 4 bytes) | `uuid_number` | `messageId` | `messageId` |
| Device IP | `IP` | `gateway_ip` | `ip` | `ip` |
| Device MAC | `Mac` | `gateway_mac` | `mac` | `mac` |
| Firmware | `Fw` | `module_sw_version` | `fwVer` | `fwVer` |

---

## Database Schema Summary

**Schema Version:** 2.1.0

**Timestamp Semantics:**
- `parse_at`: SUO creation time (when message was parsed by normalizer)
- `update_at`: DB operation time (when record was inserted/updated; handled by DB default)

**Common Columns:** All tables have `id`, `device_id`, `parse_at`, `update_at`

| Table | SUO Source | Key Fields | `message_id` | Notes |
| --- | --- | --- | --- | --- |
| `iot_meta_data` | `DEVICE_METADATA` | device_type, device_fwVer, device_ip, device_mac, modules (JSON) | - | UPSERT table; no message_id |
| `iot_heartbeat` | `HEARTBEAT` | modules (JSON) with moduleIndex/moduleId/uTotal | Optional | Device-level; tracks all modules |
| `iot_rfid_snapshot` | `RFID_SNAPSHOT` | module_index, rfid_snapshot (JSON) | Optional | Stores full snapshot as JSON |
| `iot_rfid_event` | `RFID_EVENT` | module_index, sensor_index, tag_id, action, alarm | **Required** | Event traceability |
| `iot_temp_hum` | `TEMP_HUM` | module_index, temp_index10-15, hum_index10-15 | Optional | Pivoted sensor columns |
| `iot_noise_level` | `NOISE_LEVEL` | module_index, noise_index16-18 | Optional | V5008 only; pivoted columns |
| `iot_door_event` | `DOOR_STATE` | module_index, doorState, door1State, door2State | **Required** | Event traceability |
| `iot_cmd_result` | `QRY/SET/CLN_*_RESP` | cmd, result, original_req, color_map (JSON) | **Required** | Command traceability |
| `iot_topchange_event` | `META_CHANGED_EVENT` | device_type, event_desc | **Required** | Change traceability |

---

## Related Documentation

| Document | Location | Content |
| --- | --- | --- |
| Architecture Spec | `docs/middleware_spec.md` | System architecture, API, commands |
| Normalizer Spec | `docs/normalizer_spec.md` | SUO conversion, SmartHeartbeat |
| V5008 Parser Spec | `docs/v5008_parser_spec.md` | Binary protocol details (offsets) |
| V6800 Parser Spec | `docs/v6800_parser_spec.md` | JSON protocol details |
| Dashboard Spec | `docs/dashboard_spec.md` | React frontend spec |
| Database Schema | `database/schema.sql` | Full SQL schema |

---

**Last Updated:** 2026-02-14 (v2.3.0 - Documented Self-Healing vs SmartHeartbeat separation, clarified HEARTBEAT behavior)

**Maintainer:** IoT Middleware Pro Team
