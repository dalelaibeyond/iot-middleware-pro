## ADDED Requirements

### Requirement: Device Metadata Table

The system SHALL provide a table `iot_meta_data` for storing device metadata with upsert capability.

#### Scenario: Store device metadata

- **WHEN** device metadata is received
- **THEN** the system stores device_id, device_type, and optional fields (device_fwVer, device_mask, device_gwIp, device_ip, device_mac, modules)
- **AND** the system updates existing record if device_id already exists
- **AND** parse_at and update_at timestamps are set to current time

### Requirement: Temperature Humidity Table

The system SHALL provide a pivoted table `iot_temp_hum` for storing temperature and humidity sensor data.

#### Scenario: Store temperature/humidity data

- **WHEN** temperature/humidity data is received for a module
- **THEN** the system stores one row per module with pivoted columns (temp_index10, hum_index10 through temp_index15, hum_index15)
- **AND** only columns for present sensor indices are populated
- **AND** missing columns remain NULL

### Requirement: Noise Level Table

The system SHALL provide a pivoted table `iot_noise_level` for storing noise sensor data.

#### Scenario: Store noise level data

- **WHEN** noise level data is received for a module
- **THEN** the system stores one row per module with pivoted columns (noise_index16, noise_index17, noise_index18)
- **AND** only columns for present sensor indices are populated
- **AND** missing columns remain NULL

### Requirement: RFID Event Table

The system SHALL provide a table `iot_rfid_event` for storing RFID tag attach/detach events.

#### Scenario: Store RFID event

- **WHEN** an RFID tag is attached or detached
- **THEN** the system stores device_id, module_index, sensor_index, tag_id, action (ATTACHED/DETACHED/ALARM_ON/ALARM_OFF), alarm status, and timestamp

### Requirement: RFID Snapshot Table

The system SHALL provide a table `iot_rfid_snapshot` for storing full RFID state snapshots.

#### Scenario: Store RFID snapshot

- **WHEN** a complete RFID snapshot is received
- **THEN** the system stores device_id, module_index, and the full rfid_snapshot as JSON array
- **AND** the JSON array contains sensorIndex, tagId, and isAlarm for each tag

### Requirement: Door Event Table

The system SHALL provide a table `iot_door_event` for storing door state changes.

#### Scenario: Store door state

- **WHEN** door state data is received
- **THEN** the system stores device_id, module_index, doorState (single), door1State (dual A), door2State (dual B), and timestamp

### Requirement: Heartbeat Table

The system SHALL provide a table `iot_heartbeat` for storing device heartbeat information.

#### Scenario: Store heartbeat

- **WHEN** a heartbeat is received from a device
- **THEN** the system stores device_id and modules array as JSON
- **AND** the JSON array contains moduleIndex, moduleId, and uTotal for each module

### Requirement: Command Result Table

The system SHALL provide a table `iot_cmd_result` for storing command execution results.

#### Scenario: Store command result

- **WHEN** a command response is received
- **THEN** the system stores device_id, cmd, result, optional original_req, optional color_map as JSON, and timestamp

### Requirement: Topology Change Event Table

The system SHALL provide a table `iot_topchange_event` for storing topology change events.

#### Scenario: Store topology change

- **WHEN** a topology change event occurs
- **THEN** the system stores device_id, device_type, event_desc (human-readable description), parse_at, and update_at timestamps

### Requirement: Database Indexes

The system SHALL provide appropriate indexes on all tables for query performance.

#### Scenario: Query device metadata

- **WHEN** querying device metadata by device_id
- **THEN** the unique index on device_id enables fast lookup

#### Scenario: Query historical data

- **WHEN** querying historical telemetry data
- **THEN** the composite indexes on (device_id, module_index, parse_at DESC) enable efficient range queries

### Requirement: Database Engine

The system SHALL use InnoDB engine with utf8mb4 character set for all tables.

#### Scenario: Create tables

- **WHEN** the schema is executed
- **THEN** all tables use InnoDB engine
- **AND** all tables use utf8mb4 character set with utf8mb4_unicode_ci collation
