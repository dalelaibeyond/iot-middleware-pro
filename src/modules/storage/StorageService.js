/**
 * StorageService - Batch Writer & Pivoting Logic
 *
 * Handles storage of normalized data to MySQL with batching and pivoting.
 * Routes SUO messages to appropriate database tables based on message type.
 */

const eventBus = require("../../core/EventBus");
const database = require("../../core/Database");
const StateCache = require("../normalizer/StateCache");
const c = require("config");

class StorageService {
  constructor() {
    this.config = null;
    this.batchBuffer = new Map();
    this.flushTimer = null;
    this.isRunning = false;
  }

  /**
   * Initialize storage service
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  StorageService initialized");
  }

  /**
   * Start storage service
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn("StorageService already started");
      return;
    }

    // Subscribe to normalized data
    eventBus.onDataNormalized((suo) => {
      this.handleData(suo);
    });

    // Start periodic flush
    const flushInterval = this.config.flushInterval || 1000;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, flushInterval);

    this.isRunning = true;
    console.log("StorageService started");
  }

  /**
   * Handle normalized data
   * @param {Object} suo - Standard Unified Object
   */
  handleData(suo) {
    try {
      //TEMP-DEBUG: Log SUO structure when received
      console.log("[StorageService] Received SUO:");
      console.log(suo);

      // Check if this message type should be stored
      if (this.config.filters && this.config.filters.length > 0) {
        if (!this.config.filters.includes(suo.messageType)) {
          return; // Skip this message type
        }
      }

      // Route to appropriate handler based on message type
      switch (suo.messageType) {
        case "HEARTBEAT":
          this.handleHeartbeat(suo);
          break;
        case "RFID_SNAPSHOT":
          this.handleRfidSnapshot(suo);
          break;
        case "RFID_EVENT":
          this.handleRfidEvent(suo);
          break;
        case "TEMP_HUM":
          this.handleTempHum(suo);
          break;
        case "NOISE_LEVEL":
          this.handleNoiseLevel(suo);
          break;
        case "DOOR_STATE":
          this.handleDoorState(suo);
          break;
        case "DEVICE_METADATA":
          this.handleDeviceMetadata(suo);
          break;
        case "QRY_CLR_RESP":
        case "SET_CLR_RESP":
        case "CLN_ALM_RESP":
          this.handleCmdResult(suo);
          break;
        case "META_CHANGED_EVENT":
          this.handleMetaChangedEvent(suo);
          break;
        default:
          console.warn(`Unknown message type: ${suo.messageType}`);
      }

      // Check if batch is full
      const batchSize = this.config.batchSize || 100;
      const totalBuffered = Array.from(this.batchBuffer.values()).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );

      if (totalBuffered >= batchSize) {
        this.flush();
      }
    } catch (error) {
      console.error("StorageService error:", error.message);
      eventBus.emitError(error, "StorageService");
    }
  }

  /**
   * Handle heartbeat message
   * @param {Object} suo - Standard Unified Object
   */
  handleHeartbeat(suo) {
    const { deviceId, payload } = suo;

    // Update cache with module details
    payload.forEach((item) => {
      StateCache.updateHeartbeat(
        deviceId,
        item.moduleIndex,
        item.moduleId,
        item.uTotal,
      );
    });

    // Buffer for storage
    this.addToBatch("iot_heartbeat", {
      device_id: deviceId,
      modules: JSON.stringify(payload),
      parse_at: new Date(),
    });
  }

  /**
   * Handle RFID snapshot message
   * @param {Object} suo - Standard Unified Object
   */
  handleRfidSnapshot(suo) {
    const { deviceId, moduleIndex, payload } = suo;

    // Buffer for storage (store as JSON)
    this.addToBatch("iot_rfid_snapshot", {
      device_id: deviceId,
      module_index: moduleIndex || 1,
      rfid_snapshot: JSON.stringify(payload),
      parse_at: new Date(),
    });
  }

  /**
   * Handle RFID event message
   * @param {Object} suo - Standard Unified Object
   */
  handleRfidEvent(suo) {
    const { deviceId, payload } = suo;

    // Iterate through payload and insert each item
    payload.forEach((item) => {
      this.addToBatch("iot_rfid_event", {
        device_id: deviceId,
        module_index: item.moduleIndex,
        sensor_index: item.sensorIndex,
        tag_id: item.tagId,
        action: item.action,
        alarm: item.alarm || false,
        parse_at: new Date(),
      });
    });
  }

  /**
   * Handle temperature/humidity message with pivoting
   * @param {Object} suo - Standard Unified Object
   */
  handleTempHum(suo) {
    const { deviceId, moduleIndex, payload } = suo;

    // moduleIndex is now at SUO top level (not in payload items)
    // Pivot: map sensorIndex to temp_indexXX and hum_indexXX
    const pivotedData = {};
    payload.forEach((item) => {
      if (item.sensorIndex >= 10 && item.sensorIndex <= 15) {
        pivotedData[`temp_index${item.sensorIndex}`] = item.temp;
        pivotedData[`hum_index${item.sensorIndex}`] = item.hum;
      }
    });

    // Insert one row per module
    this.addToBatch("iot_temp_hum", {
      device_id: deviceId,
      module_index: moduleIndex,
      ...pivotedData,
      parse_at: new Date(),
    });
  }

  /**
   * Handle noise level message with pivoting
   * @param {Object} suo - Standard Unified Object
   */
  handleNoiseLevel(suo) {
    const { deviceId, moduleIndex, payload } = suo;

    // moduleIndex is now at SUO top level (not in payload items)
    // Pivot: map sensorIndex to noise_indexXX (indices 16-18)
    const pivotedData = {};
    payload.forEach((item) => {
      if (item.sensorIndex >= 16 && item.sensorIndex <= 18) {
        pivotedData[`noise_index${item.sensorIndex}`] = item.noise;
      }
    });

    // Insert one row per module
    this.addToBatch("iot_noise_level", {
      device_id: deviceId,
      module_index: moduleIndex,
      ...pivotedData,
      parse_at: new Date(),
    });
  }

  /**
   * Handle door state message
   * @param {Object} suo - Standard Unified Object
   */
  handleDoorState(suo) {
    const { deviceId, moduleIndex, payload } = suo;

    // Read the first item in the payload array
    if (payload.length > 0) {
      const item = payload[0];
      this.addToBatch("iot_door_event", {
        device_id: deviceId,
        module_index: moduleIndex,
        doorState: item.doorState,
        door1State: item.door1State,
        door2State: item.door2State,
        parse_at: new Date(),
      });
    }
  }

  /**
   * Handle device metadata message
   * @param {Object} suo - Standard Unified Object
   */
  handleDeviceMetadata(suo) {
    const { deviceId, deviceType, payload, ip, mac, fwVer, mask, gwIp } = suo;

    // DEBUG: Log SUO structure to diagnose deviceType issue
    //console.log("[StorageService] handleDeviceMetadata SUO:", JSON.stringify(suo, null, 2));
    //console.log("[StorageService] deviceType value:", deviceType);

    // Ensure all fields are defined to avoid undefined bindings
    // Use null for missing fields (HEARTBEAT messages may not have device-level metadata)
    const metadataData = {
      device_id: deviceId,
      device_type: deviceType || "V6800",
      device_fwVer: fwVer !== undefined ? fwVer : null,
      device_mask: mask !== undefined ? mask : null,
      device_gwIp: gwIp !== undefined ? gwIp : null,
      device_ip: ip !== undefined ? ip : null,
      device_mac: mac !== undefined ? mac : null,
      modules: payload && payload.length > 0 ? JSON.stringify(payload) : null,
      parse_at: new Date(),
      update_at: new Date(),
    };

    //DEBUG: Log metadataData before upsert
    //console.log("[StorageService] iot_meta_data:");
    //console.log(metadataData);

    // Use UPSERT (Insert on Duplicate Key Update)
    database.upsert("iot_meta_data", metadataData, "device_id");
  }

  /**
   * Handle command result message
   * @param {Object} suo - Standard Unified Object
   */
  handleCmdResult(suo) {
    const { deviceId, payload } = suo;

    if (payload.length > 0) {
      const result = payload[0];
      this.addToBatch("iot_cmd_result", {
        device_id: deviceId,
        cmd: suo.messageType,
        result: result.result,
        original_req: result.originalReq || null,
        color_map: result.colorMap ? JSON.stringify(result.colorMap) : null,
        parse_at: new Date(),
      });
    }
  }

  /**
   * Handle metadata changed event message
   * @param {Object} suo - Standard Unified Object
   */
  handleMetaChangedEvent(suo) {
    const { deviceId, deviceType, payload } = suo;

    // Iterate through payload and insert one row per description
    payload.forEach((item) => {
      this.addToBatch("iot_topchange_event", {
        device_id: deviceId,
        device_type: deviceType,
        event_desc: item.description,
        parse_at: new Date(),
        update_at: new Date(),
      });
    });
  }

  /**
   * Add data to batch buffer
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   */
  addToBatch(table, data) {
    if (!this.batchBuffer.has(table)) {
      this.batchBuffer.set(table, []);
    }
    this.batchBuffer.get(table).push(data);
  }

  /**
   * Flush all batches to database
   */
  async flush() {
    if (this.batchBuffer.size === 0) {
      return;
    }

    // DEBUG: Log batch buffer contents before flushing
    //console.log("[StorageService] Batch buffer contents before flush:");
    //for (const [table, data] of this.batchBuffer.entries()) {
    //  console.log(`  Table: ${table}, Records: ${data.length}`);
    //}

    try {
      // Convert Map to Array to ensure consistent iteration order
      const entries = Array.from(this.batchBuffer.entries());

      for (const [table, data] of entries) {
        if (data.length === 0) {
          continue;
        }

        // DEBUG: Log table and data before flushing
        console.log(`[StorageService] Flushing table: ${table}, data:`);
        console.log(data);

        try {
          await database.batchInsert(table, data);
          //console.log(`Flushed ${data.length} records to ${table}`);
        } catch (error) {
          console.error(`Failed to flush to ${table}:`, error.message);
          eventBus.emitError(error, "StorageService");
        }
      }

      // Clear buffer
      this.batchBuffer.clear();
    } catch (error) {
      console.error("StorageService flush error:", error.message);
      eventBus.emitError(error, "StorageService");
    }
  }

  /**
   * Stop storage service
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping StorageService...");

    // Flush remaining data
    await this.flush();

    // Stop periodic flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Unsubscribe from events
    eventBus.removeAllListeners("data.normalized");

    this.isRunning = false;
    console.log("StorageService stopped");
  }
}

module.exports = new StorageService();
