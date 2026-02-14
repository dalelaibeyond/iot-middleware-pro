/**
 * StorageService - Batch Writer & Pivoting Logic
 *
 * Handles storage of normalized data to MySQL with batching and pivoting.
 * Routes SUO messages to appropriate database tables based on message type.
 * 
 * Schema Version: 2.1.0
 * - Added message_id to all tables for traceability
 * - parse_at: SUO creation time
 * - update_at: DB operation time (handled by DB default)
 */

const eventBus = require("../../core/EventBus");
const database = require("../../core/Database");
const StateCache = require("../normalizer/StateCache");
const c = require("config");
const logger = require("../../core/Logger");

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
    console.log("  StorageService started");
  }

  /**
   * Handle normalized data
   * @param {Object} suo - Standard Unified Object
   */
  handleData(suo) {
    try {
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
          // Unknown message type - silently skip
          break;
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
      // Error already emitted via EventBus
      eventBus.emitError(error, "StorageService");
    }
  }

  /**
   * Handle heartbeat message
   * @param {Object} suo - Standard Unified Object
   */
  handleHeartbeat(suo) {
    const { deviceId, deviceType, payload, messageId } = suo;

    // Update cache with module details
    payload.forEach((item) => {
      StateCache.updateHeartbeat(
        deviceId,
        deviceType,
        item.moduleIndex,
        item.moduleId,
        item.uTotal,
      );
    });

    // Buffer for storage
    this.addToBatch("iot_heartbeat", {
      device_id: deviceId,
      message_id: messageId || null,
      active_modules: JSON.stringify(payload),
      parse_at: new Date(),
    });
  }

  /**
   * Handle RFID snapshot message
   * @param {Object} suo - Standard Unified Object
   */
  handleRfidSnapshot(suo) {
    const { deviceId, moduleIndex, payload, messageId } = suo;

    // Buffer for storage (store as JSON)
    this.addToBatch("iot_rfid_snapshot", {
      device_id: deviceId,
      module_index: moduleIndex || 1,
      message_id: messageId || null,
      rfid_snapshot: JSON.stringify(payload),
      parse_at: new Date(),
    });
  }

  /**
   * Handle RFID event message
   * @param {Object} suo - Standard Unified Object
   */
  handleRfidEvent(suo) {
    const { deviceId, moduleIndex, payload, messageId } = suo;

    // Iterate through payload and insert each item
    payload.forEach((item) => {
      this.addToBatch("iot_rfid_event", {
        device_id: deviceId,
        module_index: moduleIndex,
        message_id: messageId || "",
        sensor_index: item.sensorIndex,
        tag_id: item.tagId,
        action: item.action,
        alarm: item.isAlarm || false,
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
      message_id: suo.messageId || null,
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
      message_id: suo.messageId || null,
      ...pivotedData,
      parse_at: new Date(),
    });
  }

  /**
   * Handle door state message
   * @param {Object} suo - Standard Unified Object
   */
  handleDoorState(suo) {
    const { deviceId, moduleIndex, payload, messageId } = suo;

    // Read the first item in the payload array
    if (payload.length > 0) {
      const item = payload[0];
      this.addToBatch("iot_door_event", {
        device_id: deviceId,
        module_index: moduleIndex,
        message_id: messageId || "",
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

    // Ensure all fields are defined to avoid undefined bindings
    // Use null for missing fields (HEARTBEAT messages may not have device-level metadata)
    // Note: update_at is handled by DB default, but we set it explicitly for UPSERT
    const metadataData = {
      device_id: deviceId,
      device_type: deviceType || "V6800",
      device_fwVer: fwVer !== undefined ? fwVer : null,
      device_mask: mask !== undefined ? mask : null,
      device_gwIp: gwIp !== undefined ? gwIp : null,
      device_ip: ip !== undefined ? ip : null,
      device_mac: mac !== undefined ? mac : null,
      active_modules: payload && payload.length > 0 ? JSON.stringify(payload) : null,
      parse_at: new Date(),
      // update_at uses DB DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE
    };

    // Debug: Log DB upsert
    try {
      const debugConfig = c.get("debug");
      if (debugConfig && debugConfig.logDb) {
        logger.debug("DB upsert", { table: "iot_meta_data", data: metadataData });
      }
    } catch (e) {
      // Debug config not available, skip
    }

    // Use UPSERT (Insert on Duplicate Key Update)
    database.upsert("iot_meta_data", metadataData, "device_id");
  }

  /**
   * Handle command result message
   * @param {Object} suo - Standard Unified Object
   */
  handleCmdResult(suo) {
    const { deviceId, payload, messageId } = suo;

    if (payload.length > 0) {
      const result = payload[0];
      this.addToBatch("iot_cmd_result", {
        device_id: deviceId,
        message_id: messageId || "",
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
    const { deviceId, deviceType, payload, messageId } = suo;

    // Iterate through payload and insert one row per description
    payload.forEach((item) => {
      this.addToBatch("iot_topchange_event", {
        device_id: deviceId,
        device_type: deviceType,
        message_id: messageId || "",
        event_desc: item.description,
        parse_at: new Date(),
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

    try {
      // Convert Map to Array to ensure consistent iteration order
      const entries = Array.from(this.batchBuffer.entries());

      for (const [table, data] of entries) {
        if (data.length === 0) {
          continue;
        }

        // Debug: Log DB batch insert
        try {
          const debugConfig = c.get("debug");
          if (debugConfig && debugConfig.logDb) {
            logger.debug("DB batchInsert", { table, recordCount: data.length, sample: data[0] });
          }
        } catch (e) {
          // Debug config not available, skip
        }

        try {
          await database.batchInsert(table, data);
        } catch (error) {
          console.error(`[StorageService] Failed to flush to ${table}:`, error.message);
          eventBus.emitError(error, "StorageService");
        }
      }

      // Clear buffer
      this.batchBuffer.clear();
    } catch (error) {
      console.error("[StorageService] Flush error:", error.message);
      eventBus.emitError(error, "StorageService");
    }
  }

  /**
   * Stop storage service
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("  Stopping StorageService...");

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
    console.log("  StorageService stopped");
  }
}

module.exports = new StorageService();
