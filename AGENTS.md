# AI Agent Workspace Instructions

## 1. Project Overview

**IoT Middleware Pro v2.0** is a high-throughput integration layer that unifies data from heterogeneous IoT Gateways (V5008/Binary and V6800/JSON) into a standardized format for real-time dashboards and historical SQL storage.

### Key Features
- **Multi-Protocol Support**: Handles both V5008 (binary) and V6800 (JSON) gateway formats
- **Event-Driven Architecture**: Modular monolith with event bus for loose coupling
- **Real-time Processing**: MQTT-based ingress with WebSocket output for live dashboards
- **Data Normalization**: Converts device-specific formats to standardized unified objects (SUO)
- **Batch Storage**: Optimized MySQL storage with pivoted tables for telemetry data
- **Command Support**: Outbound commands for device control and synchronization

### Technology Stack

#### Backend
| Component | Technology |
|-----------|------------|
| Runtime | Node.js v18+ |
| Language | JavaScript (CommonJS) |
| Database | MySQL 8.0 (Knex.js + mysql2) |
| Transport | MQTT (mqtt library) |
| API | Express.js |
| Logging | Winston |
| Testing | Jest |

#### Frontend (Dashboard)
| Component | Technology |
|-----------|------------|
| Framework | React 19 |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| State Management | Zustand |
| HTTP Client | Axios |
| Icons | Lucide React |

---

## 2. Project Structure

```
iot-middleware-pro/
├── config/
│   └── default.json              # Main configuration file
├── src/
│   ├── core/
│   │   ├── EventBus.js           # Central event emitter (pub/sub)
│   │   ├── Database.js           # Knex.js MySQL connection pool
│   │   └── ModuleManager.js      # Module lifecycle manager
│   ├── modules/
│   │   ├── ingress/
│   │   │   └── MqttSubscriber.js # MQTT inbound listener
│   │   ├── parsers/
│   │   │   ├── V5008Parser.js    # Binary protocol parser
│   │   │   ├── V6800Parser.js    # JSON protocol parser
│   │   │   └── ParserManager.js  # Parser router
│   │   ├── normalizer/
│   │   │   ├── UnifyNormalizer.js # SIF → SUO converter
│   │   │   ├── StateCache.js      # In-memory state cache
│   │   │   └── CacheWatchdog.js   # Offline detection
│   │   ├── storage/
│   │   │   └── StorageService.js  # Batch writer & pivoting
│   │   ├── command/
│   │   │   └── CommandService.js  # Outbound device commands
│   │   └── output/
│   │       ├── ApiServer.js       # REST API (port 3000)
│   │       ├── WebSocketServer.js # Real-time feed (port 3001)
│   │       ├── MqttRelay.js       # MQTT relay output
│   │       └── WebhookService.js  # Webhook notifications
│   └── index.js                  # Application entry point
├── dashboard/                    # React/Vite frontend
│   ├── App.tsx                   # Main app component
│   ├── components/               # UI components
│   │   ├── layout/               # Layout components (Sidebar, TopBar)
│   │   ├── rack/                 # Rack visualization components
│   │   └── ui/                   # UI primitives (Badge, ErrorDisplay, etc.)
│   ├── hooks/                    # Custom React hooks
│   ├── store/                    # Zustand store
│   ├── services/                 # API services
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── database/
│   └── schema.sql                # MySQL schema
├── tests/                        # Test files
│   ├── verify_v6800.js           # V6800 parser verification (19 test cases)
│   ├── verify_pipeline.js        # End-to-end pipeline validation
│   └── test_*.js                 # Various test scripts
└── openspec/                     # Architecture specifications
    ├── AGENTS.md                 # OpenSpec agent personas
    └── specs/                    # Detailed specifications
```

---

## 3. Architecture: Event-Driven Pipeline

The system follows a **4-stage data flow**:

```
Ingest (MQTT) → Parse (SIF) → Normalize (SUO) → Distribute (Storage/API/WS)
```

### Stage 1: Ingest
- **MqttSubscriber.js** listens to MQTT topics (`V5008Upload/#`, `V6800Upload/#`)
- Emits `mqtt.message` event with raw payload

### Stage 2: Parse
- **ParserManager.js** routes to appropriate parser based on topic prefix
- **V5008Parser.js**: Parses binary format → SIF (Standard Intermediate Format)
- **V6800Parser.js**: Parses JSON format → SIF
- **Output**: SIF structure:
  ```javascript
  {
    deviceId: "string",
    deviceType: "V5008|V6800",
    messageType: "HEARTBEAT|RFID_SNAPSHOT|...",
    messageId: "string",
    meta: { topic, rawHex, rawType },
    data: [] // Parsed payload
  }
  ```

