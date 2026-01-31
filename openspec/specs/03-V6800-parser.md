# V6800Parser Implementation Guide v1.0

**File Name:** `V6800Parser_Spec.md`

**Date:** 1/26/2026

**Type:** Component Specification

**Scope:** JSON to SIF (Standard Intermediate Format) Conversion

**Status:** Final

---

## 1. Component Overview

- **Class Name:** `V6800Parser`
- **Input:** `(topic: string, message: String | Object)`
- **Output:** `SIF Object` or `null`
- **Error Handling:**
  - Parse JSON safely (`try-catch`).
  - If `msg_type` is unknown: set `messageType = "UNKNOWN"`, preserve raw payload, do not throw.
  - If parsing fails: Log error, return `null`.

---

## 2. SIF Standard Contract (Global Rules)

1. **The Envelope (Mandatory):**
   Every SIF object returned by the parser **MUST** contain these root fields:
   - `deviceType`: Fixed "V6800".
   - `deviceId`: String.
   - `messageType`: String (Unified Enum).
   - `messageId`: String.
   - `meta`: Object containing `{ "topic": string, "rawType": string }`.
2. **Topology Context (Conditional):**
   If the message pertains to specific sensor data, the SIF **MUST** include `moduleIndex` and `moduleId` (if available in the raw message).
3. **Payload Structure:**
   - All list-based data **MUST** be contained in an array key named **`data`**.

---

## 3. Message Type Mapping

The parser extracts `msg_type` from the JSON and maps it to the SIF `messageType`.

| Raw `msg_type`                         | Trigger               | SIF `messageType`     |
| -------------------------------------- | --------------------- | --------------------- |
| **Device Published**                   |                       |                       |
| `heart_beat_req`                       | Periodic              | `HEARTBEAT`           |
| `u_state_resp`                         | Snapshot Response     | `RFID_SNAPSHOT`       |
| `u_state_changed_notify_req`           | Event (Tag Change)    | `RFID_EVENT`          |
| `temper_humidity_exception_nofity_req` | Threshold Change      | `TEMP_HUM`            |
| `temper_humidity_resp`                 | Query Response        | `QRY_TEMP_HUM_RESP`   |
| `door_state_changed_notify_req`        | Event (Door Change)   | `DOOR_STATE`          |
| `door_state_resp`                      | Query Response        | `QRY_DOOR_STATE_RESP` |
| `devies_init_req`                      | Boot/Query Response   | `DEV_MOD_INFO`        |
| `u_color`                              | Query Response        | `QRY_CLR_RESP`        |
| `set_module_property_result_req`       | Set Response          | `SET_CLR_RESP`        |
| `clear_u_warning`                      | Set Response          | `CLN_ALM_RESP`        |
| `devices_changed_req`                  | Event (Config Change) | `UTOTAL_CHANGED`      |

---

## 4. Field Mapping Logic

### 4.1 Common Fields (Root Level)

_Map these fields from the raw JSON root to the SIF root._

| Raw Field     | SIF Key        | Data Type | Notes                                                   |
| ------------- | -------------- | --------- | ------------------------------------------------------- |
| `gateway_sn`  | `deviceId`     | String    |                                                         |
| `module_sn`   | `deviceId`     | String    | _Only_ for `heart_beat_req` where `module_type`="mt_gw" |
| `msg_type`    | `meta.rawType` | String    |                                                         |
| `uuid_number` | `messageId`    | String    | Cast Number to String                                   |
| `gateway_ip`  | `ip`           | String    |                                                         |
| `gateway_mac` | `mac`          | String    |                                                         |

### 4.2 Module & Sensor Array Mapping

_Most messages contain a `data` array. Iterate this array and map fields as follows._

| Context    | Raw Field                 | SIF Key       | Transformation Logic                             |
| ---------- | ------------------------- | ------------- | ------------------------------------------------ |
| **Module** | `module_index`            | `moduleIndex` | Integer                                          |
| **Module** | `host_gateway_port_index` | `moduleIndex` | Integer (Alias)                                  |
| **Module** | `module_sn`               | `moduleId`    | String                                           |
| **Module** | `extend_module_sn`        | `moduleId`    | String (Alias)                                   |
| **Module** | `module_u_num`            | `uTotal`      | Integer                                          |
| **Module** | `module_sw_version`       | `fwVer`       | String                                           |
| **RFID**   | `u_index`                 | `uIndex`      | Integer                                          |
| **RFID**   | `tag_code`                | `tagId`       | String. **Filter:** Ignore object if null/empty. |
| **RFID**   | `warning`                 | `isAlarm`     | Boolean (0=false, 1=true)                        |
| **RFID**   | `new_state` / `old_state` | `action`      | `1`/`0` → `"ATTACHED"`; `0`/`1` → `"DETACHED"`   |
| **Env**    | `temper_position`         | `thIndex`     | Integer                                          |
| **Env**    | `temper_swot`             | `temp`        | Number                                           |
| **Env**    | `hygrometer_swot`         | `hum`         | Number                                           |
| **Color**  | `color`                   | `colorName`   | String                                           |
| **Color**  | `code`                    | `colorCode`   | Integer                                          |

### 4.3 Door State Logic

V6800 supports both Single and Dual door sensors.

- **Case 1 (Single):** If raw has `new_state` → Map to `doorState`.
- **Case 2 (Dual):** If raw has `new_state1` / `new_state2` → Map to `door1State` / `door2State`.

---

## 5. SIF Output Examples (Complete List)

**Note:** All lists use the key **`data`**.

### 1. `HEARTBEAT`

