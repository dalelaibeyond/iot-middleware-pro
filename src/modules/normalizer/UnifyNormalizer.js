/**
 * UnifyNormalizer - Converts SIF (Standard Intermediate Format) to SUO (Standard Unified Object)
 *
 * Implements UnifyNormalizer specification.
 * Handles field standardization, state management, and event generation.
 */

const c = require("config");
const eventBus = require("../../core/EventBus");
const StateCache = require("./StateCache");
const SmartHeartbeat = require("./SmartHeartbeat");

class UnifyNormalizer {
  constructor() {
    this.config = null;
    this.stateCache = StateCache;
    this.smartHeartbeat = null; // Initialized in initialize()
  }

  /**
   * Initialize normalizer
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    
    // Initialize SmartHeartbeat with config (may be disabled)
    const shConfig = config.smartHeartbeat || {};
    this.smartHeartbeat = new SmartHeartbeat(eventBus, shConfig);
    
    console.log(`  UnifyNormalizer initialized (SmartHeartbeat: ${shConfig.enabled !== false ? 'enabled' : 'disabled'})`);
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

    console.log("  UnifyNormalizer started");
  }

  /**
   * Extract modules from SIF with unified format
   * Handles both V5008 (top-level) and V6800 (nested) formats
   * 
   * @param {Object} sif - Standard Intermediate Format
   * @param {string} readingKey - Key for nested readings (e.g., 'data', or null for flat)
   * @returns {Array} Array of {moduleIndex, moduleId, readings}
   */
  extractModules(sif, readingKey = 'data') {
    const { data, moduleIndex, moduleId } = sif;
    const modules = [];

    // V6800 style: data is array of modules, each with moduleIndex/moduleId
    if (Array.isArray(data) && data.length > 0 && data[0].moduleIndex !== undefined) {
      for (const moduleData of data) {
        const readings = readingKey && moduleData[readingKey] !== undefined 
          ? moduleData[readingKey] 
          : [moduleData]; // If no nested key, treat module itself as reading
        modules.push({
          moduleIndex: moduleData.moduleIndex,
          moduleId: moduleData.moduleId,
          readings: Array.isArray(readings) ? readings : [readings]
        });
      }
      return modules;
    }

    // V5008 style: single module at top level
    if (moduleIndex !== undefined && moduleId !== undefined) {
      const readings = readingKey && data !== undefined
        ? (Array.isArray(data) ? data : [data])
        : [sif];
      modules.push({
        moduleIndex,
        moduleId,
        readings: Array.isArray(readings) ? readings : [readings]
      });
      return modules;
    }

    // V5008 QRY_DOOR_STATE_RESP style: data is object with moduleIndex/moduleId
    if (data && typeof data === 'object' && !Array.isArray(data) && 
        data.moduleIndex !== undefined && data.moduleId !== undefined) {
      modules.push({
        moduleIndex: data.moduleIndex,
        moduleId: data.moduleId,
        readings: [data]
      });
      return modules;
    }

    return modules;
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
   * Implements Section 3.3 Case A: HEARTBEAT (The "Tick")
   * - Step 1: Reconcile Cache activeModules with HEARTBEAT data
   * - Step 2: Self-Healing Check (emit command.request if info missing)
   * - Step 3: Emit HEARTBEAT SUO and DEVICE_METADATA SUO
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

    // Update cache for each module (telemetry cache)
    validModules.forEach((module) => {
      this.stateCache.updateHeartbeat(
        deviceId,
        deviceType,
        module.moduleIndex,
        module.moduleId,
        module.uTotal,
      );
    });

    // Step 1: Reconcile activeModules into metadata cache
    // HEARTBEAT is authoritative for presence - syncs module list
    const changes = this.stateCache.reconcileMetadata(deviceId, deviceType, validModules);

    // Emit META_CHANGED_EVENT if any changes detected (module added/removed/uTotal changes)
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

    // Step 2: Self-Healing Check
    // Device Level: If cache ip OR mac is missing → Emit command.request
    if (this.stateCache.isDeviceInfoMissing(deviceId)) {
      console.log(
        `[UnifyNormalizer] Self-healing: Device ${deviceId} missing ip/mac, requesting device info`,
      );
      const cmdMessageType = deviceType === "V6800" ? "QRY_DEV_MOD_INFO" : "QRY_DEVICE_INFO";
      eventBus.emitCommandRequest({
        deviceId,
        deviceType,
        messageType: cmdMessageType,
      });
    }

    // Module Level (V5008 Only): If any active module is missing fwVer → Emit command.request
    if (deviceType === "V5008") {
      const modulesMissingFwVer = this.stateCache.getModulesMissingFwVer(deviceId);
      if (modulesMissingFwVer.length > 0) {
        const moduleIndices = modulesMissingFwVer.map(m => m.moduleIndex).join(',');
        console.log(
          `[UnifyNormalizer] Self-healing: Device ${deviceId} modules [${moduleIndices}] missing fwVer, requesting module info`,
        );
        eventBus.emitCommandRequest({
          deviceId,
          deviceType,
          messageType: "QRY_MODULE_INFO",
        });
      }
    }

    // Step 3: Smart Heartbeat Check (Data Warmup)
    // Comprehensive cache check and repair for all modules
    // Note: This only runs if SmartHeartbeat is enabled in config
    // Basic self-healing (ip/mac/fwVer) still happens in Step 2 above
    if (this.smartHeartbeat) {
      this.smartHeartbeat.checkAndRepair(
        deviceId,
        deviceType,
        validModules,
        this.stateCache
      );
    }

    // Step 4: Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle RFID_SNAPSHOT with global diffing
   * Unified handling for V5008 (top-level) and V6800 (nested) formats
   * @param {Object} sif - Standard Intermediate Format
   */
  handleRfidSnapshot(sif) {
    const { deviceId, deviceType, messageId } = sif;
    const rfidEventMessageId = messageId;

    // Extract modules using unified format
    const modules = this.extractModules(sif, 'data');

    for (const { moduleIndex, moduleId, readings } of modules) {
      // Get previous snapshot from cache
      const previousSnapshot = this.stateCache.getRfidSnapshot(deviceId, moduleIndex);

      // Normalize current snapshot (map uIndex to sensorIndex)
      const currentSnapshot = readings.map((item) => ({
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
      this.stateCache.updateTelemetryField(
        deviceId,
        deviceType,
        moduleIndex,
        "rfidSnapshot",
        currentSnapshot,
        "lastSeenRfid",
      );
    }
  }

  /**
   * Handle RFID_EVENT
   * @param {Object} sif - Standard Intermediate Format
   */
  handleRfidEvent(sif) {
    const { deviceId, deviceType, data, moduleIndex, moduleId } = sif;

    // V6800 RFID_EVENT: Trigger sync only
    if (deviceType === "V6800") {
      // Use moduleIndex and moduleId from SIF top-level fields (set by V6800Parser)
      // V6800Parser extracts host_gateway_port_index -> moduleIndex
      // and extend_module_sn -> moduleId
      const effectiveModuleIndex = moduleIndex || 0;
      const effectiveModuleId = moduleId || null;

      // Emit command.request to fetch fresh snapshot
      eventBus.emitCommandRequest({
        deviceId,
        deviceType,
        messageType: "QRY_RFID_SNAPSHOT",
        payload: {
          moduleIndex: effectiveModuleIndex,
          moduleId: effectiveModuleId,
        },
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
   * Unified handling for V5008 (top-level) and V6800 (nested) formats
   * @param {Object} sif - Standard Intermediate Format
   */
  handleTempHum(sif) {
    const { deviceId, deviceType, messageId } = sif;

    // Extract modules using unified format
    const modules = this.extractModules(sif, 'data');

    for (const { moduleIndex, moduleId, readings } of modules) {
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
          return tempValid || humValid;
        });

      if (normalizedData.length === 0) continue;

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

      this.stateCache.updateTelemetryField(
        deviceId,
        deviceType,
        moduleIndex,
        "tempHum",
        normalizedData,
        "lastSeenTh",
      );
    }
  }

  /**
   * Handle NOISE_LEVEL message
   * Unified handling for V5008 (top-level) and V6800 (nested) formats
   * @param {Object} sif - Standard Intermediate Format
   */
  handleNoiseLevel(sif) {
    const { deviceId, deviceType, messageId } = sif;

    // Extract modules using unified format
    const modules = this.extractModules(sif, 'data');

    for (const { moduleIndex, moduleId, readings } of modules) {
      const normalizedData = readings
        .map((item) => ({
          sensorIndex: item.nsIndex || item.sensorIndex,
          noise: item.noise,
        }))
        .filter((item) => {
          return item.noise !== null && item.noise !== undefined;
        });

      if (normalizedData.length === 0) continue;

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

      this.stateCache.updateTelemetryField(
        deviceId,
        deviceType,
        moduleIndex,
        "noiseLevel",
        normalizedData,
        "lastSeenNs",
      );
    }
  }

  /**
   * Handle DOOR_STATE message
   * Unified handling for V5008 and V6800 (both now use data array format)
   * @param {Object} sif - Standard Intermediate Format
   */
  handleDoorState(sif) {
    const { deviceId, deviceType, messageId } = sif;

    // Extract modules using unified format (both V5008 and V6800 now return {data: [...]})
    const modules = this.extractModules(sif, null);

    for (const { moduleIndex, moduleId, readings } of modules) {
      // Business logic validation: modAddr must be [1-5] and modId must not be 0
      if (moduleIndex < 1 || moduleIndex > 5 || moduleId === "0") {
        console.warn(
          `[UnifyNormalizer] Invalid door state data for device ${deviceId}: moduleIndex=${moduleIndex}, moduleId=${moduleId}. Skipping.`,
        );
        continue;
      }

      // readings[0] contains door state fields
      const reading = readings[0] || {};
      const doorStatePayload = {
        doorState: reading.doorState ?? null,
        door1State: reading.door1State ?? null,
        door2State: reading.door2State ?? null,
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
      telemetry.deviceId = deviceId;
      telemetry.deviceType = deviceType;
      telemetry.moduleIndex = moduleIndex;
      telemetry.doorState = doorStatePayload.doorState;
      telemetry.door1State = doorStatePayload.door1State;
      telemetry.door2State = doorStatePayload.door2State;
      telemetry.lastSeenDoor = new Date().toISOString();
      this.stateCache.setTelemetry(deviceId, moduleIndex, telemetry);

      // Log UOS door state
      this.stateCache.getDoorState(deviceId, moduleIndex);
    }
  }

  /**
   * Handle QRY_DOOR_STATE_RESP message
   * Now uses same format as DOOR_STATE (unified)
   * @param {Object} sif - Standard Intermediate Format
   */
  handleDoorStateQuery(sif) {
    // QRY_DOOR_STATE_RESP now has same structure as DOOR_STATE
    // Both use {data: [{moduleIndex, moduleId, doorState}]} format
    this.handleDoorState(sif);
  }

  /**
   * Handle metadata messages (DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO, DEVICE_METADATA)
   * Implements Section 3.3 Case B: DEVICE_INFO / MODULE_INFO / DEV_MOD_INFO / UTOTAL_CHANGED
   * - Step 1: Change Detection (Diffing) before merging
   * - Step 2: Merge to cache based on message type
   * - Step 3: Emit DEVICE_METADATA SUO
   * @param {Object} sif - Standard Intermediate Format
   */
  handleMetadata(sif) {
    const { deviceId, deviceType, messageType, messageId, data } = sif;
    // Use SIF messageId for META_CHANGED_EVENT
    const metaChangedMessageId = messageId;

    let changes = [];

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

      // Step 1 & 2: Diff then merge
      changes = this.diffAndMergeMetadata(deviceId, incomingMetadata);
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

      // Step 1 & 2: Diff then merge
      changes = this.diffAndMergeMetadata(deviceId, incomingMetadata);
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

      // For V6800, use first module's fwVer as device fwVer if not at SIF level
      const deviceFwVer = sif.fwVer || (activeModules.length > 0 ? activeModules[0].fwVer : null);

      const incomingMetadata = {
        deviceType,
        ip: sif.ip || null,
        mac: sif.mac || null,
        fwVer: deviceFwVer,
        mask: sif.mask || null,
        gwIp: sif.gwIp || null,
        activeModules: activeModules,
      };

      // Step 1 & 2: Diff then merge
      changes = this.diffAndMergeMetadata(deviceId, incomingMetadata);
    }

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

    // Step 3: Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Handle UTOTAL_CHANGED message
   * Implements Section 3.3 Case B: UTOTAL_CHANGED
   * - Step 1: Change Detection (Diffing) before merging
   * - Step 2: Merge to cache
   * - Step 3: Emit DEVICE_METADATA SUO
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

    // Step 1 & 2: Diff then merge
    const changes = this.diffAndMergeMetadata(deviceId, incomingMetadata);

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

    // Step 3: Emit DEVICE_METADATA SUO from cache
    this.emitDeviceMetadata(sif);
  }

  /**
   * Diff incoming metadata against cache and then merge
   * Implements Section 3.4: Metadata Change Detection Logic (Diffing)
   * @param {string} deviceId - Device ID
   * @param {Object} incomingMetadata - Metadata from SIF
   * @returns {Array} Array of change descriptions
   */
  diffAndMergeMetadata(deviceId, incomingMetadata) {
    // Step 1: Detect changes before merging
    const changes = this.detectMetadataChanges(deviceId, incomingMetadata);

    // Step 2: Merge to cache
    this.stateCache.mergeMetadata(deviceId, incomingMetadata);

    return changes;
  }

  /**
   * Detect metadata changes before merging (Section 3.4 Diffing)
   * @param {string} deviceId - Device ID
   * @param {Object} incoming - Incoming metadata from SIF
   * @returns {Array} Array of change descriptions
   */
  detectMetadataChanges(deviceId, incoming) {
    const changes = [];
    const cached = this.stateCache.getMetadata(deviceId);

    if (!cached) {
      // No cache yet, treat as all new but we can't compare
      // Return empty to avoid noise on first contact
      return changes;
    }

    // 1. Device Level Checks
    if (incoming.ip && incoming.ip !== cached.ip) {
      changes.push(`Device IP changed from ${cached.ip || "null"} to ${incoming.ip}`);
    }
    if (incoming.fwVer && incoming.fwVer !== cached.fwVer) {
      changes.push(`Device Firmware changed from ${cached.fwVer || "null"} to ${incoming.fwVer}`);
    }

    // 2. Module Level Checks
    if (incoming.activeModules && Array.isArray(incoming.activeModules)) {
      // Create a Map of cached modules using moduleIndex as key
      const cachedModulesMap = new Map();
      cached.activeModules.forEach((m) => {
        cachedModulesMap.set(m.moduleIndex, m);
      });

      // Iterate through incoming modules
      incoming.activeModules.forEach((incomingModule) => {
        const cachedModule = cachedModulesMap.get(incomingModule.moduleIndex);

        if (!cachedModule) {
          // New Module
          const moduleId = incomingModule.moduleId || incomingModule.moduleIndex;
          changes.push(`Module ${moduleId} added at Index ${incomingModule.moduleIndex}`);
        } else {
          // Existing Module - compare fields
          // moduleId change
          if (incomingModule.moduleId && incomingModule.moduleId !== cachedModule.moduleId) {
            changes.push(
              `Module ${cachedModule.moduleId || incomingModule.moduleIndex} replaced with ${incomingModule.moduleId} at Index ${incomingModule.moduleIndex}`
            );
          }
          // fwVer change
          if (incomingModule.fwVer !== undefined && incomingModule.fwVer !== cachedModule.fwVer) {
            const moduleId = cachedModule.moduleId || incomingModule.moduleIndex;
            changes.push(
              `Module ${moduleId} Firmware changed from ${cachedModule.fwVer || "null"} to ${incomingModule.fwVer}`
            );
          }
          // uTotal change
          if (incomingModule.uTotal !== undefined && incomingModule.uTotal !== cachedModule.uTotal) {
            const moduleId = cachedModule.moduleId || incomingModule.moduleIndex;
            changes.push(
              `Module ${moduleId} U-Total changed from ${cachedModule.uTotal || "null"} to ${incomingModule.uTotal}`
            );
          }
        }
      });
    }

    return changes;
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
    console.log("  Stopping UnifyNormalizer...");

    // Unsubscribe from events
    eventBus.removeAllListeners("data.parsed");

    console.log("  UnifyNormalizer stopped");
  }
}

module.exports = new UnifyNormalizer();
