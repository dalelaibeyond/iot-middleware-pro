## 1. StateCache Refactor

- [x] 1.1 Implement proper UOS (Unified Object Structure) format
  - [x] 1.1.1 Update cache structure to use correct keys: `device:{id}:module:{index}` and `device:{id}:info`
  - [x] 1.1.2 Implement telemetry cache structure with temp_hum, noise_level, rfid_snapshot, doorState fields
  - [x] 1.1.3 Implement metadata cache structure with activeModules array
  - [x] 1.1.4 Add timestamp fields: lastSeen_hb, lastSeen_th, lastSeen_ns, lastSeen_rfid, lastSeen_door, lastSeen_info

- [x] 1.2 Implement metadata merge logic with change detection
  - [x] 1.2.1 Implement device-level change detection (IP, firmware)
  - [x] 1.2.2 Implement module-level change detection (add, remove, replace, firmware, uTotal)
  - [x] 1.2.3 Return array of change descriptions for META_CHANGED_EVENT
  - [x] 1.2.4 Merge incoming SIF data into cache with proper field mapping

- [x] 1.3 Implement cache update strategy per message type
  - [x] 1.3.1 HEARTBEAT: Update isOnline and lastSeen_hb for each module, merge activeModules into info
  - [x] 1.3.2 TEMP_HUM: Update temp_hum array and lastSeen_th
  - [x] 1.3.3 NOISE_LEVEL: Update noise_level array and lastSeen_ns
  - [x] 1.3.4 DOOR_STATE: Update doorState fields and lastSeen_door
  - [x] 1.3.5 RFID_SNAPSHOT: REPLACE rfid_snapshot array and update lastSeen_rfid
  - [x] 1.3.6 RFID_EVENT: NO ACTION (trigger sync only)
  - [x] 1.3.7 DEVICE_METADATA: MERGE/REPLACE ip, fwVer, activeModules and update lastSeen_info
  - [x] 1.3.8 UTOTAL_CHANGED: MERGE activeModules (uTotal, fwVer, moduleId, moduleIndex) and update lastSeen_info

- [x] 1.4 Implement cache access methods
  - [x] 1.4.1 getTelemetry(deviceId, moduleIndex) - Get full telemetry state
  - [x] 1.4.2 getMetadata(deviceId) - Get full device metadata
  - [x] 1.4.3 getRfidSnapshot(deviceId, moduleIndex) - Get RFID snapshot for diffing
  - [x] 1.4.4 setTelemetry(deviceId, moduleIndex, telemetry) - Update telemetry state
  - [x] 1.4.5 setMetadata(deviceId, metadata) - Update device metadata

## 2. UnifyNormalizer Refactor

- [x] 2.1 Implement proper flattening logic
  - [x] 2.1.1 Telemetry messages (TEMP_HUM, NOISE, RFID): Split into separate SUOs (1 per module)
  - [x] 2.1.2 System messages (HEARTBEAT, DEVICE_METADATA): Process as single Device-Level unit with full array

- [x] 2.2 Implement context loading from StateCache
  - [x] 2.2.1 Load telemetry context: `device:{id}:module:{index}`
  - [x] 2.2.2 Load metadata context: `device:{id}:info`

- [x] 2.3 Implement logic branching for message types
  - [x] 2.3.1 Stateless messages (TEMP_HUM, NOISE, DOOR): Map directly SIF → SUO, update cache
  - [x] 2.3.2 Stateful snapshots (RFID_SNAPSHOT): Diff against cache → Generate RFID_EVENT SUOs, update cache
  - [x] 2.3.3 Stateful events (RFID_EVENT - V6800): Trigger sync (emit command.request), NO cache update
  - [x] 2.3.4 Metadata (DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO, HEARTBEAT, UTOTAL_CHANGED): Compare vs Cache → Emit META_CHANGED_EVENT if diffs found → Merge into Cache → Emit DEVICE_METADATA SUO

- [x] 2.4 Implement proper standardization
  - [x] 2.4.1 Map thIndex → sensorIndex for TEMP_HUM messages
  - [x] 2.4.2 Map nsIndex → sensorIndex for NOISE_LEVEL messages
  - [x] 2.4.3 Map uIndex → sensorIndex for RFID messages

