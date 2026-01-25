# UnifyNormalizer Implementation Guide v1.7

**File Name:** `UnifyNormalizer_Spec.md`

**Date:** 1/22/2026
**Type:** Component Specification
**Scope:** Normalization Logic, State Caching, and SUO Generation.
**Status:** Final

---

## 1. Component Overview

- **Class Name:** `UnifyNormalizer`
- **Input:** `SIF Object` (Standard Intermediate Format from Parsers)
- **Outputs:**
    1. `SUO` (Standard Unified Object) → Emitted to `EventBus` (`data.normalized`).
    2. `UOS` (Unified Object Structure) → Written to `StateCache` (Memory/Redis).
    3. `Command Request` → Emitted to `EventBus` (`command.request`).
- **Dependencies:** `CacheService`, `EventBus`.

---

## 2. Core Logic Flow

The Normalizer operates in a specific sequence for every incoming SIF:

1. **Flattening:**
    - **Telemetry (Temp/Noise/RFID):** Split into separate SUOs (1 per module) to allow specific database pivoting.
    - **System (HEARTBEAT / DEVICE_METADATA):** Process as a single Device-Level unit. Emit ONE SUO containing the full array.
2. **Context Loading:** Fetch current state from `CacheService`.
    - Telemetry Key: `device:{id}:module:{index}`
    - Metadata Key: `device:{id}:info`
3. **Logic Branching:**
    - **Stateless Messages** (`TEMP_HUM`, `NOISE`, `DOOR`): Map directly SIF → SUO. Update Cache.
    - **Stateful Snapshots** (`RFID_SNAPSHOT`): **Diff** against Cache → Generate `RFID_EVENT` SUOs. Update Cache.
    - **Stateful Events** (`RFID_EVENT` - V6800): **Trigger Sync** (Emit `command.request`).
    - **Metadata** (`DEVICE_INFO`, `MODULE_INFO`, `DEV_MOD_INFO`, `HEARTBEAT` , `UTOTAL_CHANGED`): Compare vs Cache → Emit `META_CHANGED_EVENT` (if diffs found) → Merge into Cache → Emit `DEVICE_METADATA` SUO
4. **Standardization:** Map specific input indices (`thIndex`,`nsIndex`, `uIndex`) to generic `sensorIndex`.
5. **Output:** Emit SUO(s) and persist UOS to Cache.

---

## 3. Special Handling Algorithms

### 3.1 Global RFID Diffing Logic (Snapshot → Event)

*Goal: Detect changes (Attach/Detach) by comparing the incoming Snapshot against the cached State. Applies to **ALL** `RFID_SNAPSHOT` messages.*

**Logic Steps:**

1. **Input:** SIF with `messageType: "RFID_SNAPSHOT"`.
2. **Normalize Input:** Map SIF `uIndex` → `sensorIndex` temporarily for comparison.
3. **Load Context:** Get `previous_snapshot` array from Cache (`:module:{index}`). *If cache is empty, treat previous as `[]`.*
4. **Construct Maps (for O(n) comparison):**
    - `PrevMap`: Map of `sensorIndex` → `tagId` from Cache.
    - `CurrMap`: Map of `sensorIndex` → `tagId` from Input.
5. **Detect DETACHED:**
    - Iterate `PrevMap`. If an index exists in `Prev` but **NOT** in `Curr` (or `tagId` changed) → Emit `RFID_EVENT` SUO (`action: "DETACHED"`, old `tagId`).
6. **Detect ATTACHED:**
    - Iterate `CurrMap`. If an index exists in `Curr` but **NOT** in `Prev` (or `tagId` changed) → Emit `RFID_EVENT` SUO (`action: "ATTACHED"`, new `tagId`).
7. **Emit Snapshot:** Emit the full `RFID_SNAPSHOT` SUO (for `iot_rfid_snapshot` table).
8. **Update Cache:** Overwrite `rfid_snapshot` in Cache with the new list.

