## ADDED Requirements

### Requirement: Message Type Routing

The StorageService SHALL route Standard Unified Object (SUO) messages to appropriate database tables based on message type.

#### Scenario: Route HEARTBEAT message to iot_heartbeat table
- **WHEN** a SUO with messageType "HEARTBEAT" is received
- **THEN** the service SHALL update StateCache with module details
- **AND** the service SHALL buffer the heartbeat data for iot_heartbeat table

#### Scenario: Route RFID_SNAPSHOT message to iot_rfid_snapshot table
- **WHEN** a SUO with messageType "RFID_SNAPSHOT" is received
- **THEN** the service SHALL buffer the RFID snapshot as JSON for iot_rfid_snapshot table

#### Scenario: Route RFID_EVENT message to iot_rfid_event table
- **WHEN** a SUO with messageType "RFID_EVENT" is received
- **THEN** the service SHALL buffer each RFID event as a separate row in iot_rfid_event table

#### Scenario: Route TEMP_HUM message to iot_temp_hum table
- **WHEN** a SUO with messageType "TEMP_HUM" is received
- **THEN** the service SHALL apply pivoting logic to map sensorIndex 10-15 to temp_indexXX and hum_indexXX columns
- **AND** the service SHALL group data by module index
- **AND** the service SHALL buffer one row per module

#### Scenario: Route NOISE_LEVEL message to iot_noise_level table
- **WHEN** a SUO with messageType "NOISE_LEVEL" is received
- **THEN** the service SHALL apply pivoting logic to map sensorIndex 16-18 to noise_indexXX columns
- **AND** the service SHALL group data by module index
- **AND** the service SHALL buffer one row per module

#### Scenario: Route DOOR_STATE message to iot_door_event table
- **WHEN** a SUO with messageType "DOOR_STATE" is received
- **THEN** the service SHALL buffer door state data from the first payload item

#### Scenario: Route DEVICE_METADATA message to iot_meta_data table
- **WHEN** a SUO with messageType "DEVICE_METADATA" is received
- **THEN** the service SHALL perform an UPSERT operation to iot_meta_data table
- **AND** the service SHALL use device_id as the unique key

#### Scenario: Route QRY_CLR_RESP message to iot_cmd_result table
- **WHEN** a SUO with messageType "QRY_CLR_RESP" is received
- **THEN** the service SHALL buffer command result data including color map for iot_cmd_result table

#### Scenario: Route META_CHANGED_EVENT message to iot_topchange_event table
- **WHEN** a SUO with messageType "META_CHANGED_EVENT" is received
- **THEN** the service SHALL buffer each event description as a separate row in iot_topchange_event table

#### Scenario: Handle unknown message type
- **WHEN** a SUO with an unknown messageType is received
- **THEN** the service SHALL log a warning message
- **AND** the service SHALL not process the message

### Requirement: Batching and Flush Behavior

The StorageService SHALL buffer data in batches and flush to database based on size and time triggers.

#### Scenario: Buffer data for batch insertion
- **WHEN** data is received for a specific table
- **THEN** the service SHALL add the data to the batch buffer for that table
- **AND** the service SHALL maintain separate buffers for each table

#### Scenario: Flush when batch size is reached
- **WHEN** the total buffered records reaches the configured batchSize
- **THEN** the service SHALL flush all buffered data to the database
- **AND** the service SHALL clear the buffer after successful flush

#### Scenario: Flush on periodic timer
- **WHEN** the configured flushInterval elapses
- **THEN** the service SHALL flush all buffered data to the database
- **AND** the service SHALL continue the periodic timer

#### Scenario: Handle empty buffer during flush
- **WHEN** flush is called and the buffer is empty
- **THEN** the service SHALL return without error

#### Scenario: Handle database errors during flush
- **WHEN** a database error occurs during flush
- **THEN** the service SHALL log the error
- **AND** the service SHALL emit an error event via EventBus
- **AND** the service SHALL continue processing other tables

### Requirement: Message Type Filtering

The StorageService SHALL support filtering of message types to selectively store data.

#### Scenario: Process only filtered message types
- **WHEN** filters are configured with specific message types
- **THEN** the service SHALL only process messages whose messageType is in the filters list
- **AND** the service SHALL skip messages not in the filters list

#### Scenario: Process all message types when filters are empty
- **WHEN** filters are empty or not configured
- **THEN** the service SHALL process all message types

### Requirement: Pivoting Logic

The StorageService SHALL apply pivoting logic for multi-sensor data to optimize storage structure.

#### Scenario: Pivot temperature/humidity data
- **WHEN** TEMP_HUM message contains sensorIndex 10-15
- **THEN** the service SHALL map sensorIndex to temp_indexXX and hum_indexXX columns
- **AND** the service SHALL only include columns for present sensor indices
- **AND** the service SHALL not insert NULL values for missing indices

#### Scenario: Pivot noise level data
- **WHEN** NOISE_LEVEL message contains sensorIndex 16-18
- **THEN** the service SHALL map sensorIndex to noise_indexXX columns
- **AND** the service SHALL only include columns for present sensor indices
- **AND** the service SHALL not insert NULL values for missing indices

#### Scenario: Group pivoted data by module index
- **WHEN** pivoting multi-sensor data
- **THEN** the service SHALL group data by moduleIndex
- **AND** the service SHALL create one row per module index

### Requirement: Error Handling

The StorageService SHALL handle errors gracefully without crashing the application.

#### Scenario: Emit error on exception
- **WHEN** an exception occurs during message processing
- **THEN** the service SHALL catch the exception
- **AND** the service SHALL log the error message
- **AND** the service SHALL emit an error event via EventBus

#### Scenario: Continue processing after error
- **WHEN** an error occurs processing a single message
- **THEN** the service SHALL continue processing subsequent messages

### Requirement: Service Lifecycle

The StorageService SHALL support initialization, start, and stop operations.

#### Scenario: Initialize service with configuration
- **WHEN** initialize is called with configuration
- **THEN** the service SHALL store the configuration
- **AND** the service SHALL log initialization message

#### Scenario: Start service and subscribe to events
- **WHEN** start is called
- **THEN** the service SHALL subscribe to data.normalized events via EventBus
- **AND** the service SHALL start the periodic flush timer
- **AND** the service SHALL set isRunning flag to true

#### Scenario: Stop service and cleanup
- **WHEN** stop is called
- **THEN** the service SHALL flush remaining buffered data
- **AND** the service SHALL stop the periodic flush timer
- **AND** the service SHALL unsubscribe from events
- **AND** the service SHALL set isRunning flag to false

#### Scenario: Prevent duplicate start
- **WHEN** start is called and service is already running
- **THEN** the service SHALL log a warning
- **AND** the service SHALL not start again
