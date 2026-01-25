# Project Context: IoT Middleware Pro v2.0

## 1. Goal

Build a high-throughput integration layer that unifies data from heterogeneous IoT Gateways (V5008/Binary and V6800/JSON) into a standardized format for real-time dashboards and historical SQL storage.

## 2. Tech Stack

- **Runtime:** Node.js v18+
- **Language:** JavaScript (CommonJS)
- **Architecture:** Modular Monolith (Event-Driven)
- **Database:** MySQL 8.0 (Library: `knex` + `mysql2`)
- **Transport:** MQTT (Library: `mqtt`)
- **API:** Express.js
- **Logging:** Winston

## 3. Coding Standards

- **Error Handling:** Never crash on parse errors. Use `try/catch`. Log errors via `Logger.error`.
- **Async/Await:** Use for all I/O operations.
- **Config:** Use `config/default.json`. Do not hardcode credentials.
- **Module Pattern:** Code must be organized in `src/modules/{feature}/`.

## 4. Architecture Overview

1. **Ingest:** MQTT Subscriber listens to device topics.
2. **Parse:** Converts Raw Buffer/JSON -> **SIF** (Standard Intermediate Format).
3. **Normalize:** Converts SIF -> **SUO** (Standard Unified Object) & Updates State Cache.
4. **Output:**
   - **Storage:** Batched writes to MySQL.
   - **API/WS:** Real-time access for Dashboard.
