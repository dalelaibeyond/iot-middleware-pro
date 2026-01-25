## Context

The V6800 parser is responsible for parsing JSON protocol messages from V6800 IoT gateways. The protocol uses a JSON format with specific message structures for different data types (heartbeat, RFID, temperature/humidity, noise, door state, device info, module info, and command responses).

### Constraints

- JSON protocol with field-based message types
- Must handle various msg_type values
- Must map raw JSON fields to SIF JSON keys
- Must handle single and dual door sensor configurations

### Stakeholders

- ParserManager - routes messages to V6800Parser
- UnifyNormalizer - consumes SIF output
- StorageService - stores parsed data to database

## Goals / Non-Goals

### Goals

- Implement complete V6800 JSON parser following specification exactly
- Support all message types defined in specification
- Provide proper error handling and logging
- Return null for parse failures (do not throw exceptions)

### Non-Goals

- Unit testing (can be added later)
- Protocol validation beyond parsing (e.g., checksum verification)

## Decisions

### Decision 1: Message Type Mapping Strategy

**What:** Use msg_type field from raw JSON and map to SIF messageType.

**Why:**

- msg_type field provides clear message type identification
- Specification provides complete mapping table
- Simpler than topic-based detection

**Alternatives considered:**

- Topic suffix detection: Rejected - not reliable for V6800
- Header byte detection: Rejected - no header in JSON protocol

### Decision 2: Field Mapping Logic

**What:** Map raw JSON fields to SIF JSON keys based on specification.

**Why:**

- Specification provides complete field mapping table
- Ensures correct SIF output format
- Handles all message types consistently

**Alternatives considered:**

- Direct field pass-through: Rejected - doesn't normalize to SIF format
- Custom mapping: Rejected - spec provides authoritative mapping

### Decision 3: Door State Logic

**What:** Handle both single and dual door sensor configurations.

**Why:**

- V6800 supports both configurations
- Specification provides clear logic for each case
- Must map to appropriate SIF fields

**Alternatives considered:**

- Single door only: Rejected - doesn't support all devices
- Dual door only: Rejected - doesn't support all devices

### Decision 4: Error Handling Strategy

**What:** Log errors and return null instead of throwing exceptions.

**Why:**

- Matches specification error handling requirement
- Prevents application crashes on parse errors
- Allows graceful degradation

**Alternatives considered:**

- Throw exceptions: Rejected - violates spec
- Silent failure: Rejected - harder to debug

## Risks / Trade-offs

### Risk 1: JSON Parsing Complexity

**Risk:** JSON parsing may have edge cases not covered by specification.

**Mitigation:**

- Comprehensive logging of raw JSON values
- Handle missing fields gracefully
- Provide clear error messages

### Trade-off: Code Size vs. Readability

**Decision:** Use helper methods for common parsing patterns.

**Rationale:**

- Reduces code duplication
- Improves maintainability
- Still maintains clarity

## Migration Plan

### Steps

1. Update V6800Parser.js with new implementation
2. Test with sample JSON messages
3. Verify SIF output matches specification format
4. Verify error handling works correctly

### Rollback

- Revert to stub implementation if issues found
- No data migration needed (parser output format unchanged)

## Open Questions

None at this time. The specification provides complete guidance for all parsing requirements.
