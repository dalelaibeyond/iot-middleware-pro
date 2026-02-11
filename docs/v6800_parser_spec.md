# V6800 Parser Specification - As-Built

> **Component:** V6800Parser  
> **Version:** 1.0  
> **Last Updated:** 2026-02-11  
> **Status:** As-Built (Verified against source code)

---

## 1. Component Overview

- **Class Name:** `V6800Parser`
- **Input:** `(topic: string, message: string | object)`
- **Output:** `SIF Object` or `null`
- **Error Handling:**
  - Parse JSON safely with `try-catch`
  - Unknown `msg_type`: Set `messageType = "UNKNOWN"`, preserve raw payload
  - Parse fails: Log error, return `null`

**Source File:** `src/modules/parsers/V6800Parser.js`

---

## 2. SIF Standard Contract

Every SIF object returned by the parser **MUST** contain:

```javascript
{
  deviceType: "V6800",
  deviceId: "string",
  messageType: "HEARTBEAT|RFID_SNAPSHOT|...",
  messageId: "string",
  meta: {
    topic: "string",
    rawType: "string"    // Original msg_type from JSON
  },
  // Plus message-specific fields
}
```

**Topology Context (for sensor data):**
- `moduleIndex`: Number
- `moduleId`: String (if available)

---

## 3. Message Type Mapping

| Raw `msg_type` | SIF `messageType` | Trigger |
|----------------|-------------------|---------|
| `heart_beat_req` | `HEARTBEAT` | Periodic (60s) |
| `u_state_resp` | `RFID_SNAPSHOT` | Query response |
| `u_state_changed_notify_req` | `RFID_EVENT` | Tag attach/detach event |
| `temper_humidity_exception_nofity_req` | `TEMP_HUM` | Threshold change |
| `temper_humidity_resp` | `QRY_TEMP_HUM_RESP` | Query response |
| `door_state_changed_notify_req` | `DOOR_STATE` | Door change event |
| `door_state_resp` | `QRY_DOOR_STATE_RESP` | Query response |
| `devies_init_req` | `DEV_MOD_INFO` | Boot/Query response |
| `u_color` | `QRY_CLR_RESP` | Query response |
| `set_module_property_result_req` | `SET_CLR_RESP` | Set response |
| `clear_u_warning` | `CLN_ALM_RESP` | Clear alarm response |
| `devices_changed_req` | `UTOTAL_CHANGED` | Config change event |

---

## 4. Field Mapping Logic

### 4.1 Common Fields (Root Level)

| Raw Field | SIF Key | Data Type | Notes |
|-----------|---------|-----------|-------|
| `gateway_sn` | `deviceId` | String | Primary device ID |
| `module_sn` | `deviceId` | String | Only for `heart_beat_req` with `module_type="mt_gw"` |
| `msg_type` | `meta.rawType` | String | Original message type |
| `uuid_number` | `messageId` | String | Cast Number to String |
| `gateway_ip` | `ip` | String | Device IP address |
| `gateway_mac` | `mac` | String | Device MAC address |

**Device ID Extraction Priority:**
1. Special case: `heart_beat_req` + `module_type="mt_gw"` → use `module_sn`
2. `gateway_sn`
3. `gateway_id`
4. `device_id`
5. `dev_id`
6. `sn`

### 4.2 Module & Sensor Array Mapping

| Context | Raw Field | SIF Key | Transformation |
|---------|-----------|---------|----------------|
| **Module** | `module_index` | `moduleIndex` | Integer |
| **Module** | `host_gateway_port_index` | `moduleIndex` | Integer (Alias) |
| **Module** | `module_sn` | `moduleId` | String |
| **Module** | `extend_module_sn` | `moduleId` | String (Alias) |
| **Module** | `module_u_num` | `uTotal` | Integer |
| **Module** | `module_sw_version` | `fwVer` | String |
| **RFID** | `u_index` | `uIndex` | Integer |
| **RFID** | `tag_code` | `tagId` | String (filter null/empty) |
| **RFID** | `warning` | `isAlarm` | Boolean (0=false, 1=true) |
| **RFID** | `new_state` / `old_state` | `action` | `1/0`→"ATTACHED", `0/1`→"DETACHED" |
| **Env** | `temper_position` | `thIndex` | Integer |
| **Env** | `temper_swot` | `temp` | Number (0→null) |
| **Env** | `hygrometer_swot` | `hum` | Number (0→null) |
| **Color** | `color` | `colorName` | String |
| **Color** | `code` | `colorCode` | Integer |

