## ADDED Requirements

### Requirement: StateCache UOS Structure

The system SHALL implement StateCache with proper UOS (Unified Object Structure) format using hierarchical cache keys.

#### Scenario: Cache telemetry data

- **GIVEN** a TEMP_HUM SIF message arrives
- **WHEN** StateCache updates telemetry for device "dev1" module 1
- **THEN** it SHALL store data at key `device:dev1:module:1`
- **AND** it SHALL include temp_hum array with sensorIndex, temp, hum fields
- **AND** it SHALL update lastSeen_th timestamp

#### Scenario: Cache metadata data

- **GIVEN** a DEVICE_INFO SIF message arrives
- **WHEN** StateCache updates metadata for device "dev1"
- **THEN** it SHALL store data at key `device:dev1:info`
- **AND** it SHALL include activeModules array with moduleIndex, moduleId, fwVer, uTotal
- **AND** it SHALL update lastSeen_info timestamp

### Requirement: Metadata Merge with Change Detection

The system SHALL detect configuration changes by comparing incoming SIF data against existing Cache before merging.

#### Scenario: Detect device IP change

- **GIVEN** cached device IP is "192.168.0.2"
- **AND** incoming SIF has IP "192.168.0.5"
- **WHEN** StateCache merges metadata
- **THEN** it SHALL emit META_CHANGED_EVENT SUO with description "Device IP changed from 192.168.0.2 to 192.168.0.5"
- **AND** it SHALL update cached IP to new value

#### Scenario: Detect module firmware change

- **GIVEN** cached module 1 firmware is "1.0"
- **AND** incoming SIF has firmware "2.0" for module 1
- **WHEN** StateCache merges metadata
- **THEN** it SHALL emit META_CHANGED_EVENT SUO with description "Module 1 Firmware changed from 1.0 to 2.0"
- **AND** it SHALL update cached firmware to new value

#### Scenario: Detect new module added

- **GIVEN** cached device has no module at index 2
- **AND** incoming SIF includes module 2 with moduleId "mod2"
- **WHEN** StateCache merges metadata
- **THEN** it SHALL emit META_CHANGED_EVENT SUO with description "Module mod2 added at Index 2"
- **AND** it SHALL add module to activeModules array

### Requirement: Global RFID Diffing

The system SHALL detect RFID tag movements by comparing incoming RFID_SNAPSHOT against cached previous snapshot.

#### Scenario: Detect tag attached

- **GIVEN** cached snapshot has no tag at sensorIndex 10
- **AND** incoming snapshot has tagId "A1" at sensorIndex 10
- **WHEN** UnifyNormalizer processes RFID_SNAPSHOT
- **THEN** it SHALL emit RFID_EVENT SUO with action "ATTACHED"
- **AND** it SHALL include sensorIndex 10 and tagId "A1"
- **AND** it SHALL update cached snapshot with new tag

#### Scenario: Detect tag detached

- **GIVEN** cached snapshot has tagId "A1" at sensorIndex 10
- **AND** incoming snapshot has no tag at sensorIndex 10
- **WHEN** UnifyNormalizer processes RFID_SNAPSHOT
- **THEN** it SHALL emit RFID_EVENT SUO with action "DETACHED"
- **AND** it SHALL include sensorIndex 10 and tagId "A1"
- **AND** it SHALL update cached snapshot without the tag

### Requirement: V6800 RFID Sync Trigger

The system SHALL treat V6800 RFID_EVENT messages purely as signals to fetch fresh snapshot from device.

#### Scenario: V6800 RFID event triggers sync

- **GIVEN** a V6800 device sends RFID_EVENT message
- **WHEN** UnifyNormalizer processes the message
- **THEN** it SHALL emit command.request with messageType "QRY_RFID_SNAPSHOT"
- **AND** it SHALL NOT update cache
- **AND** it SHALL NOT emit SUO for the event

### Requirement: Telemetry Flattening

The system SHALL split telemetry messages (TEMP_HUM, NOISE, RFID) into separate SUOs (1 per module) for database pivoting.

#### Scenario: Flatten multi-module telemetry

- **GIVEN** a V6800 device sends TEMP_HUM message with data for modules 1 and 2
- **WHEN** UnifyNormalizer processes the message
- **THEN** it SHALL emit two separate SUOs (one per module)
- **AND** each SUO SHALL have moduleIndex and moduleId at root
- **AND** each SUO SHALL have payload array with sensor data

#### Scenario: Flatten single-module telemetry

- **GIVEN** a V5008 device sends TEMP_HUM message
- **WHEN** UnifyNormalizer processes the message
- **THEN** it SHALL emit one SUO with moduleIndex=1 at root
- **AND** the SUO SHALL have payload array with sensor data

### Requirement: SUO Structure Standardization

The system SHALL ensure all SUOs follow consistent structure with payload arrays and proper topology context.

#### Scenario: Sensor message SUO structure

- **GIVEN** a TEMP_HUM SIF message arrives
- **WHEN** UnifyNormalizer creates SUO
- **THEN** it SHALL include messageType, messageId, deviceId, deviceType at root
- **AND** it SHALL include moduleIndex and moduleId at root
- **AND** it SHALL map thIndex to sensorIndex in payload
- **AND** payload SHALL be an array

#### Scenario: Device message SUO structure

- **GIVEN** a HEARTBEAT SIF message arrives
- **WHEN** UnifyNormalizer creates SUO
- **THEN** it SHALL include messageType, messageId, deviceId, deviceType at root
- **AND** it SHALL NOT include moduleIndex at root (set to 0 or null)
- **AND** payload array items SHALL include moduleIndex and moduleId