### Stage 3: Normalize
- **UnifyNormalizer.js** converts SIF → SUO (Standard Unified Object)
- **StateCache.js**: Dual-purpose in-memory cache (logic + API reads)
- **Output**: SUO with normalized field names:
  ```javascript
  {
    deviceId: "string",
    deviceType: "V5008|V6800",
    messageType: "string",
    messageId: "string",
    moduleIndex: number,
    moduleId: "string",
    payload: [] // ALWAYS an array
  }
  ```

### Stage 4: Distribute
- **StorageService.js**: Batch buffers SUOs, flushes to MySQL
- **ApiServer.js**: REST endpoints (reads from StateCache)
- **WebSocketServer.js**: Real-time feed for dashboard
- **MqttRelay.js**: Optional SUO relay back to MQTT

### EventBus (Core)
Located in `src/core/EventBus.js` - Singleton pub/sub with typed methods:
- `emitMqttMessage(payload)` / `onMqttMessage(handler)`
- `emitDataNormalized(suo)` / `onDataNormalized(handler)`
- `emitCommandRequest(command)` / `onCommandRequest(handler)`
- `emitError(error, source)` / `onError(handler)`

### Module Initialization Order
From `src/core/ModuleManager.js`:
```
database → eventBus → stateCache → mqttSubscriber → parserManager → normalizer → storage → command → apiServer → webSocketServer → cacheWatchdog
```

---

## 4. Build & Test Commands

### Backend (Node.js)
```bash
# Install dependencies
npm install

# Run production server
npm start

# Run with auto-reload (nodemon)
npm run dev

# Run Jest tests
npm test
```

### Frontend (React/Vite)
```bash
cd dashboard

# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Database Setup
```bash
mysql -u root -p < database/schema.sql
```

### Key Test Files
- `tests/verify_v6800.js`: V6800 parser verification (19 test cases)
- `tests/verify_pipeline.js`: End-to-end pipeline validation
- `tests/test_mqtt_subscriber.js`: MQTT listener pattern
- `tests/test_api_commands_simple.js`: Command API testing pattern

---

## 5. Code Style & Conventions

### JavaScript (Backend: CommonJS)
- **Module format**: `require()`/`module.exports` (CommonJS, not ESM)
- **Async patterns**: Always use `async/await` with `try/catch` blocks for I/O operations
- **Classes**: All modules are ES6 classes with lifecycle methods:
  ```javascript
  class Module {
    async initialize(config) { }
    async start() { }
    async stop() { }
  }
  ```
- **Error handling**: Never throw on parse errors—return `null` and log via `EventBus.emitError()`. All catches must emit to `EventBus`.
- **Logging**: Use `console.log()/console.error()` with bracket prefix format:
  ```javascript
  console.log("[ModuleName] message");
  console.error("[V5008Parser] Error:", error.message);
  ```

### TypeScript (Frontend: React)
- **Stack**: React 19 + Vite + Tailwind CSS + Zustand
- **Hooks pattern**: Use `useState`, `useEffect`, custom hooks (`useSocket`, `useDeviceStore`)
- **Component design**: Atomic Design principles—small, reusable components in `dashboard/components/{layout,rack,ui}/`
- **State merging**: Context-aware updates—ignore SUOs for inactive devices using `get()` to check active context

### Configuration
- Load via `const config = require("config")` then `config.get("modules.storage.enabled")`
- **Never hardcode credentials**—all secrets come from `config/default.json` or environment variables
- **Per-module config**: Each module receives config in `initialize(moduleConfig)` parameter
- **Enable/disable pattern**: Check `moduleConfig.enabled === false` before starting

---

## 6. Database Patterns

### Connection & Pool
- **Database.js**: Knex.js singleton with mysql2 driver
- Pool config: `min: 2, max: 10` connections, 30-second timeout
- Access via: `database.getConnection()('table_name')`

### Schema Design (`database/schema.sql`)
- **Pivoted telemetry**: Tables like `iot_temp_hum` store multiple sensor indices as columns (e.g., `temp_index10`, `temp_index11`)
- **JSON metadata**: `iot_meta_data.modules` stores array as JSON
- **Composite indexes**: `idx_th (device_id, module_index, parse_at DESC)` for time-range queries

### Key Tables
| Table | Purpose |
|-------|---------|
| `iot_meta_data` | Device metadata (UPSERT on device_id) |
| `iot_temp_hum` | Temperature/humidity (pivoted columns 10-15) |
| `iot_noise_level` | Noise levels (pivoted columns 16-18) |
| `iot_rfid_event` | RFID attach/detach events |
| `iot_rfid_snapshot` | Full RFID snapshots (JSON) |
| `iot_door_event` | Door state changes |
| `iot_heartbeat` | Device heartbeats |
| `iot_cmd_result` | Command results |
| `iot_topchange_event` | Topology change events |

### Write Pattern (StorageService.js)
1. Buffer SUOs in a Map keyed by table name
2. On timer (default 1000ms), batch insert all buffered records
3. Knex usage: `await db('table_name').insert(batchArray)`
4. Message type → table routing via switch statement

---

## 7. Testing Approach

- **Direct module calls**: Initialize modules with config, call methods with fixtures, no mocking library
- **Real dependencies**: Tests use real MQTT connections, real HTTP requests (Node's `http` module)
- **Fixture-driven**: Reuse config from `config/default.json` in tests

### Jest Configuration (`jest.config.js`)
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  moduleDirectories: ['node_modules', 'src'],
};
```

