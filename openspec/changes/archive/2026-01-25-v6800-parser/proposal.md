# Change: Implement V6800 Parser

## Why

The V6800 device sends JSON messages over MQTT that need to be parsed into the Standard Intermediate Format (SIF) for downstream processing by the normalizer and storage modules. Currently, the V6800Parser stub exists but lacks full implementation.

## What Changes

- Implement full V6800Parser class to handle 12 message types from V6800 devices
- Add message type mapping from raw `msg_type` to SIF `messageType`
- Implement field mapping logic for common fields, module/sensor arrays, and door states
- Handle error cases gracefully (unknown message types, parse failures)
- Support both single and dual door sensor configurations

## Impact

- Affected specs: `specs/v6800-parser/spec.md` (new capability)
- Affected code: `src/modules/parsers/V6800Parser.js` (implementation)
- Integration: ParserManager will use V6800Parser for V6800 device messages

---

# Implementation Plan

## 1. Core Parser Structure

### 1.1 Class Definition

- **File:** `src/modules/parsers/V6800Parser.js`
- **Class:** `V6800Parser`
- **Method:** `parse(topic, message)`
  - Input: `(topic: string, message: String | Object)`
  - Output: `SIF Object` or `null`

### 1.2 Error Handling

- Wrap JSON parsing in `try-catch` block
- Log errors via `Logger.error` on parse failure
- Return `null` if parsing fails
- For unknown `msg_type`: set `messageType = "UNKNOWN"`, preserve raw payload, do not throw

## 2. Message Type Mapping

| Raw `msg_type`                         | SIF `messageType`     |
| -------------------------------------- | --------------------- |
| `heart_beat_req`                       | `HEARTBEAT`           |
| `u_state_resp`                         | `RFID_SNAPSHOT`       |
| `u_state_changed_notify_req`           | `RFID_EVENT`          |
| `temper_humidity_exception_nofity_req` | `TEMP_HUM`            |
| `temper_humidity_resp`                 | `QRY_TEMP_HUM_RESP`   |
| `door_state_changed_notify_req`        | `DOOR_STATE`          |
| `door_state_resp`                      | `QRY_DOOR_STATE_RESP` |
| `devies_init_req`                      | `DEV_MOD_INFO`        |
| `u_color`                              | `QRY_CLR_RESP`        |
| `set_module_property_result_req`       | `SET_CLR_RESP`        |
| `clear_u_warning`                      | `CLN_ALM_RESP`        |
| `devices_changed_req`                  | `UTOTAL_CHANGED`      |

## 3. SIF Envelope (Mandatory Fields)

Every SIF object MUST contain:

```javascript
{
  deviceType: "V6800",
  deviceId: string,      // from gateway_sn or module_sn (for heart_beat_req with module_type="mt_gw")
  messageType: string,   // mapped from msg_type
  messageId: string,     // from uuid_number (cast Number to String)
  meta: {
    topic: string,      // input topic
    rawType: string     // original msg_type
  }
}
```

## 4. Field Mapping Logic

### 4.1 Common Fields (Root Level)

| Raw Field     | SIF Key        | Data Type | Notes                                                 |
| ------------- | -------------- | --------- | ----------------------------------------------------- |
| `gateway_sn`  | `deviceId`     | String    | Default mapping                                       |
| `module_sn`   | `deviceId`     | String    | Only for `heart_beat_req` where `module_type`="mt_gw" |
| `msg_type`    | `meta.rawType` | String    |                                                       |
| `uuid_number` | `messageId`    | String    | Cast Number to String                                 |
| `gateway_ip`  | `ip`           | String    |                                                       |
| `gateway_mac` | `mac`          | String    |                                                       |

### 4.2 Module & Sensor Array Mapping

| Context    | Raw Field                 | SIF Key       | Transformation Logic                            |
| ---------- | ------------------------- | ------------- | ----------------------------------------------- |
| **Module** | `module_index`            | `moduleIndex` | Integer                                         |
| **Module** | `host_gateway_port_index` | `moduleIndex` | Integer (Alias)                                 |
| **Module** | `module_sn`               | `moduleId`    | String                                          |
| **Module** | `extend_module_sn`        | `moduleId`    | String (Alias)                                  |
| **Module** | `module_u_num`            | `uTotal`      | Integer                                         |
| **Module** | `module_sw_version`       | `fwVer`       | String                                          |
| **RFID**   | `u_index`                 | `uIndex`      | Integer                                         |
| **RFID**   | `tag_code`                | `tagId`       | String. **Filter:** Ignore object if null/empty |
| **RFID**   | `warning`                 | `isAlarm`     | Boolean (0=false, 1=true)                       |
| **RFID**   | `new_state` / `old_state` | `action`      | `1`/`0` → `"ATTACHED"`; `0`/`1` → `"DETACHED"`  |
| **Env**    | `temper_position`         | `thIndex`     | Integer                                         |
| **Env**    | `temper_swot`             | `temp`        | Number                                          |
| **Env**    | `hygrometer_swot`         | `hum`         | Number                                          |
| **Color**  | `color`                   | `colorName`   | String                                          |
| **Color**  | `code`                    | `colorCode`   | Integer                                         |

