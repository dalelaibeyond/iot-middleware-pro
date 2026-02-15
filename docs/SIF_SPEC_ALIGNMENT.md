# SIF (Standard Intermediate Format) Specification Alignment

## Overview

This document defines the unified SIF structure for IoT Middleware Pro v2.0, aligning V5008 (binary) and V6800 (JSON) protocols.

**Design Principle:**
- **Parsers** handle device-specific protocol details
- **Normalizer** handles device-specific structural differences via unified utilities
- **SIF** serves as the common intermediate format

---

## Unified Module Extraction

The `UnifyNormalizer.extractModules()` utility handles structural differences:

```javascript
extractModules(sif, readingKey = 'data') → [{moduleIndex, moduleId, readings}]
```

**Supported Formats:**

### Format 1: V5008 Top-Level (Single Module)
```javascript
// Parser Output
{
  deviceId: "...",
  deviceType: "V5008",
  moduleIndex: 1,        // ← Top level
  moduleId: "12345",     // ← Top level
  data: [readings]       // ← Sensor readings
}

// extractModules() Output
[{
  moduleIndex: 1,
  moduleId: "12345",
  readings: [readings]
}]
```

**Used by:** V5008 TEMP_HUM, NOISE_LEVEL, RFID_SNAPSHOT

### Format 2: V6800 Nested (Multiple Modules Possible)
```javascript
// Parser Output
{
  deviceId: "...",
  deviceType: "V6800",
  data: [{              // ← Array of modules
    moduleIndex: 1,     // ← Module level
    moduleId: "12345",  // ← Module level
    data: [readings]    // ← Nested readings
  }]
}

// extractModules() Output
[{
  moduleIndex: 1,
  moduleId: "12345",
  readings: [readings]
}]
```

**Used by:** V6800 TEMP_HUM, RFID_SNAPSHOT, RFID_EVENT, DEV_MOD_INFO, UTOTAL_CHANGED

### Format 3: Object Data (Legacy Support)
```javascript
// Parser Output (legacy format, now unified to array)
{
  deviceId: "...",
  deviceType: "V5008",
  data: {               // ← Object (not array)
    moduleIndex: 1,
    moduleId: "12345",
    doorState: 0
  }
}

// extractModules() Output
[{
  moduleIndex: 1,
  moduleId: "12345",
  readings: [{doorState: 0}]
}]
```

**Note:** QRY_DOOR_STATE_RESP was previously using this format but has been unified to use Format 1 (array) like all other messages.

---

## Message Type Specifications

### 1. HEARTBEAT

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | `sif.data = [{moduleIndex, moduleId, uTotal}]` | `sif.data = [{moduleIndex, moduleId, uTotal}]` |
| **Module Location** | Inside `data` array items | Inside `data` array items |
| **Normalizer** | `handleHeartbeat()` iterates `sif.data` | Same handling |
| **Cache Update** | `updateHeartbeat()` per module | Same handling |

**SIF Structure (Both):**
```javascript
{
  deviceId: string,
  deviceType: "V5008" | "V6800",
  messageType: "HEARTBEAT",
  messageId: string,
  data: [
    { moduleIndex: number, moduleId: string, uTotal: number }
  ]
}
```

---

### 2. TEMP_HUM

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | `{moduleIndex, moduleId, data: [readings]}` | `{data: [{moduleIndex, moduleId, data: [readings]}]}` |
| **Module Location** | Top level | Inside `data` array items |
| **Normalizer** | `extractModules()` → unified processing | `extractModules()` → unified processing |
| **Cache Field** | `tempHum` | `tempHum` |

**Unified Processing:**
```javascript
const modules = this.extractModules(sif, 'data');
modules.forEach(({moduleIndex, moduleId, readings}) => {
  // readings = [{thIndex, temp, hum}]
  // Filter null/0 values, emit SUO, update cache
});
```

---

### 3. NOISE_LEVEL

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | `{moduleIndex, moduleId, data: [readings]}` | N/A (not supported) |
| **Module Location** | Top level | N/A |
| **Normalizer** | `extractModules()` → unified processing | N/A |
| **Cache Field** | `noiseLevel` | N/A |

**Note:** V6800 does not support NOISE_LEVEL message type.

---

