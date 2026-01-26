# Change: Implement UnifyNormalizer and StateCache

## Why

The current UnifyNormalizer and StateCache implementations are incomplete and do not fully implement the specification. Critical features are missing:

1. **V6800 Sync Trigger**: V6800 RFID_EVENT messages should trigger a sync command to fetch fresh snapshot, not update cache directly
2. **Device Metadata Merge**: V5008 sends fragmented metadata (DEVICE_INFO, MODULE_INFO, HEARTBEAT) that needs to be merged into a complete device record with change detection
3. **Proper Flattening**: Telemetry messages (TEMP_HUM, NOISE, RFID) should be split into separate SUOs per module for database pivoting
4. **Global RFID Diffing**: RFID_SNAPSHOT messages should be compared against cached state to generate RFID_EVENT SUOs
5. **Metadata Change Detection**: Detect configuration changes (IP, firmware, module list) and emit META_CHANGED_EVENT SUOs

## What Changes

- **Refactor UnifyNormalizer.js** to implement full specification:
  - Implement proper flattening logic for telemetry (split into separate SUOs per module)
  - Implement proper context loading from StateCache using correct cache keys
  - Implement proper logic branching for stateless vs stateful messages
  - Implement proper standardization (map thIndex, nsIndex, uIndex to sensorIndex)
  - Implement proper SUO structure with payload arrays
  - Implement V6800 RFID sync trigger (emit command.request, don't update cache)
  - Implement metadata change detection logic
  - Implement proper cache update strategy per message type

- **Refactor StateCache.js** to implement full specification:
  - Implement proper UOS (Unified Object Structure) format
  - Implement correct cache keys: `device:{id}:module:{index}` and `device:{id}:info`
  - Implement proper cache update strategy as per spec Section 6
  - Implement metadata merge logic with change detection
  - Implement proper field merging for fragmented V5008 data

- **Add proper error handling** and logging throughout both modules

## Impact

- Affected specs: `specs/normalizer/spec.md` (new capability)
- Affected code:
  - `src/modules/normalizer/UnifyNormalizer.js` (refactor)
  - `src/modules/normalizer/StateCache.js` (refactor)
- Integration:
  - ParserManager → UnifyNormalizer (SIF input)
  - UnifyNormalizer → EventBus (SUO output, command requests)
  - UnifyNormalizer → StateCache (UOS persistence)
  - ApiServer → StateCache (read-only access)
