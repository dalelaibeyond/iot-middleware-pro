# v5008_parser_spec

# V5008 Parser Specification - As-Built

> **Component:** V5008Parser (Binary Protocol)
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
| **Class** | `V5008Parser` |
| **Input** | `(buffer: Buffer, metadata: {topic, deviceId, messageType})` |
| **Output** | `SIF Object` or `null` |
| **Source** | `src/modules/parsers/V5008Parser.js` |
| **Error Handling** | Log errors, return `null`. Never throw exceptions. |

**See Also:** [message_map_spec.md](message_map_spec.md) for complete RAW → SIF → SUO → DB → UOS transformations.

---

## 2. Message Type Identification

Identification follows strict **priority order**: Topic → Header Byte → Extended Header → Command Code.

| Priority | Trigger | Message Type |
| --- | --- | --- |
| **1. Topic Suffix** | `.../LabelState` | `RFID_SNAPSHOT` |
|  | `.../TemHum` | `TEMP_HUM` |
|  | `.../Noise` | `NOISE_LEVEL` |
| **2. Header (Byte 0)** | `0xBA` | `DOOR_STATE` |
|  | `0xCC` / `0xCB` | `HEARTBEAT` |
|  | `0xBB` | `RFID_SNAPSHOT` |
| **3. Extended Header (Bytes 0-1)** | `0xEF 0x01` | `DEVICE_INFO` |
|  | `0xEF 0x02` | `MODULE_INFO` |
| **4. Command Response (Byte 6)** | `0xE4` | `QRY_CLR_RESP` |
| (Header `0xAA`) | `0xE1` | `SET_CLR_RESP` |
|  | `0xE2` | `CLN_ALM_RESP` |

---

## 3. Binary Field Mapping

| Binary Field | Size | SIF Key | Parsing Rule |
| --- | --- | --- | --- |
| **Common** |  |  |  |
| `MsgId` | 4B | `messageId` | `readUInt32BE` → String |
| `ModId` | 4B | `moduleId` | `readUInt32BE` → String |
| `ModAddr` | 1B | `moduleIndex` | `readUInt8` (1-5) |
| **Sensors** |  |  |  |
| `Addr` (Temp) | 1B | `thIndex` | Range 10-15 |
| `Addr` (Noise) | 1B | `nsIndex` | Range 16-18 |
| `uPos` | 1B | `uIndex` | Range 1-54 |
| `TagId` | 4B | `tagId` | `toString('hex').toUpperCase()` |
| **Device** |  |  |  |
| `IP/Mask/Gw` | 4B | `ip/mask/gwIp` | Dot-notation |
| `Mac` | 6B | `mac` | Colon-separated hex |
| `Fw` | 4B | `fwVer` | `readUInt32BE` → String |

---

## 4. Special Algorithms

### 4.1 Algorithm A: Signed Sensor Values

**Used for:** `temp`, `hum`, `noise` fields

```jsx
function parseSignedFloat(integerByte, fractionByte) {
  if (integerByte === 0x00 && fractionByte === 0x00) return null;

  let signedInt = (integerByte & 0x80)
    ? (0xFF - integerByte + 1) * -1
    : integerByte;

  let value = signedInt + Math.sign(signedInt || 1) * (fractionByte / 100);
  return Number(value.toFixed(2));
}
```

### 4.2 Algorithm B: Dynamic originalReq Length

**Used for:** Command responses (`QRY_CLR_RESP`, `SET_CLR_RESP`, `CLN_ALM_RESP`)

```jsx
const cmdCode = buffer[6];
const reqLength = (cmdCode === 0xE4) ? 2 : buffer.length - 10;
const originalReq = buffer.slice(6, 6 + reqLength).toString('hex').toUpperCase();
```

---

## 5. Message Quick Reference

### 5.1 HEARTBEAT

| Attribute | Value |
| --- | --- |
| **Header** | `0xCC` or `0xCB` |
| **Schema** | `Header(1) + [ModAddr(1) + ModId(4) + Total(1)] × 10 + MsgId(4)` |
| **Filter** | Skip slots where `ModId == 0` or `ModAddr > 5` |

