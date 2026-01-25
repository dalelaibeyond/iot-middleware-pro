# V5008Parser Implementation Guide v1.8

**File Name:** `V5008Parser_Spec.md`

**Date:** 1/22/2026
**Type:** Component Specification
**Scope:** Binary to SIF (Standard Intermediate Format) Conversion
**Status:** Final (Integrity Verified)

---

## 1. Component Overview

- **Class Name:** `V5008Parser`
- **Input:** `(topic: string, message: Buffer)`
- **Output:** `SIF Object` or `null`
- **Error Handling:** Log errors, return `null`. Do not throw exceptions.

---

## 2. SIF Standard Contract (Global Rules)

1. **The Envelope (Mandatory):**
Every SIF object returned by the parser **MUST** contain these root fields:
    - `deviceType`: Fixed "V5008".
    - `deviceId`: String (Target Gateway ID).
    - `messageType`: String (Unified Enum, e.g., "TEMP_HUM").
    - `messageId`: String (Unique packet ID).
    - `meta`: Object containing `{ "topic": string, "rawHex": string }`.
2. **Topology Context (Conditional):**
If the message pertains to specific sensor data (`RFID_SNAPSHOT`, `TEMP_HUM`, `NOISE_LEVEL`, `DOOR_STATE`), the SIF **MUST** include:
    - `moduleIndex`: Number (1-5).
    - `moduleId`: String.
3. **Payload Structure:**
    - All list-based data **MUST** be contained in an array key named **`data`**.

---

## 3. Parsing Strategy

### 3.1 Message Identification Logic

The parser determines `messageType` using this strict precedence:

1. **Topic Suffix Check:**
    - `.../LabelState` → `RFID_SNAPSHOT`
    - `.../TemHum` → `TEMP_HUM`
    - `.../Noise` → `NOISE_LEVEL`
2. **Header Byte Check (Byte 0):**
    - `0xBA` → `DOOR_STATE`
    - `0xCC` or `0xCB` → `HEARTBEAT`
3. **Extended Header Check (Bytes 0-1):**
    - `0xEF01` → `DEVICE_INFO`
    - `0xEF02` → `MODULE_INFO`
4. **Command Response Check (Header 0xAA):**
    - Read Byte 6 (Original Command Code):
        - `0xE4` → `QRY_CLR_RESP`
        - `0xE1` → `SET_CLR_RESP`
        - `0xE2` → `CLN_ALM_RESP`

---

## 4. Binary Field to SIF Mapping

**CRITICAL:** The parser must map the **Binary Field Name** (from Section 6 Schemas) to the specific **SIF JSON Key**.

| Binary Field Name | Byte Size | SIF JSON Key | Parsing Rule / Data Type |
| --- | --- | --- | --- |
| **Common Fields** |  |  |  |
| `DeviceId` | 4B | `deviceId` | **Context Dependent:**<br>1. Header `AA`: Bytes [1-4] → String.<br>2. Others: Extract from MQTT Topic. |
| `MsgId` | 4B | `messageId` | Last 4 bytes of packet → String. |
| `ModId` | 4B | `moduleId` | `uint32_be` → String. |
| `ModAddr` | 1B | `moduleIndex` | `uint8` (Range 1-5). |
| **Sensor Indices** |  |  |  |
| `Addr` (Temp) | 1B | `thIndex` | `uint8` (Range 10-15). |
| `Addr` (Noise) | 1B | `nsIndex` | `uint8` (Range 16-18). |
| `uPos` | 1B | `uIndex` | `uint8` (Range 1-54). |
| **Values** |  |  |  |
| `Total` | 1B | `uTotal` | `uint8`. |
| `Count` | 1B | `onlineCount` | `uint8`. |
| `Alarm` | 1B | `isAlarm` | `0x00`=false, `0x01`=true. |
| `TagId` | 4B | `tagId` | Hex String (Uppercase). |
| `State` | 1B | `doorState` | `uint8` (0 or 1). |
| `Result` | 1B | `result` | `0xA1`="Success", `0xA0`="Failure". |
| `ColorCode` | 1B | - | Used in `data` array as integer. |
| **Device Meta** |  |  |  |
| `Model` | 2B | `model` | Hex String (Uppercase). |
| `Fw` | 4B | `fwVer` | `uint32_be` → String. |
| `IP` | 4B | `ip` | Dot-notation String (e.g., "192.168.0.1"). |
| `Mask` | 4B | `mask` | Dot-notation String. |
| `Gw` | 4B | `gwIp` | Dot-notation String. |
| `Mac` | 6B | `mac` | Hex String with colons (e.g., "AA:BB..."). |
| `OriginalReq` | Var | `originalReq` | Hex String. See Algorithm B. |

