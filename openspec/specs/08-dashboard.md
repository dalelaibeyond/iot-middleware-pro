# Dashboard Master Specification v1.2

**File Name:** `08-dashboard.md`

**Date:** 1/24/2026
**Type:** Full Stack Specification (PRD + Implementation)
**Scope:** Frontend Dashboard Logic, UI, and API Integration.
**Status:** Final for AI Coding

---

## 1. Executive Summary

The **IoT Ops Dashboard** is a real-time, single-page application (SPA) that acts as the "Digital Twin" for the data center. It connects to the IoT Middleware via REST API (for initial state) and WebSocket (for live UOS updates).

**Tech Stack:**

- **Framework:** React 18 + Vite
- **Language:** TypeScript
- **State:** Zustand (Global Store)
- **Styling:** Tailwind CSS
- **HTTP:** Axios
- **Icons:** Lucide-React

---

## 2. UI Layout & Features (PRD)

The app uses a **Sidebar Navigation** layout with a **Master-Detail** view.

### 2.1 Left Sidebar (Navigation)

- **Data Source:** `GET /api/devices` (Initial) + WebSocket (Updates).
- **Visual:** Accordion list.
    - **Level 1:** Device ID (with Online/Offline dot).
    - **Level 2:** Module ID (Rack).
- **Real-Time Behavior:**
    - If `DEVICE_METADATA` arrives, update the Device Label/IP.
    - If `HEARTBEAT` arrives, update the Online/Offline dot immediately.

### 2.2 Top Bar (Context)

- **Data Source:** Active Rack Metadata + WebSocket Connection State.
- **Visual:**
    - Left: Breadcrumbs (`Device > Module`) + Device IP/Firmware.
    - Right: Connection Status Badge (Green=Live, Red=Disconnected).
- **Real-Time Behavior:** Updates instantly when `DEVICE_METADATA` updates in the store.

### 2.3 Main Panel (The Rack View)

Divided into three zones. Updates instantly via `data.normalized` events.

**Zone A: Security (Left)**

- **Visual:** Large Door Icons.
- **Logic:**
    - If `door1State` exists (V6800), show Front/Rear icons.
    - If only `doorState` exists (V5008), show Front icon only.
    - **Red + Pulse** = Open. **Green** = Closed.

**Zone B: Rack Visualizer (Center)**

- **Visual:** Vertical stack of slots representing the physical rack.
- **Logic:** Dynamic height based on `uTotal` (default 42).
- **Slots:**
    - **Occupied:** Colored block with Tag ID.
    - **Empty:** Gray placeholder.
    - **Alarm:** Blinking Red background.

**Zone C: Environment Monitor (Right)**

- **Visual:** A heatmap-style list aligned with the rack.
- **Logic:** List all `TEMP_HUM` and `NOISE` readings.
- **Format:** `#{index}: 24.5°C | 50%` (Color code temperature: >35°C = Orange).

---

## 3. Technical Architecture (Implementation Guide)

### 3.1 Project Directory Structure (Monorepo)

The Dashboard exists as a sub-project within the Middleware root.

```
iot-middleware-pro/       <-- Project Root
├── config/               # Backend Config
├── src/                  # Backend Source
├── dashboard/            # Frontend Application <-- HERE
│   ├── package.json      # Frontend dependencies
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── api/
│       │   ├── client.ts     # Axios setup
│       │   └── endpoints.ts  # API wrapper functions
│       ├── components/
│       │   ├── layout/       # Sidebar, TopBar
│       │   ├── rack/         # RackStrip, DoorPanel, EnvList
│       │   └── ui/           # Generic Cards, Buttons
│       ├── hooks/
│       │   └── useSocket.ts  # WebSocket logic
│       ├── store/
│       │   └── useIoTStore.ts # Zustand Global State
│       └── types/
│           └── schema.ts     # TS Interfaces (matches Middleware SUO)
└── package.json          # Root dependencies (scripts to run both)
```

### 3.2 Data Contracts (TypeScript Interfaces)

**RackState (The Frontend Shadow):**

```tsx
export interface RackState {
  deviceId: string;
  moduleIndex: number;
  
  // Status
  isOnline: boolean;
  lastSeen_hb: string;

  // Sensor Data
  rfid_snapshot: Array<{ sensorIndex: number; tagId: string; isAlarm: boolean }>;
  temp_hum: Array<{ sensorIndex: number; temp: number; hum: number }>;
  noise_level: Array<{ sensorIndex: number; noise: number }>;
  
  // Doors
  doorState: number | null;
  door1State: number | null;
  door2State: number | null;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  ip: string;
  fwVer: string;
  // ... other fields
  activeModules: Array<{ moduleIndex: number, uTotal: number }>;
}
```

### 3.3 State Management (Zustand)

**Store Logic:**

1. **State:**
    - deviceList: Array<DeviceMetadata> (Sidebar Source).
    - activeRack: RackState | null (Main Panel Source).
2. **Action mergeUpdate(suo):**
    - Called by WebSocket.
    - **Branch 1: Metadata Update (Global)**
        - If suo.messageType === 'DEVICE_METADATA' OR 'HEARTBEAT':
            - Find device in deviceList and update fields (IP, FW, Online Status).
            - *Crucial:* This ensures the Sidebar and TopBar update in real-time.
    - **Branch 2: Rack Update (Context-Aware)**
        - **Guard:** If suo.deviceId != current view ID OR moduleIndex != current view Index, ignore.
        - **Update activeRack:**
            - TEMP_HUM: Update specific index in activeRack.temp_hum.
            - HEARTBEAT: Update activeRack.isOnline.
            - RFID_*: Update rfid_snapshot array.
            - DOOR_STATE: Update door fields.

### 3.4 Integration Logic (Hooks)

**useSocket.ts:**

- Auto-connect to ws://localhost:8080 (or VITE_WS_URL).
- On Message: JSON Parse -> store.mergeUpdate(data).
- On META_CHANGED_EVENT: Trigger a Toast Notification.

**useRackData.ts:**

- On mount (or selection change):
    1. Fetch GET /api/devices/{id}/modules/{idx}/state.
    2. Set activeRack in store.

---

## 4. AI Coding Instructions

**Step 1: Scaffold**

> "Initialize a Vite+React+TS project in the dashboard/ folder inside the project root. Install axios, zustand, lucide-react, clsx, tailwind-merge."
> 

**Step 2: Core Logic**

> "Create dashboard/src/types/schema.ts based on the Data Contracts. Then create dashboard/src/store/useIoTStore.ts implementing the merge logic defined in Section 3.3. Ensure DEVICE_METADATA updates the deviceList."
> 

**Step 3: Components**

> "Implement RackStrip.tsx. It must accept uTotal and rfidData. It must render a vertical list from uTotal down to 1. Use Tailwind for styling."
> 

**Step 4: Integration**

> "Implement useSocket.ts. Connect to the backend and dispatch messages to the Zustand store."
>