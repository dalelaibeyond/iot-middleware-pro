## Context

The V5008 parser is responsible for parsing binary protocol messages from V5008 IoT gateways. The protocol uses a binary format with specific message structures for different data types (heartbeat, RFID, temperature/humidity, noise, door state, device info, module info, and command responses).

### Constraints

- Binary protocol with fixed message structures
- Must handle signed sensor values (two's complement)
- Must handle variable-length originalReq field in command responses
- Must map binary field names to SIF JSON keys

### Stakeholders

- ParserManager - routes messages to V5008Parser
- UnifyNormalizer - consumes SIF output
- StorageService - stores parsed data to database

## Goals / Non-Goals

### Goals

- Implement complete V5008 binary parser following specification exactly
- Support all message types defined in specification
- Provide proper error handling and logging
- Return null for parse failures (do not throw exceptions)

### Non-Goals

- Unit testing (can be added later)
- Protocol validation beyond parsing (e.g., checksum verification)

## Decisions

### Decision 1: Message Type Identification Strategy

**What:** Use topic suffix check first, then header byte check.

**Why:**

- Topic suffix is reliable for most messages
- Header byte check provides fallback for ambiguous cases
- Matches specification precedence rules

**Alternatives considered:**

- Header byte only: Rejected - less reliable for standard messages
- Topic suffix only: Rejected - cannot distinguish all message types

### Decision 2: Signed Sensor Value Algorithm

**What:** Implement two's complement signed integer parsing for temperature, humidity, and noise values.

**Why:**

- Specification requires this exact algorithm
- Handles negative values correctly
- Combines integer and fractional parts

**Alternatives considered:**

- Simple byte reading: Rejected - doesn't handle negative values
- Offset-based reading: Rejected - more complex, no benefit

### Decision 3: Dynamic originalReq Length

**What:** Use Algorithm B to calculate variable originalReq length for QRY_CLR_RESP, SET_CLR_RESP, and CLN_ALM_RESP.

**Why:**

- Specification requires this algorithm
- Handles variable-length requests correctly
- Fixed 2-byte length for QRY_CLR_RESP

**Alternatives considered:**

- Fixed length for all: Rejected - doesn't match spec
- Header-based length: Rejected - spec uses Algorithm B

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

### Risk 1: Binary Protocol Complexity

**Risk:** Binary parsing is error-prone and difficult to debug.

**Mitigation:**

- Comprehensive logging of raw hex values
- Clear error messages
- Follow specification exactly

### Trade-off: Code Size vs. Readability

**Decision:** Use helper methods for common parsing patterns.

**Rationale:**

- Reduces code duplication
- Improves maintainability
- Still maintains clarity

## Migration Plan

### Steps

1. Update V5008Parser.js with new implementation
2. Test with sample binary messages
3. Verify SIF output matches specification format
4. Verify error handling works correctly

### Rollback

- Revert to stub implementation if issues found
- No data migration needed (parser output format unchanged)

## Open Questions

None at this time. The specification provides complete guidance for all parsing requirements.