---

## 5. Special Parsing Algorithms

### Algorithm A: Signed Sensor Values (Temp/Noise)

*Used for fields: `temp`, `hum`, `noise`.Binary Input: [IntegerByte, FractionByte]*

```jsx
function parseSignedFloat(integerByte, fractionByte) {
  // 1. Check Sign Bit (Two's Complement)
  let signedInt = (integerByte & 0x80) ? (0xFF - integerByte + 1) * -1 : integerByte;

  // 2. Combine with Fraction
  // Note: Fraction adds magnitude to the signed base
  let value = signedInt + (Math.sign(signedInt || 1) * (fractionByte / 100));

  return Number(value.toFixed(2));
}

```

### Algorithm B: Dynamic `originalReq` Length

*Used for `QRY_CLR_RESP`, `SET_CLR_RESP`, `CLN_ALM_RESP`.*

```jsx
// Header (AA) is at index 0. Command Code is at index 6.
let cmdCode = buffer[6];
let reqLength;

if (cmdCode === 0xE4) {
    reqLength = 2; // Fixed length for Query Color
} else {
    // Variable length: Total - Overhead (Header+Id+Result+MsgId)
    // Overhead = 10 bytes (Header:1 + DevId:4 + Result:1 + MsgId:4)
    reqLength = buffer.length - 10;
}
// Read `reqLength` bytes starting at index 6 -> `originalReq`

```

### **Algorithm C: Parsing originalReq (Header AA)**

*Goal: Extract the Module Index from the echoed command.*

```jsx
// 1. Determine Req Length (Algorithm B)
// 2. Extract Buffer slice for originalReq
const reqBuffer = buffer.slice(6, 6 + reqLength);

// 3. Extract Module Index (Byte 1 of the command)
// Example: E4 01 (Query Mod 1) -> 01
const moduleIndex = reqBuffer.readUInt8(1); 

// 4. Return both the Hex String and the Index
return { originalReq: reqBuffer.toString('hex').toUpperCase(), moduleIndex };
```

---

## 6. Message Structure Schemas (Binary Layout)

The parser must iterate through the binary buffer based on these structures to populate the SIF object.

### 6.1 HEARTBEAT

- **Header:** `0xCC` or `0xCB`
- **Schema:** `Header(1)` + `[ModAddr(1) + ModId(4) + Total(1)] × 10` + `MsgId(4)`
- **Parsing Logic:** Loop 10 times. **Filter out** slots where `ModId == 0` or `ModAddr > 5`.

### 6.2 RFID_SNAPSHOT

- **Header:** `0xBB`
- **Schema:** `Header(1) + ModAddr(1) + ModId(4) + Res(1) + Total(1) + Count(1)` + `[uPos(1) + Alarm(1) + TagId(4)] × Count` + `MsgId(4)`

### 6.3 TEMP_HUM

- **Topic:** `.../TemHum`
- **Schema:** `ModAddr(1) + ModId(4)` + `[Addr(1) + T_Int(1) + T_Frac(1) + H_Int(1) + H_Frac(1)] × 6` + `MsgId(4)`
- **Note:** Fixed 6 slots. If `Addr === 0`, skip. Use Algorithm A for values.

### 6.4 NOISE_LEVEL

- **Topic:** `.../Noise`
- **Schema:** `ModAddr(1) + ModId(4)` + `[Addr(1) + N_Int(1) + N_Frac(1)] × 3` + `MsgId(4)`
- **Note:** Fixed 3 slots. If `Addr === 0`, skip. Use Algorithm A for values.

### 6.5 DOOR_STATE

- **Header:** `0xBA`
- **Schema:** `Header(1) + ModAddr(1) + ModId(4) + State(1) + MsgId(4)`

### 6.6 DEVICE_INFO

- **Header:** `0xEF01`
- **Schema:** `Header(2) + Model(2) + Fw(4) + IP(4) + Mask(4) + Gw(4) + Mac(6) + MsgId(4)`

### 6.7 MODULE_INFO

- **Header:** `0xEF02`
- **Schema:** `Header(2)` + `[ModAddr(1) + Fw(4)] × N` + `MsgId(4)`
- **Logic:** `N = (Buffer.length - 6) / 5`

