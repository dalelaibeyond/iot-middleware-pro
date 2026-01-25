# IoT Middleware Pro v2.0

A high-throughput integration layer that unifies data from heterogeneous IoT Gateways (V5008/Binary and V6800/JSON) into a standardized format for real-time dashboards and historical SQL storage.

## Features

- **Multi-Protocol Support**: Handles both V5008 (binary) and V6800 (JSON) gateway formats
- **Event-Driven Architecture**: Modular monolith with event bus for loose coupling
- **Real-time Processing**: MQTT-based ingress with WebSocket output for live dashboards
- **Data Normalization**: Converts device-specific formats to standardized unified objects (SUO)
- **State Management**: In-memory cache for device state and metadata
- **Batch Storage**: Optimized MySQL storage with pivoted tables for telemetry data
- **REST API**: Express.js backend for dashboard integration
- **Command Support**: Outbound commands for device control and synchronization

## Tech Stack

- **Runtime**: Node.js v18+
- **Language**: JavaScript (CommonJS)
- **Architecture**: Modular Monolith (Event-Driven)
- **Database**: MySQL 8.0 (Library: `knex` + `mysql2`)
- **Transport**: MQTT (Library: `mqtt`)
- **API**: Express.js
- **Logging**: Winston

## Installation

```bash
npm install
```

## Configuration

Edit `src/config/default.json` to configure:

- MQTT broker connection
- Database connection
- Module settings (storage, webhook, API, WebSocket, etc.)

## Database Setup

Execute the database schema:

```bash
mysql -u root -p iot_middleware < database/schema.sql
```

## Running

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Project Structure

```
src/
├── core/
│   ├── EventBus.js          # Events: mqtt.message, data.normalized, command.request
│   ├── Database.js          # Knex.js MySQL connection pool
│   └── ModuleManager.js     # Lifecycle manager
├── modules/
│   ├── ingress/
│   │   └── MqttSubscriber.js # Inbound listener
│   ├── parsers/
│   │   ├── V5008Parser.js    # Implements V5008Parser_Spec
│   │   ├── V6800Parser.js    # Implements V6800Parser_Spec
│   │   └── ParserManager.js  # Router
│   ├── normalizer/
│   │   ├── UnifyNormalizer.js # Implements UnifyNormalizer_Spec
│   │   ├── StateCache.js      # Dual-Purpose Cache (Logic + API)
│   │   └── CacheWatchdog.js   # Offline Detection Service
│   ├── storage/
│   │   └── StorageService.js  # Batch Writer & Pivoting Logic
│   ├── command/
│   │   └── CommandService.js  # Outbound Commands (Sync/Control)
│   └── output/
│       ├── MqttRelay.js
│       ├── WebhookService.js
│       ├── ApiServer.js       # Dashboard Backend
│       └── WebSocketServer.js # Real-time feed
└── config/
    └── default.json
```

## Data Flow

1. **Ingest**: `MqttSubscriber` → `mqtt.message` event
2. **Parse**: `ParserManager` selects Parser → Returns **SIF** (Standard Intermediate Format)
3. **Normalize**: `UnifyNormalizer` converts SIF → **SUO** (Standard Unified Object)
4. **Distribute**: Emits `data.normalized` event
5. **Output**: `StorageService`, `WebSocketServer`, `ApiServer` consume `data.normalized`

## API Endpoints

- `GET /api/health` - System health check
- `GET /api/config` - System configuration (passwords redacted)
- `GET /api/devices` - List all devices
- `GET /api/devices/:deviceId/modules/:moduleIndex/state` - Module state
- `POST /api/commands` - Send control commands

## V6800Parser Usage

The V6800Parser converts JSON messages from V6800 devices into Standard Intermediate Format (SIF).

### Basic Usage

```javascript
const V6800Parser = require("./src/modules/parsers/V6800Parser");

// Example: Parse a heartbeat message
const topic = "V6800Upload/2105101125/heart_beat_req";
const message = {
  gateway_sn: "2105101125",
  msg_type: "heart_beat_req",
  uuid_number: 755052881,
  data: [
    {
      module_index: 4,
      module_sn: "3468672873",
      module_u_num: 12,
    },
  ],
};

const sif = V6800Parser.parse(topic, message);
console.log(sif);
```

### Output SIF Structure

```json
{
  "deviceType": "V6800",
  "deviceId": "2105101125",
  "messageType": "HEARTBEAT",
  "messageId": "755052881",
  "meta": {
    "topic": "V6800Upload/2105101125/heart_beat_req",
    "rawType": "heart_beat_req"
  },
  "data": [
    {
      "moduleIndex": 4,
      "moduleId": "3468672873",
      "uTotal": 12
    }
  ]
}
```

### Supported Message Types

| Message Type        | Raw `msg_type`                       | Description                           |
| ------------------- | ------------------------------------ | ------------------------------------- |
| HEARTBEAT           | heart_beat_req                       | Periodic heartbeat                    |
| RFID_SNAPSHOT       | u_state_resp                         | RFID tag snapshot                     |
| RFID_EVENT          | u_state_changed_notify_req           | RFID tag attach/detach event          |
| TEMP_HUM            | temper_humidity_exception_nofity_req | Temperature/humidity threshold change |
| QRY_TEMP_HUM_RESP   | temper_humidity_resp                 | Temperature/humidity query response   |
| DOOR_STATE          | door_state_changed_notify_req        | Door state change event               |
| QRY_DOOR_STATE_RESP | door_state_resp                      | Door state query response             |
| DEV_MOD_INFO        | devies_init_req                      | Device/module information             |
| UTOTAL_CHANGED      | devices_changed_req                  | Module configuration change           |
| QRY_CLR_RESP        | u_color                              | Color query response                  |
| SET_CLR_RESP        | set_module_property_result_req       | Color set response                    |
| CLN_ALM_RESP        | clear_u_warning                      | Clear alarm response                  |

### Running Verification Tests

To verify the V6800Parser implementation:

```bash
node tests/verify_v6800.js
```

This will run 19 test cases covering all message types and edge cases.

## License

MIT