### 3.2 V6800 RFID Sync (Event → **Trigger**)

*Goal: Treat the incoming Event purely as a signal to fetch the latest truth from the device.*

1. **Input:** SIF `RFID_EVENT`.
2. **Action:** Emit `command.request` via `EventBus`.
    - Payload: `QRY_RFID_SNAPSHOT`.
3. **Cache:** **NO ACTION**. Do not update the cache. Do not emit an SUO.
4. **Outcome:** The device will respond with `RFID_SNAPSHOT`. The **Global Diffing Logic (Section 3.1)** will handle that snapshot, detect the differences against the Cache, and generate the necessary `RFID_EVENT` SUO for the database automatically.

### 3.3 Metadata Merging (Fragmented Data)

*Goal: Combine partial data from V5008 into a complete Device Record.*

**Logic:**

1. **Input:** SIF (`HEARTBEAT` | `DEVICE_INFO` | `MODULE_INFO` | `DEV_MOD_INFO` | `UTOTAL_CHANGED`).
2. **Load Cache:** `device:{id}:info`.
3. Before merging, compare the incoming SIF data against the current Cache.
    - Check for changes in IP, Firmware, and Module List (Add/Remove/Replace).
    - If differences are found, emit a META_CHANGED_EVENT SUO containing a list of description strings.
4. **Merge:** Update only the specific fields provided by the SIF (See Section 6).
5. **Reconstruct:** When emitting SUO, fill missing fields (like `moduleId` or `fwVer`) by reading the **updated Cache**, not just the incoming SIF.

### 3.4 **Metadata Change Detection Logic**

*Goal: Detect configuration changes by comparing incoming SIF data against the existing Cache **before** merging.*

**Comparison Steps:**

1. **Device Level Checks:**
    - If `SIF.ip` exists AND `SIF.ip != Cache.ip`: Add event "`Device IP changed from {Cache.ip} to {SIF.ip}`".
    - If `SIF.fwVer` exists AND `SIF.fwVer != Cache.fwVer`: Add event "`Device Firmware changed from {Cache.fwVer} to {SIF.fwVer}`".
2. **Module Level Checks:**
    - *Preparation:* Create a Map of the Cache's `activeModules` using `moduleIndex` as the key.
    - *Iteration:* Loop through modules in the SIF data array:
        - **New Module:** If `moduleIndex` not in Cache Map  Add event "`Module {id} added at Index {index}`".
        - **Existing Module:** If found, compare fields:
            - `moduleId`: If different  "`Module {id} replaced with {new_id} at Index {index}`".
            - `fwVer`: If different  "`Module {id} Firmware changed from {old} to {new}`".
            - `uTotal`: If different  "`Module {id} U-Total changed from {old} to {new}`".
3. **Output:**
    - If any events were generated, emit a **`META_CHANGED_EVENT` SUO**.
    - *Then* proceed to merge data into the Cache.

---

## 4. Message Mapping: SIF → SUO

**Common Rule:** 

1. **Array Payload:** Every SUO payload MUST be an **Array** [...].
2. **Identity Block (Root):** Every SUO root MUST contain: `messageType`, `messageId`, `deviceId`, `deviceType`.
3. **Topology Context:**
    - **Sensor Messages** (`TEMP_HUM`, `NOISE_LEVEL`, `RFID_SNAPSHOT`, `RFID_EVENT`, `DOOR_STATE`):
        - MUST include `moduleIndex` and `moduleId` at the **SUO Root**.
    - **Device Messages** (`HEARTBEAT`, `DEVICE_METADATA`):
        - MUST **NOT** put moduleIndex at the root (set to 0 or null).
        - MUST include `moduleIndex` and `moduleId` inside each item of the **Payload Array**.

### 4.1 `HEARTBEAT`

