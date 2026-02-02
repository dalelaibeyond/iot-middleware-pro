/**
 * UnifyNormalizer - Converts SIF (Standard Intermediate Format) to SUO (Standard Unified Object)
 *
 * Implements UnifyNormalizer specification.
 * Handles field standardization, state management, and event generation.
 */

const c = require("config");
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
    console.log("  UnifyNormalizer initialized");
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
        case "QRY_TEMP_HUM_RESP":
          this.handleTempHum(sif);
          break;
        case "NOISE_LEVEL":
          this.handleNoiseLevel(sif);
          break;
        case "DOOR_STATE":
          this.handleDoorState(sif);
          break;
        case "QRY_DOOR_STATE_RESP":
          this.handleDoorStateQuery(sif);
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
    // Use SIF messageId for META_CHANGED_EVENT
    const metaChangedMessageId = messageId;

    // Defensive check: ensure data is an array
    if (!data || !Array.isArray(data)) {
      console.warn(
        `[UnifyNormalizer] Invalid or missing heartbeat data for device ${deviceId}`,
      );
      return;
    }

    // Filter out invalid slots where moduleId == 0 (V5008)
    const validModules = data.filter((m) => m.moduleId && m.moduleId !== "0");

    // Emit HEARTBEAT SUO for storage service
    const heartbeatSuo = {
      deviceId,
      deviceType,
      messageType: "HEARTBEAT",
      messageId,
      // moduleIndex and moduleId are not at top level for HEARTBEAT
      // They are included in the payload for each module
      payload: validModules,
    };
    eventBus.emitDataNormalized(heartbeatSuo);

    // Update cache for each module
    validModules.forEach((module) => {
      this.stateCache.updateHeartbeat(
        deviceId,
        module.moduleIndex,
        module.moduleId,
        module.uTotal,
      );
    });

    // Merge activeModules into metadata cache with change detection
    // Note: HEARTBEAT doesn't include fwVer, so only update moduleId and uTotal
    // fwVer will be preserved from cache (MODULE_INFO/DEVICE_INFO messages)
    const metadata = {
      deviceType,
      activeModules: validModules.map((m) => {
        const moduleData = {
          moduleIndex: m.moduleIndex,
          moduleId: m.moduleId,
          uTotal: m.uTotal,
        };
        // Only include fwVer if it exists in the incoming data
        // This prevents undefined from being set, which becomes null in JSON
        if (m.fwVer !== undefined) {
          moduleData.fwVer = m.fwVer;
        }
        return moduleData;
      }),
    };
    const changes = this.stateCache.mergeMetadata(deviceId, metadata);

    // Emit META_CHANGED_EVENT if any changes detected (moduleId/uTotal changes)
    if (changes.length > 0) {
      const changeEventSuo = {
        deviceId,
        deviceType,
        messageType: "META_CHANGED_EVENT",
        messageId: metaChangedMessageId,
        payload: changes.map((desc) => ({ description: desc })),
      };
      eventBus.emitDataNormalized(changeEventSuo);
    }

    // Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle RFID_SNAPSHOT with global diffing
   * @param {Object} sif - Standard Intermediate Format
   */
  handleRfidSnapshot(sif) {
    const { deviceId, deviceType, messageId, data, moduleIndex, moduleId } =
      sif;
    // Use SIF messageId for RFID_EVENT as well
    const rfidEventMessageId = messageId;

    // Check if this is V5008 style (top-level fields merged into SIF)
    const isV5008Style =
      moduleIndex !== undefined &&
      moduleId !== undefined &&
      data &&
      Array.isArray(data);

    // Check if data has nested structure (V6800) or flat structure (V5008)
    const hasNestedData =
      data && data.length > 0 && data[0].data && Array.isArray(data[0].data);

    if (isV5008Style) {
      // V5008 style: top-level fields (moduleIndex, moduleId) are merged into SIF
      // Get previous snapshot from cache
      const previousSnapshot = this.stateCache.getRfidSnapshot(
        deviceId,
        moduleIndex,
      );

      // Normalize current snapshot (map uIndex to sensorIndex)
      const currentSnapshot = data.map((item) => ({
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
            messageId: rfidEventMessageId,
            moduleIndex: event.moduleIndex,
            moduleId: event.moduleId,
            payload: [
              {
                moduleIndex: event.moduleIndex,
                moduleId: event.moduleId,
                sensorIndex: event.sensorIndex,
                tagId: event.tagId,
                action: event.action,
                isAlarm: event.isAlarm || false,
              },
            ],
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
      this.stateCache.updateTelemetryField(
        deviceId,
        moduleIndex,
        "rfid_snapshot",
        currentSnapshot,
        "lastSeen_rfid",
      );
    } else if (hasNestedData) {
      // V6800 style: nested structure with module.data containing array of readings
      data.forEach((moduleData) => {
        const { moduleIndex, moduleId, data: rfidData } = moduleData;

        // Defensive check: ensure rfidData is an array
        if (!rfidData || !Array.isArray(rfidData)) {
          console.warn(
            `[UnifyNormalizer] Invalid or missing RFID snapshot data for device ${deviceId}, module ${moduleIndex}`,
          );
          return;
        }

        // Get previous snapshot from cache
        const previousSnapshot = this.stateCache.getRfidSnapshot(
          deviceId,
          moduleIndex,
        );

        // Normalize current snapshot (map uIndex to sensorIndex)
        const currentSnapshot = rfidData.map((item) => ({
          moduleIndex,
          moduleId,
          sensorIndex: item.uIndex || item.sensorIndex,
          tagId: item.tagId,
          isAlarm: item.isAlarm || false,
        }));

        // Compare and emit events for differences
        const events = this.diffRfidSnapshots(
          previousSnapshot,
          currentSnapshot,
        );

        if (events.length > 0) {
          // Emit RFID_EVENT for each difference
          events.forEach((event) => {
            const eventSuo = this.createSuo({
              deviceId,
              deviceType,
              messageType: "RFID_EVENT",
              messageId: rfidEventMessageId,
              moduleIndex: event.moduleIndex,
              moduleId: event.moduleId,
              payload: [
                {
                  moduleIndex: event.moduleIndex,
                  moduleId: event.moduleId,
                  sensorIndex: event.sensorIndex,
                  tagId: event.tagId,
                  action: event.action,
                  isAlarm: event.isAlarm || false,
                },
              ],
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
        this.stateCache.updateTelemetryField(
          deviceId,
          moduleIndex,
          "rfid_snapshot",
          currentSnapshot,
          "lastSeen_rfid",
        );
      });
    } else if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      data.data
    ) {
      // V5008 style: object with top-level fields and data array
      const {
        moduleIndex,
        moduleId,
        uTotal,
        onlineCount,
        data: rfidData,
      } = data;

      // Defensive check: ensure rfidData is an array
      if (!rfidData || !Array.isArray(rfidData)) {
        console.warn(
          `[UnifyNormalizer] Invalid or missing RFID snapshot data for device ${deviceId}, module ${moduleIndex}`,
        );
        return;
      }

      // Get previous snapshot from cache
      const previousSnapshot = this.stateCache.getRfidSnapshot(
        deviceId,
        moduleIndex,
      );

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
            messageId: rfidEventMessageId,
            moduleIndex: event.moduleIndex,
            moduleId: event.moduleId,
            payload: [
              {
                moduleIndex: event.moduleIndex,
                moduleId: event.moduleId,
                sensorIndex: event.sensorIndex,
                tagId: event.tagId,
                action: event.action,
                isAlarm: event.isAlarm || false,
              },
            ],
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
      this.stateCache.updateTelemetryField(
        deviceId,
        moduleIndex,
        "rfid_snapshot",
        currentSnapshot,
        "lastSeen_rfid",
      );
    } else {
      // V5008 style: flat structure where each item is a single reading
      // Group readings by moduleIndex
      const moduleReadings = new Map();
      data.forEach((reading) => {
        const { moduleIndex, moduleId } = reading;
        if (!moduleReadings.has(moduleIndex)) {
          moduleReadings.set(moduleIndex, { moduleId, readings: [] });
        }
        moduleReadings.get(moduleIndex).readings.push(reading);
      });

      // Process each module's readings
      moduleReadings.forEach(({ moduleId, readings }, moduleIndex) => {
        // Get previous snapshot from cache
        const previousSnapshot = this.stateCache.getRfidSnapshot(
          deviceId,
          moduleIndex,
        );

        // Normalize current snapshot (map uIndex to sensorIndex)
        const currentSnapshot = readings.map((item) => ({
          moduleIndex,
          moduleId,
          sensorIndex: item.uIndex || item.sensorIndex,
          tagId: item.tagId,
          isAlarm: item.isAlarm || false,
        }));

        // Compare and emit events for differences
        const events = this.diffRfidSnapshots(
          previousSnapshot,
          currentSnapshot,
        );

        if (events.length > 0) {
          // Emit RFID_EVENT for each difference
          events.forEach((event) => {
            const eventSuo = this.createSuo({
              deviceId,
              deviceType,
              messageType: "RFID_EVENT",
              messageId: rfidEventMessageId,
              moduleIndex: event.moduleIndex,
              moduleId: event.moduleId,
              payload: [
                {
                  moduleIndex: event.moduleIndex,
                  moduleId: event.moduleId,
                  sensorIndex: event.sensorIndex,
                  tagId: event.tagId,
                  action: event.action,
                  isAlarm: event.isAlarm || false,
                },
              ],
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
        this.stateCache.updateTelemetryField(
          deviceId,
          moduleIndex,
          "rfid_snapshot",
          currentSnapshot,
          "lastSeen_rfid",
        );
      });
    }
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

      // Check if data has nested structure (V6800) or flat structure (V5008)
      const hasNestedData =
        data && data.length > 0 && data[0].data && Array.isArray(data[0].data);

      if (hasNestedData) {
        // V6800 style: nested structure with module.data containing array of events
        data.forEach((moduleData) => {
          const { moduleIndex, moduleId, data: eventData } = moduleData;

          // Defensive check: ensure eventData is an array
          if (!eventData || !Array.isArray(eventData)) {
            console.warn(
              `[UnifyNormalizer] Invalid or missing RFID event data for device ${deviceId}, module ${moduleIndex}`,
            );
            return;
          }

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
      } else {
        // V5008 style: flat structure where each item is a single event
        data.forEach((event) => {
          const {
            moduleIndex,
            moduleId,
            uIndex,
            sensorIndex,
            tagId,
            action,
            isAlarm,
          } = event;

          const normalizedEvents = [
            {
              sensorIndex: uIndex || sensorIndex,
              tagId: tagId,
              action: action,
              isAlarm: isAlarm || false,
            },
          ];

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
  }

  /**
   * Handle TEMP_HUM message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleTempHum(sif) {
    const { deviceId, deviceType, messageId, data, moduleIndex, moduleId } =
      sif;

    // Check if data has nested structure (V6800) or flat structure (V5008)
    const hasNestedData =
      data && data.length > 0 && data[0].data && Array.isArray(data[0].data);

    if (hasNestedData) {
      // V6800 style: nested structure with module.data containing array of readings
      data.forEach((moduleData) => {
        const { moduleIndex, moduleId, data: thData } = moduleData;

        // Defensive check: ensure thData is an array
        if (!thData || !Array.isArray(thData)) {
          console.warn(
            `[UnifyNormalizer] Invalid or missing temp/hum data for device ${deviceId}, module ${moduleIndex}`,
          );
          return;
        }

        const normalizedData = thData
          .map((item) => ({
            sensorIndex: item.thIndex || item.sensorIndex,
            temp: item.temp,
            hum: item.hum,
          }))
          .filter((item) => {
            // Filter out readings where both temp and hum are 0 or null
            const tempValid =
              item.temp !== null && item.temp !== undefined && item.temp !== 0;
            const humValid =
              item.hum !== null && item.hum !== undefined && item.hum !== 0;
            return tempValid || humValid; // Keep if at least one value is valid
          });

        // Skip if no valid readings remain
        if (normalizedData.length === 0) {
          return;
        }

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
        this.stateCache.updateTelemetryField(
          deviceId,
          moduleIndex,
          "temp_hum",
          normalizedData,
          "lastSeen_th",
        );
      });
    } else if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      data.data
    ) {
      // V5008 style: object with top-level fields and data array
      const { moduleIndex, moduleId, data: thData } = data;

      // Defensive check: ensure thData is an array
      if (!thData || !Array.isArray(thData)) {
        console.warn(
          `[UnifyNormalizer] Invalid or missing temp/hum data for device ${deviceId}, module ${moduleIndex}`,
        );
        return;
      }

      const normalizedData = thData
        .map((item) => ({
          sensorIndex: item.thIndex || item.sensorIndex,
          temp: item.temp,
          hum: item.hum,
        }))
        .filter((item) => {
          // Filter out readings where both temp and hum are 0 or null
          const tempValid =
            item.temp !== null && item.temp !== undefined && item.temp !== 0;
          const humValid =
            item.hum !== null && item.hum !== undefined && item.hum !== 0;
          return tempValid || humValid; // Keep if at least one value is valid
        });

      // Skip if no valid readings remain
      if (normalizedData.length === 0) {
        return;
      }

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
      this.stateCache.updateTelemetryField(
        deviceId,
        moduleIndex,
        "temp_hum",
        normalizedData,
        "lastSeen_th",
      );
    } else if (
      moduleIndex !== undefined &&
      moduleId !== undefined &&
      data &&
      Array.isArray(data)
    ) {
      // V5008 style: top-level moduleIndex/moduleId with data array of readings
      // One SIF -> One SUO with all readings in payload

      // Defensive check: ensure data is an array
      if (!data || !Array.isArray(data)) {
        console.warn(
          `[UnifyNormalizer] Invalid or missing temp/hum data for device ${deviceId}, module ${moduleIndex}`,
        );
        return;
      }

      const normalizedData = data
        .map((item) => ({
          sensorIndex: item.thIndex || item.sensorIndex,
          temp: item.temp,
          hum: item.hum,
        }))
        .filter((item) => {
          // Filter out readings where both temp and hum are 0 or null
          const tempValid =
            item.temp !== null && item.temp !== undefined && item.temp !== 0;
          const humValid =
            item.hum !== null && item.hum !== undefined && item.hum !== 0;
          return tempValid || humValid; // Keep if at least one value is valid
        });

      // Skip if no valid readings remain
      if (normalizedData.length === 0) {
        return;
      }

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
      this.stateCache.updateTelemetryField(
        deviceId,
        moduleIndex,
        "temp_hum",
        normalizedData,
        "lastSeen_th",
      );
    } else {
      // V5008 style: flat structure where each item has its own moduleIndex/moduleId
      // Group readings by moduleIndex and emit one SUO per module
      const moduleReadings = new Map();
      data.forEach((reading) => {
        const { moduleIndex, moduleId } = reading;
        if (!moduleReadings.has(moduleIndex)) {
          moduleReadings.set(moduleIndex, { moduleId, readings: [] });
        }
        moduleReadings.get(moduleIndex).readings.push(reading);
      });

      // Process each module's readings - emit one SUO per module
      moduleReadings.forEach(({ moduleId, readings }, moduleIndex) => {
        const normalizedData = readings
          .map((item) => ({
            sensorIndex: item.thIndex || item.sensorIndex,
            temp: item.temp,
            hum: item.hum,
          }))
          .filter((item) => {
            // Filter out readings where both temp and hum are 0 or null
            const tempValid =
              item.temp !== null && item.temp !== undefined && item.temp !== 0;
            const humValid =
              item.hum !== null && item.hum !== undefined && item.hum !== 0;
            return tempValid || humValid; // Keep if at least one value is valid
          });

        // Skip if no valid readings remain
        if (normalizedData.length === 0) {
          return;
        }

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
        this.stateCache.updateTelemetryField(
          deviceId,
          moduleIndex,
          "temp_hum",
          normalizedData,
          "lastSeen_th",
        );
      });
    }
  }

  /**
   * Handle NOISE_LEVEL message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleNoiseLevel(sif) {
    const { deviceId, deviceType, messageId, data, moduleIndex, moduleId } =
      sif;

    // Check if data has nested structure (V6800) or flat structure (V5008)
    const hasNestedData =
      data && data.length > 0 && data[0].data && Array.isArray(data[0].data);

    if (hasNestedData) {
      // V6800 style: nested structure with module.data containing array of readings
      data.forEach((moduleData) => {
        const { moduleIndex, moduleId, data: nsData } = moduleData;

        // Defensive check: ensure nsData is an array
        if (!nsData || !Array.isArray(nsData)) {
          console.warn(
            `[UnifyNormalizer] Invalid or missing noise level data for device ${deviceId}, module ${moduleIndex}`,
          );
          return;
        }

        const normalizedData = nsData
          .map((item) => ({
            sensorIndex: item.nsIndex || item.sensorIndex,
            noise: item.noise,
          }))
          .filter((item) => {
            // Filter out readings where noise is null
            // Parser returns null for 0x00 raw values
            return item.noise !== null && item.noise !== undefined;
          });

        // Skip if no valid readings remain
        if (normalizedData.length === 0) {
          return;
        }

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
        this.stateCache.updateTelemetryField(
          deviceId,
          moduleIndex,
          "noise_level",
          normalizedData,
          "lastSeen_ns",
        );
      });
    } else if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      data.data
    ) {
      // V5008 style: object with top-level fields and data array
      const { moduleIndex, moduleId, data: nsData } = data;

      // Defensive check: ensure nsData is an array
      if (!nsData || !Array.isArray(nsData)) {
        console.warn(
          `[UnifyNormalizer] Invalid or missing noise level data for device ${deviceId}, module ${moduleIndex}`,
        );
        return;
      }

      const normalizedData = nsData
        .map((item) => ({
          sensorIndex: item.nsIndex || item.sensorIndex,
          noise: item.noise,
        }))
        .filter((item) => {
          // Filter out readings where noise is null
          // Parser returns null for 0x00 raw values
          return item.noise !== null && item.noise !== undefined;
        });

      // Skip if no valid readings remain
      if (normalizedData.length === 0) {
        return;
      }

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
      this.stateCache.updateTelemetryField(
        deviceId,
        moduleIndex,
        "noise_level",
        normalizedData,
        "lastSeen_ns",
      );
    } else if (
      moduleIndex !== undefined &&
      moduleId !== undefined &&
      data &&
      Array.isArray(data)
    ) {
      // V5008 style: top-level moduleIndex/moduleId with data array of readings
      // One SIF -> One SUO with all readings in payload

      // Defensive check: ensure data is an array
      if (!data || !Array.isArray(data)) {
        console.warn(
          `[UnifyNormalizer] Invalid or missing noise level data for device ${deviceId}, module ${moduleIndex}`,
        );
        return;
      }

      const normalizedData = data
        .map((item) => ({
          sensorIndex: item.nsIndex || item.sensorIndex,
          noise: item.noise,
        }))
        .filter((item) => {
          // Filter out readings where noise is null
          // Parser returns null for 0x00 raw values
          return item.noise !== null && item.noise !== undefined;
        });

      // Skip if no valid readings remain
      if (normalizedData.length === 0) {
        return;
      }

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
      this.stateCache.updateTelemetryField(
        deviceId,
        moduleIndex,
        "noise_level",
        normalizedData,
        "lastSeen_ns",
      );
    } else {
      // V5008 style: flat structure where each item has its own moduleIndex/moduleId
      // Group readings by moduleIndex and emit one SUO per module
      const moduleReadings = new Map();
      data.forEach((reading) => {
        const { moduleIndex, moduleId } = reading;
        if (!moduleReadings.has(moduleIndex)) {
          moduleReadings.set(moduleIndex, { moduleId, readings: [] });
        }
        moduleReadings.get(moduleIndex).readings.push(reading);
      });

      // Process each module's readings - emit one SUO per module
      moduleReadings.forEach(({ moduleId, readings }, moduleIndex) => {
        const normalizedData = readings
          .map((item) => ({
            sensorIndex: item.nsIndex || item.sensorIndex,
            noise: item.noise,
          }))
          .filter((item) => {
            // Filter out readings where noise is 0 or null
            return (
              item.noise !== null &&
              item.noise !== undefined &&
              item.noise !== 0
            );
          });

        // Skip if no valid readings remain
        if (normalizedData.length === 0) {
          return;
        }

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
        this.stateCache.updateTelemetryField(
          deviceId,
          moduleIndex,
          "noise_level",
          normalizedData,
          "lastSeen_ns",
        );
      });
    }
  }

  /**
   * Handle DOOR_STATE message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleDoorState(sif) {
    const {
      deviceId,
      deviceType,
      messageId,
      data,
      moduleIndex,
      moduleId,
      doorState,
      door1State,
      door2State,
    } = sif;

    // Check if data is an array (V6800) or object with top-level fields (V5008)
    if (data && Array.isArray(data)) {
      // V6800 style: array of module data
      data.forEach((moduleData) => {
        const { moduleIndex, moduleId } = moduleData;

        // Business logic validation: modAddr must be [1-5] and modId must not be 0
        if (moduleIndex < 1 || moduleIndex > 5 || moduleId === "0") {
          console.warn(
            `[UnifyNormalizer] Invalid door state data for device ${deviceId}: moduleIndex=${moduleIndex}, moduleId=${moduleId}. Skipping.`,
          );
          return;
        }

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
        const telemetry =
          this.stateCache.getTelemetry(deviceId, moduleIndex) || {};
        telemetry.doorState = doorState.doorState;
        telemetry.door1State = doorState.door1State;
        telemetry.door2State = doorState.door2State;
        telemetry.lastSeen_door = new Date().toISOString();
        this.stateCache.setTelemetry(deviceId, moduleIndex, telemetry);
      });
    } else if (data && typeof data === "object" && !Array.isArray(data)) {
      // V5008 style: object with top-level fields (moduleIndex, moduleId, doorState)
      const { moduleIndex, moduleId, doorState, door1State, door2State } = data;

      // Business logic validation: modAddr must be [1-5] and modId must not be 0
      if (moduleIndex < 1 || moduleIndex > 5 || moduleId === "0") {
        console.warn(
          `[UnifyNormalizer] Invalid door state data for device ${deviceId}: moduleIndex=${moduleIndex}, moduleId=${moduleId}. Skipping.`,
        );
        return;
      }

      // Move door state fields into payload array
      const doorStatePayload = {
        doorState: doorState || null,
        door1State: door1State || null,
        door2State: door2State || null,
      };

      const suo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "DOOR_STATE",
        messageId,
        moduleIndex,
        moduleId,
        payload: [doorStatePayload],
      });
      eventBus.emitDataNormalized(suo);

      // Update cache
      const telemetry =
        this.stateCache.getTelemetry(deviceId, moduleIndex) || {};
      telemetry.doorState = doorStatePayload.doorState;
      telemetry.door1State = doorStatePayload.door1State;
      telemetry.door2State = doorStatePayload.door2State;
      telemetry.lastSeen_door = new Date().toISOString();
      this.stateCache.setTelemetry(deviceId, moduleIndex, telemetry);
    } else if (moduleIndex !== undefined && moduleId !== undefined) {
      // V5008 style: door state fields merged directly into SIF (no data object)
      // Business logic validation: modAddr must be [1-5] and modId must not be 0
      if (moduleIndex < 1 || moduleIndex > 5 || moduleId === "0") {
        console.warn(
          `[UnifyNormalizer] Invalid door state data for device ${deviceId}: moduleIndex=${moduleIndex}, moduleId=${moduleId}. Skipping.`,
        );
        return;
      }

      // Move door state fields into payload array
      const doorStatePayload = {
        doorState: doorState || null,
        door1State: door1State || null,
        door2State: door2State || null,
      };

      const suo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "DOOR_STATE",
        messageId,
        moduleIndex,
        moduleId,
        payload: [doorStatePayload],
      });
      eventBus.emitDataNormalized(suo);

      // Update cache
      const telemetry =
        this.stateCache.getTelemetry(deviceId, moduleIndex) || {};
      telemetry.doorState = doorStatePayload.doorState;
      telemetry.door1State = doorStatePayload.door1State;
      telemetry.door2State = doorStatePayload.door2State;
      telemetry.lastSeen_door = new Date().toISOString();
      this.stateCache.setTelemetry(deviceId, moduleIndex, telemetry);
    } else {
      console.warn(
        `[UnifyNormalizer] Invalid or missing door state data for device ${deviceId}`,
      );
      return;
    }
  }

  /**
   * Handle QRY_DOOR_STATE_RESP message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleDoorStateQuery(sif) {
    const { deviceId, deviceType, messageId, data } = sif;

    // QRY_DOOR_STATE_RESP has a different structure than DOOR_STATE
    // It contains moduleIndex and moduleId at the top level of data
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const { moduleIndex, moduleId, doorState, door1State, door2State } = data;

      // Business logic validation: modAddr must be [1-5] and modId must not be 0
      if (moduleIndex < 1 || moduleIndex > 5 || moduleId === "0") {
        console.warn(
          `[UnifyNormalizer] Invalid door state query response for device ${deviceId}: moduleIndex=${moduleIndex}, moduleId=${moduleId}. Skipping.`,
        );
        return;
      }

      // Move door state fields into payload array
      const doorStatePayload = {
        doorState: doorState || null,
        door1State: door1State || null,
        door2State: door2State || null,
      };

      const suo = this.createSuo({
        deviceId,
        deviceType,
        messageType: "DOOR_STATE",
        messageId,
        moduleIndex,
        moduleId,
        payload: [doorStatePayload],
      });
      eventBus.emitDataNormalized(suo);

      // Update cache
      const telemetry =
        this.stateCache.getTelemetry(deviceId, moduleIndex) || {};
      telemetry.doorState = doorStatePayload.doorState;
      telemetry.door1State = doorStatePayload.door1State;
      telemetry.door2State = doorStatePayload.door2State;
      telemetry.lastSeen_door = new Date().toISOString();
      this.stateCache.setTelemetry(deviceId, moduleIndex, telemetry);
    } else {
      console.warn(
        `[UnifyNormalizer] Invalid or missing door state query response data for device ${deviceId}`,
      );
      return;
    }
  }

  /**
   * Handle metadata messages (DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO)
   * @param {Object} sif - Standard Intermediate Format
   */
  handleMetadata(sif) {
    const { deviceId, deviceType, messageType, messageId, data } = sif;
    // Use SIF messageId for META_CHANGED_EVENT
    const metaChangedMessageId = messageId;

    // For V5008, handle DEVICE_INFO and MODULE_INFO differently
    if (messageType === "DEVICE_INFO") {
      // DEVICE_INFO: Updates device-level fwVer, ip, mac, mask, gwIp (no module data)
      const incomingMetadata = {
        deviceType,
        ip: sif.ip || null,
        mac: sif.mac || null,
        fwVer: sif.fwVer || null, // Device-level firmware
        mask: sif.mask || null,
        gwIp: sif.gwIp || null,
        activeModules: [], // No module data in DEVICE_INFO
      };

      // Merge with change detection
      const changes = this.stateCache.mergeMetadata(deviceId, incomingMetadata);

      // Emit META_CHANGED_EVENT if any changes detected
      if (changes.length > 0) {
        const changeEventSuo = {
          deviceId,
          deviceType,
          messageType: "META_CHANGED_EVENT",
          messageId: metaChangedMessageId,
          payload: changes.map((desc) => ({ description: desc })),
        };
        eventBus.emitDataNormalized(changeEventSuo);
      }
    } else if (messageType === "MODULE_INFO") {
      // MODULE_INFO: Updates module-level fwVer based on moduleIndex (no device-level fields)
      const activeModules =
        data && Array.isArray(data)
          ? data.map((m) => {
              const moduleData = {
                moduleIndex: m.moduleIndex,
                moduleId: null, // MODULE_INFO doesn't have moduleId
                fwVer: m.fwVer, // Module-level firmware
              };
              // Only include uTotal if it exists in the incoming data
              // This prevents null from overwriting existing uTotal value
              if (m.uTotal !== undefined) {
                moduleData.uTotal = m.uTotal;
              }
              return moduleData;
            })
          : [];

      const incomingMetadata = {
        deviceType,
        ip: undefined, // MODULE_INFO doesn't have ip
        mac: undefined, // MODULE_INFO doesn't have mac
        fwVer: undefined, // MODULE_INFO doesn't have device-level fwVer
        mask: undefined, // MODULE_INFO doesn't have mask
        gwIp: undefined, // MODULE_INFO doesn't have gwIp
        activeModules: activeModules,
      };

      // Merge with change detection
      const changes = this.stateCache.mergeMetadata(deviceId, incomingMetadata);

      // Emit META_CHANGED_EVENT if any changes detected
      if (changes.length > 0) {
        const changeEventSuo = {
          deviceId,
          deviceType,
          messageType: "META_CHANGED_EVENT",
          messageId: metaChangedMessageId,
          payload: changes.map((desc) => ({ description: desc })),
        };
        eventBus.emitDataNormalized(changeEventSuo);
      }
    } else {
      // V6800 style (DEV_MOD_INFO) - handle both device and module data
      const activeModules =
        data && Array.isArray(data)
          ? data.map((m) => ({
              moduleIndex: m.moduleIndex,
              moduleId: m.moduleId,
              fwVer: m.fwVer || null,
              uTotal: m.uTotal,
            }))
          : [];

      const incomingMetadata = {
        deviceType,
        ip: sif.ip || null,
        mac: sif.mac || null,
        fwVer: sif.fwVer || null,
        mask: sif.mask || null,
        gwIp: sif.gwIp || null,
        activeModules: activeModules,
      };

      // Merge with change detection
      const changes = this.stateCache.mergeMetadata(deviceId, incomingMetadata);

      // Emit META_CHANGED_EVENT if any changes detected
      if (changes.length > 0) {
        const changeEventSuo = {
          deviceId,
          deviceType,
          messageType: "META_CHANGED_EVENT",
          messageId: metaChangedMessageId,
          payload: changes.map((desc) => ({ description: desc })),
        };
        eventBus.emitDataNormalized(changeEventSuo);
      }
    }

    // Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle UTOTAL_CHANGED message
   * @param {Object} sif - Standard Intermediate Format
   */
  handleUtotalChanged(sif) {
    const { deviceId, deviceType, messageId, data } = sif;
    // Use SIF messageId for META_CHANGED_EVENT
    const metaChangedMessageId = messageId;

    // Extract metadata
    const incomingMetadata = {
      deviceType,
      activeModules: data
        ? data.map((m) => ({
            moduleIndex: m.moduleIndex,
            moduleId: m.moduleId,
            fwVer: m.fwVer || null,
            uTotal: m.uTotal,
          }))
        : [],
    };

    // Merge with change detection
    const changes = this.stateCache.mergeMetadata(deviceId, incomingMetadata);

    // Emit META_CHANGED_EVENT if any changes detected
    if (changes.length > 0) {
      const changeEventSuo = {
        deviceId,
        deviceType,
        messageType: "META_CHANGED_EVENT",
        messageId: metaChangedMessageId,
        payload: changes.map((desc) => ({ description: desc })),
      };
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

    // Handle V6800 style (data array) and V5008 style (object with top-level fields)
    if (data && Array.isArray(data)) {
      // V6800 style: array of command response data
      // Wrap result in payload array
      const normalizedPayload = data.map((item) => ({
        moduleIndex: item.moduleIndex,
        moduleId: item.moduleId || null,
        result: item.result || null,
        originalReq: item.originalReq || null,
        colorMap: item.data || item.colorMap || null, // Check for both possible field names
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
    } else if (data && typeof data === "object" && !Array.isArray(data)) {
      // V5008 style: object with top-level fields (result, originalReq, moduleIndex, data for QRY_CLR_RESP)
      const { result, originalReq, moduleIndex, data: colorData } = data;

      let normalizedPayload;
      if (messageType === "QRY_CLR_RESP" && colorData) {
        // QRY_CLR_RESP has color data array
        normalizedPayload = [
          {
            moduleIndex: moduleIndex,
            moduleId: null,
            result: result || null,
            originalReq: originalReq || null,
            colorMap: colorData,
          },
        ];
      } else {
        // SET_CLR_RESP and CLN_ALM_RESP have no data array
        normalizedPayload = [
          {
            moduleIndex: moduleIndex,
            moduleId: null,
            result: result || null,
            originalReq: originalReq || null,
            colorMap: null,
          },
        ];
      }

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
    } else {
      console.warn(
        `[UnifyNormalizer] Invalid or missing command response data for device ${deviceId}`,
      );
      return;
    }
  }

  /**
   * Emit DEVICE_METADATA SUO from cache
   * @param {Object} sif - Standard Intermediate Format
   */
  emitDeviceMetadata(sif) {
    const { deviceId, deviceType, messageId } = sif;

    // DEBUG: Log SIF structure
    //console.log(
    //  "[UnifyNormalizer] emitDeviceMetadata SIF:",
    //  JSON.stringify(sif, null, 2),
    //);
    //console.log("[UnifyNormalizer] deviceType from SIF:", deviceType);

    // Get full metadata from cache (UOS)
    const fullMetadata = this.stateCache.getMetadata(deviceId);
    if (fullMetadata) {
      // For V5008, payload (activeModules) should always come from cache (UOS)
      // to ensure complete module information:
      // - HEARTBEAT provides: moduleIndex, moduleId, uTotal
      // - MODULE_INFO provides: moduleIndex, fwVer
      // - DEVICE_INFO provides: device-level fields (ip, mac, fwVer, mask, gwIp)
      // Cache merges all these together based on deviceId and moduleIndex
      const activeModules = fullMetadata.activeModules || [];

      // Use SIF fields if present (DEVICE_INFO), otherwise use cached fields (MODULE_INFO/HEARTBEAT)
      const ip = sif.ip !== undefined ? sif.ip : fullMetadata.ip || null;
      const mac = sif.mac !== undefined ? sif.mac : fullMetadata.mac || null;
      const fwVer =
        sif.fwVer !== undefined ? sif.fwVer : fullMetadata.fwVer || null;
      const mask =
        sif.mask !== undefined ? sif.mask : fullMetadata.mask || null;
      const gwIp =
        sif.gwIp !== undefined ? sif.gwIp : fullMetadata.gwIp || null;

      const metadataSuo = {
        deviceId,
        deviceType,
        messageType: "DEVICE_METADATA",
        messageId: messageId,
        // moduleIndex and moduleId are not at top level for DEVICE_METADATA
        // They are included in payload for each module
        // Device-level fields from cache (UOS) or SIF
        ip,
        mac,
        fwVer,
        mask,
        gwIp,
        // Payload with modules from cache (UOS) - contains complete module info
        payload: activeModules,
      };

      // DEBUG: Log SUO structure before emission
      //console.log(
      //  "[UnifyNormalizer] Emitting DEVICE_METADATA SUO:",
      //  JSON.stringify(metadataSuo, null, 2),
      //);

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
    const {
      deviceId,
      deviceType,
      messageType,
      messageId,
      moduleIndex,
      moduleId,
      payload,
      ...extraFields
    } = params;

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
