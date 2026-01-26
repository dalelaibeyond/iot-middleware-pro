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
   * Initialize normalizer
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
      const { deviceId, deviceType, messageType, messageId } = sif;

      // Process based on message type
      switch (messageType) {
        case "HEARTBEAT":
          this.handleHeartbeat(sif);
          break;
        case "RFID_SNAPSHOT":
          this.handleRfidSnapshot(sif);
          break;
        case "RFID_EVENT":
          this.handleRfidEvent(sif);
          break;
        case "TEMP_HUM":
          this.handleTempHum(sif);
          break;
        case "NOISE_LEVEL":
          this.handleNoiseLevel(sif);
          break;
        case "DOOR_STATE":
          this.handleDoorState(sif);
          break;
        case "DEVICE_INFO":
        case "MODULE_INFO":
        case "DEV_MOD_INFO":
        case "DEVICE_METADATA":
          this.handleMetadata(sif);
          break;
        case "UTOTAL_CHANGED":
          this.handleUtotalChanged(sif);
          break;
        case "QRY_CLR_RESP":
        case "SET_CLR_RESP":
        case "CLN_ALM_RESP":
          this.handleCommandResponses(sif);
          break;
        default:
          console.warn(`Unknown message type: ${messageType}`);
          break;
      }
    } catch (error) {
      console.error(`UnifyNormalizer error:`, error.message);
      eventBus.emitError(error, "UnifyNormalizer");
    }
  }

  /**
   * Handle HEARTBEAT message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleHeartbeat(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // Filter out invalid slots where moduleId == 0 (V5008)
    const validModules = data.filter((m) => m.moduleId && m.moduleId !== "0");

    // Update cache for each module
    validModules.forEach((module) => {
      this.stateCache.updateHeartbeat(deviceId, module.moduleIndex, module.moduleId, module.uTotal);
    });

    // Merge activeModules into metadata cache
    const metadata = {
      deviceType,
      activeModules: validModules.map((m) => ({
        moduleIndex: m.moduleIndex,
        moduleId: m.moduleId,
        fwVer: m.fwVer || null,
        uTotal: m.uTotal,
      })),
    };
    this.stateCache.mergeMetadata(deviceId, metadata);

    // Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle RFID_SNAPSHOT with global diffing
   * @param {Object} sif - Standard Intermediate Format
   */
  handleRfidSnapshot(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // Process each module
    data.forEach((moduleData) => {
      const { moduleIndex, moduleId, data: rfidData } = moduleData;

      // Get previous snapshot from cache
      const previousSnapshot = this.stateCache.getRfidSnapshot(deviceId, moduleIndex);

      // Normalize current snapshot (map uIndex to sensorIndex)
      const currentSnapshot = rfidData.map((item) => ({
        moduleIndex,
        moduleId,
        sensorIndex: item.uIndex || item.sensorIndex,
        tagId: item.tagId,
        isAlarm: item.isAlarm || false,
      }));

      // Compare and emit events for differences
      const events = this.diffRfidSnapshots(previousSnapshot, currentSnapshot);

      if (events.length > 0) {
        // Emit RFID_EVENT for each difference
        events.forEach((event) => {
          const eventSuo = this.createSuo({
            deviceId,
            deviceType,
            messageType: "RFID_EVENT",
            messageId: `${deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            moduleIndex: event.moduleIndex,
            moduleId: event.moduleId,
            payload: [{
              sensorIndex: event.sensorIndex,
              tagId: event.tagId,
              action: event.action,
              isAlarm: event.isAlarm || false,
            }],
          });
          eventBus.emitDataNormalized(eventSuo);
        });
      }

      // Emit full RFID_SNAPSHOT SUO for database
      const snapshotSuo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "RFID_SNAPSHOT",
        messageId,
        moduleIndex,
        moduleId,
        payload: currentSnapshot,
      });
      eventBus.emitDataNormalized(snapshotSuo);

      // Update cache with new snapshot
      this.stateCache.updateTelemetryField(deviceId, moduleIndex, "rfid_snapshot", currentSnapshot, "lastSeen_rfid");
    });
  }

  /**
   * Handle RFID_EVENT
   * @param {Object} sif - Standard Intermediate Format
   */
  handleRfidEvent(sif) {
    const { deviceId, deviceType } = sif;

    // V6800 RFID_EVENT: Trigger sync only
    if (deviceType === "V6800") {
      // Emit command.request to fetch fresh snapshot
      eventBus.emitCommandRequest({
        deviceId,
        messageType: "QRY_RFID_SNAPSHOT",
      });
      // Do NOT update cache
      // Do NOT emit SUO
    } else {
      // V5008 RFID_EVENT: Emit SUO directly
      const { messageId, data } = sif;
      data.forEach((moduleData) => {
        const { moduleIndex, moduleId, data: eventData } = moduleData;
        const normalizedEvents = eventData.map((item) => ({
          sensorIndex: item.uIndex || item.sensorIndex,
          tagId: item.tagId,
          action: item.action,
          isAlarm: item.isAlarm || false,
        }));

        const eventSuo = this.createSuo({
          deviceId,
          deviceType,
          messageType: "RFID_EVENT",
          messageId,
          moduleIndex,
          moduleId,
          payload: normalizedEvents,
        });
        eventBus.emitDataNormalized(eventSuo);
      });
    }
  }

  /**
   * Handle TEMP_HUM message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleTempHum(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // Split into separate SUOs per module (flattening)
    data.forEach((moduleData) => {
      const { moduleIndex, moduleId, data: thData } = moduleData;
      const normalizedData = thData.map((item) => ({
        sensorIndex: item.thIndex || item.sensorIndex,
        temp: item.temp,
        hum: item.hum,
      }));

      const suo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "TEMP_HUM",
        messageId,
        moduleIndex,
        moduleId,
        payload: normalizedData,
      });
      eventBus.emitDataNormalized(suo);

      // Update cache
      this.stateCache.updateTelemetryField(deviceId, moduleIndex, "temp_hum", normalizedData, "lastSeen_th");
    });
  }

  /**
   * Handle NOISE_LEVEL message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleNoiseLevel(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // Split into separate SUOs per module (flattening)
    data.forEach((moduleData) => {
      const { moduleIndex, moduleId, data: nsData } = moduleData;
      const normalizedData = nsData.map((item) => ({
        sensorIndex: item.nsIndex || item.sensorIndex,
        noise: item.noise,
      }));

      const suo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "NOISE_LEVEL",
        messageId,
        moduleIndex,
        moduleId,
        payload: normalizedData,
      });
      eventBus.emitDataNormalized(suo);

      // Update cache
      this.stateCache.updateTelemetryField(deviceId, moduleIndex, "noise_level", normalizedData, "lastSeen_ns");
    });
  }

  /**
   * Handle DOOR_STATE message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleDoorState(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // Split into separate SUOs per module (flattening)
    data.forEach((moduleData) => {
      const { moduleIndex, moduleId } = moduleData;

      // Move door state fields into payload array
      const doorState = {
        doorState: moduleData.doorState || null,
        door1State: moduleData.door1State || null,
        door2State: moduleData.door2State || null,
      };

      const suo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "DOOR_STATE",
        messageId,
        moduleIndex,
        moduleId,
        payload: [doorState],
      });
      eventBus.emitDataNormalized(suo);

      // Update cache
      const telemetry = this.stateCache.getTelemetry(deviceId, moduleIndex) || {};
      telemetry.doorState = doorState.doorState;
      telemetry.door1State = doorState.door1State;
      telemetry.door2State = doorState.door2State;
      telemetry.lastSeen_door = new Date().toISOString();
      this.stateCache.setTelemetry(deviceId, moduleIndex, telemetry);
    });
  }

  /**
   * Handle metadata messages (DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO)
   * @param {Object} sif - Standard Intermediate Format
   */
  handleMetadata(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // Extract metadata from SIF
    const incomingMetadata = {
      deviceType,
      ip: sif.ip || null,
      mac: sif.mac || null,
      fwVer: sif.fwVer || null,
      mask: sif.mask || null,
      gwIp: sif.gwIp || null,
      activeModules: data ? data.map((m) => ({
        moduleIndex: m.moduleIndex,
        moduleId: m.moduleId,
        fwVer: m.fwVer || null,
        uTotal: m.uTotal,
      })) : [],
    };

    // Merge with change detection
    const changes = this.stateCache.mergeMetadata(deviceId, incomingMetadata);

    // Emit META_CHANGED_EVENT if any changes detected
    if (changes.length > 0) {
      const changeEventSuo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "META_CHANGED_EVENT",
        messageId: `${deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        moduleIndex: 0, // Device-level event
        moduleId: "0",
        payload: changes.map((desc) => ({ description: desc })),
      });
      eventBus.emitDataNormalized(changeEventSuo);
    }

    // Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle UTOTAL_CHANGED message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleUtotalChanged(sif) {
    const { deviceId, deviceType, data } = sif;

    // Extract metadata
    const incomingMetadata = {
      deviceType,
      activeModules: data ? data.map((m) => ({
        moduleIndex: m.moduleIndex,
        moduleId: m.moduleId,
        fwVer: m.fwVer || null,
        uTotal: m.uTotal,
      })) : [],
    };

    // Merge with change detection
    const changes = this.stateCache.mergeMetadata(deviceId, incomingMetadata);

    // Emit META_CHANGED_EVENT if any changes detected
    if (changes.length > 0) {
      const changeEventSuo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "META_CHANGED_EVENT",
        messageId: `${deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        moduleIndex: 0,
        moduleId: "0",
        payload: changes.map((desc) => ({ description: desc })),
      });
      eventBus.emitDataNormalized(changeEventSuo);
    }

    // Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle command responses (QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP)
   * @param {Object} sif - Standard Intermediate Format
   */
  handleCommandResponses(sif) {
    const { deviceId, deviceType, messageType, messageId, data } = sif;

    // Wrap result in payload array
    const normalizedPayload = data.map((item) => ({
      moduleIndex: item.moduleIndex,
      moduleId: item.moduleId || null,
      result: item.result || null,
      originalReq: item.originalReq || null,
      colorMap: item.colorMap || null,
    }));

    const suo = this.createSuo({
      deviceId,
      deviceType,
      messageType,
      messageId,
      moduleIndex: 0, // Device-level
      moduleId: "0",
      payload: normalizedPayload,
    });
    eventBus.emitDataNormalized(suo);
  }

  /**
   * Emit DEVICE_METADATA SUO from cache
   * @param {Object} sif - Standard Intermediate Format
   */
  emitDeviceMetadata(sif) {
    const { deviceId, deviceType } = sif;

    // Get full metadata from cache
    const fullMetadata = this.stateCache.getMetadata(deviceId);
    if (fullMetadata) {
      const metadataSuo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "DEVICE_METADATA",
        messageId: `${deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        moduleIndex: 0, // Device-level
        moduleId: "0",
        // Common fields
        ip: fullMetadata.ip,
        mac: fullMetadata.mac,
        // V5008 specific (send null if V6800)
        fwVer: fullMetadata.fwVer,
        mask: fullMetadata.mask,
        gwIp: fullMetadata.gwIp,
        // Payload with modules
        payload: fullMetadata.activeModules || [],
      });
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

    // Create maps for O(n) comparison
    const previousMap = new Map();
    const currentMap = new Map();

    if (previous && Array.isArray(previous)) {
      previous.forEach((item) => {
        previousMap.set(item.sensorIndex, item);
      });
    }

    if (current && Array.isArray(current)) {
      current.forEach((item) => {
        currentMap.set(item.sensorIndex, item);
      });
    }

    // Check for new items (ATTACHED)
    current.forEach((item) => {
      const prevItem = previousMap.get(item.sensorIndex);

      if (!prevItem) {
        // New tag attached
        events.push({
          moduleIndex: item.moduleIndex,
          moduleId: item.moduleId,
          sensorIndex: item.sensorIndex,
          tagId: item.tagId,
          action: "ATTACHED",
          isAlarm: item.isAlarm || false,
        });
      } else if (prevItem.tagId !== item.tagId) {
        // Tag ID changed (treat as detach + attach)
        events.push({
          moduleIndex: prevItem.moduleIndex,
          moduleId: prevItem.moduleId,
          sensorIndex: prevItem.sensorIndex,
          tagId: prevItem.tagId,
          action: "DETACHED",
          isAlarm: prevItem.isAlarm || false,
        });
        events.push({
          moduleIndex: item.moduleIndex,
          moduleId: item.moduleId,
          sensorIndex: item.sensorIndex,
          tagId: item.tagId,
          action: "ATTACHED",
          isAlarm: item.isAlarm || false,
        });
      } else if (prevItem.isAlarm !== item.isAlarm) {
        // Alarm status changed
        events.push({
          moduleIndex: item.moduleIndex,
          moduleId: item.moduleId,
          sensorIndex: item.sensorIndex,
          tagId: item.tagId,
          action: item.isAlarm ? "ALARM_ON" : "ALARM_OFF",
          isAlarm: item.isAlarm || false,
        });
      }
    });

    // Check for removed items (DETACHED)
    if (previous && Array.isArray(previous)) {
      previous.forEach((item) => {
        const currItem = currentMap.get(item.sensorIndex);
        if (!currItem) {
          // Tag detached
          events.push({
            moduleIndex: item.moduleIndex,
            moduleId: item.moduleId,
            sensorIndex: item.sensorIndex,
            tagId: item.tagId,
            action: "DETACHED",
            isAlarm: false,
          });
        }
      });
    }

    return events;
  }

  /**
   * Create SUO with proper structure
   * @param {Object} params - SUO parameters
   * @returns {Object} Standard Unified Object
   */
  createSuo(params) {
    const { deviceId, deviceType, messageType, messageId, moduleIndex, moduleId, payload, ...extraFields } = params;

    return {
      deviceId,
      deviceType,
      messageType,
      messageId,
      moduleIndex: moduleIndex || 0,
      moduleId: moduleId || "0",
      payload: Array.isArray(payload) ? payload : [],
      ...extraFields,
    };
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
