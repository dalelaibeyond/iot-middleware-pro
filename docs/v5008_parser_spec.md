# V5008 Parser Specification - As-Built

> **Component:** V5008Parser  
> **Version:** 1.8  
> **Last Updated:** 2026-02-11  
> **Status:** As-Built (Verified against source code)

---

## 1. Component Overview

- **Class Name:** `V5008Parser`
- **Input:** `(buffer: Buffer, metadata: {topic, deviceId, messageType})`
- **Output:** `SIF Object` or `null`
- **Error Handling:** Log errors, return `null`. Never throw exceptions.

**Source File:** `src/modules/parsers/V5008Parser.js`

---

## 2. SIF Standard Contract

Every SIF object returned by the parser **MUST** contain:

```javascript
{
  deviceType: "V5008",
  deviceId: "string",
  messageType: "HEARTBEAT|RFID_SNAPSHOT|...",
  messageId: "string",
  meta: {
    topic: "string",
    rawHex: "string"
  },
  // Plus message-specific fields
}
```

**Topology Context (for sensor data):**
- `moduleIndex`: Number (1-5)
- `moduleId`: String

---

## 3. Message Identification Logic

The parser determines `messageType` using this strict precedence:

### 3.1 Priority 1: Topic Suffix Check

| Topic Suffix | Message Type |
|--------------|--------------|
| `.../LabelState` | `RFID_SNAPSHOT` |
| `.../TemHum` | `TEMP_HUM` |
| `.../Noise` | `NOISE_LEVEL` |

### 3.2 Priority 2: Header Byte Check (Byte 0)

| Header Byte | Message Type |
|-------------|--------------|
| `0xBA` | `DOOR_STATE` |
| `0xCC` or `0xCB` | `HEARTBEAT` |
| `0xBB` | `RFID_SNAPSHOT` |

### 3.3 Priority 3: Extended Header Check (Bytes 0-1)

| Bytes | Message Type |
|-------|--------------|
| `0xEF 0x01` | `DEVICE_INFO` |
| `0xEF 0x02` | `MODULE_INFO` |

### 3.4 Priority 4: Command Response Check (Header 0xAA)

| Byte 6 (Command Code) | Message Type |
|-----------------------|--------------|
| `0xE4` | `QRY_CLR_RESP` |
| `0xE1` | `SET_CLR_RESP` |
| `0xE2` | `CLN_ALM_RESP` |

---

## 4. Binary Field to SIF Mapping

| Binary Field | Byte Size | SIF JSON Key | Parsing Rule |
|--------------|-----------|--------------|--------------|
| **Common Fields** |
| `DeviceId` | 4B | `deviceId` | Header AA: Bytes [1-4] → Hex String |
| `MsgId` | 4B | `messageId` | Last 4 bytes → readUInt32BE → String |
| `ModId` | 4B | `moduleId` | readUInt32BE → String |
| `ModAddr` | 1B | `moduleIndex` | readUInt8 (Range 1-5) |
| **Sensor Indices** |
| `Addr` (Temp) | 1B | `thIndex` | readUInt8 (Range 10-15) |
| `Addr` (Noise) | 1B | `nsIndex` | readUInt8 (Range 16-18) |
| `uPos` | 1B | `uIndex` | readUInt8 (Range 1-54) |
| **Values** |
| `Total` | 1B | `uTotal` | readUInt8 |
| `Count` | 1B | `onlineCount` | readUInt8 |
| `Alarm` | 1B | `isAlarm` | `0x00`=false, `0x01`=true |
| `TagId` | 4B | `tagId` | toString('hex').toUpperCase() |
| `State` | 1B | `doorState` | readUInt8 (0 or 1) |
| `Result` | 1B | `result` | `0xA1`="Success", `0xA0`="Failure" |
| **Device Meta** |
| `Model` | 2B | `model` | toString('hex').toUpperCase() |
| `Fw` | 4B | `fwVer` | readUInt32BE → String |
| `IP` | 4B | `ip` | Dot-notation (e.g., "192.168.0.1") |
| `Mask` | 4B | `mask` | Dot-notation |
| `Gw` | 4B | `gwIp` | Dot-notation |
| `Mac` | 6B | `mac` | Hex with colons (AA:BB:CC:DD:EE:FF) |
| `OriginalReq` | Var | `originalReq` | Hex String |

