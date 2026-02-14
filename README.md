# IoT Middleware Pro v2.0

> High-throughput integration layer unifying data from heterogeneous IoT Gateways (V5008/Binary and V6800/JSON) into a standardized format for real-time dashboards and historical SQL storage.

---

## 📚 Documentation

This project maintains **As-Built Specifications** in the `docs/` folder. These documents are verified against the actual source code and represent the current implementation.

| Document | Description |
|----------|-------------|
| [docs/middleware_spec.md](docs/middleware_spec.md) | Architecture, API specification, Command Service, Database Schema |
| [docs/message_map_spec.md](docs/message_map_spec.md) | Field transformations: RAW → SIF → SUO → DB |
| [docs/normalizer_spec.md](docs/normalizer_spec.md) | UnifyNormalizer, SmartHeartbeat, CacheWatchdog logic |
| [docs/v5008_parser_spec.md](docs/v5008_parser_spec.md) | V5008 Binary Parser (quick reference) |
| [docs/v6800_parser_spec.md](docs/v6800_parser_spec.md) | V6800 JSON Parser (quick reference) |
| [docs/dashboard_spec.md](docs/dashboard_spec.md) | React Dashboard frontend specification |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        IoT Middleware Pro v2.0                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌────────────────┐ │
│  │  MQTT    │ →  │ V5008/   │ →  │   Unify      │ →  │   Storage      │ │
│  │  Broker  │    │ V6800    │    │ Normalizer   │    │   Service      │ │
│  │          │    │ Parser   │    │              │    │   (MySQL)      │ │
│  └──────────┘    └──────────┘    │ - StateCache │    └────────────────┘ │
│                                  │ - SmartHB    │    ┌────────────────┐ │
│         ↓                        │ - Watchdog   │ →  │   ApiServer    │ │
│    V5008Upload/                  └──────────────┘    │   (REST API)   │ │
│    V6800Upload/                      ↓               └────────────────┘ │
│                                  data.normalized     ┌────────────────┐ │
│                                                         WebSocket    │ │
│                                                         Server       │ │
│                                                      └────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                           ┌────────────────┐
                           │    Dashboard   │
                           │  (React/Vite)  │
                           └────────────────┘
```

**Data Flow:** MQTT Ingest → Parse (SIF) → Normalize (SUO) → Distribute (Storage/API/WebSocket)

---

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- MySQL 8.0
- MQTT Broker (e.g., Mosquitto)

### 1. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install dashboard dependencies
cd dashboard
npm install
cd ..
```

### 2. Configure Database

```bash
# Create database and tables
mysql -u root -p < database/schema.sql
```

### 3. Configure Environment

Edit `config/default.json`:

```json
{
  "mqtt": {
    "brokerUrl": "mqtt://localhost:1883"
  },
  "modules": {
    "database": {
      "connection": {
        "host": "localhost",
        "user": "root",
        "password": "your-password",
        "database": "iot_middleware"
      }
    },
    "normalizer": {
      "smartHeartbeat": {
        "enabled": true,
        "staggerDelay": 500,
        "stalenessThresholds": {
          "tempHum": 5,
          "rfid": 60
        }
      }
    }
  }
}
```

### 4. Start the Middleware

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```

The middleware will start:
- REST API on port 3000
- WebSocket Server on port 3001

### 5. Start the Dashboard

```bash
cd dashboard

# Development mode
npm run dev

# Open http://localhost:5173
```

---

## 🔌 REST API

### System Health
```bash
GET http://localhost:3000/api/health
```

### Device Topology
```bash
GET http://localhost:3000/api/live/topology
```

### Module State
```bash
GET http://localhost:3000/api/live/devices/{deviceId}/modules/{moduleIndex}
```

### Send Command
```bash
POST http://localhost:3000/api/commands
Content-Type: application/json

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

**Full API documentation:** [docs/middleware_spec.md](docs/middleware_spec.md)

---

## ⚙️ Configuration Options

### SmartHeartbeat (Data Warmup)

SmartHeartbeat automatically queries devices for missing or stale data during heartbeat processing:

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable automatic data queries |
| `staggerDelay` | `500` | ms between command emissions |
| `stalenessThresholds.tempHum` | `5` | Minutes before temp/hum considered stale |
| `stalenessThresholds.rfid` | `60` | Minutes before RFID snapshot considered stale |

**When disabled (`enabled: false`):**
- Basic self-healing still works:
  - Queries for missing `ip`/`mac` (all devices)
  - Queries for missing `fwVer` (V5008 only, via `QRY_MODULE_INFO`)
