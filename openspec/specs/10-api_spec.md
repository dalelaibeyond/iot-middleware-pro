# API Spec

Here is the **Final API & Integration Specification v1.2**.

I have replaced the old "Integration Scenarios" section with a comprehensive **"Section 5: API Usage Guide (Integration Strategies)"** that covers the scenarios we discussed.

---

### File Name: `api_spec.md`

# API & Integration Specification v1.2

**File Name:** `api_spec.md`

**Date:** 2/9/2026
**Scope:** Output Interfaces (REST, WebSocket, Webhook, MQTT)
**Status:** Final for Implementation

---

## 1. Architectural Philosophy: "Headless & Modular"

The IoT Middleware Pro is designed as a **Headless Engine**. It provides a "Menu" of interfaces that can be enabled or disabled based on the deployment environment.

- **Core Dependency:** The **State Cache (Memory/Redis)** is the "Heart". It must always be running. It provides the "Live State".
- **Optional Plugin:** The **Database (StorageService)** is the "Recorder". If disabled, History APIs must gracefully return "Not Implemented".
- **Consumer Choice:** App teams select the interface module that fits their technology stack.

---

## 2. Configuration Design (Demo only)

The system must support granular enabling/disabling of output modules via `config/default.json`.

Note, here is a demo to show enable or disable a module, it is NOT to say simplify to replace existing total logic.

```json
{
  "modules": {
    // 1. Core Logic (Mandatory)
    "ingress": { "enabled": true },
    "normalizer": { "enabled": true, "cacheType": "memory" },

    // 2. Output Interfaces (User Selectable)
    "apiServer": {
      "enabled": true,
      "port": 3000,
      "features": {
        "management": true, // Enables /api/live/* and /api/commands
        "history": true     // Enables /api/history/* (Requires Storage)
      }
    },
    "websocket": { "enabled": true, "port": 3001},
    "webhook": { "enabled": false },
    "mqttRelay": { "enabled": false },

    // 3. Persistence (Optional)
    "storage": { "enabled": true, "type": "mysql" }
  }
}
```

---

## 3. Interface Modules (The Menu)

### Group S: System API (Core)

- **Source:** Internal Process State.
- **Availability:** Always.
- **Use Case:** DevOps Monitoring, Frontend Feature Flagging.

| Method | Endpoint | Description | Logic |
| --- | --- | --- | --- |
| `GET` | `/api/health` | System Health Check. | Check DB connection (if enabled) and MQTT Client connection.<br>Return JSON: `{ status: "ok", db: "connected", mqtt: "connected" }`. |
| `GET` | `/api/config` | Public Configuration. | Return `globalConfig`.<br>**Security:** MUST redact passwords/secrets (e.g., DB password, MQTT credentials) before responding. |

### Group A: Management API (REST - Hot Path)

- **Source:** **State Cache** (Redis/Memory).
- **Availability:** Always (if `apiServer` is enabled).
- **Performance:** Ultra-low latency (<10ms).
- **Use Case:** Dashboards, Mobile Apps, initial state hydration.

| Method | Endpoint | Description | Logic |
| --- | --- | --- | --- |
| `GET` | `/api/live/topology` | List all active Devices & Modules. | 1. Query **DB** (if enabled) for known devices.<br>2. Query **Cache** (`device:*:info`) for live status.<br>3. **Merge:** Return full list. If missing in Cache, mark `isOnline: false`.<br>4. If both empty, return `[]`. |
| `GET` | `/api/live/devices/{id}/modules/{idx}` | Get Full Snapshot (UOS) of a specific rack. | Get Cache Key `device:{id}:module:{idx}`. Return JSON. |
| `POST` | `/api/commands` | Send Control Command. | Validate JSON → Emit `command.request` to EventBus. Return `202 Accepted`. |

### Group B: Real-Time API (WebSocket)

- **Source:** **EventBus** (`data.normalized`).
- **Availability:** Optional (Enabled via config).
- **Behavior:** Broadcasts **SUO** JSON immediately upon normalization.

### Group C: Notification API (Webhooks)

