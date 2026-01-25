/**
 * UnifyNormalizer - Converts SIF (Standard Intermediate Format) to SUO (Standard Unified Object)
 *
 * Implements UnifyNormalizer specification.
 * Handles field standardization, state management, and event generation.
 */

const eventBus = require("../../core/EventBus");
const StateCache = require("./StateCache");

class UnifyNormalizer {
  constructor() {
    this.config = null;
    this.stateCache = StateCache;
  }

  /**
   * Initialize the normalizer
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("UnifyNormalizer initialized");
  }

  /**
   * Start the normalizer
   * @returns {Promise<void>}
   */
  async start() {
    // Subscribe to parsed data from ParserManager
    eventBus.on("data.parsed", (sif) => {
      this.normalize(sif);
    });

    console.log("UnifyNormalizer started");
  }

  /**
   * Normalize SIF to SUO
   * @param {Object} sif - Standard Intermediate Format
   */
  normalize(sif) {
    try {
      const { meta, deviceType, messageType, data } = sif;

      // Determine structure type (Single-Module V5008 or Multi-Module V6800)
      const isMultiModule = deviceType === "V6800";

      // Generate unique message ID
      const messageId = `${meta.deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Normalize message type to unified enum
      const unifiedMessageType = this.getUnifiedMessageType(messageType);

      // Process based on message type
      if (isMultiModule) {
        // Multi-module processing (V6800)
        this.normalizeMultiModule(sif, unifiedMessageType, messageId);
      } else {
        // Single-module processing (V5008)
        this.normalizeSingleModule(sif, unifiedMessageType, messageId);
      }
    } catch (error) {
      console.error(`UnifyNormalizer error:`, error.message);
      eventBus.emitError(error, "UnifyNormalizer");
    }
  }

  /**
   * Normalize single-module (V5008) message
   * @param {Object} sif - Standard Intermediate Format
   * @param {string} unifiedMessageType - Unified message type
   * @param {string} messageId - Unique message ID
   */
  normalizeSingleModule(sif, unifiedMessageType, messageId) {
    const { meta, data } = sif;

    // Standardize field names and inject timestamps
    const normalizedPayload = data.map((item) => ({
      ...item,
      moduleIndex: 1, // V5008 is single-module
      sensorIndex: item.thIndex || item.noiseIndex || item.sensorIndex || 0,
      timestamp: new Date(),
    }));

    // Create SUO
    const suo = {
      deviceId: meta.deviceId,
      deviceType: meta.deviceType,
      messageType: unifiedMessageType,
      messageId: messageId,
      payload: normalizedPayload,
    };

    // Handle stateful message types
    this.handleStatefulMessages(suo);

    // Emit normalized data
    eventBus.emitDataNormalized(suo);
  }

  /**
   * Normalize multi-module (V6800) message
   * @param {Object} sif - Standard Intermediate Format
   * @param {string} unifiedMessageType - Unified message type
   * @param {string} messageId - Unique message ID
   */
  normalizeMultiModule(sif, unifiedMessageType, messageId) {
    const { meta, data } = sif;

    // V6800 data is already organized by module
    // Standardize field names
    const normalizedPayload = data.map((item) => ({
      ...item,
      timestamp: new Date(),
    }));

    // Create SUO
    const suo = {
      deviceId: meta.deviceId,
      deviceType: meta.deviceType,
      messageType: unifiedMessageType,
      messageId: messageId,
      payload: normalizedPayload,
    };

    // Handle stateful message types
    this.handleStatefulMessages(suo);

    // Emit normalized data
    eventBus.emitDataNormalized(suo);
  }

  /**
   * Handle stateful message types (RFID, metadata)
   * @param {Object} suo - Standard Unified Object
   */
  handleStatefulMessages(suo) {
    switch (suo.messageType) {
      case "RFID_SNAPSHOT":
        this.handleRfidSnapshot(suo);
        break;
      case "RFID_EVENT":
        this.handleRfidEvent(suo);
        break;
      case "HEARTBEAT":
      case "DEVICE_INFO":
        this.handleMetadata(suo);
        break;
      default:
        // Stateless messages (TEMP_HUM, NOISE, DOOR) pass through
        break;
    }
  }

  /**
   * Handle RFID snapshot with global diffing
   * @param {Object} suo - Standard Unified Object
   */
  handleRfidSnapshot(suo) {
    const { deviceId, payload } = suo;

    // Get previous snapshot from cache
    const previousSnapshot = this.stateCache.getRfidSnapshot(deviceId, 1);

    // Compare and emit events for differences
    const events = this.diffRfidSnapshots(previousSnapshot, payload);

    if (events.length > 0) {
      // Emit RFID_EVENT for each difference
      events.forEach((event) => {
        const eventSuo = {
          deviceId: deviceId,
          deviceType: suo.deviceType,
          messageType: "RFID_EVENT",
          messageId: `${deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          payload: [event],
        };
        eventBus.emitDataNormalized(eventSuo);
      });
    }

    // Update cache with new snapshot
    this.stateCache.setRfidSnapshot(deviceId, 1, payload);
  }

  /**
   * Handle RFID event with sync trigger
   * @param {Object} suo - Standard Unified Object
   */
  handleRfidEvent(suo) {
    // Do NOT update cache for V6800 RFID events
    // Emit command.request to fetch fresh snapshot
    eventBus.emitCommandRequest({
      deviceId: suo.deviceId,
      messageType: "QRY_RFID_SNAPSHOT",
    });
  }

  /**
   * Handle metadata merge
   * @param {Object} suo - Standard Unified Object
   */
  handleMetadata(suo) {
    const { deviceId, payload } = suo;

    // Merge partial metadata into cache
    this.stateCache.mergeMetadata(deviceId, payload);

    // Emit full DEVICE_METADATA from cache
    const fullMetadata = this.stateCache.getMetadata(deviceId);
    if (fullMetadata) {
      const metadataSuo = {
        deviceId: deviceId,
        deviceType: suo.deviceType,
        messageType: "DEVICE_METADATA",
        messageId: `${deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payload: [fullMetadata],
      };
      eventBus.emitDataNormalized(metadataSuo);
    }
  }

  /**
   * Diff two RFID snapshots to find changes
   * @param {Array} previous - Previous snapshot
   * @param {Array} current - Current snapshot
   * @returns {Array} Array of RFID events
   */
  diffRfidSnapshots(previous, current) {
    const events = [];

    // Create maps for easy lookup
    const previousMap = new Map();
    const currentMap = new Map();

    if (previous) {
      previous.forEach((item) => {
        previousMap.set(`${item.sensorIndex}_${item.tagId}`, item);
      });
    }

    current.forEach((item) => {
      currentMap.set(`${item.sensorIndex}_${item.tagId}`, item);
    });

    // Check for new items (ATTACHED)
    current.forEach((item) => {
      const key = `${item.sensorIndex}_${item.tagId}`;
      const prevItem = previousMap.get(key);

      if (!prevItem) {
        events.push({
          moduleIndex: item.moduleIndex,
          sensorIndex: item.sensorIndex,
          tagId: item.tagId,
          action: "ATTACHED",
          alarm: item.isAlarm || false,
        });
      } else if (prevItem.isAlarm !== item.isAlarm) {
        // Alarm status changed
        events.push({
          moduleIndex: item.moduleIndex,
          sensorIndex: item.sensorIndex,
          tagId: item.tagId,
          action: item.isAlarm ? "ALARM_ON" : "ALARM_OFF",
          alarm: item.isAlarm || false,
        });
      }
    });

    // Check for removed items (DETACHED)
    previous.forEach((item) => {
      const key = `${item.sensorIndex}_${item.tagId}`;
      if (!currentMap.has(key)) {
        events.push({
          moduleIndex: item.moduleIndex,
          sensorIndex: item.sensorIndex,
          tagId: item.tagId,
          action: "DETACHED",
          alarm: false,
        });
      }
    });

    return events;
  }

  /**
   * Get unified message type
   * @param {string} messageType - Original message type
   * @returns {string} Unified message type
   */
  getUnifiedMessageType(messageType) {
    const typeMap = {
      HEARTBEAT: "HEARTBEAT",
      TEMP_HUM: "TEMP_HUM",
      NOISE_LEVEL: "NOISE_LEVEL",
      RFID_SNAPSHOT: "RFID_SNAPSHOT",
      RFID_EVENT: "RFID_EVENT",
      DOOR_STATE: "DOOR_STATE",
      DEVICE_INFO: "DEVICE_INFO",
      CMD_RESPONSE: "QRY_CLR_RESP",
      META_CHANGED_EVENT: "META_CHANGED_EVENT",
    };

    return typeMap[messageType] || messageType;
  }

  /**
   * Stop the normalizer
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping UnifyNormalizer...");

    // Unsubscribe from events
    eventBus.removeAllListeners("data.parsed");

    console.log("UnifyNormalizer stopped");
  }
}

module.exports = new UnifyNormalizer();
