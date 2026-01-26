# Change: Add Database Schema

## Why

The database schema is required to store IoT device data including metadata, telemetry, RFID events, door states, heartbeats, command results, and topology change events. The schema must support pivoted tables for efficient storage of multi-sensor data.

## What Changes

- Create database schema SQL file with all required tables
- Implement device metadata table with upsert capability
- Implement pivoted temperature/humidity table (sensor indices 10-15)
- Implement pivoted noise level table (sensor indices 16-18)
- Implement RFID event and snapshot tables
- Implement door event table
- Implement heartbeat table
- Implement command result table
- Implement topology change event table

**BREAKING:** None - this is a new schema

## Impact

- Affected specs: None (new database schema)
- Affected code: StorageService.js (uses schema tables)
- Dependencies: MySQL 8.0 required