---

## 5. Special Parsing Algorithms

### 5.1 Algorithm A: Signed Sensor Values (Temp/Noise)

**Used for:** `temp`, `hum`, `noise` fields

```javascript
function parseSignedFloat(integerByte, fractionByte) {
  // Check if both bytes are 0x00 (Zero)
  if (integerByte === 0x00 && fractionByte === 0x00) {
    return null;
  }

  // Check Sign Bit (Two's Complement)
  let signedInt = (integerByte & 0x80) 
    ? (0xFF - integerByte + 1) * -1 
    : integerByte;

  // Combine with Fraction
  let value = signedInt + Math.sign(signedInt || 1) * (fractionByte / 100);

  return Number(value.toFixed(2));
}
```

### 5.2 Algorithm B: Dynamic originalReq Length

**Used for:** `QRY_CLR_RESP`, `SET_CLR_RESP`, `CLN_ALM_RESP`

```javascript
// Header (AA) at index 0, Command Code at index 6
const cmdCode = buffer[6];
let reqLength;

if (cmdCode === 0xE4) {
  reqLength = 2; // Fixed length for Query Color
} else {
  // Variable: Total - Overhead (Header:1 + DevId:4 + Result:1 + MsgId:4)
  reqLength = buffer.length - 10;
}

// Extract originalReq
const reqBuffer = buffer.slice(6, 6 + reqLength);
const moduleIndex = reqBuffer.readUInt8(1);

return {
  originalReq: reqBuffer.toString('hex').toUpperCase(),
  moduleIndex
};
```

### 5.3 Algorithm D: Parsing 4-byte Field to String

**Used for:** `ModId`, `MsgId`, `Fw`, `fwVer`

```javascript
// Example: Raw bytes [0x27, 0x00, 0xDC, 0xF6]
const decimalValue = buffer.readUInt32BE(offset).toString();
// Result: "654367990"
```

---

## 6. Message Structure Schemas

### 6.1 HEARTBEAT

- **Header:** `0xCC` or `0xCB`
- **Schema:** `Header(1) + [ModAddr(1) + ModId(4) + Total(1)] × 10 + MsgId(4)`
- **Parsing:** Loop 10 times, filter out slots where `ModId == 0` or `ModAddr > 5`
- **Edge Case:** Return `data: []` (not null) if all slots invalid

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "HEARTBEAT",
  "messageId": "4060092047",
  "meta": { "topic": "...", "rawHex": "CC01..." },
  "data": [
    { "moduleIndex": 1, "moduleId": "3963041727", "uTotal": 6 },
    { "moduleIndex": 2, "moduleId": "2349402517", "uTotal": 12 }
  ]
}
```

### 6.2 RFID_SNAPSHOT

- **Header:** `0xBB` or Topic `.../LabelState`
- **Schema:** `Header(1) + ModAddr(1) + ModId(4) + Res(1) + Total(1) + Count(1) + [uPos(1) + Alarm(1) + TagId(4)] × Count + MsgId(4)`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "RFID_SNAPSHOT",
  "messageId": "83888045",
  "meta": { "topic": "...", "rawHex": "BB02..." },
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

### 6.3 TEMP_HUM

- **Topic:** `.../TemHum`
- **Schema:** `ModAddr(1) + ModId(4) + [Addr(1) + T_Int(1) + T_Frac(1) + H_Int(1) + H_Frac(1)] × 6 + MsgId(4)`
- **Note:** Fixed 6 slots. If `Addr === 0`, skip. Use Algorithm A for values.

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "TEMP_HUM",
  "messageId": "16854211",
  "meta": { "topic": "...", "rawHex": "01EC..." },
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "data": [
    { "thIndex": 10, "temp": 28.48, "hum": 51.27 },
    { "thIndex": 11, "temp": -5.25, "hum": 51.11 }
  ]
}
```

### 6.4 NOISE_LEVEL