### 6.8 COMMAND RESPONSES (Header AA)

- **Schema (General):** `Header(1) + DeviceId(4) + Result(1) + OriginalReq(Var) + [Payload] + MsgId(4)`
- **Specific OriginalReq** and **Payloads:**
    - `QRY_CLR_RESP`: OriginalReq is `[E4]+[ModAddr]`, Payload is `[ColorCode × N]`.  `N = Buffer.length - 12` (Header:1 + DevId:4 + Result:1 + Req:2 + MsgId:4).
    - `SET_CLR_RESP`: OriginalReq is `[E1]+[ModAddr] + (uIndex + colorCode) x N`, No Payload.  `Var = Buffer.length - 10`  (Header:1 + DevId:4 + Result:1 + MsgId:4).
    - `CLN_ALM_RESP`: OriginalReq is `[E2]+[ModAddr]`, No Payload.  `Var = Buffer.length - 10`  (Header:1 + DevId:4 + Result:1 + MsgId:4).

---

## 7. SIF Output Examples (Complete List)

**Note:** All SIF outputs MUST include the full envelope (`meta`, `deviceId`, etc.) and use the key `data` for arrays.

### 1. `HEARTBEAT`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "CC01..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "HEARTBEAT",
  "messageId": "4060092047",
  "data": [
    { "moduleIndex": 1, "moduleId": "3963041727", "uTotal": 6 },
    { "moduleIndex": 2, "moduleId": "2349402517", "uTotal": 12 }
  ]
}

```

### 2. `RFID_SNAPSHOT`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/LabelState", "rawHex": "BB02..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "RFID_SNAPSHOT",
  "messageId": "83888045",
  "moduleIndex": 2,
  "moduleId": "2349402517",
  "uTotal": 12,
  "onlineCount": 2,
  "data": [
    { "uIndex": 10, "isAlarm": false, "tagId": "DD344A44" },
    { "uIndex": 11, "isAlarm": false, "tagId": "DD2862B4" }
  ]
}

```

### 3. `TEMP_HUM`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/TemHum", "rawHex": "01EC..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "TEMP_HUM",
  "messageId": "16854211",
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "data": [
    { "thIndex": 10, "temp": 28.48, "hum": 51.27 },
    { "thIndex": 11, "temp": -5.25, "hum": 51.11 }
  ]
}

```

### 4. `NOISE_LEVEL`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/Noise", "rawHex": "01EC..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "NOISE_LEVEL",
  "messageId": "16854211",
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "data": [
    { "nsIndex": 16, "noise": 45.20 },
    { "nsIndex": 17, "noise": 42.10 }
  ]
}

```

### 5. `DOOR_STATE`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "BA01..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "DOOR_STATE",
  "messageId": "184666104",
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "doorState": 1
}

```

### 6. `DEVICE_INFO`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "EF01..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "DEVICE_INFO",
  "messageId": "4060159179",
  "model": "1390",
  "fwVer": "2509101151",
  "ip": "192.168.0.211",
  "mask": "255.255.0.0",
  "gwIp": "192.168.0.1",
  "mac": "80:82:91:4E:F6:65"
}

```

### 7. `MODULE_INFO`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "EF02..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "MODULE_INFO",
  "messageId": "4093706598",
  "data": [
    { "moduleIndex": 1, "fwVer": "2307101644" },
    { "moduleIndex": 2, "fwVer": "2307101644" }
  ]
}

```

### 8. `QRY_CLR_RESP`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "AA91..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "QRY_CLR_RESP",
  "messageId": "620846412",
  "result": "Success",
  "originalReq": "E401",
  "moduleIndex": 1, // originalReq[1] = 0x01
  "data": [0, 0, 0, 13, 13, 8]
}

```

### 9. `SET_CLR_RESP`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "AA91..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "SET_CLR_RESP",
  "messageId": "721429270",
  "result": "Success",
  "moduleIndex": 1, // originalReq[1] = 0x01
  "originalReq": "E10105020601"
}

```

### 10. `CLN_ALM_RESP`

```json
{
  "meta": { "topic": "V5008Upload/2437871205/OpeAck", "rawHex": "AA91..." },
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "CLN_ALM_RESP",
  "messageId": "2885721807",
  "result": "Success",
  "moduleIndex": 1, // originalReq[1] = 0x01
  "originalReq": "E2010605"
}

```