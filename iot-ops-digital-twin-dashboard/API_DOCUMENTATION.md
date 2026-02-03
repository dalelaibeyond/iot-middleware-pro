# IoT Ops Dashboard API Documentation

## Overview

This document describes the API integration between the IoT Ops Dashboard and the IoT Middleware. The dashboard connects to the middleware via REST API for initial data fetching and WebSocket for real-time updates.

## API Endpoints

### 1. Get Devices

**Endpoint**: `GET /api/devices`

**Description**: Fetches the list of all devices with their metadata and active modules.

**Response**:

```json
[
  {
    "deviceId": "DC01-RACK-08",
    "deviceType": "V6800-IoT",
    "ip": "192.168.1.108",
    "fwVer": "v2.4.1-stable",
    "isOnline": true,
    "activeModules": [
      {
        "moduleIndex": 0,
        "moduleId": "R08-A",
        "uTotal": 42
      },
      {
        "moduleIndex": 1,
        "moduleId": "R08-B",
        "uTotal": 42
      }
    ]
  }
]
```

### 2. Get Rack State

**Endpoint**: `GET /api/devices/{deviceId}/modules/{moduleIndex}/state`

**Description**: Fetches the current state of a specific rack (device module).

**Parameters**:

- `deviceId` (string): The ID of the device
- `moduleIndex` (number): The index of the module/rack

**Response**:

```json
{
  "deviceId": "DC01-RACK-08",
  "moduleIndex": 0,
  "isOnline": true,
  "lastSeen_hb": "2023-01-01T12:00:00.000Z",
  "rfid_snapshot": [
    {
      "sensorIndex": 0,
      "tagId": "TAG-12345",
      "isAlarm": false
    }
  ],
  "temp_hum": [
    {
      "sensorIndex": 0,
      "temp": 24.5,
      "hum": 50
    }
  ],
  "noise_level": [
    {
      "sensorIndex": 0,
      "noise": 45
    }
  ],
  "doorState": null,
  "door1State": 0,
  "door2State": 0
}
```

### 3. Send Command

**Endpoint**: `POST /api/commands`

**Description**: Sends a control command to a specific device.

**Request Body**:

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

**Response**:

```json
{
  "status": "sent",
  "commandId": "cmd-12345"
}
```

### 4. Health Check

**Endpoint**: `GET /api/health`

**Description**: Checks the health status of the middleware.

**Response**:

```json
{
  "status": "ok",
  "services": {
    "database": "connected",
    "mqtt": "connected",
    "websocket": "running"
  }
}
```

## WebSocket Connection

### Connection URL

**Default**: `ws://localhost:3001`
**Configurable via**: `VITE_WS_URL` environment variable

### Message Format

All WebSocket messages follow the SUO (Standard Unified Object) format:

```json
{
  "messageType": "MESSAGE_TYPE",
  "deviceId": "DEVICE_ID",
  "moduleIndex": 0,
  "payload": { ... }
}
```

### Message Types

#### 1. DEVICE_METADATA

Updates device metadata information.

```json
{
  "messageType": "DEVICE_METADATA",
  "deviceId": "DC01-RACK-08",
  "payload": {
    "ip": "192.168.1.108",
    "fwVer": "v2.4.2-stable",
    "isOnline": true
  }
}
```

#### 2. HEARTBEAT

Indicates the device is still online.

```json
{
  "messageType": "HEARTBEAT",
  "deviceId": "DC01-RACK-08",
  "payload": {}
}
```

#### 3. TEMP_HUM

Updates temperature and humidity readings.

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

#### 4. RFID_SNAPSHOT

Updates RFID tag information.

```json
{
  "messageType": "RFID_SNAPSHOT",
  "deviceId": "DC01-RACK-08",
  "moduleIndex": 0,
  "payload": [
    {
      "sensorIndex": 0,
      "tagId": "TAG-12345",
      "isAlarm": false
    }
  ]
}
```

#### 5. DOOR_STATE

Updates door status.

```json
{
  "messageType": "DOOR_STATE",
  "deviceId": "DC01-RACK-08",
  "moduleIndex": 0,
  "payload": {
    "door1State": 0,
    "door2State": 0
  }
}
```

#### 6. NOISE

Updates noise level readings.

```json
{
  "messageType": "NOISE",
  "deviceId": "DC01-RACK-08",
  "moduleIndex": 0,
  "payload": {
    "sensorIndex": 0,
    "noise": 45
  }
}
```

#### 7. META_CHANGED_EVENT

Notification that metadata has changed.

```json
{
  "messageType": "META_CHANGED_EVENT",
  "deviceId": "DC01-RACK-08",
  "payload": {
    "message": "Device configuration updated"
  }
}
```

## Error Handling

### HTTP Status Codes

- `200 OK`: Successful request
- `202 Accepted`: Command accepted for processing
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

### WebSocket Error Handling

The dashboard implements automatic reconnection with exponential backoff:

- Initial reconnection attempt: 2 seconds
- Subsequent attempts: 4, 8, 16, 32 seconds
- Maximum attempts: 5

## Data Validation

All API responses and WebSocket messages are validated against TypeScript interfaces to ensure data integrity:

- `DeviceMetadata`: Validates device list responses
- `RackState`: Validates rack state responses
- `SUOUpdate`: Validates WebSocket messages

Invalid data is logged to the console and rejected to prevent UI errors.

## Environment Configuration

### Required Environment Variables

- `VITE_API_URL`: Base URL for API requests (default: `http://localhost:3000`)
- `VITE_WS_URL`: WebSocket connection URL (default: `ws://localhost:3001`)

### Optional Environment Variables

- `VITE_APP_TITLE`: Application title (default: `IoT Ops Dashboard`)
- `VITE_APP_VERSION`: Application version (default: `1.2.0`)

## Development Setup

1. Copy `.env.example` to `.env.local`
2. Configure the environment variables for your middleware instance
3. Run `npm run dev` to start the development server
4. The dashboard will connect to the middleware using the configured URLs

## Production Deployment

1. Set the appropriate environment variables for your production environment
2. Run `npm run build` to create the production build
3. Deploy the `dist` folder to your web server
4. Configure your web server to serve the application and proxy API requests if needed

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if the middleware is running
   - Verify the API and WebSocket URLs in your environment configuration

2. **CORS Errors**
   - Ensure the middleware allows requests from your dashboard domain
   - Check the CORS configuration on the middleware

3. **Data Not Updating**
   - Verify WebSocket connection is established
   - Check browser console for WebSocket errors
   - Ensure the middleware is emitting data updates

4. **Authentication Errors**
   - Check if authentication is required by the middleware
   - Verify authentication tokens are being sent with requests

### Debug Mode

Enable debug mode by setting `localStorage.debug = 'true'` in the browser console. This will:

- Log all API requests and responses
- Log all WebSocket messages
- Show detailed error information