- [x] 2.5 Implement proper SUO structure
  - [x] 2.5.1 Ensure all payloads are arrays
  - [x] 2.5.2 Include identity block at root: messageType, messageId, deviceId, deviceType
  - [x] 2.5.3 Sensor messages: Include moduleIndex and moduleId at SUO root
  - [x] 2.5.4 Device messages: Do NOT include moduleIndex at root (set to 0 or null), include inside payload array items

- [x] 2.6 Implement V6800 RFID sync trigger
  - [x] 2.6.1 For V6800 RFID_EVENT messages: Emit command.request with QRY_RFID_SNAPSHOT
  - [x] 2.6.2 Do NOT update cache for V6800 RFID_EVENT messages
  - [x] 2.6.3 Do NOT emit SUO for V6800 RFID_EVENT messages

- [x] 2.7 Implement global RFID diffing logic
  - [x] 2.7.1 Load previous snapshot from cache (treat as [] if empty)
  - [x] 2.7.2 Construct PrevMap and CurrMap for O(n) comparison
  - [x] 2.7.3 Detect DETACHED: Items in Prev but not in Curr (or tagId changed)
  - [x] 2.7.4 Detect ATTACHED: Items in Curr but not in Prev (or tagId changed)
  - [x] 2.7.5 Emit full RFID_SNAPSHOT SUO for database
  - [x] 2.7.6 Update cache with new snapshot

- [x] 2.8 Implement metadata change detection
  - [x] 2.8.1 Device-level checks: IP, firmware changes
  - [x] 2.8.2 Module-level checks: New module, existing module changes (moduleId, fwVer, uTotal)
  - [x] 2.8.3 Emit META_CHANGED_EVENT SUO with array of change descriptions if any changes detected
  - [x] 2.8.4 Merge data into cache after detection

- [x] 2.9 Implement proper message type handlers
  - [x] 2.9.1 handleHeartbeat(sif) - Filter invalid slots, update cache, emit SUO
  - [x] 2.9.2 handleRfidSnapshot(sif) - Diff against cache, emit events, update cache
  - [x] 2.9.3 handleRfidEvent(sif) - V6800: trigger sync only; V5008: emit SUO
  - [x] 2.9.4 handleTempHum(sif) - Map directly, update cache, emit SUO
  - [x] 2.9.5 handleNoiseLevel(sif) - Map directly, update cache, emit SUO
  - [x] 2.9.6 handleDoorState(sif) - Map directly, update cache, emit SUO
  - [x] 2.9.7 handleMetadata(sif) - Detect changes, merge cache, emit DEVICE_METADATA SUO
  - [x] 2.9.8 handleCommandResponses(sif) - Wrap result in payload array, emit SUO

## 3. Integration and Testing

- [x] 3.1 Update EventBus integration
  - [x] 3.1.1 Subscribe to data.parsed events from ParserManager
  - [x] 3.1.2 Emit data.normalized events with SUO
  - [x] 3.1.3 Emit command.request events for V6800 RFID sync

- [x] 3.2 Add comprehensive error handling
  - [x] 3.2.1 Try-catch blocks in all async operations
  - [x] 3.2.2 Proper error logging with context
  - [x] 3.2.3 Graceful degradation on cache failures

- [x] 3.3 Add logging
  - [x] 3.3.1 Log cache operations (get, set, merge)
  - [x] 3.3.2 Log normalization steps (flattening, diffing, change detection)
  - [x] 3.3.3 Log emitted events with message types

- [x] 3.4 Write unit tests
  - [x] 3.4.1 Test StateCache metadata merge and change detection
  - [x] 3.4.2 Test StateCache telemetry updates per message type
  - [x] 3.4.3 Test UnifyNormalizer flattening for telemetry messages
  - [x] 3.4.4 Test UnifyNormalizer RFID diffing logic
  - [x] 3.4.5 Test UnifyNormalizer V6800 RFID sync trigger
  - [x] 3.4.6 Test UnifyNormalizer metadata change detection
  - [x] 3.4.7 Test all SUO output structures match specification

- [ ] 3.5 Integration testing
  - [ ] 3.5.1 Test end-to-end flow: Parser → Normalizer → EventBus → Storage
  - [ ] 3.5.2 Test V5008 fragmented metadata merge
  - [ ] 3.5.3 Test V6800 RFID event sync trigger
  - [ ] 3.5.4 Test cache persistence across restarts (if using Redis)