- **V5008 Logic:** Filter out invalid slots where `moduleId == 0`.
- **Refresh Logic:**
    - Iterate through modules present in the SIF.
    - Update Cache Key :`module:{index}`  Set `isOnline`: true and update `lastSeen_hb`.
    - *Note:* Do not set missing modules to false here. The **Cache Watchdog** handles timeouts.
- **Cache Action:** Update Metadata Cache (`activeModules` list).
- **SUO:**
    
    ```json
    {
      "messageType": "HEARTBEAT",
      "messageId": "755052881",
      "deviceId": "2437871205",
      "deviceType": "V5008",
      "payload": [ { "moduleIndex": 1, "moduleId": "3963041727", "uTotal": 6 } ]
    }
    
    ```
    

### 4.2 `RFID_SNAPSHOT`

- **Logic:** Map `uIndex` → `sensorIndex`.
- **SUO:**
    
    ```json
    {
      "messageType": "RFID_SNAPSHOT",
      "messageId": "755052881",
      "deviceId": "2437871205",
      "deviceType": "V5008",
      "moduleIndex": 1,
      "moduleId": "3963041727",
      "payload": [ { "sensorIndex": 10, "isAlarm": false, "tagId": "A1" } ]
    }
    
    ```
    

### 4.3 `RFID_EVENT`

- **Logic:** Iterate through the inner `data` array of the SIF module item. Map `uIndex` → `sensorIndex`.
- **SUO:**
    
    ```json
    {
      "messageType": "RFID_EVENT",
      "messageId": "755052881",
      "deviceId": "2437871205",
      "deviceType": "V5008",
      "moduleIndex": 1,
      "moduleId": "3963041727",
      "payload": [
        { "sensorIndex": 11, "tagId": "A1", "action": "DETACHED", "isAlarm": false }
      ]
    }
    
    ```
    

### 4.4 `TEMP_HUM` / `NOISE_LEVEL`

- **Logic:** Map `thIndex`/`nsIndex` → `sensorIndex`.
- **SUO:**
    
    ```json
    {
      "messageType": "TEMP_HUM", // or NOISE_LEVEL
      "messageId": "755052881",
      "deviceId": "2437871205",
      "deviceType": "V5008",
      "moduleIndex": 1,
      "moduleId": "3963041727",
      "payload": [ { "sensorIndex": 10, "temp": 24.5, "hum": 50.1 } ]
    }
    
    ```
    

### 4.5 `DOOR_STATE`

- **Logic:** Move the door state fields (doorState, door1State, door2State) from the SIF **Root** into the first object of the **payload array**
- **SUO:**
    
    ```json
    {
      "messageType": "DOOR_STATE",
      "messageId": "755052881",
      "deviceId": "2437871205",
      "deviceType": "V5008",
      "moduleIndex": 1,
      "moduleId": "3963041727",
      "payload": [{
          "doorState": 1,   // Single door
          "door1State": null,
          "door2State": null
      }]
    }
    
    ```
    

### 4.6 `DEVICE_METADATA`

- **Trigger:** DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO, UTOTAL_CHANGED.
- **Logic:** Fields are merged from Cache if missing in SIF.
- **SUO:**
    
    ```json
    {
      "messageType": "DEVICE_METADATA",
      "messageId": "755052881",
      "deviceId": "...",
      "deviceType": "...",
      
      // Common
      "ip": "192.168.0.100",
      "mac": "AA:BB:CC...",
      
      // V5008 Specific (Send null if V6800)
      "fwVer": "2.0.1", 
      "mask": "255.255.255.0",
      "gwIp": "192.168.0.1",
    
      "payload": [ { "moduleIndex": 1, "fwVer": "1.0", "moduleId": "...", "uTotal":6} ]
    }
    ```
    

### 4.7 Command Responses