- **Topic:** `.../Noise`
- **Schema:** `ModAddr(1) + ModId(4) + [Addr(1) + N_Int(1) + N_Frac(1)] × 3 + MsgId(4)`
- **Note:** Fixed 3 slots. If `Addr === 0`, skip. Use Algorithm A for values.

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "NOISE_LEVEL",
  "messageId": "16854211",
  "meta": { "topic": "...", "rawHex": "01EC..." },
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "data": [
    { "nsIndex": 16, "noise": 45.20 },
    { "nsIndex": 17, "noise": 42.10 }
  ]
}
```

### 6.5 DOOR_STATE

- **Header:** `0xBA`
- **Schema:** `Header(1) + ModAddr(1) + ModId(4) + State(1) + MsgId(4)`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "DOOR_STATE",
  "messageId": "184666104",
  "meta": { "topic": "...", "rawHex": "BA01..." },
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "doorState": 1
}
```

### 6.6 DEVICE_INFO

- **Header:** `0xEF01`
- **Schema:** `Header(2) + Model(2) + Fw(4) + IP(4) + Mask(4) + Gw(4) + Mac(6) + MsgId(4)`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "DEVICE_INFO",
  "messageId": "4060159179",
  "meta": { "topic": "...", "rawHex": "EF01..." },
  "model": "1390",
  "fwVer": "2509101151",
  "ip": "192.168.0.211",
  "mask": "255.255.0.0",
  "gwIp": "192.168.0.1",
  "mac": "80:82:91:4E:F6:65"
}
```

### 6.7 MODULE_INFO

- **Header:** `0xEF02`
- **Schema:** `Header(2) + [ModAddr(1) + Fw(4)] × N + MsgId(4)`
- **Logic:** `N = (Buffer.length - 6) / 5`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "MODULE_INFO",
  "messageId": "4093706598",
  "meta": { "topic": "...", "rawHex": "EF02..." },
  "data": [
    { "moduleIndex": 1, "fwVer": "2307101644" },
    { "moduleIndex": 2, "fwVer": "2307101644" }
  ]
}
```

### 6.8 Command Responses (Header 0xAA)

#### QRY_CLR_RESP (Command Code 0xE4)

- **Schema:** `Header(1) + DeviceId(4) + Result(1) + OriginalReq(2) + [ColorCode × N] + MsgId(4)`
- **N:** `Buffer.length - 12`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "QRY_CLR_RESP",
  "messageId": "620846412",
  "meta": { "topic": "...", "rawHex": "AA91..." },
  "result": "Success",
  "originalReq": "E401",
  "moduleIndex": 1,
  "data": [0, 0, 0, 13, 13, 8]
}
```

#### SET_CLR_RESP (Command Code 0xE1)

- **Schema:** `Header(1) + DeviceId(4) + Result(1) + OriginalReq(Var) + MsgId(4)`
- **Var:** `Buffer.length - 10`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "SET_CLR_RESP",
  "messageId": "721429270",
  "meta": { "topic": "...", "rawHex": "AA91..." },
  "result": "Success",
  "moduleIndex": 1,
  "originalReq": "E10105020601"
}
```

#### CLN_ALM_RESP (Command Code 0xE2)

- **Schema:** `Header(1) + DeviceId(4) + Result(1) + OriginalReq(2) + MsgId(4)`

**SIF Output:**
```json
{
  "deviceType": "V5008",
  "deviceId": "2437871205",
  "messageType": "CLN_ALM_RESP",
  "messageId": "2885721807",
  "meta": { "topic": "...", "rawHex": "AA91..." },
  "result": "Success",
  "moduleIndex": 1,
  "originalReq": "E2010605"
}
```

---

## 7. Supported Message Types Summary

| Type | Code/Trigger | Description |
|------|--------------|-------------|
| `HEARTBEAT` | `0xCC`/`0xCB` | Periodic heartbeat with module list |
| `RFID_SNAPSHOT` | `0xBB` or `/LabelState` | Full RFID state snapshot |
| `TEMP_HUM` | `/TemHum` topic | Temperature & humidity readings |
| `NOISE_LEVEL` | `/Noise` topic | Noise sensor readings |
| `DOOR_STATE` | `0xBA` | Door open/close state |
| `DEVICE_INFO` | `0xEF01` | Device metadata (IP, MAC, etc.) |
| `MODULE_INFO` | `0xEF02` | Module firmware versions |
| `QRY_CLR_RESP` | `0xAA` + `0xE4` | Query color response |
| `SET_CLR_RESP` | `0xAA` + `0xE1` | Set color response |
| `CLN_ALM_RESP` | `0xAA` + `0xE2` | Clear alarm response |
