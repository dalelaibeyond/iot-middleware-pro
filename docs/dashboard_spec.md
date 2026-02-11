# Dashboard Specification - As-Built

> **Component:** IoT Ops Dashboard (React/Vite Frontend)  
> **Version:** 2.0.0  
> **Last Updated:** 2026-02-11  
> **Status:** As-Built (Verified against source code)

---

## 1. Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | React 18+ |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| State Management | Zustand |
| HTTP Client | Axios |
| Icons | Lucide React |
| Utilities | clsx, tailwind-merge |

---

## 2. Project Structure

```
dashboard/
├── .env.example              # Environment template
├── .env.local               # Local environment (gitignored)
├── index.html               # Entry HTML
├── index.tsx                # React entry point
├── App.tsx                  # Main app component
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx      # Device/module navigation
│   │   └── TopBar.tsx       # Header with breadcrumbs
│   ├── rack/
│   │   ├── DoorPanel.tsx    # Door status display
│   │   ├── RackStrip.tsx    # U-position rack visualization
│   │   └── EnvList.tsx      # Temperature/humidity cards
│   └── ui/
│       ├── Badge.tsx
│       ├── DataFreshnessIndicator.tsx
│       ├── ErrorDisplay.tsx
│       ├── LoadingIndicator.tsx
│       └── SkeletonLoader.tsx
├── hooks/
│   └── useSocket.ts         # WebSocket connection hook
├── store/
│   └── useIoTStore.ts       # Zustand global state
├── types/
│   └── schema.ts            # TypeScript interfaces
├── src/
│   ├── api/
│   │   ├── client.ts        # Axios configuration
│   │   └── endpoints.ts     # API endpoint functions
│   └── utils/
│       └── validation.ts    # Message validation
└── utils/
    └── cn.ts                # Tailwind class merger
```

---

## 3. UI Layout

### 3.1 Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar    │  TopBar (breadcrumbs, connection status)  │
│  (Device    ├───────────────────────────────────────────┤
│   List)     │                                           │
│             │  ┌─────────┐  ┌───────────┐  ┌────────┐  │
│  [Device 1] │  │  Door   │  │   Rack    │  │  Env   │  │
│   - Mod 1   │  │ Panel   │  │  Strip    │  │ List   │  │
│   - Mod 2   │  │ (Zone A)│  │ (Zone B)  │  │(Zone C)│  │
│  [Device 2] │  └─────────┘  └───────────┘  └────────┘  │
│             │                                           │
└─────────────┴───────────────────────────────────────────┘
```

### 3.2 Left Sidebar (Navigation)

- **Data Source:** `GET /api/live/topology` (initial) + WebSocket (updates)
- **Visual:** Accordion list
  - **Level 1:** Device ID with Online/Offline dot (Green = Online, Gray = Offline)
  - **Level 2:** Module ID (Rack)
- **Real-Time Behavior:**
  - `DEVICE_METADATA` arrives → Update Device Label/IP
  - `HEARTBEAT` arrives → Update Online/Offline dot immediately

### 3.3 Top Bar (Context)

- **Left:** Breadcrumbs (`Device > {deviceId} > Rack #{moduleIndex}`) + Device IP/Firmware
- **Right:** Connection Status Badge (Green=Live, Red=Disconnected)

### 3.4 Main Panel (Rack View)

**Zone A: Security (Left, ~20%)**
- Large Door Icons
- Single Door: 1 Icon
- Dual Door (V6800): 2 Icons (Front/Rear)
- **States:**
  - Closed: Green Outline / Gray Fill
  - Open: Red Solid Fill + Pulsing Animation

**Zone B: Rack Visualizer (Center, ~50%)**
- Vertical stack of slots representing physical rack
- Dynamic height based on `uTotal` (default 42)
- **Ordering:** Physical Standard (U1 at Bottom, U-Max at Top)
- **Slots:**
  - Empty: Gray placeholder
  - Occupied: Colored block with Tag ID
  - Alarm: Blinking Red background

**Zone C: Environment (Right, ~30%)**
- Card-based list aligned with rack
- Combines Temperature & Humidity per sensor
- Temperature > 35°C shown in Orange

---

## 4. State Management (Zustand)

**Store:** `store/useIoTStore.ts`

### 4.1 State Structure

```typescript
interface IoTStore {
  deviceList: DeviceMetadata[];        // Sidebar source
  activeRack: RackState | null;        // Main panel source
  activeDeviceId: string | null;
  activeModuleIndex: number | null;
  socketConnected: boolean;
  isNocMode: boolean;                  // NOC focus mode
}
```

### 4.2 Actions

| Action | Description |
|--------|-------------|
| `setDeviceList(devices)` | Initialize/update device list |
| `setActiveSelection(deviceId, moduleIndex)` | Change selected rack |
| `setActiveRack(rack)` | Set current rack state |
| `setSocketConnected(connected)` | Update WS status |
| `toggleNocMode()` | Toggle NOC focus view |
| `mergeUpdate(suo)` | Merge WebSocket SUO into state |

### 4.3 Merge Update Logic

The `mergeUpdate(suo)` function handles two branches:

**Branch 1: Metadata Update (Global)**
- Triggers: `suo.messageType === 'DEVICE_METADATA'` or `'HEARTBEAT'`
- Updates: Device IP, FW version, Online status, activeModules list
- Affects: Sidebar and TopBar

