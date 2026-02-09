# Dashboard API Documentation

## API & Integration Specification v1.2

This document describes the REST API endpoints used by the IoT Middleware Dashboard.

---

## Base URL

```
http://localhost:3000/api
```

---

## API Groups

The API is organized into logical groups based on their purpose and data source:

| Group | Endpoint Prefix | Description |
|-------|-----------------|-------------|
| **S** | `/api/*` | System API - Health and configuration |
| **A** | `/api/live/*` | Management API - Live state from cache |
| **E** | `/api/history/*` | History API - Historical data from database |

---

## Group S: System API

### GET `/api/health`

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

---

### GET `/api/config`

**Purpose:** Get system configuration (read-only view, secrets redacted).

**Response:**
```json
{
  "app": {
    "name": "IoT Middleware Pro",
    "version": "2.0.0"
  },
  "mqtt": {
    "brokerUrl": "mqtt://localhost:1883",
    "topics": {
      "v5008": "V5008Upload/#",
      "v6800": "V6800Upload/#"
    }
  },
  "modules": {
    "apiServer": {
      "enabled": true,
      "port": 3000,
      "features": {
        "management": true,
        "history": true
      }
    }
  }
}
```

---

## Group A: Management API (Hot Path)

### GET `/api/live/topology`

**Purpose:** List all active devices and their modules with live online status.
This endpoint merges data from the database (if enabled) with the live state cache.

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
    "isOnline": true,
    "lastSeenInfo": "2026-02-03T06:24:09.841Z",
    "modules": [
      {
        "moduleIndex": 2,
        "moduleId": "2349402517",
        "uTotal": 12,
        "fwVer": "35203",
        "isOnline": true,
        "lastSeenHb": "2026-02-03T06:24:09.841Z"
      }
    ]
  }
]
```

**Notes:**
- Devices not found in the live cache but present in the database will have `isOnline: false`
- Modules are sorted by `moduleIndex`

---

### GET `/api/live/devices/{deviceId}/modules/{moduleIndex}`

**Purpose:** Get full snapshot (UOS) of a specific rack/module.

**Parameters:**
- `deviceId` (path): Device ID
- `moduleIndex` (path): Module index (0-5 for V5008, 1-5 for V6800)

**Response:**
```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "moduleIndex": 2,
  "moduleId": "2349402517",
  "isOnline": true,
  "lastSeenHb": "2026-02-03T06:24:09.841Z",
  "rfidSnapshot": [
    {
      "sensorIndex": 1,
      "tagId": "AABBCCDD",
      "isAlarm": false
    }
  ],
  "tempHum": [
    {
      "sensorIndex": 1,
      "temp": 24.5,
      "hum": 50.0
    }
  ],
  "noiseLevel": [
    {
      "sensorIndex": 1,
      "noise": 45.2
    }
  ],
  "doorState": 0,
  "door1State": null,
  "door2State": null,
  "lastSeenRfid": "2026-02-03T06:24:09.841Z",
  "lastSeenTh": "2026-02-03T06:24:09.841Z",
  "lastSeenNs": "2026-02-03T06:24:09.841Z",
  "lastSeenDoor": "2026-02-03T06:24:09.841Z"
}
```

---

### POST `/api/commands`

**Purpose:** Send a control command to a specific device.

**Request Body:**
```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "messageType": "SET_COLOR",
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
- **202 Accepted:** Command validated and queued
- **400 Bad Request:** Missing required fields

---

## Group E: History API (Cold Path)

**Note:** These endpoints are only available when the storage module is enabled. If disabled, they return `501 Not Implemented`.

### GET `/api/history/events`

**Purpose:** List RFID/Door events from the database.

**Query Parameters:**
- `deviceId` (optional): Filter by device ID
- `moduleIndex` (optional): Filter by module index
- `eventType` (optional): Filter by type (`rfid` or `door`)
- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:** Array of event objects with `eventType` field indicating the source table.

---

### GET `/api/history/telemetry`

**Purpose:** List environmental telemetry data (temp/humidity/noise) from the database.

**Query Parameters:**
- `deviceId` (optional): Filter by device ID
- `moduleIndex` (optional): Filter by module index
- `type` (optional): Filter by type (`temp_hum` or `noise`)
- `startTime` (optional): Start of time range (ISO 8601)
- `endTime` (optional): End of time range (ISO 8601)
- `limit` (optional): Max records (default: 100)

**Response:** Array of telemetry records with `telemetryType` field indicating the source table.

---

### GET `/api/history/audit`

**Purpose:** List configuration change events (topology changes).

**Query Parameters:**
- `deviceId` (optional): Filter by device ID
- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:** Array of topology change events from `iot_topchange_event`.

---

### GET `/api/history/devices`

**Purpose:** List devices from the database (historical view).

**Query Parameters:**
- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:** Array of device metadata from `iot_meta_data`.

---

## Deprecated Endpoints

The following endpoints are deprecated and will be removed in a future version:

| Deprecated Endpoint | Replacement |
|---------------------|-------------|
| `GET /api/devices` | `GET /api/live/topology` |
| `GET /api/devices/:id/modules/:idx/state` | `GET /api/live/devices/:id/modules/:idx` |
| `GET /api/devices/:id/modules` | `GET /api/live/topology` |
| `GET /api/uos/:id/:idx` | `GET /api/live/devices/:id/modules/:idx` |
| `GET /api/meta/:id` | `GET /api/live/topology` |

---

## Error Responses

All endpoints follow standard HTTP status codes:

| Status | Description |
|--------|-------------|
| 200 OK | Successful GET request |
| 202 Accepted | Command queued successfully |
| 400 Bad Request | Invalid request parameters |
| 404 Not Found | Resource not found |
| 501 Not Implemented | History API when storage disabled |
| 500 Internal Server Error | Server error |

**Error Response Format:**
```json
{
  "error": "Error description"
}
```