```json
{
  "meta": { "topic": "...", "rawType": "heart_beat_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "HEARTBEAT",
  "messageId": "755052881",
  "data": [{ "moduleIndex": 4, "moduleId": "3468672873", "uTotal": 12 }]
}
```

### 2. `RFID_SNAPSHOT`

```json
{
  "meta": { "topic": "...", "rawType": "u_state_resp" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "RFID_SNAPSHOT",
  "messageId": "755052881",
  "data": [
    {
      "moduleIndex": 1,
      "moduleId": "0304555999",
      "data": [{ "uIndex": 3, "tagId": "21B03311", "isAlarm": false }]
    }
  ]
}
```

### 3. `RFID_EVENT`

```json
{
  "meta": { "topic": "...", "rawType": "u_state_changed_notify_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "RFID_EVENT",
  "messageId": "755052881",
  "data": [
    {
      "moduleIndex": 4,
      "moduleId": "3468672873",
      "data": [
        {
          "uIndex": 11,
          "action": "DETACHED",
          "tagId": "21AF16B1",
          "isAlarm": false
        }
      ]
    }
  ]
}
```

### 4. `TEMP_HUM`

```json
{
  "meta": { "topic": "...", "rawType": "temper_humidity_exception_nofity_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "TEMP_HUM",
  "messageId": "755052881",
  "data": [
    {
      "moduleIndex": 1,
      "moduleId": "1616797188",
      "data": [{ "thIndex": 10, "temp": 32.1, "hum": 51.1 }]
    }
  ]
}
```

### 5. `QRY_TEMP_HUM_RESP`

```json
{
  "meta": { "topic": "...", "rawType": "temper_humidity_resp" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "QRY_TEMP_HUM_RESP",
  "messageId": "755052881",
  "data": [
    {
      "moduleIndex": 1,
      "moduleId": "1616797188",
      "data": [{ "thIndex": 10, "temp": 32.1, "hum": 51.1 }]
    }
  ]
}
```

### 6. `DOOR_STATE`

_Case: Single Door_

```json
{
  "meta": { "topic": "...", "rawType": "door_state_changed_notify_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "DOOR_STATE",
  "messageId": "755052881",
  "data": [{ "moduleId": "0304555999", "moduleIndex": 1, "doorState": 1 }]
}
```

_Case: Dual Door_

```json
{
  "meta": { "topic": "...", "rawType": "door_state_changed_notify_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "DOOR_STATE",
  "messageId": "755052881",
  "data": [
    {
      "moduleId": "0304555999",
      "moduleIndex": 1,
      "door1State": 1,
      "door2State": 1
    }
  ]
}
```

### 7. `QRY_DOOR_STATE_RESP`

```json
{
  "meta": { "topic": "...", "rawType": "door_state_resp" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "QRY_DOOR_STATE_RESP",
  "messageId": "755052881",
  "moduleIndex": 1,
  "moduleId": "0304555999",
  "doorState": 1
}
```

### 8. `DEV_MOD_INFO`

```json
{
  "meta": { "topic": "...", "rawType": "devies_init_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "DEV_MOD_INFO",
  "messageId": "1528492292",
  "ip": "192.168.100.100",
  "mac": "08:80:7D:79:4B:45",
  "data": [
    {
      "moduleIndex": 4,
      "fwVer": "2209191506",
      "moduleId": "3468672873",
      "uTotal": 12
    }
  ]
}
```

### 9. `UTOTAL_CHANGED`

```json
{
  "meta": { "topic": "...", "rawType": "devices_changed_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "UTOTAL_CHANGED",
  "messageId": "755052881",
  "data": [
    {
      "moduleIndex": 4,
      "moduleId": "3468672873",
      "uTotal": 12,
      "fwVer": "2209191506"
    }
  ]
}
```

### 10. `QRY_CLR_RESP`

```json
{
  "meta": { "topic": "...", "rawType": "u_color" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "QRY_CLR_RESP",
  "messageId": "755052881",
  "data": [
    {
      "moduleIndex": 3,
      "moduleId": "3468672873",
      "uTotal": 12,
      "data": [{ "uIndex": 1, "colorName": "red", "colorCode": 1 }]
    }
  ]
}
```

### 11. `SET_CLR_RESP`

```json
{
  "meta": { "topic": "...", "rawType": "set_module_property_result_req" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "SET_CLR_RESP",
  "messageId": "755052881",
  "data": [{ "moduleIndex": 2, "moduleId": "3468672873", "result": "success" }]
}
```

### 12. `CLN_ALM_RESP`

```json
{
  "meta": { "topic": "...", "rawType": "clear_u_warning" },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "CLN_ALM_RESP",
  "messageId": "755052881",
  "data": [
    { "moduleIndex": 4, "moduleId": "3074309747", "uTotal": 18, "result": true }
  ]
}
```

---

## 6. Special Handling

### 6.1 Unknown Message Type

- **Given:** A V6800 device sends a message with unknown `msg_type`
- **When:** The parser receives the message
- **Then:** It SHALL set `messageType="UNKNOWN"`, preserve the raw payload, and NOT throw an error

### 6.2 Parse Error

- **Given:** Invalid JSON is received
- **When:** The parser attempts to parse
- **Then:** It SHALL log the error, return `null`, and NOT throw an error

### 6.3 Heart Beat with Gateway Module

- **Given:** A `heart_beat_req` message with `module_type="mt_gw"`
- **When:** The parser processes the message
- **Then:** It SHALL use `module_sn` as `deviceId` instead of `gateway_sn`

### 6.4 Module Field Aliases

- **Given:** A message with `host_gateway_port_index` instead of `module_index`
- **When:** The parser processes the message
- **Then:** It SHALL map `host_gateway_port_index` to `moduleIndex` and handle `extend_module_sn` as alias for `moduleId`