### Running Tests
```bash
# Run all Jest tests
npm test

# Run specific verification scripts
node tests/verify_v6800.js
node tests/verify_pipeline.js
node tests/test_api_commands_simple.js
```

---

## 8. Integration Points

### MQTT Ingress
- Topics configured in `config/default.json` (`mqtt.topics.v5008`, `mqtt.topics.v6800`)
- Handlers in `MqttSubscriber.onMqttMessage()` route to `ParserManager`
- V5008: Binary payload on `V5008Upload/{deviceId}/{suffix}`
- V6800: JSON payload on `V6800Upload/{deviceId}/{msg_type}`

### REST API (ApiServer.js)
| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | System health check |
| `GET /api/config` | System config (passwords redacted) |
| `GET /api/devices` | List all devices |
| `GET /api/devices/:deviceId/modules` | Get all modules for a device |
| `GET /api/devices/:deviceId/modules/:moduleIndex/state` | Module state from cache |
| `GET /api/uos/:deviceId/:moduleIndex` | Get telemetry (Unified Object Structure) |
| `GET /api/meta/:deviceId` | Get device metadata |
| `POST /api/commands` | Submit control commands |

### Command Request Format
```json
POST /api/commands
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

### WebSocket Feed
- **Client**: `dashboard/hooks/useSocket.ts` with exponential backoff (2s → 4s → 8s, max 5 attempts)
- **Server**: `src/modules/output/WebSocketServer.js` broadcasts SUOs to connected clients
- **Port**: 3001 (configurable in `config/default.json`)

### Command Egress
- Dashboard submits to `POST /api/commands`
- `CommandService.js` handles async device control
- Publishes to `V5008Download/{deviceId}` or `V6800Download/{deviceId}`

---

## 9. Security & Error Handling

### Input Validation
- **Binary parsing**: Validate buffer length before reading bytes—never trust external input
- **JSON parsing**: Verify required fields in SIF/SUO before normalization
- **SQL injection**: Use Knex.js parameterized queries only—never concatenate SQL strings

### Error Containment
- **No exceptions escape**: All I/O wrapped in `try/catch` with `EventBus.emitError()`
- **Graceful degradation**: Parse errors return `null`, normalizer skips bad data
- **Unhandled rejections**: Handled in `src/index.js` via `process.on('unhandledRejection', ...)`

### Logging
- **Never log credentials** or sensitive PII
- **Bracket-prefixed**: `[ModuleName]` helps grep and monitor logs
- **Temp debug**: Mark temp logs with `//TEMP-DEBUG:` comment for easy cleanup

---

## 10. Quick Reference

### Supported Message Types
| Type | V5008 | V6800 | Description |
|------|-------|-------|-------------|
| HEARTBEAT | ✓ | ✓ | Periodic heartbeat |
| RFID_SNAPSHOT | ✓ | ✓ | Full RFID state |
| RFID_EVENT | ✓ | ✓ | Tag attach/detach |
| TEMP_HUM | ✓ | ✓ | Temperature/humidity |
| NOISE_LEVEL | ✓ | ✗ | Noise sensor data |
| DOOR_STATE | ✓ | ✓ | Door open/close |
| DEVICE_INFO | ✓ | ✗ | Device metadata |
| MODULE_INFO | ✓ | ✗ | Module firmware |
| DEV_MOD_INFO | ✗ | ✓ | Device+module info |
| UTOTAL_CHANGED | ✗ | ✓ | Module config change |
| QRY_*_RESP | ✓ | ✓ | Query responses |
| SET_CLR_RESP | ✓ | ✓ | Set color response |
| CLN_ALM_RESP | ✓ | ✓ | Clear alarm response |

### Configuration File Locations
- Backend config: `config/default.json`
- Frontend env: `dashboard/.env.local` (copy from `.env.example`)

### Port Allocations
| Service | Port | Config Path |
|---------|------|-------------|
| API Server | 3000 | `modules.apiServer.port` |
| WebSocket Server | 3001 | `modules.webSocketServer.port` |
| MQTT Broker | 1883 | `mqtt.brokerUrl` |
| Dashboard Dev | 5173 | Vite default |

### Environment Variables (Dashboard)
```bash
# Copy and configure
cp dashboard/.env.example dashboard/.env.local

# Key variables
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3001
VITE_APP_TITLE=IoT Ops Dashboard
VITE_APP_VERSION=1.2.0
```

<!-- OPENSPEC:START - Maintain this block for automated spec sync -->
<!-- OPENSPEC:END -->
