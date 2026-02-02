# CommandService Implementation Guide v1.0

**File Name:** `CommandService_Implementation_Guide_v1.0.md`

**Date:** 1/24/2026
**Type:** Component Specification
**Scope:** Internal Command Translation & MQTT Publishing
**Status:** Final

---

## 1. Component Overview

- **Class Name:** `CommandService`
- **Role:** The Output Interface. It translates internal system intents into device-specific raw protocols (Binary or JSON) and publishes them to the MQTT Broker.
- **Dependencies:**
    - `EventBus`: Listens for `command.request`.
    - `MqttSubscriber`: Used to publish messages (via its `publish` method).

---

## 2. Core Logic Flow

1. **Listen:** Subscribe to `command.request` event on the EventBus.
2. **Route:** Switch logic based on `deviceType` ("V5008" vs "V6800").
3. **Build:**
    - If **V5008**: Construct a **Node.js Buffer** containing the Hex sequence.
    - If **V6800**: Construct a **JSON Object** payload.
4. **Publish:**
    - Topic: `V5008Download/{deviceId}` or `V6800Download/{deviceId}`.
    - Payload: The Buffer or stringified JSON.
5. **Log:** Log the outbound command for audit purposes.

---

## 3. Input Data Contract

The service consumes the `command.request` event payload.

```jsx
{
  "deviceId": "2437871205",   // Target Device
  "deviceType": "V5008",      // "V5008" or "V6800"
  "messageType": "SET_COLOR", // Unified Enum (See Tables Below)

  // Optional Params (depending on command)
  "payload": {
    "moduleIndex": 1,         // Required for Module-level commands
    "sensorIndex": 10,        // Required for Sensor-level commands (uIndex)
    "colorCode": 1            // Required for Set Color
  }
}

```

---

## 4. V5008 Builder Logic (Binary)

**Topic:** `V5008Download/{deviceId}`**Format:** Binary Buffer.

**Implementation Note:** Use `Buffer.from([...])` or `Buffer.alloc()` to construct these packets. `moduleIndex` corresponds to the byte `modAddr`.

| Message Type | Hex Structure Formula | Note |
| --- | --- | --- |
| `QRY_RFID_SNAPSHOT` | `0xE9, 0x01, moduleIndex` | Fixed 3 Bytes |
| `QRY_TEMP_HUM` | `0xE9, 0x02, moduleIndex` | Fixed 3 Bytes |
| `QRY_DOOR_STATE` | `0xE9, 0x03, moduleIndex` | Fixed 3 Bytes |
| `QRY_NOISE_LEVEL` | `0xE9, 0x04, moduleIndex` | Fixed 3 Bytes |
| `QRY_DEVICE_INFO` | `0xEF, 0x01, 0x00` | Device Info (Fixed 3 Bytes) |
| `QRY_MODULE_INFO` | `0xEF, 0x02, 0x00` | Module Info (Fixed 3 Bytes) |
| `QRY_COLOR` | `0xE4, moduleIndex` | Fixed 2 Bytes |
| `CLN_ALARM` | `0xE2, moduleIndex, sensorIndex` | Fixed 3 Bytes |
| `SET_COLOR` | `0xE1, moduleIndex, sensorIndex, colorCode` | **Set a single LED:** 4 Bytes |
| `SET_COLOR` | `0xE1, moduleIndex, sensorIndex, colorCode`,`sensorIndex, colorCode`, … | Set multiple LEDs |

### V5008 Code Example (for AI)

```jsx
// Example: SET_COLOR
// Input: moduleIndex=1, sensorIndex=10, colorCode=1
const buffer = Buffer.from([0xE1, 0x01, 0x0A, 0x01]);
mqtt.publish(`V5008Download/${deviceId}`, buffer);

```

---

## 5. V6800 Builder Logic (JSON)

**Topic:** `V6800Download/{deviceId}`**Format:** JSON String.

**Common Fields:**
All V6800 commands must include:

- `gateway_sn`: `{deviceId}`

### 5.1 Command Mappings

| Message Type | `msg_type` | Payload Requirements |
| --- | --- | --- |
| `QRY_RFID_SNAPSHOT` | `u_state_req` | See detailed structure below. |
| `QRY_TEMP_HUM` | `temper_humidity_req` | See detailed structure below. |
| `QRY_DOOR_STATE` | `door_state_req` | See detailed structure below. |
| `QRY_DEV_MOD_INFO` | `get_devies_init_req` | See detailed structure below. |
| `QRY_COLOR` | `get_u_color` | See detailed structure below. |
| `CLN_ALARM` | `clear_u_warning` | See detailed structure below. |
| `SET_COLOR` | `set_module_property_req` | See detailed structure below. |

### 5.2 JSON Structures

**SET_COLOR (`set_module_property_req`)**

```json
{
  "msg_type": "set_module_property_req",
  "gateway_sn": "{deviceId}",
  "set_property_type": 8001, //Fixed value: 8001
  "data": [{ 
      "host_gateway_port_index": "{moduleIndex}", 
      "extend_module_sn": null, 
      "module_type": 2, 
      "u_color_data": [{"u_index": "{sensorIndex}","color_code": "{colorCode}" }]}]
}
```

**CLN_ALARM (`clear_u_warning`)**

```json
{
  "msg_type": "clear_u_warning",
  "gateway_id": "{deviceId}", // Note: gateway_id, not gateway_sn
  "code": 123456, 
  "data": [{ "index": "{moduleIndex}", // moduleIndex
    "warning_data": ["{sensorIndex}"] // Array of uIndexes to clear
  }]
}

```

**QRY_DEV_MOD_INFO** (`get_devies_init_req`)

```json
{
  "msg_type": "get_devies_init_req",
  "code": 200 // Fixed value: 200
}
```

**QRY_RFID_SNAPSHOT** (`u_state_req`)

```json
{
  "msg_type": "u_state_req",
  "gateway_sn": "2105101125",
  "data": [{
    "extend_module_sn": "0304555999",
    "host_gateway_port_index": 1,
    "u_index_list": null
  }]
}
```

**QRY_DOOR_STATE** (`door_state_req`)

```json
{
  "msg_type": "door_state_req",
  "gateway_sn": "2105101125", //deviceId
  "extend_module_sn": "0304555999",
  "host_gateway_port_index": 1
}
```

**QRY_TEMP_HUM** (`temper_humidity_req`)

```json
{
  "msg_type": "temper_humidity_req",  
  "gateway_sn": "2105101125",  
  "extend_module_sn": null, //Fixed value: null
  "data": [1,2] //moduleIndex
}
```

QRY_COLOR (`get_u_color`)

```json
{
  "msg_type": "get_u_color",  
  "code": 1346589,  //any
  "data": [3, 5]   //moduleIndex
}
```

## 6. Implementation Requirements

1. **Validation:**
    - Check that `deviceId` exists.
    - Check that required params (`moduleIndex`, etc.) exist for the specific command type.
2. **Safety:**
    - If `deviceType` is unknown, log an error and do not publish.
    - If `messageType` is not supported for that device, log a warning.
3. **Extensibility:**
    - Use a `Strategy Pattern` or simple switch-case separated by functions (e.g., `buildV5008Command`, `buildV6800Command`) to allow easy addition of new devices.