- **Types:** `QRY_CLR_RESP`, `SET_CLR_RESP`, `CLN_ALM_RESP`.
- **Logic:** Wrap result in payload array.
- **SUO:**
    
    ```json
    {
      "messageType": "QRY_CLR_RESP", // or SET_CLR_RESP, CLN_ALM_RESP
      "messageId": "755052881",  
      "deviceId": "2437871205",
      "deviceType": "V5008",
      "payload": [{
          "moduleIndex": 1,
          "moduleId": "...", // Null for V5008, String for V6800
          "result": "Success", // Null for V6800 QRY_CLR_RESP
          "originalReq": "E401", // Null for V6800
          "colorMap": [0, 0, 0, 13, 13, 8] // QRY Only
      }]
    }
    ```
    

### **4.8 META_CHANGED_EVENT**

- **Trigger**: Detected difference between SIF and Cache during Metadata Merge

```json
{
  "messageType": "META_CHANGED_EVENT",
  "messageId": "755052881",  
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "moduleIndex": 0, // 0 for Device-level events
  "moduleId": "0",
  
  // Payload is an array of change descriptions
  "payload": [
    { "description": "Device IP changed from 192.168.0.2 to 192.168.0.5" },
    { "description": "Module 1 U-quantity changed from 42 to 54" }
  ]
}
```

---

## 5. Cache Data Structure (UOS)

### Key 1: `device:{id}:module:{index}` (Telemetry)

*Stores high-frequency sensor state.*

```json
{
  "deviceId": "...",
  "deviceType":"...",
  "moduleIndex": 1,
  "moduleId": "...",

  "isOnline": true,
  "lastSeen_hb": "ISO_DATE",

  "temp_hum": [ { "sensorIndex": 10, "temp": 24.5, "hum": 50.1 } ],
  "lastSeen_th": "ISO_DATE",

  "noise_level": [ { "sensorIndex": 16, "noise": 45.2 } ],
  "lastSeen_ns": "ISO_DATE",

  "rfid_snapshot": [ { "sensorIndex": 10, "tagId": "HEX", "isAlarm": false } ],
  "lastSeen_rfid": "ISO_DATE",

  "doorState": 1,
  "door1State": null,
  "door2State": null,
  "lastSeen_door": "ISO_DATE"
}

```

### Key 2: `device:{id}:info` (Metadata)

*Stores low-frequency metadata.*

```json
{
  "deviceId": "...",
  "deviceType": "V5008",
  "fwVer": "1.0",
  "ip": "...",
  "mask": "...",
  "gwIp": "...",
  "mac": "...",
  "lastSeen_info": "ISO_DATE",

  // Registry of modules
  "activeModules": [
    { "moduleIndex": 1, "moduleId": "...", "fwVer": "...", "uTotal": 12 }
  ]
}

```

---

## 6. Cache Update Strategy

| Incoming SUO Type | **Target Cache Key** | Fields to Update (Set Value) | Timestamp Field to Update |
| --- | --- | --- | --- |
| `HEARTBEAT` | `:module:{index}` | `isOnline` | `lastSeen_hb` |
| `HEARTBEAT` | `:info` | **MERGE:** Update `activeModules` (`moduleId`, `uTotal`). | `lastSeen_info` |
| `TEMP_HUM` | `:module:{index}` | `temp_hum` | `lastSeen_th` |
| `NOISE_LEVEL` | `:module:{index}` | `noise_level` | `lastSeen_ns` |
| `DOOR_STATE` | `:module:{index}` | `door*State` | `lastSeen_door` |
| `RFID_SNAPSHOT` | `:module:{index}` | **REPLACE:** `rfid_snapshot` | `lastSeen_rfid` |
| `RFID_EVENT` | **NONE** | **NO ACTION** (Trigger Sync Only) | N/A |
| `DEVICE_METADATA` | `:info` | **MERGE/REPLACE:** `ip`, `fwVer`, `activeModules` | `lastSeen_info` |
| `UTOTAL_CHANGED` | `:info` | **MERGE:** Update `activeModules (uTotal, fwVer, moduleId, moduleIndex)` | `lastSeen_info` |