### 4.3 Door State Logic

V6800 supports both Single and Dual door sensors:

**Single Door:**
- Raw has `new_state` → Map to `doorState`

**Dual Door:**
- Raw has `new_state1` / `new_state2` → Map to `door1State` / `door2State`

---

## 5. Message Format Details

### 5.1 HEARTBEAT

**Raw JSON:**
```json
{
  "msg_type": "heart_beat_req",
  "gateway_sn": "2105101125",
  "uuid_number": 755052881,
  "data": [
    {
      "module_index": 4,
      "module_sn": "3468672873",
      "module_u_num": 12
    }
  ]
}
```

**SIF Output:**
```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "HEARTBEAT",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "heart_beat_req" },
  "data": [
    { "moduleIndex": 4, "moduleId": "3468672873", "uTotal": 12 }
  ]
}
```

### 5.2 RFID_SNAPSHOT

**Raw JSON:**
```json
{
  "msg_type": "u_state_resp",
  "gateway_sn": "2105101125",
  "uuid_number": 755052881,
  "data": [
    {
      "module_index": 1,
      "extend_module_sn": "0304555999",
      "data": [
        { "u_index": 3, "tag_code": "21B03311", "warning": 0 }
      ]
    }
  ]
}
```

**SIF Output:**
```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "RFID_SNAPSHOT",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "u_state_resp" },
  "moduleIndex": 1,
  "moduleId": "0304555999",
  "data": [
    {
      "moduleIndex": 1,
      "moduleId": "0304555999",
      "data": [
        { "uIndex": 3, "tagId": "21B03311", "isAlarm": false }
      ]
    }
  ]
}
```

### 5.3 RFID_EVENT

**Raw JSON:**
```json
{
  "msg_type": "u_state_changed_notify_req",
  "gateway_sn": "2105101125",
  "data": [
    {
      "host_gateway_port_index": 4,
      "extend_module_sn": "3468672873",
      "data": [
        {
          "u_index": 11,
          "tag_code": "21AF16B1",
          "new_state": 0,
          "old_state": 1,
          "warning": 0
        }
      ]
    }
  ]
}
```

**SIF Output:**
```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "RFID_EVENT",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "u_state_changed_notify_req" },
  "moduleIndex": 4,
  "moduleId": "3468672873",
  "data": [
    {
      "moduleIndex": 4,
      "moduleId": "3468672873",
      "data": [
        {
          "uIndex": 11,
          "tagId": "21AF16B1",
          "isAlarm": false,
          "action": "DETACHED"
        }
      ]
    }
  ]
}
```

### 5.4 TEMP_HUM

**Raw JSON:**
```json
{
  "msg_type": "temper_humidity_exception_nofity_req",
  "gateway_sn": "2105101125",
  "data": [
    {
      "module_index": 1,
      "extend_module_sn": "1616797188",
      "data": [
        { "temper_position": 10, "temper_swot": 32.1, "hygrometer_swot": 51.1 }
      ]
    }
  ]
}
```

**SIF Output:**
```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "TEMP_HUM",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "temper_humidity_exception_nofity_req" },
  "moduleIndex": 1,
  "moduleId": "1616797188",
  "data": [
    {
      "moduleIndex": 1,
      "moduleId": "1616797188",
      "data": [
        { "thIndex": 10, "temp": 32.1, "hum": 51.1 }
      ]
    }
  ]
}
```

### 5.5 DOOR_STATE

**Single Door:**
```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "DOOR_STATE",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "door_state_changed_notify_req" },
  "data": [
    { "moduleIndex": 1, "moduleId": "0304555999", "doorState": 1 }
  ]
}
```

**Dual Door:**
```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "DOOR_STATE",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "door_state_changed_notify_req" },
  "data": [
    { "moduleIndex": 1, "moduleId": "0304555999", "door1State": 1, "door2State": 1 }
  ]
}
```

