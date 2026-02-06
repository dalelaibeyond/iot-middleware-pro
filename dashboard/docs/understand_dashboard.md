# Understanding Dashboard Real-Time Data Flow

**Version**: 1.0  
**Last Updated**: 2026-02-06

## Overview

The IoT Ops Dashboard receives real-time data from the IoT Middleware through a dual-channel architecture:

1. **REST API** - For initial data fetching and explicit queries
2. **WebSocket** - For continuous real-time data streaming

This document explains how the dashboard connects to and receives data from middleware broadcasts.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     IoT Middleware Pro                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   MQTT       │    │  Normalizer  │    │  EventBus    │ │
│  │  Subscriber  │───▶│              │───▶│              │ │
│  └──────────────┘    └──────────────┘    └──────┬───────┘ │
│                                              │              │
│  ┌───────────────────────────────────────────────▼──────────────┐ │
│  │              WebSocket Server (Port 3001)               │ │
│  │  - Broadcasts SUO messages to all connected clients    │ │
│  │  - Listens for command requests from dashboard         │ │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────┬─────────────────────────────┘
                                    │ WebSocket Connection
                                    │ (ws://localhost:3001)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Dashboard Frontend                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ useSocket    │───▶│ useIoTStore  │───▶│   React UI   │ │
│  │   Hook       │    │  (Zustand)   │    │  Components  │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. WebSocket Connection

### Connection Establishment

**File**: [`dashboard/hooks/useSocket.ts`](../hooks/useSocket.ts:1)

The dashboard establishes a WebSocket connection on application mount:

```typescript
const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3001";
wsRef.current = new WebSocket(wsUrl);
```

**Environment Configuration** ([`.env.example`](../.env.example:5)):
```bash
VITE_WS_URL=ws://localhost:3001
```

### Connection Events

| Event | Handler | Description |
|--------|----------|-------------|
| `onopen` | Sets connection state to `true` | Connection established successfully |
| `onmessage` | Validates and processes incoming data | Real-time data received |
| `onclose` | Attempts reconnection with exponential backoff | Connection lost |
| `onerror` | Logs error and updates connection state | Connection error occurred |

### Reconnection Strategy

The dashboard implements automatic reconnection with exponential backoff:

```typescript
const reconnectDelay = 2000; // Start with 2 seconds
const maxReconnectAttempts = 5;

// Delay calculation: 2s, 4s, 8s, 16s, 32s
const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
```

---

## 2. Message Format: SUO (Standard Unified Object)

The middleware broadcasts data in the **SUO (Standard Unified Object)** format. This format is used consistently across:

- WebSocket messages
- Webhook payloads
- Internal event bus communication

### SUO Structure

```typescript
interface SUOUpdate {
  messageType: MessageType;    // Type of data update
  deviceId: string;          // Unique device identifier
  moduleIndex?: number;       // Module/rack index (optional)
  payload: any;             // Message-specific data
}
```

### Message Types

| MessageType | Description | Payload Structure |
|-------------|-------------|------------------|
| `DEVICE_METADATA` | Device metadata changes | `{ip, fwVer, isOnline}` |
| `HEARTBEAT` | Device alive signal | `{}` (empty) |
| `TEMP_HUM` | Temperature/humidity update | `{sensorIndex, temp, hum}` |
| `RFID_SNAPSHOT` | RFID tag state | `[{sensorIndex, tagId, isAlarm}]` |
| `DOOR_STATE` | Door sensor state | `{door1State, door2State, doorState}` |
| `NOISE` | Noise level reading | `{sensorIndex, noise}` |
| `META_CHANGED_EVENT` | Configuration changed | `{message: string}` |

### WebSocket Message Wrapper

The middleware wraps SUO messages in a control envelope:

```json
{
  "type": "data",
  "data": {
    "messageType": "TEMP_HUM",
    "deviceId": "DC01-RACK-08",
    "moduleIndex": 0,
    "payload": {
      "sensorIndex": 0,
      "temp": 24.5,
      "hum": 50
    }
  },
  "timestamp": "2026-02-06T01:25:00.000Z"
}
```

Control messages (not data updates):
- `{"type": "connected", "message": "Connected to IoT Middleware Pro"}`
- `{"type": "ready"}`
- `{"type": "command_ack", "messageId": "..."}`

---

## 3. Message Validation

**File**: [`dashboard/src/utils/validation.ts`](../src/utils/validation.ts:1)

All incoming WebSocket messages are validated before processing:

### Validation Pipeline

```typescript
export const validateWebSocketMessage = (message: string): SUOUpdate | null => {
  try {
    const parsed = JSON.parse(message);
    
    // Extract SUO from middleware wrapper
    if (parsed.type === "data" && parsed.data) {
      const data = parsed.data;
      if (validateSUOUpdate(data)) {
        return data;  // Return SUO for processing
      }
    }
    
    // Ignore control messages
    if (parsed.type === "connected" || 
        parsed.type === "ready" || 
        parsed.type === "command_ack") {
      return null;
    }
    
    return null;  // Invalid message
  } catch (error) {
    return null;  // Parse error
  }
};
```

### SUO Validation

```typescript
export const validateSUOUpdate = (data: any): data is SUOUpdate => {
  return (
    data &&
    typeof data.deviceId === "string" &&
    isValidMessageType(data.messageType) &&
    (data.moduleIndex === undefined || typeof data.moduleIndex === "number") &&
    data.payload !== undefined
  );
};
```

---

## 4. State Management (Zustand Store)

**File**: [`dashboard/store/useIoTStore.ts`](../store/useIoTStore.ts:1)

The dashboard uses Zustand for centralized state management.

### Store Structure

```typescript
interface IoTStore {
  // State
  deviceList: DeviceMetadata[];      // All registered devices
  activeRack: RackState | null;     // Currently viewed rack
  activeDeviceId: string | null;     // Selected device ID
  activeModuleIndex: number | null;  // Selected module index
  socketConnected: boolean;          // WebSocket connection status
  isNocMode: boolean;              // NOC focus mode
  
  // Actions
  setDeviceList: (devices) => void;
  setActiveSelection: (deviceId, moduleIndex) => void;
  setActiveRack: (rack) => void;
  setSocketConnected: (connected) => void;
  toggleNocMode: () => void;
  mergeUpdate: (suo: SUOUpdate) => void;  // Key for real-time updates
}
```

### Data Merging Logic

The `mergeUpdate` action handles incoming SUO messages:

```typescript
mergeUpdate: (suo) => {
  const { deviceList, activeRack, activeDeviceId, activeModuleIndex } = get();

  // Branch 1: Global updates (affect device list)
  if (suo.messageType === "DEVICE_METADATA" || 
      suo.messageType === "HEARTBEAT") {
    const updatedList = deviceList.map((d) => {
      if (d.deviceId === suo.deviceId) {
        return { ...d, ...suo.payload, isOnline: true };
      }
      return d;
    });
    set({ deviceList: updatedList });
  }

  // Branch 2: Context-aware updates (only for viewed rack)
  if (suo.deviceId !== activeDeviceId || 
      suo.moduleIndex !== activeModuleIndex) {
    return;  // Ignore if not currently viewed
  }

  // Update active rack based on message type
  switch (suo.messageType) {
    case "TEMP_HUM":
      newRack.temp_hum = newRack.temp_hum.map((th) =>
        th.sensorIndex === suo.payload.sensorIndex ? {...th, ...suo.payload} : th
      );
      break;
    case "RFID_SNAPSHOT":
      newRack.rfid_snapshot = suo.payload;  // Full array replacement
      break;
    case "DOOR_STATE":
      newRack.door1State = suo.payload.door1State;
      newRack.door2State = suo.payload.door2State;
      break;
    case "NOISE":
      newRack.noise_level = newRack.noise_level.map((n) =>
        n.sensorIndex === suo.payload.sensorIndex ? {...n, ...suo.payload} : n
      );
      break;
  }
  
  set({ activeRack: newRack });
}
```

---

## 5. Data Transformation

**File**: [`dashboard/src/api/endpoints.ts`](../src/api/endpoints.ts:16)

The middleware uses **snake_case** field names, while the dashboard uses **camelCase**. A transformation layer handles this:

```typescript
function toCamelCase<T>(obj: any): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item));
  }

  const result: any = {};
  for (const key in obj) {
    // Convert snake_case to camelCase
    let camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    // Apply specific field name mappings
    const fieldMappings: Record<string, string> = {
      device_id: "deviceId",
      device_type: "deviceType",
      device_ip: "ip",
      device_mac: "mac",
      device_fwVer: "fwVer",
      device_mask: "mask",
      device_gwIp: "gwIp",
      modules: "activeModules",
    };

    if (fieldMappings[key]) {
      camelKey = fieldMappings[key];
    }

    result[camelKey] = toCamelCase(obj[key]);
  }
  return result;
}
```

### Field Name Mapping

| Middleware (snake_case) | Dashboard (camelCase) |
|------------------------|----------------------|
| `device_id` | `deviceId` |
| `device_type` | `deviceType` |
| `device_ip` | `ip` |
| `device_mac` | `mac` |
| `device_fwVer` | `fwVer` |
| `device_mask` | `mask` |
| `device_gwIp` | `gwIp` |
| `modules` | `activeModules` |
| `rfid_snapshot` | `rfidSnapshot` |
| `temp_hum` | `tempHum` |
| `noise_level` | `noiseLevel` |
| `lastSeen_hb` | `lastSeenHb` |

---

## 6. Middleware Broadcast Mechanism

### WebSocket Server

**File**: [`src/modules/output/WebSocketServer.js`](../../src/modules/output/WebSocketServer.js:1)

The middleware's WebSocket server broadcasts data to all connected clients:

```javascript
// Subscribe to normalized data from EventBus
eventBus.onDataNormalized((suo) => {
  this.broadcast(suo);
});

// Broadcast to all connected clients
broadcast(suo) {
  const message = {
    type: "data",
    data: suo,
    timestamp: new Date(),
  };

  const payload = JSON.stringify(message);

  this.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
```

### Webhook Service

**File**: [`src/modules/output/WebhookService.js`](../../src/modules/output/WebhookService.js:1)

For HTTP-based clients, the middleware supports webhooks:

```javascript
// Subscribe to normalized data
eventBus.onDataNormalized((suo) => {
  this.handleData(suo);
});

// Send to configured webhook URL
async sendWebhook(suo) {
  const payload = JSON.stringify(suo);
  
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 10000,
  };

  // Send HTTP POST request
  const req = httpModule.request(options, (res) => {
    // Handle response
  });
  
  req.write(payload);
  req.end();
}
```

### Event Bus Flow

**File**: [`src/core/EventBus.js`](../../src/core/EventBus.js:1)

The EventBus coordinates data flow between modules:

```
MQTT Message
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                   EventBus                             │
│  emitMqttMessage()  │
│         │                                             │
│         ▼                                             │
│  Parser (V5008/V6800)                              │
│         │                                             │
│         ▼                                             │
│  Normalizer (UnifyNormalizer)                          │
│         │                                             │
│         ▼                                             │
│  emitDataNormalized(suo)  ◀───┐                 │
│         │                             │                │
└─────────┼─────────────────────────────┼────────────────┘
          │                             │
          ▼                             │
    ┌─────┴─────┐                     │
    │           │                     │
    ▼           ▼                     │
WebSocket    Webhook                 │
Server      Service                  │
    │           │                     │
    └─────┬─────┘                     │
          │                             │
          ▼                             │
    External Clients                    │
          │                             │
          └─────────────────────────────┘
```

---

## 7. Complete Data Flow Example

### Scenario: Temperature Sensor Update

1. **Device sends MQTT message**:
   ```json
   {
     "messageType": "TEMP_HUM",
     "deviceId": "DC01-RACK-08",
     "moduleIndex": 0,
     "payload": {
       "sensorIndex": 0,
       "temp": 24.5,
       "hum": 50
     }
   }
   ```

2. **Middleware processes**:
   - MQTT Subscriber receives message
   - Parser validates and normalizes
   - Normalizer creates SUO object
   - EventBus emits `data.normalized` event

3. **WebSocket Server broadcasts**:
   ```json
   {
     "type": "data",
     "data": {
       "messageType": "TEMP_HUM",
       "deviceId": "DC01-RACK-08",
       "moduleIndex": 0,
       "payload": {
         "sensorIndex": 0,
         "temp": 24.5,
         "hum": 50
       }
     },
     "timestamp": "2026-02-06T01:25:00.000Z"
   }
   ```

4. **Dashboard receives**:
   - WebSocket `onmessage` handler triggered
   - Message validated by `validateWebSocketMessage()`
   - SUO extracted from wrapper
   - `mergeUpdate()` called in store

5. **State updated**:
   ```typescript
   newRack.temp_hum = newRack.temp_hum.map((th) =>
     th.sensorIndex === 0 
       ? {sensorIndex: 0, temp: 24.5, hum: 50}
       : th
   );
   ```

6. **UI re-renders**:
   - React components subscribed to store re-render
   - Temperature display shows new value: 24.5°C
   - Humidity display shows new value: 50%

---

## 8. REST API Integration

While WebSocket handles real-time updates, REST API is used for:

### Initial Data Fetching

**File**: [`App.tsx`](../App.tsx:34)

```typescript
useEffect(() => {
  const init = async () => {
    try {
      const devices = await getDevices();  // GET /api/devices
      setDeviceList(devices);
      if (devices.length > 0) {
        setActiveSelection(
          devices[0].deviceId,
          devices[0].activeModules[0].moduleIndex,
        );
      }
    } catch (err) {
      console.error("Initialization failed", err);
    } finally {
      setLoading(false);
    }
  };
  init();
}, [setDeviceList, setActiveSelection]);
```

### On-Demand Rack State

```typescript
useEffect(() => {
  if (activeDeviceId && activeModuleIndex !== null) {
    const fetchDetail = async () => {
      const state = await getRackState(activeDeviceId, activeModuleIndex);
      setActiveRack(state);
    };
    fetchDetail();
  }
}, [activeDeviceId, activeModuleIndex, setActiveRack]);
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|---------|---------|
| `/api/devices` | GET | Fetch all devices with metadata |
| `/api/devices/{id}/modules/{index}/state` | GET | Fetch specific rack state |
| `/api/commands` | POST | Send command to device |
| `/api/health` | GET | Check middleware health |

---

## 9. Webhook Integration (Alternative to WebSocket)

For clients that cannot use WebSocket, the middleware supports HTTP webhooks:

### Configuration

```javascript
// config/default.json
{
  "modules": {
    "webhookService": {
      "enabled": true,
      "url": "https://your-server.com/webhook",
      "filters": ["TEMP_HUM", "DOOR_STATE", "ALARM"]
    }
  }
}
```

### Webhook Payload

Webhooks receive the same SUO format as WebSocket:

```json
POST /webhook HTTP/1.1
Content-Type: application/json

{
  "messageType": "TEMP_HUM",
  "deviceId": "DC01-RACK-08",
  "moduleIndex": 0,
  "payload": {
    "sensorIndex": 0,
    "temp": 24.5,
    "hum": 50
  }
}
```

### Response Handling

The middleware expects a 2xx status code:

- **200-299**: Success, webhook delivered
- **Other**: Error logged, webhook may be retried

---

## 10. Troubleshooting

### WebSocket Not Connecting

**Symptoms**: Dashboard shows "Disconnected" status

**Checks**:
1. Verify middleware is running: `curl http://localhost:3000/api/health`
2. Check WebSocket URL in `.env.local`: `VITE_WS_URL=ws://localhost:3001`
3. **Check browser console (F12)** for WebSocket errors
4. Verify no firewall blocking port 3001

**Note**: `console.log()` statements in dashboard code output to the **browser console**, not the server terminal. To view them:
- Open browser DevTools (F12)
- Go to Console tab
- Look for messages like "WebSocket connected" or "Received SUO message from middleware"

### Data Not Updating

**Symptoms**: Dashboard connected but data not changing

**Checks**:
1. Enable debug mode: `localStorage.setItem('debug', 'true')`
2. Check browser console for incoming messages
3. Verify middleware is receiving MQTT messages
4. Check middleware logs for "Sent to WebSocket client" messages
5. Verify active device/module selection matches incoming data

### Validation Errors

**Symptoms**: Messages rejected in console

**Checks**:
1. Verify SUO structure matches schema
2. Check `messageType` is valid
3. Ensure `deviceId` is present and is a string
4. Verify `payload` exists for data messages

### Context-Aware Filtering

**Important**: The dashboard only updates the **currently viewed rack**. Messages for other devices/modules are ignored to optimize performance.

To view updates for a different device:
1. Click on the device in the sidebar
2. Select the module/rack
3. Dashboard will now process messages for that selection

---

## 11. Key Files Reference

| File | Purpose |
|------|----------|
| [`hooks/useSocket.ts`](../hooks/useSocket.ts:1) | WebSocket connection and message handling |
| [`store/useIoTStore.ts`](../store/useIoTStore.ts:1) | State management and data merging |
| [`src/utils/validation.ts`](../src/utils/validation.ts:1) | Message validation |
| [`src/api/endpoints.ts`](../src/api/endpoints.ts:1) | REST API client and data transformation |
| [`types/schema.ts`](../types/schema.ts:1) | TypeScript type definitions |
| [`src/modules/output/WebSocketServer.js`](../../src/modules/output/WebSocketServer.js:1) | Middleware WebSocket server |
| [`src/modules/output/WebhookService.js`](../../src/modules/output/WebhookService.js:1) | Middleware webhook service |
| [`src/core/EventBus.js`](../../src/core/EventBus.js:1) | Middleware event coordination |

---

## 12. Summary

The dashboard receives real-time data through a well-architected pipeline:

1. **Middleware** normalizes device data into SUO format
2. **EventBus** distributes SUO to all output modules
3. **WebSocket Server** broadcasts SUO to connected dashboard clients
4. **Dashboard** validates, transforms, and merges updates into Zustand store
5. **React UI** re-renders with new data

This architecture provides:
- **Real-time updates** with minimal latency
- **Type safety** through validation
- **Scalability** through event-driven design
- **Flexibility** supporting both WebSocket and webhook clients
- **Performance** through context-aware filtering
