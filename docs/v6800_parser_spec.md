# v6800_parser_spec

# V6800 Parser Specification - As-Built

> **Component:** V6800Parser (JSON Protocol)
> 
> 
> **Version:** 2.1.2
> 
> **Last Updated:** 2026-02-13 (sync with message_map_spec v2.1.2)
> 
> **Status:** As-Built (Verified against source code)
> 

---

## 1. Component Overview

| Item | Value |
| --- | --- |
| **Class** | `V6800Parser` |
| **Input** | `(topic: string, message: string \| object)` |
| **Output** | `SIF Object` or `null` |
| **Source** | `src/modules/parsers/V6800Parser.js` |
| **Error Handling** | Log errors, return `null`. Unknown `msg_type` sets `messageType = "UNKNOWN"`. |

**See Also:** [message_map_spec.md](message_map_spec.md) for complete RAW → SIF → SUO → DB → UOS transformations.

---

## 2. Message Type Mapping

| Raw `msg_type` | SIF `messageType` | Trigger |
| --- | --- | --- |
| `heart_beat_req` | `HEARTBEAT` | Periodic (60s) |
| `u_state_resp` | `RFID_SNAPSHOT` | Query response |
| `u_state_changed_notify_req` | `RFID_EVENT` | Tag attach/detach event |
| `temper_humidity_exception_nofity_req` | `TEMP_HUM` | Threshold change |
| `temper_humidity_resp` | `QRY_TEMP_HUM_RESP` | Query response |
| `door_state_changed_notify_req` | `DOOR_STATE` | Door change event |
| `door_state_resp` | `QRY_DOOR_STATE_RESP` | Query response |
| `devies_init_req` | `DEV_MOD_INFO` | Boot/Query response |
| `devices_changed_req` | `UTOTAL_CHANGED` | Config change event |
| `u_color` | `QRY_CLR_RESP` | Query response |
| `set_module_property_result_req` | `SET_CLR_RESP` | Set response |
| `clear_u_warning` | `CLN_ALM_RESP` | Clear alarm response |

---

## 3. Field Mapping

### 3.1 Device ID Extraction Priority

1. Special case: `heart_beat_req` + `module_type="mt_gw"` → use `module_sn`
2. `gateway_sn`
3. `gateway_id`
4. `device_id`
5. `dev_id`
6. `sn`

### 3.2 Common Fields (Root Level)

| Raw Field | SIF Key | Notes |
| --- | --- | --- |
| `msg_type` | `meta.rawType` | Original message type preserved |
| `uuid_number` | `messageId` | Cast Number to String |
| `gateway_ip` | `ip` | Device IP address |
| `gateway_mac` | `mac` | Device MAC address |

### 3.3 Module & Sensor Fields

| SIF Key | Primary Field | Alias Fields |
| --- | --- | --- |
| `moduleIndex` | `module_index` | `host_gateway_port_index`, `index` |
| `moduleId` | `module_sn` | `extend_module_sn`, `module_id` |
| `uTotal` | `module_u_num` | - |
| `fwVer` | `module_sw_version` | - |
| `uIndex` | `u_index` | - |
| `tagId` | `tag_code` | Filter null/empty |
| `isAlarm` | `warning` | `0`→false, `1`→true |
| `action` | - | Derived from `new_state`/`old_state` |
| `thIndex` | `temper_position` | - |
| `temp` | `temper_swot` | `0`→null |
| `hum` | `hygrometer_swot` | `0`→null |
| `colorName` | `color` | - |
| `colorCode` | `code` | - |

### 3.4 RFID Action Derivation

| `new_state` | `old_state` | `action` |
| --- | --- | --- |
| 1 | 0 | `ATTACHED` |
| 0 | 1 | `DETACHED` |

### 3.5 Door State Mapping

- **Single Door:** `new_state` → `doorState`
- **Dual Door:** `new_state1` / `new_state2` → `door1State` / `door2State`

---

## 4. Message Quick Reference

### 4.1 HEARTBEAT

```json
{
  "msg_type": "heart_beat_req",
  "gateway_sn": "2105101125",
  "uuid_number": 755052881,
  "data": [{"module_index": 4, "module_sn": "3468672873", "module_u_num": 12}]
}
```

**Key Fields:** `gateway_sn` → deviceId, `uuid_number` → messageId, `data[]` → modules

### 4.2 RFID_SNAPSHOT

```json
{
  "msg_type": "u_state_resp",
  "gateway_sn": "2105101125",
  "data": [{"module_index": 1, "extend_module_sn": "...", "data": [{"u_index": 3, "tag_code": "...", "warning": 0}]}]
}
```