**Branch 2: Rack Update (Context-Aware)**
- **Guard:** Only process if `suo.deviceId === activeDeviceId` AND `suo.moduleIndex === activeModuleIndex`
- **Updates:**
  - `TEMP_HUM` → Update tempHum array
  - `HEARTBEAT` → Update isOnline
  - `RFID_SNAPSHOT/RFID_EVENT` → Update rfidSnapshot
  - `DOOR_STATE` → Update door*State fields
  - `NOISE_LEVEL` → Update noiseLevel array

---

## 5. API Integration

### 5.1 API Client Configuration

**File:** `src/api/client.ts`

```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  timeout: 10000,
  headers: { "Content-Type": "application/json" }
});
```

### 5.2 Endpoints

**File:** `src/api/endpoints.ts`

| Function | Endpoint | Description |
|----------|----------|-------------|
| `getTopology()` | `GET /api/live/topology` | Device/module list |
| `getRackState(deviceId, moduleIndex)` | `GET /api/live/devices/{id}/modules/{idx}` | Rack state |
| `sendCommand(deviceId, deviceType, messageType, payload)` | `POST /api/commands` | Send command |
| `getHealthStatus()` | `GET /api/health` | System health |
| `getHistoryEvents(params)` | `GET /api/history/events` | Historical events |
| `getHistoryTelemetry(params)` | `GET /api/history/telemetry` | Historical telemetry |
| `getHistoryAudit(params)` | `GET /api/history/audit` | Audit log |

### 5.3 Field Name Mapping

The API uses snake_case, but the dashboard uses camelCase:

| API (snake_case) | Dashboard (camelCase) |
|------------------|----------------------|
| `device_id` | `deviceId` |
| `device_type` | `deviceType` |
| `rfid_snapshot` | `rfidSnapshot` |
| `temp_hum` | `tempHum` |
| `noise_level` | `noiseLevel` |
| `last_seen_hb` | `lastSeenHb` |

---

## 6. WebSocket Integration

### 6.1 Hook: useSocket

**File:** `hooks/useSocket.ts`

**Configuration:**
```typescript
const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3001";
const maxReconnectAttempts = 5;
const reconnectDelay = 2000; // Base delay, doubles each attempt
```

**Reconnection Strategy:**
- Exponential backoff: 2s → 4s → 8s → 16s → 32s
- Max 5 attempts
- Manual disconnect (code 1000) does not trigger reconnect

**Message Flow:**
```
WebSocket Message → validateWebSocketMessage() → mergeUpdate(suo)
```

### 6.2 SUO Update Types

| messageType | State Update |
|-------------|--------------|
| `TEMP_HUM` | `activeRack.tempHum = payload` |
| `HEARTBEAT` | `activeRack.isOnline = true`, update timestamp |
| `RFID_SNAPSHOT` | `activeRack.rfidSnapshot = payload` |
| `RFID_EVENT` | Merge single event into rfidSnapshot array |
| `DOOR_STATE` | Update doorState/door1State/door2State |
| `NOISE_LEVEL` | `activeRack.noiseLevel = payload` |
| `DEVICE_METADATA` | Update deviceList entry |
| `META_CHANGED_EVENT` | Log to console (future: toast notification) |

---

## 7. TypeScript Interfaces

### 7.1 Core Types

**File:** `types/schema.ts`

```typescript
interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  ip: string | null;
  mac: string | null;
  fwVer: string | null;
  mask: string | null;
  gwIp: string | null;
  isOnline: boolean;
  activeModules: Array<{
    moduleIndex: number;
    moduleId: string;
    uTotal: number;
    fwVer: string | null;
  }>;
}

interface RackState {
  deviceId: string;
  moduleIndex: number;
  isOnline: boolean;
  rfidSnapshot: Array<{
    sensorIndex: number;
    tagId: string;
    isAlarm: boolean;
  }>;
  tempHum: Array<{
    sensorIndex: number;
    temp: number | null;
    hum: number | null;
  }>;
  noiseLevel: Array<{
    sensorIndex: number;
    noise: number | null;
  }>;
  doorState: number | null;
  door1State: number | null;
  door2State: number | null;
  lastSeenHb?: string;
}

interface SUOUpdate {
  deviceId: string;
  deviceType: string;
  messageType: string;
  messageId: string;
  moduleIndex: number;
  moduleId: string;
  payload: any[];
}
```

---

## 8. Environment Configuration

**File:** `.env.local` (copy from `.env.example`)

```bash
# API Configuration
VITE_API_URL=http://localhost:3000

# WebSocket Configuration
VITE_WS_URL=ws://localhost:3001

# App Configuration
VITE_APP_TITLE=IoT Ops Dashboard
VITE_APP_VERSION=1.2.0
```

---

## 9. Running the Dashboard

```bash
# Navigate to dashboard directory
cd dashboard

# Install dependencies
npm install

# Start development server
npm run dev
# → http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 10. Key Implementation Notes

### 10.1 "Zero Module" Case Handling

The dashboard handles devices with no modules:
- Initialization: Check if `activeModules.length > 0` before selecting
- Auto-correction: If selected module removed, switch to first available

### 10.2 Field Name Compatibility

The store maintains both snake_case and camelCase versions:
```typescript
newRack.temp_hum = suo.payload;  // API format
newRack.tempHum = suo.payload;   // Dashboard format
```

### 10.3 NOC Mode

NOC (Network Operations Center) mode:
- Hides Zone A (Security) and Zone C (Environment)
- Expands Rack Visualizer to full width
- Useful for large-screen monitoring displays

### 10.4 Data Freshness

- Initial load: Skeleton loaders shown
- Data stale (> 2 min): Visual indicator
- API error: "Rack Offline or Not Found" empty state
