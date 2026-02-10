# Metadata Merging & Repair Logic

file name: `metadata_merge_repair_logic.md`

Here are the specific sections will update into **`UnifyNormalizer_Spec.md`**.

This replaces the existing **Section 3.3** and **Section 3.4** with the optimized, lightweight, and robust logic we agreed upon.

---

# Metadata Merging & Repair Logic

### 3.3 Metadata Merging & Repair Logic

*Goal: Maintain a complete Device Record in the Cache by merging partial data fragments and auto-repairing missing information during Heartbeats.*

**Logic Flow by Input SIF Type:**

### Case A: `HEARTBEAT` (The "Tick")

- **Step 1 (Merge):** Update Cache `activeModules` list with `moduleId` and `uTotal` from the SIF.
- **Step 2 (Self-Healing Check):**
    - *Device Level:* If Cache `ip` OR `mac` is missing → Emit `command.request` (`QRY_DEV_MOD_INFO` for V6800, `QRY_DEVICE_INFO` for V5008).
    - *Module Level (V5008 Only):* If any active module in Cache is missing `fwVer` → Emit `command.request` (`QRY_MODULE_INFO`).
- **Step 3 (Emit):**
    - Emit `HEARTBEAT` SUO (History).
    - Emit `DEVICE_METADATA` SUO  (Constructed from the **Merged Cache** to ensure Sidebar has ID/uTotal).

### Case B: `DEVICE_INFO` / `MODULE_INFO` / `DEV_MOD_INFO` / `UTOTAL_CHANGED`

- **Step 1 (Change Detection):** Execute **Section 3.4 (Diffing)**.
    - If differences found → Emit `META_CHANGED_EVENT` SUO.
- **Step 2 (Merge):** Update Cache with fields present in SIF.
    - `DEVICE_INFO`: Update `ip`, `mac`, `fwVer`, `mask`, `gwIp`.
    - `MODULE_INFO`: Update `fwVer` for specific `moduleIndex`.
    - `DEV_MOD_INFO`: Replace full `activeModules` list, update `ip`, `mac`.
- **Step 3 (Emit):** Emit `DEVICE_METADATA` SUO (Constructed from the **Fully Merged Cache**).

---

### 3.4 Metadata Change Detection Logic (Diffing)

*Goal: Generate Audit Logs by comparing incoming SIF data against the existing Cache **before** merging.*

**Comparison Steps:**

1. **Device Level Checks:**
    - If `SIF.ip` exists AND `SIF.ip != Cache.ip` → Add event `"Device IP changed from {Cache.ip} to {SIF.ip}"`.
    - If `SIF.fwVer` exists AND `SIF.fwVer != Cache.fwVer` → Add event `"Device Firmware changed from {Cache.fwVer} to {SIF.fwVer}"`.
2. **Module Level Checks:**
    - *Preparation:* Create a Map of the Cache's `activeModules` using `moduleIndex` as the key.
    - *Iteration:* Loop through modules in the SIF `data` array:
        - **New Module:** If `moduleIndex` not in Cache Map → Add event `"Module {id} added at Index {index}"`.
        - **Existing Module:** If found, compare fields:
            - `moduleId`: If different → `"Module {id} replaced with {new_id} at Index {index}"`.
            - `fwVer`: If different → `"Module {id} Firmware changed from {old} to {new}"`.
            - `uTotal`: If different → `"Module {id} U-Total changed from {old} to {new}"`.
3. **Output:**
    - If the event list is not empty, create and emit a **`META_CHANGED_EVENT` SUO** containing the list of descriptions.

# Other Supplementary

**Current Status:**
The specs *implicitly* support it (because arrays `[]` are valid), but they do **not** explicitly define how to handle the transition from "Has Modules" $\to$ "No Modules" (e.g., if someone unplugs the only RS485 bar).

**The Risk:**
In **Section  (Cache Update Strategy)**, we specified **`MERGE`** for Heartbeat.

- *Ambiguity:* If the Cache has `[Module 1]` and the Heartbeat sends `[]` (Empty), a standard "Merge" function often **does nothing** (it thinks there is nothing to update).
- *Result:* The Cache would still show "Module 1" as active, even though it was physically removed.

**The Fix:**
You need to clarify that "Merge" for the Module List means **"Reconcile"** (Sync).

### Required Update for `UnifyNormalizer_Spec`

Update **Section  (Cache Update Strategy)** for the `HEARTBEAT` row.

**Current:**

> `HEARTBEAT` | `:info` | **MERGE:** Update `activeModules` (`moduleId`, `uTotal`).
> 

**New (Explicit):**

> `HEARTBEAT` | `:info` | **RECONCILE:** Update `activeModules`.
> 
> - **Logic:** The Heartbeat is authoritative for *presence*.
> - **Match:** If module exists in Cache, update `uTotal`/`moduleId`, preserve `fwVer`.
> - **Add:** If new in Heartbeat, add to Cache.
> - **Remove:** If in Cache but **MISSING** in Heartbeat, remove from Cache. (Handle "Zero Module" case).

---

### Update for `V5008Parser_Spec`

Ensure the Parser doesn't return `null` for empty heartbeats.

**Section 6.1 (Heartbeat):**

> **Parsing Logic:** Loop 10 times. Filter out invalid slots.
> 
> - **Edge Case:** If all slots are invalid, return `data: []` (Empty Array), **not** `null`. This signals "Device is Online, but has 0 modules."

### Summary

With these two small clarifications, your system will correctly handle:

1. **Fresh Boot (0 Modules):** Dashboard shows Device, no Racks.
2. **Unplug Event:** User unplugs the bar $\to$ Heartbeat sends `[]` → Normalizer removes from Cache → Dashboard removes Rack.