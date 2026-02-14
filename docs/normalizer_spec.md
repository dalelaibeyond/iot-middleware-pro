# normalizer_spec

# Normalizer Specification - As-Built

> **Component:** UnifyNormalizer, SmartHeartbeat, CacheWatchdog
> 
> 
> **Version:** 2.1.2
> 
> **Last Updated:** 2026-02-14 (v2.2.0 - Separated SmartHeartbeat from Self-Healing, added configurable enable/disable)
> 
> **Status:** As-Built (Verified against source code)
> 

---

## 1. Component Overview

The Normalizer module consists of three sub-components:

| Component | File | Purpose |
| --- | --- | --- |
| **UnifyNormalizer** | `UnifyNormalizer.js` | SIF → SUO conversion, state management |
| **SmartHeartbeat** | `SmartHeartbeat.js` | Automated data repair & warmup |
| **CacheWatchdog** | `CacheWatchdog.js` | Offline detection service |

---

## 2. UnifyNormalizer

### 2.1 Core Logic Flow

```
SIF Input → Message Type Router → Handler → SUO Output
                ↓
         StateCache (read/write)
                ↓
         Command Request (optional)
```

### 2.2 Message Type Handlers

| Message Type | Handler | Cache Action | Emits Command |
| --- | --- | --- | --- |
| `HEARTBEAT` | `handleHeartbeat()` | Update metadata | Yes (if info missing) |
| `RFID_SNAPSHOT` | `handleRfidSnapshot()` | Replace rfidSnapshot | No |
| `RFID_EVENT` | `handleRfidEvent()` | V5008: None, V6800: Trigger | V6800 only |
| `TEMP_HUM` | `handleTempHum()` | Update tempHum | No |
| `NOISE_LEVEL` | `handleNoiseLevel()` | Update noiseLevel | No |
| `DOOR_STATE` | `handleDoorState()` | Update door*State | No |
| `DEVICE_INFO` | `handleMetadata()` | Merge into metadata | No |
| `MODULE_INFO` | `handleMetadata()` | Merge fwVer | No |
| `DEV_MOD_INFO` | `handleMetadata()` | Replace activeModules | No |
| `UTOTAL_CHANGED` | `handleUtotalChanged()` | Update uTotal | No |
| Command Responses | `handleCommandResponses()` | No cache update | No |

### 2.3 RFID Diffing Logic (Snapshot → Event)

**Applies to:** All `RFID_SNAPSHOT` messages

**Algorithm:**
1. Load `previous_snapshot` from Cache
2. Normalize current: Map `uIndex` → `sensorIndex`
3. Construct maps: `PrevMap(sensorIndex → tagId)` and `CurrMap(sensorIndex → tagId)`
4. Detect DETACHED: Index in Prev but not in Curr
5. Detect ATTACHED: Index in Curr but not in Prev
6. Emit `RFID_EVENT` SUO for each difference
7. Update Cache with new snapshot
8. Emit `RFID_SNAPSHOT` SUO for database

### 2.4 V6800 RFID Sync (Event → Trigger)

**Applies to:** `RFID_EVENT` with `deviceType === "V6800"`

**Behavior:**
1. Emit `command.request` with `QRY_RFID_SNAPSHOT`
2. **DO NOT** update Cache
3. **DO NOT** emit SUO
4. Wait for `RFID_SNAPSHOT` response → diffing logic handles the rest

### 2.5 Metadata Merging & Repair

**Trigger Messages:** `HEARTBEAT`, `DEVICE_INFO`, `MODULE_INFO`, `DEV_MOD_INFO`, `UTOTAL_CHANGED`

**Case A: HEARTBEAT (The “Tick”)**

1. **Reconcile:** Update Cache `activeModules` with moduleId/uTotal from SIF
2. **Self-Healing Check (Always Active):**
    - **Purpose:** Ensure device can be identified and managed
    - Device Level: If Cache `ip` OR `mac` missing → Emit `QRY_DEV_MOD_INFO` (V6800) or `QRY_DEVICE_INFO` (V5008)
    - Module Level (V5008): If any module missing `fwVer` → Emit `QRY_MODULE_INFO` (gets ALL modules)
3. **SmartHeartbeat Check (Configurable):**
    - **Purpose:** Warm up telemetry cache (optional optimization)
    - Only runs if `config.modules.normalizer.smartHeartbeat.enabled !== false`
    - Checks per module: `tempHum`, `rfidSnapshot`, `doorState`
    - Emits: `QRY_TEMP_HUM`, `QRY_RFID_SNAPSHOT`, `QRY_DOOR_STATE` as needed
