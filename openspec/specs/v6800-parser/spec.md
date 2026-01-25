# v6800-parser Specification

## Purpose
TBD - created by archiving change v6800-parser. Update Purpose after archive.
## Requirements
### Requirement: V6800 Parser

The system SHALL provide a V6800Parser class that converts raw JSON messages from V6800 IoT devices into Standard Intermediate Format (SIF) objects.

#### Scenario: Parse heart_beat_req message

- **GIVEN** a V6800 device sends a heart_beat_req message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="HEARTBEAT"
- **AND** it SHALL include deviceType="V6800"
- **AND** it SHALL map module_index to moduleIndex
- **AND** it SHALL map module_sn to moduleId
- **AND** it SHALL map module_u_num to uTotal

#### Scenario: Parse u_state_resp message (RFID snapshot)

- **GIVEN** a V6800 device sends a u_state_resp message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="RFID_SNAPSHOT"
- **AND** it SHALL iterate through the data array
- **AND** it SHALL map u_index to uIndex
- **AND** it SHALL map tag_code to tagId
- **AND** it SHALL filter out RFID items with null or empty tag_code
- **AND** it SHALL map warning to isAlarm (0=false, 1=true)

#### Scenario: Parse u_state_changed_notify_req message (RFID event)

- **GIVEN** a V6800 device sends a u_state_changed_notify_req message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="RFID_EVENT"
- **AND** it SHALL map new_state/old_state to action
- **AND** it SHALL convert 1/0 to "ATTACHED"
- **AND** it SHALL convert 0/1 to "DETACHED"

#### Scenario: Parse temper_humidity_exception_nofity_req message

- **GIVEN** a V6800 device sends a temper_humidity_exception_nofity_req message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="TEMP_HUM"
- **AND** it SHALL map temper_position to thIndex
- **AND** it SHALL map temper_swot to temp
- **AND** it SHALL map hygrometer_swot to hum

#### Scenario: Parse temper_humidity_resp message (query response)

- **GIVEN** a V6800 device sends a temper_humidity_resp message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="QRY_TEMP_HUM_RESP"
- **AND** it SHALL use the same field mapping as TEMP_HUM

#### Scenario: Parse door_state_changed_notify_req message (single door)

- **GIVEN** a V6800 device sends a door_state_changed_notify_req message with new_state
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="DOOR_STATE"
- **AND** it SHALL detect single door configuration
- **AND** it SHALL map new_state to doorState

#### Scenario: Parse door_state_changed_notify_req message (dual door)

- **GIVEN** a V6800 device sends a door_state_changed_notify_req message with new_state1 and new_state2
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="DOOR_STATE"
- **AND** it SHALL detect dual door configuration
- **AND** it SHALL map new_state1 to door1State
- **AND** it SHALL map new_state2 to door2State

#### Scenario: Parse door_state_resp message (query response)

- **GIVEN** a V6800 device sends a door_state_resp message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="QRY_DOOR_STATE_RESP"
- **AND** it SHALL place door state at root level (not in data array)
- **AND** it SHALL include moduleIndex and moduleId

#### Scenario: Parse devies_init_req message (device module info)

- **GIVEN** a V6800 device sends a devies_init_req message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="DEV_MOD_INFO"
- **AND** it SHALL map gateway_ip to ip
- **AND** it SHALL map gateway_mac to mac
- **AND** it SHALL map module_index to moduleIndex in data array
- **AND** it SHALL map module_sn to moduleId in data array
- **AND** it SHALL map module_u_num to uTotal in data array
- **AND** it SHALL map module_sw_version to fwVer in data array

#### Scenario: Parse devices_changed_req message

- **GIVEN** a V6800 device sends a devices_changed_req message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="UTOTAL_CHANGED"
- **AND** it SHALL map module_index to moduleIndex
- **AND** it SHALL map module_sn to moduleId
- **AND** it SHALL map module_u_num to uTotal
- **AND** it SHALL map module_sw_version to fwVer

#### Scenario: Parse u_color message (query color response)

- **GIVEN** a V6800 device sends a u_color message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="QRY_CLR_RESP"
- **AND** it SHALL map color to colorName
- **AND** it SHALL map code to colorCode

#### Scenario: Parse set_module_property_result_req message

- **GIVEN** a V6800 device sends a set_module_property_result_req message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="SET_CLR_RESP"
- **AND** it SHALL include result field from raw response

#### Scenario: Parse clear_u_warning message

- **GIVEN** a V6800 device sends a clear_u_warning message
- **WHEN** the parser receives the message
- **THEN** it SHALL return a SIF object with messageType="CLN_ALM_RESP"
- **AND** it SHALL include result field (boolean) from raw response

#### Scenario: Handle unknown message type

- **GIVEN** a V6800 device sends a message with unknown msg_type
- **WHEN** the parser receives the message
- **THEN** it SHALL set messageType="UNKNOWN"
- **AND** it SHALL preserve the raw payload
- **AND** it SHALL NOT throw an error

#### Scenario: Handle parse error

- **GIVEN** invalid JSON is received
- **WHEN** the parser attempts to parse
- **THEN** it SHALL log the error
- **AND** it SHALL return null
- **AND** it SHALL NOT throw an error

#### Scenario: Extract common envelope fields

- **GIVEN** any valid V6800 message
- **WHEN** the parser processes the message
- **THEN** it SHALL extract gateway_sn as deviceId
- **AND** it SHALL extract msg_type as meta.rawType
- **AND** it SHALL extract uuid_number as messageId (converted to String)
- **AND** it SHALL set deviceType="V6800"
- **AND** it SHALL include meta.topic from input

#### Scenario: Handle heart_beat_req with gateway module

- **GIVEN** a heart_beat_req message with module_type="mt_gw"
- **WHEN** the parser processes the message
- **THEN** it SHALL use module_sn as deviceId instead of gateway_sn

#### Scenario: Support module field aliases

- **GIVEN** a message with host_gateway_port_index instead of module_index
- **WHEN** the parser processes the message
- **THEN** it SHALL map host_gateway_port_index to moduleIndex
- **AND** it SHALL handle extend_module_sn as alias for moduleId

