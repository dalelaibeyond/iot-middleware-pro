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
| Component | Technology |
|-----------|------------|
| Runtime | Node.js v18+ |
| Backend Language | JavaScript (CommonJS) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Database | MySQL 8.0 (Knex.js + mysql2) |
| Transport | MQTT (mqtt library) |
| API | Express.js |
| Testing | Jest |

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
│   └── index.js                   # Application entry point
├── dashboard/                     # React/Vite frontend
│   ├── App.tsx                    # Main app component
│   ├── components/                # UI components
│   ├── hooks/                     # Custom React hooks
│   ├── store/                     # Zustand store
│   └── src/api/                   # API client
├── database/
│   └── schema.sql                 # MySQL schema
├── tests/                         # Test files
└── openspec/                      # Architecture specifications
    ├── AGENTS.md                  # OpenSpec agent personas
    └── specs/                     # Detailed specifications
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
- **V5008Parser.js**: Parses binary format → SIF
- **V6800Parser.js**: Parses JSON format → SIF
- **Output**: SIF (Standard Intermediate Format):
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

## 4. Code Style & Conventions

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
- **Hooks pattern**: Use `useState`, `useEffect`, custom hooks (`useSocket`, `useIoTStore`)
- **Component design**: Atomic Design principles—small, reusable components in `dashboard/components/{layout,rack,ui}/`
- **State merging**: Context-aware updates—ignore SUOs for inactive devices using `get()` to check active context

### Configuration
- Load via `const config = require("config")` then `config.get("modules.storage.enabled")`
- **Never hardcode credentials**—all secrets come from `config/default.json`
- **Per-module config**: Each module receives config in `initialize(moduleConfig)` parameter
- **Enable/disable pattern**: Check `moduleConfig.enabled === false` before starting

---

## 5. Build & Test Commands

### Backend (Node.js)
```bash
npm install              # Install dependencies
npm start                # Run production server
npm run dev              # Run with auto-reload (nodemon)
npm test                 # Run Jest tests
```

### Frontend (React/Vite)
```bash
cd dashboard
npm install              # Install dashboard dependencies
npm run dev              # Start dev server (http://localhost:5173)
npm run build            # Build for production
npm run preview          # Preview production build
```

### Database Setup
```bash
mysql -u root -p < database/schema.sql
```

### Key Test Files
- `tests/test_api_commands_simple.js`: Command API testing pattern
- `tests/verify_pipeline.js`: End-to-end pipeline validation
- `tests/test_mqtt_subscriber.js`: MQTT listener pattern
- `tests/verify_v6800.js`: V6800 parser verification (19 test cases)

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

## 7. Integration Points

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
- **Validation**: `validateWebSocketMessage()` before merging to Zustand store

### Command Egress
- Dashboard submits to `POST /api/command`
- `CommandService.js` handles async device control
- Publishes to `V5008Download/{deviceId}` or `V6800Download/{deviceId}`

---

## 8. Security & Error Handling

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

## 9. Testing Approach

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

---

## 10. OpenSpec Guidelines

**Always open `@/openspec/AGENTS.md` when the request:**
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

**Use `@/openspec/AGENTS.md` to:**
- Understand how to create and apply change proposals
- Learn the formal spec format and conventions
- Reference project structure guidelines and agency roles

**Available Agent Personas:**
- `@agent:architect` - Senior System Architect (project structure, consistency)
- `@agent:backend` - Senior Node.js IoT Engineer (parsing, DB optimization)
- `@agent:frontend` - Senior React Developer (dashboards, state management)
- `@agent:qa` - Quality Assurance Engineer (edge cases, security)

**Key Spec Files:**
- `openspec/specs/01-architecture.md` - Master blueprint
- `openspec/specs/02-v5008-parser.md` - V5008 binary parser spec
- `openspec/specs/03-V6800-parser.md` - V6800 JSON parser spec
- `openspec/specs/04-normalizer.md` - Normalization logic

**Skip OpenSpec for:**
- Simple bug fixes with clear intent
- Adding logging or documentation
- Refactoring internal implementation (no API/schema changes)

---

## 11. Quick Reference

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
- Frontend env: `dashboard/.env` (copy from `.env.example`)

### Port Allocations
- API Server: 3000
- WebSocket Server: 3001
- MQTT Broker: 1883 (configurable)
- Dashboard Dev: 5173 (Vite default)

<!-- OPENSPEC:START - Maintain this block for automated spec sync -->
<!-- OPENSPEC:END -->
