# API Design Specification

## Overview

The IoT Middleware provides a REST API for dashboard integration and device control. The API serves read-only state from StateCache and handles control commands via EventBus.

## Base URL

```
http://localhost:3000/api
```

## Endpoints

### 1. GET `/api/health`

**Purpose:** Health check endpoint for monitoring system status.

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "memory": {
    "rss": "45.2 MB",
    "heapUsed": "32.1 MB",
    "heapTotal": "128.0 MB"
  },
  "db": "connected",
  "mqtt": "connected"
}
```

**Used by:** Dashboard for health monitoring and connection status.

---

### 2. GET `/api/config`

**Purpose:** Get system configuration (read-only view).

**Response:**
```json
{
  "app": {
    "name": "IoT Middleware Pro",
    "version": "2.0.0"
  },
  "mqtt": {
    "brokerUrl": "mqtt://localhost:1883",
    "options": {
      "clientId": "iot-middleware-pro",
      "clean": true,
      "connectTimeout": 30000,
      "reconnectPeriod": 5000
    },
    "topics": {
      "v5008": "V5008Upload/#",
      "v6800": "V6800Upload/#"
    },
    "downloadTopic": "V6800Download"
  },
  "modules": {
    "apiServer": {
      "enabled": true,
      "port": 3000,
      "host": "0.0.0.0"
    },
    "webSocketServer": {
      "enabled": true,
      "port": 3001
    }
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}
```

**Note:** Passwords and sensitive fields are redacted with `***REDACTED***`.

---

### 3. GET `/api/devices`

**Purpose:** Get all devices and their metadata (device ID, type, IP, firmware, active modules). Used for sidebar navigation.

**Response:**
```json
[
  {
    "deviceId": "2437871205",
    "deviceType": "V5008",
    "ip": "192.168.100.211",
    "mac": "80:82:91:4E:F6:65",
    "fwVer": "2503200910",
    "mask": "255.255.0.0",
    "gwIp": "192.168.0.1",
    "activeModules": [
      {
        "moduleIndex": 2,
        "moduleId": "2349402517",
        "uTotal": 12,
        "fwVer": "35203"
      }
    ]
  }
]
```

**Used by:** Dashboard sidebar to display device list with online/offline status.

---

### 4. GET `/api/devices/:deviceId/modules/:moduleIndex/state`

**Purpose:** Get current rack state for a specific device and module. Used for detail view.

**Parameters:**
- `deviceId` (path parameter): Device ID
- `moduleIndex` (path parameter): Module index (0-5 for V5008, 1-5 for V6800)

**Response:**
```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "moduleIndex": 2,
  "moduleId": "2349402517",
  "isOnline": true,
  "lastSeen_hb": "2026-02-03T06:24:09.841Z",
  "rfid_snapshot": [
    {
      "sensorIndex": 1,
      "tagId": "AABBCCDD",
      "isAlarm": false
    },
    {
      "sensorIndex": 5,
      "tagId": "11223344",
      "isAlarm": true
    }
  ],
  "temp_hum": [
    {
      "sensorIndex": 1,
      "temp": 24.5,
      "hum": 50.0
    }
  ],
  "noise_level": [
    {
      "sensorIndex": 1,
      "noise": 45.2
    }
  ],
  "doorState": 0,
  "door1State": null,
  "door2State": null,
  "lastSeen_rfid": "2026-02-03T06:24:09.841Z",
  "lastSeen_th": "2026-02-03T06:24:09.841Z",
  "lastSeen_ns": "2026-02-03T06:24:09.841Z",
  "lastSeen_door": "2026-02-03T06:24:09.841Z"
}
```

**Used by:** Dashboard main panel to display rack visualization, door states, and environment readings.

**Error Response:** `404 Not Found` - Module state not found in cache.

---

### 5. GET `/api/devices/:deviceId/modules`

**Purpose:** Get all modules for a specific device.

**Parameters:**
- `deviceId` (path parameter): Device ID

**Response:**
```json
[
  {
    "deviceId": "2437871205",
    "deviceType": "V5008",
    "moduleIndex": 2,
    "moduleId": "2349402517",
    "isOnline": true,
    "lastSeen_hb": "2026-02-03T06:24:09.841Z",
    "rfid_snapshot": [...],
    "temp_hum": [...],
    "noise_level": [...],
    "doorState": 0,
    "door1State": null,
    "door2State": null,
    "lastSeen_rfid": "2026-02-03T06:24:09.841Z",
    "lastSeen_th": "2026-02-03T06:24:09.841Z",
    "lastSeen_ns": "2026-02-03T06:24:09.841Z",
    "lastSeen_door": "2026-02-03T06:24:09.841Z"
  }
]
```

**Used by:** Dashboard to display module list for a device.

---

### 6. GET `/api/uos/:deviceId/:moduleIndex`

**Purpose:** Get telemetry for a specific module (UOS - Unified Object State).

**Parameters:**
- `deviceId` (path parameter): Device ID
- `moduleIndex` (path parameter): Module index

**Response:**
```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "moduleIndex": 2,
  "moduleId": "2349402517",
  "isOnline": true,
  "lastSeen_hb": "2026-02-03T06:24:09.841Z",
  "rfid_snapshot": [...],
  "temp_hum": [...],
  "noise_level": [...],
  "doorState": 0,
  "door1State": null,
  "door2State": null,
  "lastSeen_rfid": "2026-02-03T06:24:09.841Z",
  "lastSeen_th": "2026-02-03T06:24:09.841Z",
  "lastSeen_ns": "2026-02-03T06:24:09.841Z",
  "lastSeen_door": "2026-02-03T06:24:09.841Z"
}
```

**Used by:** Dashboard for detailed telemetry view.

**Error Response:** `404 Not Found` - Module telemetry not found in cache.

---

### 7. GET `/api/meta/:deviceId`

**Purpose:** Get device metadata (UOS - Unified Object State).

**Parameters:**
- `deviceId` (path parameter): Device ID

**Response:**
```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "ip": "192.168.100.211",
  "mac": "80:82:91:4E:F6:65",
  "fwVer": "2503200910",
  "mask": "255.255.0.0",
  "gwIp": "192.168.0.1",
  "activeModules": [
    {
      "moduleIndex": 2,
      "moduleId": "2349402517",
      "uTotal": 12,
      "fwVer": "35203"
    }
  ],
  "lastSeen_info": "2026-02-03T06:24:09.841Z"
}
```

**Used by:** Dashboard for device-level metadata display.

**Error Response:** `404 Not Found` - Device metadata not found in cache.

---

### 8. POST `/api/commands`

**Purpose:** Send a control command to a specific device.

**Request Body (JSON):**

The dashboard must send data that matches the **Input Data Contract** defined in the `CommandService` specification.

```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",        // "V5008" or "V6800"
  "messageType": "SET_COLOR",   // The Unified Enum
  "payload": {
    "moduleIndex": 1,
    "sensorIndex": 10,
    "colorCode": 1
  }
}
```

**Response:**
```json
{
  "status": "sent",
  "commandId": "cmd_1234567890_abc123"
}
```

**Status Codes:**
- **202 Accepted:** Command validated and queued (Emitted to EventBus).
- **400 Bad Request:** Missing `deviceId`, `deviceType`, or `messageType`.

**Note:** This endpoint does **not** wait for the device to respond (Async). The device response will come back via MQTT later and update the Cache/DB asynchronously.

---

## Data Flow

### Command Flow

1. **Dashboard** sends `POST /api/commands` (JSON).
2. **ApiServer** emits `command.request` (Event).
3. **CommandService** wakes up, translates Event to Hex/JSON, and publishes to MQTT `.../Download`.
4. **Device** receives MQTT, executes command, and sends a Response (e.g., `SET_CLR_RESP`).
5. **Normalizer** processes Response and updates DB/Cache.
6. **Dashboard** sees the update via WebSocket.

### Data Retrieval Flow

1. **Dashboard** fetches `GET /api/devices` for sidebar.
2. **Dashboard** fetches `GET /api/devices/:id/modules/:idx/state` for detail view.
3. **Dashboard** receives real-time updates via WebSocket.
4. **ApiServer** serves data from StateCache (in-memory cache).
5. **StateCache** is updated by Normalizer when processing SUO messages.

---

## CORS Configuration

The API includes CORS headers to allow cross-origin requests from the dashboard:

```javascript
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization
Access-Control-Allow-Credentials: true
```

Adjust the `origin` check in `ApiServer.js` as needed for your production environment.

---

## Error Handling

All endpoints include proper error handling:

- **404 Not Found:** Resource not found (e.g., module state for non-existent module).
- **400 Bad Request:** Missing required fields in command request.
- **500 Internal Server Error:** Database or cache access errors.

Error responses follow this format:
```json
{
  "error": "Error description"
}
```
