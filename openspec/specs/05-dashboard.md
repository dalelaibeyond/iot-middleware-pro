# IoT Ops Dashboard - Product Requirements (PRD) v1.2

**File Name:** `Dashboard_PRD.md`

**Date:** 1/23/2026
**Type:** Frontend Application
**Scope:** Real-time Digital Twin & Monitoring.
**Status:** Final for Development

## 1. User Interface Layout

The application uses a **Sidebar Navigation** layout with a **Master-Detail** view. The design aesthetic should be "Industrial Professional" (High contrast, clear metrics).

### 1.1 Left Sidebar (Navigation)

- **Structure:** Two-level hierarchy (Accordion style).
    - **Level 1 (Devices):** List of IoT Gateways.
        - *Label:* `{deviceId}`.
        - *Indicator:* Small Status Dot (Green = Online, Gray = Offline).
    - **Level 2 (Modules):** List of Racks attached to the device.
        - *Label:* `Rack #{moduleIndex}`.
        - *Sub-label:* `{moduleId}` (Small, gray text).
- **Behavior:**
    - **Auto-Refresh:** Sidebar list refreshes every 60s (via API) OR upon receiving `DEVICE_METADATA` via WebSocket.
    - **Selection:** Clicking a Module sets the **Global Context** (`selectedDevice`, `selectedModule`).

### 1.2 Top Header (System Status)

- **Left:** Breadcrumbs (`Devices > {deviceId} > Rack #{moduleIndex}`).
- **Right:**
    - **App Connectivity:** WebSocket Status Indicator (Connected/Disconnected/Reconnecting).
    - **Last Update:** Time since last data packet received (e.g., "Updated 2s ago").

### 1.3 Main Panel (The Rack Digital Twin)

**Layout:** A composite view divided into three horizontal zones.

**Zone A: Security Panel (Left, 20% width)**

- **Visuals:** Large, clear Iconography.
- **Logic:**
    - **Single Door Mode:** 1 Icon.
    - **Dual Door Mode:** 2 Icons (Front/Rear).
- **States:**
    - **Closed:** Green Outline / Gray Fill.
    - **Open:** Red Solid Fill + Pulsing Animation.

**Zone B: Rack Visualizer (Center, 50% width)**

- **Component:** Vertical Stack.
- **Ordering:** **Physical Standard** (U1 at Bottom, U-Max at Top).
- **Height:** Dynamic based on `uTotal`. Scrollable if > 42U.
- **Slot Design:**
    - **Empty:** Light Gray background with subtle "U{n}" label.
    - **Occupied:** Solid color block (e.g., Blue/Teal).
        - *Label:* Truncated Tag ID (e.g., `...A44`).
    - **Alarm:** Bright Red background + CSS Shake animation.
- **Interaction:**
    - **Hover:** Tooltip showing Full Tag ID and `sensorIndex`.

**Zone C: Environment Monitor (Right, 30% width)**

- **Layout:** Card-based list.
- **Grouping:** Combine Temperature & Humidity into a single card per sensor index.
- **Card Template:**
    - *Header:* `Sensor #{index}`
    - *Body:*
        - **Temp:** Value in large font (Color coded: Orange if > 35°C).
        - **Hum:** Value in medium font.
    - *Footer:* Noise Level (if available for that index).

**Zone D: Control Actions (Bottom or Modal Trigger)**

- **UI Component:** "Actions" Button Group.
- **Available Commands:**
    1. **Refresh State:** Triggers `u_state_req` (Manual Sync).
    2. **Clear Alarm:** Triggers `clear_u_warning` (Requires entering `uIndex`).
    3. **Set Color:** Triggers `set_module_property_req` (Requires `uIndex` + `colorID`).
- **UX:** Clicking a button opens a small modal to confirm parameters, then sends POST request to API.

---

## 2. User Experience (UX) & Interactions

### 2.1 Notifications (Toast System)

- **Trigger:** Incoming WebSocket message of type `META_CHANGED_EVENT`.
- **Behavior:** Display a temporary "Toast" popup at the top-right.
- **Content:** The `description` field from the payload (e.g., "Device IP changed...").
- **Style:** Info/Info variant.

### 2.2 Loading & Error States

- **Initial Load:** Show "Skeleton Loaders" (Gray placeholders) while fetching API data.
- **Data Stale:** If no WebSocket update for > 2 minutes, dim the rack visualizer and show "Data Stale" badge.
- **API Error:** If `GET /state` fails (404/500), show "Rack Offline or Not Found" empty state.

---

## 3. Data Logic Requirements

### 3.1 Initialization (Hydration)

1. **Call:** `GET /api/devices` to populate Sidebar.
2. **Select:** Default to first device/module, OR restore selection from URL/LocalStorage.
3. **Call:** `GET /api/devices/{id}/modules/{index}/state` to hydrate the Redux/Zustand store.

### 3.2 Real-Time Synchronization

- **Connection:** Connect to `ws://{host}:{port}/ws`.
- **Reducer Logic (When `SUO` arrives):**
    - **Filter:** Check `suo.deviceId` == `currentDevice` AND `suo.moduleIndex` == `currentModule`.
    - **Merge:**
        - `RFID_SNAPSHOT` / `RFID_EVENT` → Update specific U-slots.
        - `TEMP_HUM` → Update Environment Cards.
        - `DOOR_STATE` → Update Security Icons.
        - `HEARTBEAT` → Update "Online" status indicator.

### 3.3 Command Execution

- **Endpoint:** `POST /api/commands`
- **Payload:**
    
    ```json
    {
      "deviceId": "...",
      "messageType": "CLN_ALARM", // or QRY_RFID_SNAPSHOT, SET_COLOR
      "payload": { "uIndex": 10 }
    }
    ```
    
- **Frontend Logic:** Call this endpoint. Show "Command Sent" toast. Wait for WebSocket update to confirm change.

---

## 4. Technical Constraints

- **Responsive:** Must work on Desktop (1920x1080) and Tablet (1024x768).
- **Performance:** Rack Visualizer must render 54 slots without layout thrashing (Use CSS Grid).
- **Theme:** Dark/Light mode support (preferred, start with Light).

---

- - END OF FILE Dashboard_PRD_v1.1.md ---