### 5.2 RFID_SNAPSHOT

| Attribute | Value |
| --- | --- |
| **Trigger** | Header `0xBB` OR Topic `/LabelState` |
| **Schema** | `Header(1) + ModAddr(1) + ModId(4) + Res(1) + Total(1) + Count(1) + [uPos(1) + Alarm(1) + TagId(4)] × Count + MsgId(4)` |

### 5.3 TEMP_HUM

| Attribute | Value |
| --- | --- |
| **Topic** | `/TemHum` |
| **Schema** | `ModAddr(1) + ModId(4) + [Addr(1) + T_Int(1) + T_Frac(1) + H_Int(1) + H_Frac(1)] × 6 + MsgId(4)` |
| **Note** | Fixed 6 slots; skip if `Addr === 0`; use **Algorithm A** |

### 5.4 NOISE_LEVEL

| Attribute | Value |
| --- | --- |
| **Topic** | `/Noise` |
| **Schema** | `ModAddr(1) + ModId(4) + [Addr(1) + N_Int(1) + N_Frac(1)] × 3 + MsgId(4)` |
| **Note** | Fixed 3 slots; skip if `Addr === 0`; use **Algorithm A** |

### 5.5 DOOR_STATE

| Attribute | Value |
| --- | --- |
| **Header** | `0xBA` |
| **Schema** | `Header(1) + ModAddr(1) + ModId(4) + State(1) + MsgId(4)` |

### 5.6 DEVICE_INFO

| Attribute | Value |
| --- | --- |
| **Header** | `0xEF01` |
| **Schema** | `Header(2) + Model(2) + Fw(4) + IP(4) + Mask(4) + Gw(4) + Mac(6) + MsgId(4)` |

### 5.7 MODULE_INFO

| Attribute | Value |
| --- | --- |
| **Header** | `0xEF02` |
| **Schema** | `Header(2) + [ModAddr(1) + Fw(4)] × N + MsgId(4)` |
| **Logic** | `N = (buffer.length - 6) / 5` |

### 5.8 Command Responses (Header `0xAA`)

| Type | Command | Schema |
| --- | --- | --- |
| `QRY_CLR_RESP` | `0xE4` | `Header(1) + DeviceId(4) + Result(1) + OriginalReq(2) + [ColorCode × N] + MsgId(4)` |
| `SET_CLR_RESP` | `0xE1` | `Header(1) + DeviceId(4) + Result(1) + OriginalReq(Var) + MsgId(4)` |
| `CLN_ALM_RESP` | `0xE2` | `Header(1) + DeviceId(4) + Result(1) + OriginalReq(2) + MsgId(4)` |

**Result Codes:** `0xA1` = Success, `0xA0` = Failure

---

## 6. Supported Message Types

| Type | Trigger | Description |
| --- | --- | --- |
| `HEARTBEAT` | `0xCC`/`0xCB` | Periodic heartbeat with module list |
| `RFID_SNAPSHOT` | `0xBB` or `/LabelState` | Full RFID state snapshot |
| `TEMP_HUM` | `/TemHum` | Temperature & humidity readings |
| `NOISE_LEVEL` | `/Noise` | Noise sensor readings |
| `DOOR_STATE` | `0xBA` | Door open/close state |
| `DEVICE_INFO` | `0xEF01` | Device metadata (IP, MAC, etc.) |
| `MODULE_INFO` | `0xEF02` | Module firmware versions |
| `QRY_CLR_RESP` | `0xAA` + `0xE4` | Query color response |
| `SET_CLR_RESP` | `0xAA` + `0xE1` | Set color response |
| `CLN_ALM_RESP` | `0xAA` + `0xE2` | Clear alarm response |

---

## 7. Related Documentation

| Document | Content |
| --- | --- |
| [message_map_spec.md](message_map_spec.md) | RAW → SIF → SUO → DB transformations |
| [middleware_spec.md](middleware_spec.md) | System architecture, SIF/SUO contracts |
| [normalizer_spec.md](normalizer_spec.md) | SUO normalization, StateCache |

---

**Last Updated:** 2026-02-12

**Maintainer:** IoT Middleware Pro Team