- **Source:** **EventBus** (`data.normalized`).
- **Availability:** Optional (Enabled via config).
- **Behavior:** Filters events based on config and POSTs SUO to target URL.

### Group D: Data Firehose (MQTT Relay)

- **Source:** **EventBus** (`data.normalized`).
- **Availability:** Optional (Enabled via config).
- **Behavior:** Republishes SUO to `mw/output/...` topics.

### Group E: History API (REST - Cold Path)

- **Source:** **Database** (MySQL).
- **Availability:** **Conditional**. Only available if `modules.storage.enabled` is `true`.

| Method | Endpoint | Description | Logic |
| --- | --- | --- | --- |
| `GET` | `/api/history/events` | List RFID/Door events. | Query `iot_rfid_event` / `iot_door_event` with Pagination. |
| `GET` | `/api/history/telemetry` | List Env Data. | Query `iot_temp_hum` / `iot_noise_level` with Time Range. |
| `GET` | `/api/history/audit` | List Config Changes. | Query `iot_topchange_event`. |
| `GET` | `/api/history/devices` | List devices in the db | Query `iot_meta_data`. |

---

## 4. Implementation Logic (For AI Coding)

### 4.1 `ApiServer.js` (Route Registration, Demo Only)

```jsx
// Pseudo-code Structure
async function start(config) {
  const app = express();

  // 1. Group S: System Routes (Always Load)
  app.use('/api', require('./routes/system')); // health, config

  // 2. Group A: Management Routes (Always Load)
  if (config.modules.apiServer.features.management) {
    app.use('/api/live', require('./routes/live'));
    app.use('/api/commands', require('./routes/commands'));
  }

  // 3. Group E: History Routes (Conditional)
  const storageEnabled = config.modules.storage && config.modules.storage.enabled;
  const historyRequested = config.modules.apiServer.features.history;

  if (historyRequested && storageEnabled) {
    app.use('/api/history', require('./routes/history'));
  } else if (historyRequested && !storageEnabled) {
    // 501 Handler
    app.use('/api/history', (req, res) =>
      res.status(501).json({ error: "Storage module disabled" })
    );
  }
}
```

---

## 5. API Usage Guide (Integration Strategies)

*Usage Reference for App Teams and Integrators.*

The middleware supports 4 primary integration patterns. Users should enable only the modules required for their specific use case to minimize resource usage.

### Strategy 1: The "Full Stack" Dashboard

- **Target:** Modern React/Vue/Mobile Apps requiring live UI + history graphs.
- **Config:**
    - ✅ `apiServer` (Management + History)
    - ✅ `websocket`
    - ✅ `storage` (MySQL) (optional for dashboard)
- **Workflow:**
    1. Call `GET /api/live/topology` to build navigation.
    2. Call `GET /api/live/.../state` to render initial view.
    3. Connect to `/ws` for sub-second updates.
    4. Call `GET /api/history/...` for charts/graphs.

### Strategy 2: The "Enterprise Event" Integrator

- **Target:** SAP, ServiceNow, or Legacy Java Backends.
- **Need:** Only wants to know when assets move or alarms trigger.
- **Config:**
    - ✅ `webhook`
    - ❌ `websocket`, `mqttRelay`
    - ❌ `storage` (Optional)
- **Workflow:** Middleware PUSHES data to the App's URL via HTTP POST. The App never calls the Middleware.

### Strategy 3: The "Data Lake" Feeder

- **Target:** AWS IoT, Azure Digital Twins, Snowflake.
- **Need:** Raw JSON stream for AI analysis.
- **Config:**
    - ✅ `mqttRelay`
    - ❌ `apiServer`, `websocket`, `webhook`
    - ❌ `storage`
- **Workflow:** Middleware acts as a protocol converter (Binary → JSON) and forwards everything to a new MQTT topic.

### Strategy 4: The "Edge Node" (Minimalist)

- **Target:** Raspberry Pi or Industrial PC with limited RAM/Disk.
- **Config:**
    - ✅ `apiServer` (Management Only)
    - ❌ `storage` (DB disabled to save SD card writes)
    - ❌ `history` feature
- **Result:** System runs purely in RAM. Provides live current state but no history.