## Context

The IoT Middleware Pro system requires a MySQL database to store device data. The schema must support:

- Device metadata with upsert capability
- Pivoted tables for efficient multi-sensor storage
- Event tables for RFID and door states
- Heartbeat tracking for device online status
- Command result tracking
- Topology change event logging

### Constraints

- Database: MySQL 8.0 with InnoDB engine
- Character set: utf8mb4 for full Unicode support
- Must support JSON columns for flexible data storage

### Stakeholders

- StorageService module - writes data to tables
- ApiServer module - reads device metadata
- Dashboard users - query historical data

## Goals / Non-Goals

### Goals

- Create a complete, normalized schema matching architecture specification
- Use pivoted tables for temperature/humidity and noise level data
- Provide appropriate indexes for query performance
- Support upsert operations for device metadata
- Use JSON columns for flexible data storage

### Non-Goals

- Database migration tools (can be added later)
- Replication/sharding (can be added later)
- Alternative database support (MySQL only)

## Decisions

### Decision 1: Pivoted Tables for Telemetry

**What:** Use pivoted columns for temperature/humidity (indices 10-15) and noise level (indices 16-18).

**Why:**

- Reduces row count by storing multiple sensors per row
- Simplifies queries for dashboard (single row per module)
- Matches architecture specification

**Alternatives considered:**

- EAV (Entity-Attribute-Value) pattern: Rejected - too complex for queries
- Separate rows per sensor: Rejected - increases row count and query complexity

### Decision 2: JSON Columns for Flexible Data

**What:** Use JSON columns for modules array in metadata and heartbeat tables.

**Why:**

- Flexible storage of module arrays without additional tables
- Simplifies schema and queries
- MySQL 8.0 has good JSON support

**Alternatives considered:**

- Separate module table: Rejected - adds complexity
- Serialized string: Rejected - requires parsing in application

### Decision 3: Upsert for Device Metadata

**What:** Use INSERT ... ON DUPLICATE KEY UPDATE for device metadata.

**Why:**

- Single operation for insert or update
- Ensures latest metadata is always stored
- Matches architecture specification

**Alternatives considered:**

- Separate insert/update logic: Rejected - requires two queries
- REPLACE INTO: Rejected - loses auto-increment ID

### Decision 4: DATETIME(3) for Timestamps

**What:** Use DATETIME(3) for millisecond precision timestamps.

**Why:**

- Provides millisecond precision for event ordering
- Standard MySQL type for timestamps
- Matches architecture specification

**Alternatives considered:**

- TIMESTAMP: Rejected - limited range (2038)
- BIGINT (epoch): Rejected - less readable

## Risks / Trade-offs

### Risk 1: JSON Column Performance

**Risk:** JSON columns may have slower query performance than native columns.

**Mitigation:**

- Use JSON columns only for flexible data (modules array)
- Use native columns for frequently queried fields
- Add appropriate indexes on native columns

### Trade-off: Schema Complexity vs. Query Simplicity

**Decision:** More complex pivoted schema for simpler queries.

**Rationale:**

- Dashboard queries benefit from pivoted structure
- Write complexity is handled in StorageService
- Read performance is prioritized for dashboard use case

## Migration Plan

### Steps

1. Execute database/schema.sql on MySQL server
2. Verify all tables created successfully
3. Verify indexes created correctly
4. Test upsert operation on iot_meta_data
5. Test pivoted inserts on iot_temp_hum and iot_noise_level

### Rollback

- Drop all created tables if needed
- No impact on existing data (new schema)

## Open Questions

None at this time. The architecture specification provides clear guidance for all table structures.