### 4.3 Door State Logic

V6800 supports both Single and Dual door sensors:

**Case 1 (Single Door):**

- If raw has `new_state` → Map to `doorState`
- Example: `{ "doorState": 1 }`

**Case 2 (Dual Door):**

- If raw has `new_state1` / `new_state2` → Map to `door1State` / `door2State`
- Example: `{ "door1State": 1, "door2State": 1 }`

## 5. Special Message Type: DEV_MOD_INFO

### 5.1 devies_init_req → DEV_MOD_INFO Mapping

**Raw Input Example:**

```json
{
  "gateway_sn": "2105101125",
  "msg_type": "devies_init_req",
  "uuid_number": 1528492292,
  "gateway_ip": "192.168.100.100",
  "gateway_mac": "08:80:7D:79:4B:45",
  "data": [
    {
      "module_index": 4,
      "module_sn": "3468672873",
      "module_u_num": 12,
      "module_sw_version": "2209191506"
    }
  ]
}
```

**SIF Output:**

```json
{
  "meta": {
    "topic": "...",
    "rawType": "devies_init_req"
  },
  "deviceId": "2105101125",
  "deviceType": "V6800",
  "messageType": "DEV_MOD_INFO",
  "messageId": "1528492292",
  "ip": "192.168.100.100",
  "mac": "08:80:7D:79:4B:45",
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

### 5.2 DEV_MOD_INFO Field Mapping Summary

| Raw Field           | SIF Key       | Notes         |
| ------------------- | ------------- | ------------- |
| `gateway_sn`        | `deviceId`    |               |
| `gateway_ip`        | `ip`          |               |
| `gateway_mac`       | `mac`         |               |
| `module_index`      | `moduleIndex` | In data array |
| `module_sn`         | `moduleId`    | In data array |
| `module_u_num`      | `uTotal`      | In data array |
| `module_sw_version` | `fwVer`       | In data array |

## 6. All 12 Message Type Implementations

### 6.1 HEARTBEAT (heart_beat_req)

- Map `module_index` → `moduleIndex`
- Map `module_sn` → `moduleId`
- Map `module_u_num` → `uTotal`
- Special: If `module_type`="mt_gw", use `module_sn` as `deviceId`

### 6.2 RFID_SNAPSHOT (u_state_resp)

- Iterate data array
- For each module: map `module_index`, `module_sn`
- For each RFID: map `u_index`, `tag_code` (filter null/empty), `warning`
- Nested `data` array for RFID items

### 6.3 RFID_EVENT (u_state_changed_notify_req)

- Similar to RFID_SNAPSHOT
- Map `new_state`/`old_state` → `action` ("ATTACHED"/"DETACHED")
- Filter RFID items with null/empty `tag_code`

### 6.4 TEMP_HUM (temper_humidity_exception_nofity_req)

- Map `temper_position` → `thIndex`
- Map `temper_swot` → `temp`
- Map `hygrometer_swot` → `hum`
- Nested `data` array for temperature/humidity items

### 6.5 QRY_TEMP_HUM_RESP (temper_humidity_resp)

- Same as TEMP_HUM
- Different message type for query response

### 6.6 DOOR_STATE (door_state_changed_notify_req)

- **Single Door:** Map `new_state` → `doorState`
- **Dual Door:** Map `new_state1` → `door1State`, `new_state2` → `door2State`
- Detect based on presence of `new_state1`/`new_state2`

### 6.7 QRY_DOOR_STATE_RESP (door_state_resp)

- Similar to DOOR_STATE but at root level (not in data array)
- Map `module_index`, `module_sn`, and door state(s)

### 6.8 DEV_MOD_INFO (devies_init_req)

- Map `gateway_ip` → `ip`
- Map `gateway_mac` → `mac`
- Map module fields in data array

### 6.9 UTOTAL_CHANGED (devices_changed_req)

- Map `module_index`, `module_sn`, `module_u_num`, `module_sw_version`
- Indicates configuration change

### 6.10 QRY_CLR_RESP (u_color)

- Map module fields: `module_index`, `module_sn`, `module_u_num`
- Map color fields: `color` → `colorName`, `code` → `colorCode`
- Nested `data` array for color items

### 6.11 SET_CLR_RESP (set_module_property_result_req)

- Map `module_index`, `module_sn`
- Add `result` field (from raw response)

### 6.12 CLN_ALM_RESP (clear_u_warning)

- Map `module_index`, `module_sn`, `module_u_num`
- Add `result` field (boolean from raw response)

## 7. Implementation Steps

1. Create message type mapping object
2. Implement common field extraction
3. Implement module/sensor array iteration
4. Implement door state detection logic
5. Implement all 12 message type handlers
6. Add error handling for unknown message types
7. Add filtering for null/empty RFID tags
8. Add unit tests for each message type
9. Integrate with ParserManager

## 8. Testing Strategy

- Test each of the 12 message types with sample data
- Test error handling (invalid JSON, unknown msg_type)
- Test door state detection (single vs dual)
- Test RFID tag filtering (null/empty values)
- Test type conversions (Number to String for messageId)