### 4. RFID_SNAPSHOT

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | `{moduleIndex, moduleId, data: [tags]}` | `{data: [{moduleIndex, moduleId, data: [tags]}]}` |
| **Module Location** | Top level | Inside `data` array items |
| **Normalizer** | `extractModules()` + diff logic | `extractModules()` + diff logic |
| **Cache Field** | `rfidSnapshot` | `rfidSnapshot` |

**Special Logic:**
- Diff against previous snapshot to generate RFID_EVENT
- Emit both RFID_SNAPSHOT (storage) and RFID_EVENT (changes)

---

### 5. RFID_EVENT

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | N/A (derived from diff) | `{data: [{moduleIndex, moduleId, data: [events]}]}` |
| **Module Location** | N/A | Inside `data` array items |
| **Normalizer** | Generated from diff | `extractModules()` or direct processing |
| **Cache Update** | None (triggers QRY_RFID_SNAPSHOT for V6800) | None (triggers QRY_RFID_SNAPSHOT) |

**V6800 Special Behavior:**
- Does NOT update cache
- Does NOT emit SUO to storage
- Triggers `QRY_RFID_SNAPSHOT` command to sync state

---

### 6. DOOR_STATE

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | `{data: [{moduleIndex, moduleId, doorState}]}` | `{data: [{moduleIndex, moduleId, doorState}]}` |
| **Module Location** | Inside `data` array items | Inside `data` array items |
| **Normalizer** | `extractModules()` → unified | `extractModules()` → unified |
| **Cache Fields** | `doorState`, `door1State`, `door2State` | Same |

**Unified SIF (Both V5008 and V6800):**
```javascript
{
  deviceId: string,
  deviceType: "V5008" | "V6800",
  messageType: "DOOR_STATE",
  data: [{
    moduleIndex: number,
    moduleId: string,
    doorState?: number,   // Single door
    door1State?: number,  // Dual door
    door2State?: number   // Dual door
  }]
}
```

---

### 7. QRY_DOOR_STATE_RESP

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | `{data: [{moduleIndex, moduleId, doorState}]}` | `{data: [{moduleIndex, moduleId, doorState}]}` |
| **Module Location** | Inside `data` array items | Inside `data` array items |
| **Normalizer** | `handleDoorState()` (delegated) | `handleDoorState()` (delegated) |
| **Validation** | moduleIndex 1-5, moduleId !== "0" | Same |

**Note:** Now uses same format as DOOR_STATE. `handleDoorStateQuery()` simply delegates to `handleDoorState()`.

---

### 8. DEV_MOD_INFO

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | N/A (use DEVICE_INFO + MODULE_INFO) | `{data: [{moduleIndex, moduleId, uTotal, fwVer}]}` |
| **Module Location** | N/A | Inside `data` array items |
| **Normalizer** | N/A | `handleMetadata()` merges to cache |
| **Cache Target** | N/A | Metadata (not telemetry) |

**SIF V6800:**
```javascript
{
  deviceId: string,
  deviceType: "V6800",
  messageType: "DEV_MOD_INFO",
  ip?: string,
  mac?: string,
  data: [{
    moduleIndex: number,
    moduleId: string,
    uTotal: number,
    fwVer: string
  }]
}
```

---

### 9. UTOTAL_CHANGED

| Aspect | V5008 | V6800 |
|--------|-------|-------|
| **Parser Output** | N/A | `{data: [{moduleIndex, moduleId, uTotal, fwVer}]}` |
| **Module Location** | N/A | Inside `data` array items |
| **Normalizer** | N/A | `handleUtotalChanged()` |
| **Cache Target** | N/A | Metadata + Telemetry |

---

## Normalizer Handler Patterns

### Pattern A: Unified with extractModules()
Used for: TEMP_HUM, NOISE_LEVEL

```javascript
handleSensorMessage(sif) {
  const { deviceId, deviceType, messageId } = sif;
  const modules = this.extractModules(sif, 'data');
  
  for (const { moduleIndex, moduleId, readings } of modules) {
    const normalizedData = readings
      .map(item => ({ sensorIndex: item.xIndex, value: item.value }))
      .filter(item => item.value !== null && item.value !== 0);
    
    if (normalizedData.length === 0) continue;
    
    const suo = this.createSuo({
      deviceId, deviceType, messageType: "XXX",
      messageId, moduleIndex, moduleId,
      payload: normalizedData
    });
    eventBus.emitDataNormalized(suo);
    this.stateCache.updateTelemetryField(...);
  }
}
```