**Note:** Filters items with null/empty `tag_code`.

### 4.3 RFID_EVENT

```json
{
  "msg_type": "u_state_changed_notify_req",
  "gateway_sn": "2105101125",
  "data": [{"host_gateway_port_index": 4, "data": [{"u_index": 11, "tag_code": "...", "new_state": 0, "old_state": 1, "warning": 0}]}]
}
```

**Note:** `new_state`/`old_state` derive `action` (ATTACHED/DETACHED).

### 4.4 TEMP_HUM

```json
{
  "msg_type": "temper_humidity_exception_nofity_req",
  "gateway_sn": "2105101125",
  "data": [{"module_index": 1, "data": [{"temper_position": 10, "temper_swot": 32.1, "hygrometer_swot": 51.1}]}]
}
```

**Note:** Values of `0` converted to `null`.

### 4.5 DOOR_STATE

**Single Door:**

```json
{"new_state": 1}
```

**Dual Door:**

```json
{"new_state1": 1, "new_state2": 0}
```

### 4.6 DEV_MOD_INFO

```json
{
  "msg_type": "devies_init_req",
  "gateway_sn": "2105101125",
  "gateway_ip": "192.168.100.100",
  "gateway_mac": "08:80:7D:79:4B:45",
  "data": [{"module_index": 4, "module_sn": "...", "module_sw_version": "...", "module_u_num": 6}]
}
```

### 4.7 UTOTAL_CHANGED

```json
{
  "msg_type": "devices_changed_req",
  "gateway_sn": "2105101125",
  "data": [{"module_index": 4, "module_sn": "...", "module_u_num": 12}]
}
```

### 4.8 Command Responses

**QRY_CLR_RESP:**

```json
{"msg_type": "u_color", "data": [{"data": [{"u_index": 1, "color": "red", "code": 1}]}]}
```

**SET_CLR_RESP:**

```json
{"msg_type": "set_module_property_result_req", "data": [{"result": "success"}]}
```

**CLN_ALM_RESP:**

```json
{"msg_type": "clear_u_warning", "data": [{"result": "Success"}]}
```

---

## 5. Special Handling

### 5.1 Null/Empty Filtering

RFID items with null or empty `tag_code` are skipped:

```jsx
if (!tagId || tagId === "" || tagId === null || tagId === undefined) {
  return; // Skip this item
}
```

### 5.2 Zero Value Handling

Temperature/Humidity values of `0` are converted to `null`:

```jsx
temp: thItem.temper_swot === 0 ? null : thItem.temper_swot
```

### 5.3 Unknown Message Types

- Set `messageType = "UNKNOWN"`
- Preserve raw payload
- Do NOT throw error

---

## 6. Supported Message Types

| Type | Supported | Description |
| --- | --- | --- |
| `HEARTBEAT` | ✓ | Periodic heartbeat |
| `RFID_SNAPSHOT` | ✓ | Full RFID state |
| `RFID_EVENT` | ✓ | Tag attach/detach |
| `TEMP_HUM` | ✓ | Temperature/humidity |
| `QRY_TEMP_HUM_RESP` | ✓ | Query response |
| `DOOR_STATE` | ✓ | Door open/close (single/dual) |
| `QRY_DOOR_STATE_RESP` | ✓ | Query response |
| `DEV_MOD_INFO` | ✓ | Device+module info |
| `UTOTAL_CHANGED` | ✓ | Module config change |
| `QRY_CLR_RESP` | ✓ | Query color response |
| `SET_CLR_RESP` | ✓ | Set color response |
| `CLN_ALM_RESP` | ✓ | Clear alarm response |

---

## 7. Key Differences from V5008

| Aspect | V5008 | V6800 |
| --- | --- | --- |
| **Format** | Binary | JSON |
| **Max Modules** | 5 | 24 |
| **Module Data** | Flat or top-level | Nested in `data` array |
| **Device ID** | From topic or header | From `gateway_sn` field |
| **Door Sensors** | Single only | Single or Dual |
| **Noise Level** | Supported | Not supported |

---

## 8. Related Documentation

| Document | Content |
| --- | --- |
| [message_map_spec.md](message_map_spec.md) | RAW → SIF → SUO → DB transformations |
| [middleware_spec.md](middleware_spec.md) | System architecture, SIF/SUO contracts |
| [normalizer_spec.md](normalizer_spec.md) | SUO normalization, StateCache |
| [v5008_parser_spec.md](v5008_parser_spec.md) | Binary protocol reference |

---

**Last Updated:** 2026-02-12

**Maintainer:** IoT Middleware Pro Team