4. **Emit:** `HEARTBEAT` SUO + `DEVICE_METADATA` SUO

**Case B: INFO Messages**

1. **Change Detection:** Compare SIF vs Cache before merging
    - IP changed: `"Device IP changed from {old} to {new}"`
    - Firmware changed: `"Device Firmware changed from {old} to {new}"`
    - New module: `"Module {id} added at Index {index}"`
    - Module replaced: `"Module {id} replaced with {new_id} at Index {index}"`
    - U-Total changed: `"Module {id} U-Total changed from {old} to {new}"`
2. **Emit:** `META_CHANGED_EVENT` SUO if changes detected
3. **Merge:** Update Cache with SIF fields
4. **Emit:** `DEVICE_METADATA` SUO from merged Cache

### 2.6 SUO Output Format

**Identity Block (all SUOs):**

```jsx
{
  deviceId: "string",
  deviceType: "V5008|V6800",
  messageType: "string",
  messageId: "string",
  moduleIndex: number,    // 0 for device-level messages
  moduleId: "string",
  payload: []             // ALWAYS an array
}
```

**Payload Examples:**

| Message Type | Payload Structure |
| --- | --- |
| `HEARTBEAT` | `[{moduleIndex, moduleId, uTotal}]` |
| `RFID_SNAPSHOT` | `[{sensorIndex, tagId, isAlarm}]` |
| `RFID_EVENT` | `[{sensorIndex, tagId, action, isAlarm}]` |
| `TEMP_HUM` | `[{sensorIndex, temp, hum}]` |
| `NOISE_LEVEL` | `[{sensorIndex, noise}]` |
| `DOOR_STATE` | `[{doorState, door1State, door2State}]` |
| `DEVICE_METADATA` | `[{moduleIndex, moduleId, fwVer, uTotal}]` |
| `META_CHANGED_EVENT` | `[{description: "..."}]` |

---

## 3. SmartHeartbeat

### 3.1 Purpose

Transforms `HEARTBEAT` from a simple status update into a **Telemetry Cache Warmup** service. Ensures telemetry data (temp, RFID, door) is fresh without requiring manual queries.

**Important:** SmartHeartbeat is **optional** and **does not** handle device metadata (ip, mac, fwVer). That is handled by UnifyNormalizer's **Self-Healing** (always active).

### 3.2 Separation of Concerns

| Feature | Self-Healing (Always On) | SmartHeartbeat (Optional) |
| --- | --- | --- |
| **Purpose** | Device identification & management | Telemetry cache warmup |
| **Checks** | `ip`, `mac`, `fwVer` (V5008 only) | `tempHum`, `RFID`, `doorState` (telemetry) |
| **Commands** | `QRY_DEVICE_INFO`, `QRY_MODULE_INFO` | `QRY_TEMP_HUM`, `QRY_RFID_SNAPSHOT`, `QRY_DOOR_STATE` |
| **Config** | Not configurable | `enabled`, `staggerDelay`, `stalenessThresholds` |

### 3.3 Check Logic (Per Module)

| Data Type | Cache Check | Action if Missing/Stale |
| --- | --- | --- |
| **Env Sensors** | Is `tempHum` empty OR `lastSeenTh` > 5 mins? | Emit `QRY_TEMP_HUM` |
| **RFID Tags** | Is `rfidSnapshot` empty OR `lastSeenRfid` > 60 mins? | Emit `QRY_RFID_SNAPSHOT` |
| **Door State** | Is `doorState` null? | Emit `QRY_DOOR_STATE` |

### 3.4 Stagger Pattern

To prevent flooding the RS485 bus, commands are emitted with configurable delays:

```jsx
// Default: 500ms delay between each command (configurable via staggerDelay)
items.forEach((item, index) => {
  setTimeout(() => {
    eventBus.emitCommandRequest(command);
  }, index * config.staggerDelay);
});
```

### 3.5 Configuration

Location: `config.default.json` → `modules.normalizer.smartHeartbeat`

```json
{
  "smartHeartbeat": {
    "enabled": true,           // Set to false to disable
    "staggerDelay": 500,       // ms between commands
    "stalenessThresholds": {
      "tempHum": 5,            // minutes before temp/hum considered stale
      "rfid": 60               // minutes before RFID considered stale
    }
  }
}
```

### 3.6 Implementation

**File:** `src/modules/normalizer/SmartHeartbeat.js`

**Key Methods:**
- `checkAndRepair(deviceId, deviceType, modules, stateCache)` - Entry point (returns early if disabled)
- `_checkModule(deviceId, deviceType, moduleIndex, cacheSnapshot)` - Per-module telemetry checks
- `_needsRefresh(dataArray, lastSeen, thresholdMinutes)` - Staleness check
- `_emitStaggered(items)` - Staggered command emission with debug logging

