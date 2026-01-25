## ADDED Requirements

### Requirement: V6800 JSON Parser Implementation

The V6800Parser SHALL implement complete JSON protocol parsing according to the V6800 specification, including message type mapping, field mapping, and all message type handlers.

#### Scenario: Parse HEARTBEAT message

- **WHEN** a V6800 JSON message with msg_type "heart_beat_req" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType HEARTBEAT and data array containing moduleIndex, moduleId, and uTotal
- **AND** parser filters out modules where module_type is "mt_gw"

#### Scenario: Parse RFID_SNAPSHOT message

- **WHEN** a V6800 JSON message with msg_type "u_state_resp" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType RFID_SNAPSHOT and data array containing uIndex, isAlarm, and tagId for each tag
- **AND** parser maps module_index to moduleIndex and u_index to uIndex

#### Scenario: Parse RFID_EVENT message

- **WHEN** a V6800 JSON message with msg_type "u_state_changed_notify_req" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType RFID_EVENT and data array containing uIndex, action, tagId, and isAlarm
- **AND** parser maps action to "ATTACHED" or "DETACHED" based on new_state and old_state values

#### Scenario: Parse TEMP_HUM message

- **WHEN** a V6800 JSON message with msg_type "temper_humidity_exception_nofity_req" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType TEMP_HUM and data array containing thIndex, temp, and hum
- **AND** parser maps temper_position to thIndex and hygrometer_swot to hum

#### Scenario: Parse DOOR_STATE message

- **WHEN** a V6800 JSON message with msg_type "door_state_changed_notify_req" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType DOOR_STATE and data array containing doorState
- **AND** parser handles single door (new_state) and dual door (new_state1/new_state2) configurations

#### Scenario: Parse DEV_MOD_INFO message

- **WHEN** a V6800 JSON message with msg_type "devies_init_req" is received
- **THEN** parser extracts device_id, model, fwVer, ip, mask, gwIp, and mac
- **AND** parser returns SIF with messageType DEVICE_INFO and data array containing device metadata

#### Scenario: Parse MODULE_INFO message

- **WHEN** a V6800 JSON message with msg_type "devies_init_req" is received
- **THEN** parser extracts device_id and module firmware versions
- **AND** parser returns SIF with messageType MODULE_INFO and data array containing moduleIndex and fwVer for each module

#### Scenario: Parse QRY_TEMP_HUM_RESP message

- **WHEN** a V6800 JSON message with msg_type "temper_humidity_resp" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType QRY_TEMP_HUM_RESP and data array containing thIndex, temp, and hum
- **AND** parser maps module_index to moduleIndex

#### Scenario: Parse QRY_DOOR_STATE_RESP message

- **WHEN** a V6800 JSON message with msg_type "door_state_resp" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType QRY_DOOR_STATE_RESP and data array containing doorState
- **AND** parser handles single door (door_state) and dual door (door_state1/door_state2) configurations

#### Scenario: Parse QRY_CLR_RESP message

- **WHEN** a V6800 JSON message with msg_type "u_color" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType QRY_CLR_RESP and data array containing colorName and colorCode
- **AND** parser maps color_name to colorName and color_code to colorCode

#### Scenario: Parse SET_CLR_RESP message

- **WHEN** a V6800 JSON message with msg_type "set_module_property_result_req" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType SET_CLR_RESP and data array
- **AND** parser maps module_index to moduleIndex and result to "success" or "failure"

#### Scenario: Parse CLN_ALM_RESP message

- **WHEN** a V6800 JSON message with msg_type "clear_u_warning" is received
- **THEN** parser extracts device_id, module information, and returns SIF with messageType CLN_ALM_RESP and data array
- **AND** parser maps module_index to moduleIndex and result to "true" or "false"

#### Scenario: Parse UTOTAL_CHANGED message

- **WHEN** a V6800 JSON message with msg_type "devices_changed_req" is received
- **THEN** parser extracts device_id, device_type, and returns SIF with messageType UTOTAL_CHANGED and data array containing module information
- **AND** parser maps module_index to moduleIndex, module_sn to moduleId, module_u_num to uTotal, module_sw_version to fwVer

#### Scenario: Handle parse error

- **WHEN** JSON message is invalid or cannot be parsed
- **THEN** parser logs error and returns null
- **AND** parser does not throw exceptions
