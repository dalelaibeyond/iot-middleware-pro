# Smart Heartbeat (Data Warmup) Specification

**File Name:** `Smart_Heartbeat_Spec.md`

**Date:** 2/11/2026
**Type:** Logic Specification
**Scope:** Automated Data Repair & Warmup Strategy via UnifyNormalizer
**Status:** Final for AI Coding

---

## 1. Objective

To ensure the **State Cache** (Digital Twin) is always complete ("Warm") without requiring the Dashboard to manually query the device. This logic transforms the `HEARTBEAT` message from a simple status update into a **Health & Consistency Check**.

## 2. Logic Trigger

- **Trigger Event:** Incoming `HEARTBEAT` SIF (Standard Intermediate Format).
- **Module Scope:** Iterate through every `moduleIndex` present in the Heartbeat payload.

## 3. The Check Logic (Per Module)

For each active module found in the Heartbeat, check the **StateCache** (`device:{id}:module:{index}`) for missing data.

| Data Type | Cache Check | Action if Missing/Empty |
| --- | --- | --- |
| **Metadata** (V5008) | Is `fwVer` (Module Level) missing? | Emit `command.request` → `QRY_MODULE_INFO` |
| **Metadata** (Device) | Is `ip` or `fwVer` (Device Level) missing? | Emit `command.request` → `QRY_DEV_MOD_INFO` (V6800) / `QRY_DEVICE_INFO` (V5008) |
| **Env Sensors** | Is `temp_hum` array empty OR `lastSeen_th` > 5 mins old? | Emit `command.request` → `QRY_TEMP_HUM` |
| **RFID Tags** | Is `rfid_snapshot` array empty OR `lastSeen_rfid` > 60 mins old? | Emit `command.request` → `QRY_RFID_SNAPSHOT` |
| **Door State** | Is `doorState` (or `door1State`) null? | Emit `command.request` → `QRY_DOOR_STATE` |

*Note: "Empty" means the array length is 0 or the key is undefined.*

## 4. Execution Strategy (Traffic Control)

To prevent flooding the RS485 bus with simultaneous queries when a Heartbeat arrives:

### 4.1 The "Stagger" Pattern

Do not emit all command requests instantly. Introduce a small delay between checks or emissions.

**Implementation Logic (Pseudocode):**

```jsx
// Inside UnifyNormalizer._processHeartbeat()

const missingItems = [];
if (needsTemp) missingItems.push('QRY_TEMP_HUM');
if (needsDoor) missingItems.push('QRY_DOOR_STATE');
// ...

// Emit with spacing (e.g., 500ms apart) to prevent bus congestion
missingItems.forEach((msgType, index) => {
    setTimeout(() => {
        this.eventBus.emit('command.request', {
            deviceId,
            moduleIndex,
            messageType: msgType
        });
    }, index * 500);
});
```

### 4.2 Behavior on "No Hardware"

If a sensor is physically missing (e.g., No Door Sensor):

1. Middleware sends QRY_DOOR_STATE.
2. Device replies with "0" or Empty.
3. Normalizer filters out valid data  → Cache remains null.
4. Next Heartbeat (60s later)  → Middleware asks again.

**Verdict:** This loop is **Intentional**. It allows for "Hot Plugging" sensors. The load (1 packet/min) is negligible.

---

## 5. Integration with CommandService

The CommandService simply accepts these requests and fires them to MQTT. It does not need to know logic about *why* they were requested.

### Summary

- **Create or copy file :** `Smart_Heartbeat_Spec.md`.
- **Use the Stagger Pattern:** The `setTimeout` logic (or a simple queue) is the professional way to ensure the "Smart Heartbeat" doesn't accidentally cause a traffic jam.

## 6. Implementation Guide

From a professional software architecture perspective, this logic belongs **inside the Normalizer Module**, but it should be extracted into a **separate helper file** to keep your code clean.

It should **not** be a completely independent Top-Level Module (like Storage or Ingress) because it is tightly coupled to the processing logic of the Normalizer.

### Recommendation: The "Strategy" Pattern

Create a separate file `src/modules/normalizer/SmartHeartbeat.js` that the `UnifyNormalizer` imports and uses.

### 1. Why this approach?

- **Separation of Concerns:** `UnifyNormalizer.js` focuses on **Data Transformation** (SIF $\to$ SUO). `SmartHeartbeat.js` focuses on **Control Logic** (Deciding if we need to send queries).
- **Code Cleanliness:** The "Check & Stagger" logic (checking 5 different sensor types and setting timeouts) involves ~50 lines of code. Putting this directly inside the main `UnifyNormalizer.js` switch-statement makes the main file hard to read.
- **Testability:** You can easily write unit tests for `SmartHeartbeat.js` (Input: Cache Mock; Output: Did it emit events?) without running the full Normalizer pipeline.

---

### 2. Implementation Guide (How to structure it)

**File Path:** `src/modules/normalizer/SmartHeartbeat.js`

```jsx
// src/modules/normalizer/SmartHeartbeat.js

class SmartHeartbeat {
    constructor(eventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Checks the cache state for a specific module and triggers repairs
     */
    checkAndRepair(deviceId, deviceType, moduleIndex, cacheSnapshot) {
        const missingItems = [];

        // 1. Check Metadata (V5008 only)
        if (deviceType === 'V5008' && !cacheSnapshot.fwVer) {
             missingItems.push('QRY_MODULE_INFO');
        }

        // 2. Check Sensors
        if (!cacheSnapshot.temp_hum || cacheSnapshot.temp_hum.length === 0) {
            missingItems.push('QRY_TEMP_HUM');
        }

        // ... (Check RFID, Door, etc.) ...

        // 3. Execution (Staggered)
        this._emitStaggered(deviceId, moduleIndex, missingItems);
    }

    _emitStaggered(deviceId, moduleIndex, messageTypes) {
        messageTypes.forEach((type, idx) => {
            setTimeout(() => {
                this.eventBus.emit('command.request', {
                    deviceId,
                    moduleIndex,
                    messageType: type
                });
            }, idx * 500); // 500ms delay between requests
        });
    }
}

module.exports = SmartHeartbeat;
```

---

### 3. Wiring it into `UnifyNormalizer.js`

You simply inject this helper into the main Normalizer class.

```jsx
// src/modules/normalizer/UnifyNormalizer.js
const SmartHeartbeat = require('./SmartHeartbeat');

class UnifyNormalizer {
    constructor(eventBus, cache) {
        this.cache = cache;
        this.smartHeartbeat = new SmartHeartbeat(eventBus); // <--- Initialize
    }

    async _processHeartbeat(sif) {
        // 1. Standard Logic (Update Cache, Emit SUO)
        // ... existing code ...

        // 2. Smart Check (The new hook)
        for (const mod of sif.data) {
            const currentCache = await this.cache.get(sif.deviceId, mod.moduleIndex);

            // Delegate the logic to the helper
            this.smartHeartbeat.checkAndRepair(
                sif.deviceId,
                sif.deviceType,
                mod.moduleIndex,
                currentCache
            );
        }
    }
}
```

### Summary

- **Do not** make it a global module (it's too specific).
- **Do not** inline the code (it's too messy).
- **Do** create `src/modules/normalizer/SmartHeartbeat.js` and call it from the Normalizer. This is the professional "Composition" pattern.