---

## 4. CacheWatchdog

### 4.1 Purpose

Detects silent failures (power loss, network disconnect) where devices stop sending data.

### 4.2 Configuration

```json
{
  "modules": {
    "normalizer": {
      "heartbeatTimeout": 120000,  // 2 minutes
      "checkInterval": 30000       // 30 seconds
    }
  }
}
```

### 4.3 Logic

1. **Timer:** Runs every `checkInterval` (default 30s)
2. **Scan:** Iterate all Module keys in StateCache
3. **Check:** Calculate `gap = Now - module.lastSeenHb`
4. **Expire:** If `gap > heartbeatTimeout`:
    - Set `module.isOnline = false` in Cache
    - (Optional) Emit `DEVICE_STATUS_CHANGE` event

### 4.4 Implementation

**File:** `src/modules/normalizer/CacheWatchdog.js`

**Key Methods:**
- `start()` - Start periodic check timer
- `check()` - Perform cache scan
- `shouldExpire(lastSeen, heartbeatTimeout)` - Determine if module is offline

---

## 5. UOS (Unified Object State) Data Structure

UOS represents the **current state** of devices and modules stored in the StateCache. It is used by:
- **Normalizer**: Read/write during SUO processing
- **ApiServer**: Read-only for REST API responses
- **SmartHeartbeat**: Read for repair decisions

### 5.1 Module Telemetry Cache

**Cache Key:** `device:{deviceId}:module:{moduleIndex}`

**Purpose:** Per-module sensor and status data

```jsx
{
  deviceId: "string",
  deviceType: "V5008|V6800",
  moduleIndex: number,
  moduleId: "string",
  
  // Status
  isOnline: boolean,
  lastSeenHb: "ISO_DATE",
  uTotal: number|null,           // Total RFID slots (from HEARTBEAT)
  
  // Sensors (array of readings)
  tempHum: [{ sensorIndex, temp, hum }],
  lastSeenTh: "ISO_DATE",
  
  noiseLevel: [{ sensorIndex, noise }],
  lastSeenNs: "ISO_DATE",
  
  rfidSnapshot: [{ sensorIndex, tagId, isAlarm }],
  lastSeenRfid: "ISO_DATE",
  
  // Door state
  doorState: number|null,
  door1State: number|null,
  door2State: number|null,
  lastSeenDoor: "ISO_DATE"
}
```

**Note:** Fields are dynamically added as messages are processed. Initial state uses `null` or `[]` for arrays.

### 5.2 Device Metadata Cache

**Cache Key:** `device:{deviceId}:info`

**Purpose:** Device-level information (IP, MAC, firmware, module list)

```jsx
{
  deviceId: "string",
  deviceType: "V5008|V6800",
  fwVer: "string",
  ip: "string",
  mask: "string",
  gwIp: "string",
  mac: "string",
  lastSeenInfo: "ISO_DATE",

  activeModules: [
    { moduleIndex, moduleId, fwVer, uTotal }
  ]
}
```

---

## 6. Cache Update Strategy

| Incoming SUO Type | Target Cache Key | Fields Updated | Timestamp Field |
| --- | --- | --- | --- |
| `HEARTBEAT` | `:module:{index}` | `isOnline=true` | `lastSeenHb` |
| `HEARTBEAT` | `:info` | Reconcile `activeModules` | `lastSeenInfo` |
| `TEMP_HUM` | `:module:{index}` | `tempHum` | `lastSeenTh` |
| `NOISE_LEVEL` | `:module:{index}` | `noiseLevel` | `lastSeenNs` |
| `DOOR_STATE` | `:module:{index}` | `door*State` | `lastSeenDoor` |
| `RFID_SNAPSHOT` | `:module:{index}` | **REPLACE** `rfidSnapshot` | `lastSeenRfid` |
| `RFID_EVENT` | **NONE** | **NO ACTION** (Trigger Sync) | N/A |
| `DEVICE_METADATA` | `:info` | **MERGE** ip, fwVer, activeModules | `lastSeenInfo` |
| `UTOTAL_CHANGED` | `:info` | Update `uTotal` in activeModules | `lastSeenInfo` |

---

## 7. Error Handling

All normalizer errors are caught and emitted via EventBus:

```jsx
try {
  // Normalizer logic
} catch (error) {
  console.error(`UnifyNormalizer error:`, error.message);
  eventBus.emitError(error, "UnifyNormalizer");
}
```

**Never throw** on parse errors - return `null` and log via EventBus.