### 5.6 DEV_MOD_INFO

```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "DEV_MOD_INFO",
  "messageId": "1528492292",
  "meta": { "topic": "...", "rawType": "devies_init_req" },
  "ip": "192.168.100.100",
  "mac": "08:80:7D:79:4B:45",
  "data": [
    { "moduleIndex": 4, "fwVer": "2209191506", "moduleId": "3468672873", "uTotal": 12 }
  ]
}
```

### 5.7 UTOTAL_CHANGED

```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "UTOTAL_CHANGED",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "devices_changed_req" },
  "data": [
    { "moduleIndex": 4, "moduleId": "3468672873", "uTotal": 12, "fwVer": "2209191506" }
  ]
}
```

### 5.8 QRY_CLR_RESP

```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "QRY_CLR_RESP",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "u_color" },
  "data": [
    {
      "moduleIndex": 3,
      "moduleId": "3468672873",
      "uTotal": 12,
      "data": [
        { "uIndex": 1, "colorName": "red", "colorCode": 1 }
      ]
    }
  ]
}
```

### 5.9 SET_CLR_RESP

```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "SET_CLR_RESP",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "set_module_property_result_req" },
  "data": [
    { "moduleIndex": 2, "moduleId": "3468672873", "result": "success" }
  ]
}
```

### 5.10 CLN_ALM_RESP

```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "CLN_ALM_RESP",
  "messageId": "755052881",
  "meta": { "topic": "...", "rawType": "clear_u_warning" },
  "data": [
    { "moduleIndex": 4, "moduleId": "3074309747", "uTotal": 18, "result": "Success" }
  ]
}
```

---

## 6. Special Handling

### 6.1 Unknown Message Type

- Set `messageType = "UNKNOWN"`
- Preserve raw payload
- Do NOT throw error

### 6.2 Parse Error

- Log error with context
- Return `null`
- Do NOT throw error

### 6.3 Module Field Aliases

The parser supports multiple field names for flexibility:

| SIF Key | Primary Field | Alias Fields |
|---------|---------------|--------------|
| `moduleIndex` | `module_index` | `host_gateway_port_index`, `index` |
| `moduleId` | `module_sn` | `extend_module_sn`, `module_id` |
| `data` (RFID) | `data` | `u_data` |
| `data` (Temp) | `data` | `th_data` |
| `data` (Color) | `data` | `color_data` |
| `result` (Set) | `result` | `set_property_result` |
| `result` (Clear) | `result` | `ctr_flag` |

### 6.4 Null/Empty Filtering

RFID items with `null` or empty `tag_code` are filtered out:

```javascript
if (!tagId || tagId === "" || tagId === null || tagId === undefined) {
  return; // Skip this item
}
```

### 6.5 Zero Value Handling

Temperature/Humidity values of `0` are converted to `null`:

```javascript
temp: thItem.temper_swot === 0 ? null : thItem.temper_swot
```

---

## 7. Supported Message Types Summary

| Type | Supported | Description |
|------|-----------|-------------|
| `HEARTBEAT` | ✓ | Periodic heartbeat |
| `RFID_SNAPSHOT` | ✓ | Full RFID state |
| `RFID_EVENT` | ✓ | Tag attach/detach |
| `TEMP_HUM` | ✓ | Temperature/humidity |
| `QRY_TEMP_HUM_RESP` | ✓ | Query response |
| `DOOR_STATE` | ✓ | Door open/close |
| `QRY_DOOR_STATE_RESP` | ✓ | Query response |
| `DEV_MOD_INFO` | ✓ | Device+module info |
| `UTOTAL_CHANGED` | ✓ | Module config change |
| `QRY_CLR_RESP` | ✓ | Query color response |
| `SET_CLR_RESP` | ✓ | Set color response |
| `CLN_ALM_RESP` | ✓ | Clear alarm response |

---

## 8. Key Differences from V5008

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Format** | Binary | JSON |
| **Max Modules** | 5 | 24 |
| **Module Data** | Flat or top-level | Nested in `data` array |
| **Device ID** | From topic or header | From `gateway_sn` field |
| **Door Sensors** | Single only | Single or Dual |
| **Noise Level** | Supported | Not supported |
