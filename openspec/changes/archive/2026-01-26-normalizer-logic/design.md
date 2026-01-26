## Context

The UnifyNormalizer and StateCache modules are critical components in the IoT middleware pipeline. They are responsible for:
- Converting SIF (Standard Intermediate Format) from parsers to SUO (Standard Unified Object) for downstream processing
- Maintaining device state in memory/Redis for real-time queries and event generation
- Detecting configuration changes and RFID tag movements

Current implementations are incomplete stubs that don't implement the full specification. Key missing features:
1. V6800 RFID sync trigger (RFID_EVENT should trigger snapshot query, not update cache)
2. Device metadata merge (V5008 sends fragmented data that needs consolidation)
3. Global RFID diffing (detect attach/detach events by comparing snapshots)
4. Metadata change detection (emit events for IP, firmware, module changes)

## Goals / Non-Goals

**Goals:**
- Implement full specification compliance for UnifyNormalizer and StateCache
- Support both V5008 (single-module) and V6800 (multi-module) devices
- Enable real-time event generation for RFID movements and configuration changes
- Provide consistent cache structure for API queries
- Maintain backward compatibility with existing EventBus integration

**Non-Goals:**
- Database schema changes (handled by separate db-schema change)
- API endpoint changes (handled by separate changes)
- Performance optimization beyond specification requirements
- Redis migration (keep in-memory for now, Redis is future enhancement)

## Decisions

### Decision 1: Cache Key Structure

**Decision:** Use hierarchical cache keys following the specification: `device:{id}:module:{index}` for telemetry and `device:{id}:info` for metadata.

**Rationale:**
- Matches specification exactly
- Enables efficient per-module queries
- Supports future Redis migration (natural key structure)
- Allows easy cache invalidation per device or module

**Alternatives considered:**
- Flat structure `{deviceId}_{moduleIndex}`: Less readable, harder to query by device
- Nested object structure: More complex to implement, harder to migrate to Redis

### Decision 2: RFID Diffing Strategy

**Decision:** Implement global diffing by comparing incoming RFID_SNAPSHOT against cached previous snapshot using Map-based O(n) comparison.

**Rationale:**
- Detects both ATTACHED and DETACHED events in single pass
- O(n) time complexity using Maps for fast lookups
- Matches specification Section 3.1 exactly
- Works for both V5008 and V6800 devices

**Alternatives considered:**
- Set-based comparison: Loses sensorIndex information
- Nested loop comparison: O(n²) complexity, inefficient for large tag counts

### Decision 3: V6800 RFID Event Handling

**Decision:** V6800 RFID_EVENT messages should trigger a sync command (emit `command.request` with `QRY_RFID_SNAPSHOT`) without updating cache or emitting SUO.

**Rationale:**
- V6800 events are signals, not authoritative state
- Fetching fresh snapshot ensures data consistency
- Global diffing logic will handle the snapshot and generate proper events
- Matches specification Section 3.2 exactly

**Alternatives considered:**
- Update cache directly: Risk of inconsistent state if event is stale
- Emit SUO directly: Duplicate events if snapshot already processed

### Decision 4: Metadata Merge Strategy

**Decision:** Implement incremental merge with change detection. Compare incoming SIF data against cache before merging, emit META_CHANGED_EVENT if differences found, then merge.

**Rationale:**
- Detects configuration changes in real-time
- Provides audit trail of device changes
- Supports fragmented V5008 data (DEVICE_INFO, MODULE_INFO, HEARTBEAT)
- Matches specification Section 3.3 and 3.4 exactly

**Alternatives considered:**
- Replace entire metadata on every update: Loses change detection, inefficient
- No merge, emit all events: Too noisy, hard to consume downstream

### Decision 5: Telemetry Flattening

**Decision:** Split telemetry messages (TEMP_HUM, NOISE, RFID) into separate SUOs (1 per module) for database pivoting. System messages (HEARTBEAT, DEVICE_METADATA) emit as single SUO with full array.

**Rationale:**
- Enables efficient database queries by module
- Matches specification Section 2 exactly
- Separates high-frequency telemetry from low-frequency metadata
- Supports both single-module (V5008) and multi-module (V6800) devices

**Alternatives considered:**
- Single SUO for all data: Harder to query by module, larger payloads
- No flattening: Doesn't match spec, inefficient for database

### Decision 6: SUO Payload Structure

**Decision:** All SUO payloads MUST be arrays. Sensor messages include moduleIndex and moduleId at root. Device messages include moduleIndex and moduleId inside payload array items.

**Rationale:**
- Consistent structure across all message types
- Matches specification Section 4 exactly
- Enables efficient array processing in downstream services
- Clear separation between sensor-level and device-level data

**Alternatives considered:**
- Mixed payload types (object for single, array for multiple): Inconsistent, harder to process
- All root-level fields: Doesn't match spec, loses module context for device messages

## Risks / Trade-offs

### Risk 1: Memory Usage

**Risk:** In-memory cache may grow large with many devices.

**Mitigation:**
- Implement cache size limits and LRU eviction
- Monitor memory usage and add alerts
- Plan Redis migration for production scale

### Risk 2: Cache Inconsistency

**Risk:** Cache may become inconsistent if devices send out-of-order messages.

**Mitigation:**
- Use timestamps for all cache entries
- Implement cache validation on heartbeat
- Add cache watchdog to detect stale entries

### Risk 3: Event Duplication

**Risk:** RFID events may be duplicated if both V6800 event and snapshot arrive.

**Mitigation:**
- V6800 events trigger sync only (no cache update, no SUO)
- Snapshot diffing is authoritative source of truth
- Use messageId for deduplication in downstream services

### Risk 4: Performance Impact

**Risk:** Diffing and change detection may impact performance with high message rates.

**Mitigation:**
- Use efficient data structures (Maps for O(n) lookups)
- Implement async processing for non-critical paths
- Add performance monitoring and optimization as needed

## Migration Plan

### Phase 1: StateCache Refactor
1. Update cache structure to match specification
2. Implement new cache access methods
3. Add unit tests for cache operations
4. **No breaking changes** - maintain backward compatibility with existing API

### Phase 2: UnifyNormalizer Refactor
1. Implement proper flattening and standardization
2. Implement logic branching for message types
3. Implement RFID diffing and metadata change detection
4. Add unit tests for all message types
5. **No breaking changes** - maintain EventBus integration

### Phase 3: Integration Testing
1. Test end-to-end flow with real device messages
2. Test V5008 fragmented metadata merge
3. Test V6800 RFID sync trigger
4. Test cache persistence and recovery
5. Performance testing with high message rates

### Phase 4: Deployment
1. Deploy to staging environment
2. Monitor cache size and memory usage
3. Monitor event generation rates
4. Fix any issues found
5. Deploy to production

**Rollback:**
- Maintain existing implementation in separate branch
- Quick rollback by reverting to previous code
- No database schema changes required (safe rollback)

## Open Questions

- [ ] Should we implement Redis migration now or defer to future change?
- [ ] What cache size limits should we enforce?
- [ ] Should we implement cache persistence to disk for recovery?
- [ ] What performance metrics should we monitor?
