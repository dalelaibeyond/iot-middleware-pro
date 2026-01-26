# Change: Add Storage Service Specification

## Why

The StorageService module is already implemented and tested, but lacks formal specification in the openspec system. Documenting the existing implementation ensures that the storage service's behavior, message routing, batching logic, and pivoting operations are properly specified and maintained.

## What Changes

- Add formal specification for StorageService capability
- Document message type routing for all supported SUO message types
- Specify batching and flush behavior
- Document pivoting logic for temperature/humidity and noise level data
- Specify error handling and message filtering behavior

**BREAKING:** None - this documents existing implementation

## Impact

- Affected specs: New storage-service capability spec
- Affected code: StorageService.js (already implemented)
- Dependencies: MySQL 8.0, EventBus, StateCache
