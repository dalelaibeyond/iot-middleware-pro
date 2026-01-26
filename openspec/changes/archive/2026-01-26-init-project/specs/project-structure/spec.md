## ADDED Requirements

### Requirement: Project Directory Structure

The system SHALL have a modular monolith directory structure under `src/` with the following organization:

- `src/core/` - Core components (EventBus, Database, ModuleManager)
- `src/modules/ingress/` - Ingress modules (MqttSubscriber)
- `src/modules/parsers/` - Parser modules (V5008Parser, V6800Parser, ParserManager)
- `src/modules/normalizer/` - Normalizer modules (UnifyNormalizer, StateCache, CacheWatchdog)
- `src/modules/storage/` - Storage modules (StorageService)
- `src/modules/command/` - Command modules (CommandService)
- `src/modules/output/` - Output modules (MqttRelay, WebhookService, ApiServer, WebSocketServer)
- `src/config/` - Configuration files

#### Scenario: Directory structure exists

- **WHEN** the project is initialized
- **THEN** all required directories exist under `src/`

### Requirement: Core Components

The system SHALL provide core components including EventBus for event-driven communication, Database for MySQL connection management, and ModuleManager for lifecycle management.

#### Scenario: EventBus exists

- **WHEN** the project is initialized
- **THEN** `src/core/EventBus.js` exists with event emission and subscription capabilities

#### Scenario: Database exists

- **WHEN** the project is initialized
- **THEN** `src/core/Database.js` exists with Knex.js MySQL connection pool

#### Scenario: ModuleManager exists

- **WHEN** the project is initialized
- **THEN** `src/core/ModuleManager.js` exists with lifecycle management capabilities

### Requirement: Configuration File

The system SHALL provide a configuration file at `src/config/default.json` containing all required settings for MQTT, database, and module configurations.

#### Scenario: Configuration file exists

- **WHEN** the project is initialized
- **THEN** `src/config/default.json` exists with app, mqtt, database, and modules sections

### Requirement: Database Schema

The system SHALL provide a database schema file at `database/schema.sql` containing all required tables: iot_meta_data, iot_temp_hum, iot_noise_level, iot_rfid_event, iot_rfid_snapshot, iot_door_event, iot_heartbeat, iot_cmd_result, and iot_topchange_event.

#### Scenario: Database schema exists

- **WHEN** the project is initialized
- **THEN** `database/schema.sql` exists with all required table definitions

### Requirement: Entry Point

The system SHALL provide an entry point file at `src/index.js` that initializes the application and starts all modules.

#### Scenario: Entry point exists

- **WHEN** the project is initialized
- **THEN** `src/index.js` exists with application initialization logic

### Requirement: Package Configuration

The system SHALL provide a package.json file with all required dependencies including knex, mysql2, mqtt, express, winston, and config.

#### Scenario: package.json exists

- **WHEN** the project is initialized
- **THEN** `package.json` exists with all required dependencies

### Requirement: Module Stubs

The system SHALL provide stub files for all modules defined in the architecture specification with basic structure and placeholder comments.

#### Scenario: Ingress module stubs exist

- **WHEN** the project is initialized
- **THEN** `src/modules/ingress/MqttSubscriber.js` exists with basic class structure

#### Scenario: Parser module stubs exist

- **WHEN** the project is initialized
- **THEN** `src/modules/parsers/V5008Parser.js`, `V6800Parser.js`, and `ParserManager.js` exist with basic class structures

#### Scenario: Normalizer module stubs exist

- **WHEN** the project is initialized
- **THEN** `src/modules/normalizer/UnifyNormalizer.js`, `StateCache.js`, and `CacheWatchdog.js` exist with basic class structures

#### Scenario: Storage module stubs exist

- **WHEN** the project is initialized
- **THEN** `src/modules/storage/StorageService.js` exists with basic class structure

#### Scenario: Command module stubs exist

- **WHEN** the project is initialized
- **THEN** `src/modules/command/CommandService.js` exists with basic class structure

#### Scenario: Output module stubs exist

- **WHEN** the project is initialized
- **THEN** `src/modules/output/MqttRelay.js`, `WebhookService.js`, `ApiServer.js`, and `WebSocketServer.js` exist with basic class structures
