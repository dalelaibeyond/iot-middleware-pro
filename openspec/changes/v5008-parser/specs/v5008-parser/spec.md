## MODIFIED Requirements

### Requirement: V5008 Binary Parser Implementation

The V5008Parser SHALL implement complete binary protocol parsing according to the V5008 specification, including message type identification, header parsing, and all message type handlers.

#### Scenario: Parse HEARTBEAT message

- **WHEN** a V5008 binary message with header 0xCC or 0xCB is received
- **THEN** the parser extracts device_id, module information, and returns SIF with messageType HEARTBEAT and data array containing moduleIndex, moduleId, and uTotal
- **AND** the parser filters out slots where ModId == 0 or ModAddr > 5

#### Scenario: Parse RFID_SNAPSHOT message

- **WHEN** a V5008 binary message with header 0xBB is received
- **THEN** the parser extracts device_id, module information, and returns SIF with messageType RFID_SNAPSHOT and data array containing uIndex, isAlarm, and tagId for each tag

#### Scenario: Parse TEMP_HUM message

- **WHEN** a V5008 binary message with topic suffix /TemHum is received
- **THEN** the parser extracts device_id, module information, and returns SIF with messageType TEMP_HUM and data array containing thIndex, temp, and hum for each sensor
- **AND** the parser uses parseSignedFloat algorithm for temperature and humidity values
- **AND** the parser skips slots where Addr === 0

#### Scenario: Parse NOISE_LEVEL message

- **WHEN** a V5008 binary message with topic suffix /Noise is received
- **THEN** the parser extracts device_id, module information, and returns SIF with messageType NOISE_LEVEL and data array containing nsIndex and noise for each sensor
- **AND** the parser uses parseSignedFloat algorithm for noise values
- **AND** the parser skips slots where Addr === 0

#### Scenario: Parse DOOR_STATE message

- **WHEN** a V5008 binary message with header 0xBA is received
- **THEN** the parser extracts device_id, module information, and returns SIF with messageType DOOR_STATE and data array containing doorState

#### Scenario: Parse DEVICE_INFO message

- **WHEN** a V5008 binary message with header 0xEF01 is received
- **THEN** the parser extracts device_id, model, fwVer, ip, mask, gwIp, and mac
- **AND** the parser returns SIF with messageType DEVICE_INFO and data array containing device metadata

#### Scenario: Parse MODULE_INFO message

- **WHEN** a V5008 binary message with header 0xEF02 is received
- **THEN** the parser extracts device_id and module firmware versions
- **AND** the parser returns SIF with messageType MODULE_INFO and data array containing moduleIndex and fwVer for each module

#### Scenario: Parse QRY_CLR_RESP message

- **WHEN** a V5008 binary message with header 0xAA and command code 0xE4 is received
- **THEN** the parser extracts device_id, result, originalReq, and colorMap
- **AND** the parser uses Algorithm B to calculate originalReq length (fixed 2 bytes)
- **AND** the parser returns SIF with messageType QRY_CLR_RESP and data array containing colorCode for each module

#### Scenario: Parse SET_CLR_RESP message

- **WHEN** a V5008 binary message with header 0xAA and command code 0xE1 is received
- **THEN** the parser extracts device_id and result
- **AND** the parser uses Algorithm B to calculate originalReq length (variable: Buffer.length - 10)
- **AND** the parser returns SIF with messageType SET_CLR_RESP and data array

#### Scenario: Parse CLN_ALM_RESP message

- **WHEN** a V5008 binary message with header 0xAA and command code 0xE2 is received
- **THEN** the parser extracts device_id and result
- **AND** the parser uses Algorithm B to calculate originalReq length (variable: Buffer.length - 10)
- **AND** the parser returns SIF with messageType CLN_ALM_RESP and data array

#### Scenario: Handle parse error

- **WHEN** the binary buffer is too short or contains invalid data
- **THEN** the parser logs the error and returns null
- **AND** the parser does not throw exceptions