- No automatic queries for temp/humidity, RFID, or door state
- Cache warms up naturally as devices report data

**Full configuration reference:** [config/default.json](config/default.json)

---

## 📡 WebSocket Protocol

**Endpoint:** `ws://localhost:3001`

The WebSocket broadcasts SUO (Standard Unified Object) messages immediately after normalization:

```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",
  "messageType": "TEMP_HUM",
  "messageId": "755052881",
  "moduleIndex": 1,
  "moduleId": "3963041727",
  "payload": [
    { "sensorIndex": 10, "temp": 24.5, "hum": 50.1 }
  ]
}
```

---

## 🗄️ Database Schema

**Schema Version:** 2.1.0

Key tables:

| Table | Purpose | `message_id` |
|-------|---------|--------------|
| `iot_meta_data` | Device metadata (UPSERT on device_id) | - |
| `iot_temp_hum` | Temperature/humidity (pivoted columns 10-15) | Optional |
| `iot_noise_level` | Noise levels (pivoted columns 16-18) | Optional |
| `iot_rfid_event` | RFID attach/detach events | **Required** |
| `iot_door_event` | Door state changes | **Required** |
| `iot_heartbeat` | Device heartbeats | Optional |
| `iot_cmd_result` | Command responses | **Required** |
| `iot_topchange_event` | Configuration change audit log | **Required** |

**Timestamp Semantics:**
- `parse_at`: SUO creation time (when message was parsed)
- `update_at`: DB operation time (when record was inserted/updated)

**Full schema:** [database/schema.sql](database/schema.sql)  
**Field Mappings:** [docs/message_map_spec.md](docs/message_map_spec.md)

---

## 📁 Project Structure

```
iot-middleware-pro/
├── config/
│   └── default.json              # Main configuration
├── dashboard/                    # React/Vite frontend
│   ├── src/
│   │   ├── api/                  # API client & endpoints
│   │   ├── components/           # UI components
│   │   ├── hooks/                # Custom React hooks
│   │   └── store/                # Zustand store
│   └── App.tsx                   # Main app component
├── database/
│   └── schema.sql                # MySQL schema
├── docs/                         # As-Built Specifications
│   ├── middleware_spec.md
│   ├── message_map_spec.md
│   ├── normalizer_spec.md
│   ├── v5008_parser_spec.md
│   ├── v6800_parser_spec.md
│   └── dashboard_spec.md
├── src/
│   ├── core/                     # Core infrastructure
│   │   ├── Database.js           # Knex.js MySQL pool
│   │   ├── EventBus.js           # Event emitter
│   │   └── ModuleManager.js      # Lifecycle manager
│   └── modules/
│       ├── ingress/
│       │   └── MqttSubscriber.js # MQTT listener
│       ├── parsers/
│       │   ├── V5008Parser.js    # Binary protocol parser
│       │   ├── V6800Parser.js    # JSON protocol parser
│       │   └── ParserManager.js  # Parser router
│       ├── normalizer/
│       │   ├── UnifyNormalizer.js
│       │   ├── StateCache.js
│       │   ├── SmartHeartbeat.js
│       │   └── CacheWatchdog.js
│       ├── storage/
│       │   └── StorageService.js # Batch writer
│       ├── command/
│       │   └── CommandService.js # Outbound commands
│       └── output/
│           ├── ApiServer.js      # REST API
│           ├── WebSocketServer.js
│           ├── MqttRelay.js
│           └── WebhookService.js
└── tests/                        # Test scripts
```

---

## 🧪 Testing

```bash
# Run Jest tests
npm test

# Run V5008 parser verification
node tests/verify_v5008.js

# Run V6800 parser verification
node tests/verify_v6800.js

# Run pipeline validation
node tests/verify_pipeline.js
```

---

## 🔧 Supported Devices

### V5008 (Binary Protocol)

- Max 5 modules per gateway
- Temperature/Humidity sensors (indices 10-15)
- Noise sensors (indices 16-18)
- RFID U-position sensors (indices 1-54)
- Single door sensor

### V6800 (JSON Protocol)

- Max 24 modules per gateway
- Temperature/Humidity sensors
- RFID U-position sensors
- Single or Dual door sensors

---

## 📄 License

[Your License Here]

---

## 🤝 Contributing

Please read [AGENTS.md](AGENTS.md) for coding conventions and project guidelines.