### Pattern B: Direct Field Access (Legacy)
Previously used for: DOOR_STATE (V5008), QRY_DOOR_STATE_RESP (V5008)

**Status:** Now unified to Pattern A. Kept for documentation purposes only.

```javascript
// Legacy approach - no longer used
handleDoorStateV5008(sif) {
  const { deviceId, deviceType, messageId, 
          moduleIndex, moduleId, doorState, door1State, door2State } = sif;
  // Validate and process directly
}
```

### Pattern C: Array Iteration (HEARTBEAT)
```javascript
handleHeartbeat(sif) {
  const { deviceId, deviceType, data } = sif;
  for (const module of data) {
    this.stateCache.updateHeartbeat(
      deviceId, deviceType,
      module.moduleIndex, module.moduleId, module.uTotal
    );
  }
}
```

---

## Cache Structure

### Telemetry Cache Key
```
device:{deviceId}:module:{moduleIndex}
```

### Telemetry Cache Value
```javascript
{
  deviceId: string,
  deviceType: "V5008" | "V6800",
  moduleIndex: number,
  moduleId: string,
  isOnline: boolean,
  lastSeenHb: ISOString,
  tempHum: [{sensorIndex, temp, hum}],
  noiseLevel: [{sensorIndex, noise}],
  rfidSnapshot: [{sensorIndex, tagId, isAlarm}],
  doorState: number | null,
  door1State: number | null,
  door2State: number | null,
  lastSeenDoor: ISOString
}
```

---

## API Endpoint Mapping

| Endpoint | Cache Source | Data Source |
|----------|--------------|-------------|
| `GET /api/meta/:deviceId` | `metadataCache` | `DEV_MOD_INFO`, `DEVICE_INFO`, `MODULE_INFO` |
| `GET /api/uos/:deviceId/:moduleIndex` | `telemetryCache` | Sensor messages (TEMP_HUM, NOISE_LEVEL, etc.) |
| `GET /api/devices/:deviceId/modules` | `telemetryCache` | All modules for device |

---

## Summary Table

| Message Type | V5008 Structure | V6800 Structure | Normalizer Pattern |
|--------------|-----------------|-----------------|-------------------|
| HEARTBEAT | `data: [{moduleIndex, moduleId, uTotal}]` | `data: [{moduleIndex, moduleId, uTotal}]` | Pattern C |
| TEMP_HUM | Top-level + `data: [readings]` | Nested `data: [{moduleIndex, moduleId, data: [readings]}]` | ✅ **Unified** - Pattern A (extractModules) |
| NOISE_LEVEL | Top-level + `data: [readings]` | N/A | ✅ **Unified** - Pattern A (extractModules) |
| RFID_SNAPSHOT | Top-level + `data: [tags]` | Nested `data: [{moduleIndex, moduleId, data: [tags]}]` | ✅ **Unified** - Pattern A + diff logic |
| RFID_EVENT | N/A (derived) | Nested `data: [{moduleIndex, moduleId, data: [events]}]` | Special (no cache update) |
| DOOR_STATE | `{data: [{moduleIndex, moduleId, doorState}]}` | `{data: [{moduleIndex, moduleId, doorState}]}` | ✅ **Unified** - Pattern A (extractModules) |
| QRY_DOOR_STATE_RESP | `{data: [{moduleIndex, moduleId, doorState}]}` | `{data: [{moduleIndex, moduleId, doorState}]}` | ✅ **Unified** - Pattern A (delegates to DOOR_STATE) |
| DEV_MOD_INFO | N/A | `data: [{moduleIndex, moduleId, uTotal, fwVer}]` | Metadata merge |
| UTOTAL_CHANGED | N/A | `data: [{moduleIndex, moduleId, uTotal, fwVer}]` | Metadata + telemetry update |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-02-15 | Unified V5008/V6800 handling with `extractModules()` utility for TEMP_HUM, NOISE_LEVEL, RFID_SNAPSHOT, DOOR_STATE, QRY_DOOR_STATE_RESP |
| 1.0 | 2026-02-14 | Initial separate implementations |
