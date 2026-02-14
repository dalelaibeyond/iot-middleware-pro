/**
 * StateCache - Dual-Purpose Cache for Logic and API
 *
 * Provides in-memory caching for:
 * - Device metadata (device:{id}:info)
 * - Telemetry state (device:{id}:module:{index})
 * - RFID snapshots
 * - Module states
 * - Online/offline status
 *
 * Used by UnifyNormalizer for state management and by ApiServer for read-only access.
 */

const config = require("config");
const logger = require("../../core/Logger");

class StateCache {
  constructor() {
    // Device metadata cache: { "device:{id}:info": { ...metadata } }
    this.metadataCache = new Map();

    // Telemetry cache: { "device:{id}:module:{index}": { ...telemetry } }
    this.telemetryCache = new Map();

    // Heartbeat timestamps: { "device:{id}:module:{index}": timestamp }
    this.heartbeatCache = new Map();
  }

  /**
   * Initialize state cache
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  StateCache initialized");
  }

  /**
   * Start state cache
   * @returns {Promise<void>}
   */
  async start() {
    console.log("  StateCache started");
  }

  /**
   * Merge partial metadata into cache with change detection
   * Used for DEVICE_INFO, MODULE_INFO, DEV_MOD_INFO, UTOTAL_CHANGED
   * @param {string} deviceId - Device ID
   * @param {Object} incomingMetadata - Partial metadata from SIF
   * @returns {Array} Array of change descriptions (empty if no changes)
   */
  mergeMetadata(deviceId, incomingMetadata) {
    const cacheKey = `device:${deviceId}:info`;
    const changes = [];

    // Get or create cached metadata
    let cached = this.metadataCache.get(cacheKey);
    if (!cached) {
      cached = {
        deviceId,
        deviceType: incomingMetadata.deviceType || null,
        ip: null,
        mac: null,
        fwVer: null,
        mask: null,
        gwIp: null,
        activeModules: [],
        lastSeenInfo: new Date().toISOString(),
      };
    }

    // Device-level change detection
    if (incomingMetadata.ip && incomingMetadata.ip !== cached.ip) {
      changes.push(
        `Device IP changed from ${cached.ip || "null"} to ${incomingMetadata.ip}`,
      );
      cached.ip = incomingMetadata.ip;
    }

    if (incomingMetadata.fwVer && incomingMetadata.fwVer !== cached.fwVer) {
      changes.push(
        `Device Firmware changed from ${cached.fwVer || "null"} to ${incomingMetadata.fwVer}`,
      );
      cached.fwVer = incomingMetadata.fwVer;
    }

    if (incomingMetadata.mac) {
      cached.mac = incomingMetadata.mac;
    }
    if (incomingMetadata.mask) {
      cached.mask = incomingMetadata.mask;
    }
    if (incomingMetadata.gwIp) {
      cached.gwIp = incomingMetadata.gwIp;
    }

    // Module-level change detection and merge
    if (
      incomingMetadata.activeModules &&
      Array.isArray(incomingMetadata.activeModules)
    ) {
      const cachedModulesMap = new Map();
      cached.activeModules.forEach((m) =>
        cachedModulesMap.set(m.moduleIndex, m),
      );

      incomingMetadata.activeModules.forEach((incomingModule) => {
        // Match modules by moduleIndex (not moduleId) to support partial module info
        // MODULE_INFO provides: moduleIndex, fwVer (no moduleId)
        // HEARTBEAT provides: moduleIndex, moduleId, uTotal
        const cachedModule = cachedModulesMap.get(incomingModule.moduleIndex);

        if (!cachedModule) {
          // New module added
          const moduleId = incomingModule.moduleId || null;
          changes.push(
            `Module ${moduleId || incomingModule.moduleIndex} added at Index ${incomingModule.moduleIndex}`,
          );
          cached.activeModules.push({ ...incomingModule });
        } else {
          // Existing module - check for changes and merge information
          // Update moduleId if provided (HEARTBEAT)
          if (
            incomingModule.moduleId &&
            incomingModule.moduleId !== cachedModule.moduleId
          ) {
            changes.push(
              `Module ${cachedModule.moduleId || incomingModule.moduleIndex} ID changed from ${cachedModule.moduleId || "null"} to ${incomingModule.moduleId} at Index ${incomingModule.moduleIndex}`,
            );
            cachedModule.moduleId = incomingModule.moduleId;
          }
          // Update fwVer if provided (MODULE_INFO)
          if (
            incomingModule.fwVer !== undefined &&
            incomingModule.fwVer !== cachedModule.fwVer
          ) {
            changes.push(
              `Module ${cachedModule.moduleId || incomingModule.moduleIndex} Firmware changed from ${cachedModule.fwVer || "null"} to ${incomingModule.fwVer}`,
            );
            cachedModule.fwVer = incomingModule.fwVer;
          }
          // Update uTotal if provided (HEARTBEAT)
          if (
            incomingModule.uTotal !== undefined &&
            incomingModule.uTotal !== cachedModule.uTotal
          ) {
            changes.push(
              `Module ${cachedModule.moduleId || incomingModule.moduleIndex} U-Total changed from ${cachedModule.uTotal || "null"} to ${incomingModule.uTotal}`,
            );
            cachedModule.uTotal = incomingModule.uTotal;
          }
        }
      });
    }

    // Update timestamp
    cached.lastSeenInfo = new Date().toISOString();

    // Save to cache
    this.metadataCache.set(cacheKey, cached);

    // Update deviceType in all telemetry entries for this device
    // This ensures the /api/uos endpoint returns the correct deviceType
    if (cached.deviceType) {
      for (const [key, telemetry] of this.telemetryCache.entries()) {
        if (key.startsWith(`device:${deviceId}:module:`)) {
          telemetry.deviceType = cached.deviceType;
          this.telemetryCache.set(key, telemetry);
        }
      }
    }

    return changes;
  }

  /**
   * Reconcile metadata from HEARTBEAT message
   * The Heartbeat is authoritative for module presence
   * - Match: If module exists in Cache, update moduleId/uTotal, preserve fwVer
   * - Add: If new in Heartbeat, add to Cache
   * - Remove: If in Cache but MISSING in Heartbeat, remove from Cache
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type (V5008 or V6800)
   * @param {Array} heartbeatModules - Modules from HEARTBEAT (moduleIndex, moduleId, uTotal)
   * @returns {Array} Array of change descriptions (empty if no changes)
   */
  reconcileMetadata(deviceId, deviceType, heartbeatModules) {
    const cacheKey = `device:${deviceId}:info`;
    const changes = [];

    // Get or create cached metadata
    let cached = this.metadataCache.get(cacheKey);
    if (!cached) {
      cached = {
        deviceId,
        deviceType: deviceType || null,
        ip: null,
        mac: null,
        fwVer: null,
        mask: null,
        gwIp: null,
        activeModules: [],
        lastSeenInfo: new Date().toISOString(),
      };
    } else if (deviceType) {
      // Update deviceType if provided (handles case where initially created without deviceType)
      cached.deviceType = deviceType;
    }

    // Create maps for efficient lookup
    const cachedModulesMap = new Map();
    cached.activeModules.forEach((m) =>
      cachedModulesMap.set(m.moduleIndex, m),
    );

    const heartbeatModulesMap = new Map();
    (heartbeatModules || []).forEach((m) =>
      heartbeatModulesMap.set(m.moduleIndex, m),
    );

    // Track which modules to keep
    const newActiveModules = [];

    // Process incoming heartbeat modules
    (heartbeatModules || []).forEach((incomingModule) => {
      const cachedModule = cachedModulesMap.get(incomingModule.moduleIndex);

      if (!cachedModule) {
        // New module added
        changes.push(
          `Module ${incomingModule.moduleId || incomingModule.moduleIndex} added at Index ${incomingModule.moduleIndex}`,
        );
        newActiveModules.push({ ...incomingModule });
      } else {
        // Existing module - update moduleId/uTotal, preserve fwVer and other fields
        const updatedModule = {
          ...cachedModule,
          moduleId: incomingModule.moduleId,
          uTotal: incomingModule.uTotal,
        };

        // Check for changes
        if (incomingModule.moduleId !== cachedModule.moduleId) {
          changes.push(
            `Module ${cachedModule.moduleId || incomingModule.moduleIndex} ID changed from ${cachedModule.moduleId || "null"} to ${incomingModule.moduleId} at Index ${incomingModule.moduleIndex}`,
          );
        }
        if (incomingModule.uTotal !== cachedModule.uTotal) {
          changes.push(
            `Module ${cachedModule.moduleId || incomingModule.moduleIndex} U-Total changed from ${cachedModule.uTotal || "null"} to ${incomingModule.uTotal}`,
          );
        }

        newActiveModules.push(updatedModule);
      }
    });

    // Detect removed modules (in cache but not in heartbeat)
    cached.activeModules.forEach((cachedModule) => {
      if (!heartbeatModulesMap.has(cachedModule.moduleIndex)) {
        changes.push(
          `Module ${cachedModule.moduleId || cachedModule.moduleIndex} removed from Index ${cachedModule.moduleIndex}`,
        );
        // Not adding to newActiveModules effectively removes it
      }
    });

    // Replace activeModules with reconciled list
    cached.activeModules = newActiveModules;

    // Update timestamp
    cached.lastSeenInfo = new Date().toISOString();

    // Save to cache
    this.metadataCache.set(cacheKey, cached);

    return changes;
  }

  /**
   * Get modules missing fwVer (for V5008 self-healing)
   * @param {string} deviceId - Device ID
   * @returns {Array} Array of modules missing fwVer
   */
  getModulesMissingFwVer(deviceId) {
    const cacheKey = `device:${deviceId}:info`;
    const cached = this.metadataCache.get(cacheKey);

    if (!cached || !cached.activeModules) {
      return [];
    }

    return cached.activeModules.filter(
      (m) => !m.fwVer || m.fwVer === null || m.fwVer === undefined,
    );
  }

  /**
   * Check if device metadata is missing ip or mac (for self-healing)
   * @param {string} deviceId - Device ID
   * @returns {boolean} True if ip or mac is missing
   */
  isDeviceInfoMissing(deviceId) {
    const cacheKey = `device:${deviceId}:info`;
    const cached = this.metadataCache.get(cacheKey);

    if (!cached) {
      return true;
    }

    return !cached.ip || !cached.mac || cached.ip === null || cached.mac === null;
  }

  /**
   * Get full metadata from cache (UOS)
   * @param {string} deviceId - Device ID
   * @returns {Object|null} Cached metadata or null
   */
  getMetadata(deviceId) {
    const cacheKey = `device:${deviceId}:info`;
    const uos = this.metadataCache.get(cacheKey) || null;
    
    // Debug: Log UOS
    try {
      const debugConfig = config.get("debug");
      if (debugConfig && debugConfig.logUos && uos) {
        logger.debug("UOS retrieved", { deviceId, uos });
      }
    } catch (e) {
      // Debug config not available, skip
    }
    
    return uos;
  }

  /**
   * Get telemetry state for a module
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Object|null} Telemetry state or null
   */
  getTelemetry(deviceId, moduleIndex) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    return this.telemetryCache.get(cacheKey) || null;
  }

  /**
   * Set telemetry state for a module
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @param {Object} telemetry - Telemetry state
   */
  setTelemetry(deviceId, moduleIndex, telemetry) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    this.telemetryCache.set(cacheKey, telemetry);
  }

  /**
   * Update telemetry field with timestamp
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type (V5008 or V6800)
   * @param {number} moduleIndex - Module index
   * @param {string} field - Field name (tempHum, noiseLevel, rfidSnapshot, doorState)
   * @param {*} value - Field value
   * @param {string} timestampField - Timestamp field name (lastSeenTh, lastSeenNs, etc.)
   */
  updateTelemetryField(deviceId, deviceType, moduleIndex, field, value, timestampField) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    let telemetry = this.telemetryCache.get(cacheKey);

    if (!telemetry) {
      telemetry = {
        deviceId,
        deviceType: deviceType || null,
        moduleIndex,
        moduleId: null,
        isOnline: false,
        lastSeenHb: null,
        tempHum: [],
        lastSeenTh: null,
        noiseLevel: [],
        lastSeenNs: null,
        rfidSnapshot: [],
        lastSeenRfid: null,
        doorState: null,
        door1State: null,
        door2State: null,
        lastSeenDoor: null,
      };
    }

    // Update deviceType if provided (handles case where telemetry created before HEARTBEAT)
    if (deviceType) {
      telemetry.deviceType = deviceType;
    }

    telemetry[field] = value;
    telemetry[timestampField] = new Date().toISOString();

    this.telemetryCache.set(cacheKey, telemetry);
    
    // Debug: Log UOS telemetry update
    try {
      const debugConfig = config.get("debug");
      if (debugConfig && debugConfig.logUos) {
        logger.debug("UOS telemetry updated", { 
          deviceId, 
          moduleIndex, 
          field,
          timestampField,
          value 
        });
      }
    } catch (e) {
      // Debug config not available, skip
    }
  }

  /**
   * Get RFID snapshot from cache (UOS telemetry)
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Array} Cached snapshot (empty array if not found)
   */
  getRfidSnapshot(deviceId, moduleIndex) {
    const telemetry = this.getTelemetry(deviceId, moduleIndex);
    const snapshot = telemetry ? telemetry.rfidSnapshot || [] : [];
    
    // Debug: Log UOS RFID snapshot
    try {
      const debugConfig = config.get("debug");
      if (debugConfig && debugConfig.logUos) {
        logger.debug("UOS RFID snapshot retrieved", { 
          deviceId, 
          moduleIndex, 
          snapshotCount: snapshot.length,
          snapshot 
        });
      }
    } catch (e) {
      // Debug config not available, skip
    }
    
    return snapshot;
  }

  /**
   * Get door state from cache (UOS telemetry)
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Object|null} Cached door state or null
   */
  getDoorState(deviceId, moduleIndex) {
    const telemetry = this.getTelemetry(deviceId, moduleIndex);
    const doorState = telemetry ? {
      doorState: telemetry.doorState ?? null,
      door1State: telemetry.door1State ?? null,
      door2State: telemetry.door2State ?? null,
      lastSeenDoor: telemetry.lastSeenDoor ?? null
    } : null;
    
    // Debug: Log UOS door state
    try {
      const debugConfig = config.get("debug");
      if (debugConfig && debugConfig.logUos) {
        logger.debug("UOS door state retrieved", { 
          deviceId, 
          moduleIndex, 
          doorState 
        });
      }
    } catch (e) {
      // Debug config not available, skip
    }
    
    return doorState;
  }

  /**
   * Update heartbeat timestamp and online status
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @param {string} deviceType - Device type (V5008 or V6800)
   * @param {string} moduleId - Module ID
   * @param {number} uTotal - Total U count
   */
  updateHeartbeat(deviceId, deviceType, moduleIndex, moduleId, uTotal) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    let telemetry = this.telemetryCache.get(cacheKey);

    if (!telemetry) {
      telemetry = {
        deviceId,
        deviceType: deviceType || null,
        moduleIndex,
        moduleId,
        isOnline: true,
        lastSeenHb: new Date().toISOString(),
        tempHum: [],
        lastSeenTh: null,
        noiseLevel: [],
        lastSeenNs: null,
        rfidSnapshot: [],
        lastSeenRfid: null,
        doorState: null,
        door1State: null,
        door2State: null,
        lastSeenDoor: null,
      };
    } else {
      telemetry.isOnline = true;
      telemetry.lastSeenHb = new Date().toISOString();
      if (deviceType) telemetry.deviceType = deviceType;
      if (moduleId) telemetry.moduleId = moduleId;
      if (uTotal !== undefined) telemetry.uTotal = uTotal;
    }

    this.telemetryCache.set(cacheKey, telemetry);
    this.heartbeatCache.set(cacheKey, new Date());
  }

  /**
   * Get last heartbeat timestamp
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Date|null} Last heartbeat timestamp or null
   */
  getLastHeartbeat(deviceId, moduleIndex) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    return this.heartbeatCache.get(cacheKey) || null;
  }

  /**
   * Get all modules for a device
   * @param {string} deviceId - Device ID
   * @returns {Array} Array of telemetry states
   */
  getAllModules(deviceId) {
    const modules = [];
    for (const [key, telemetry] of this.telemetryCache.entries()) {
      if (key.startsWith(`device:${deviceId}:module:`)) {
        modules.push(telemetry);
      }
    }
    return modules;
  }

  /**
   * Clear cache for a device
   * @param {string} deviceId - Device ID
   */
  clearDevice(deviceId) {
    const infoKey = `device:${deviceId}:info`;
    this.metadataCache.delete(infoKey);

    for (const [key] of this.telemetryCache.keys()) {
      if (key.startsWith(`device:${deviceId}:module:`)) {
        this.telemetryCache.delete(key);
      }
    }

    for (const [key] of this.heartbeatCache.keys()) {
      if (key.startsWith(`device:${deviceId}:module:`)) {
        this.heartbeatCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      metadataCount: this.metadataCache.size,
      telemetryCount: this.telemetryCache.size,
      heartbeatCount: this.heartbeatCache.size,
    };
  }

  /**
   * Get all device metadata entries (for topology API)
   * @returns {Array} Array of all device metadata
   */
  getAllMetadata() {
    const devices = [];
    for (const [key, metadata] of this.metadataCache.entries()) {
      if (key.startsWith("device:") && key.endsWith(":info")) {
        devices.push(metadata);
      }
    }
    return devices;
  }

  /**
   * Get all telemetry entries (for topology API)
   * @returns {Array} Array of all telemetry entries
   */
  getAllTelemetry() {
    const telemetry = [];
    for (const [key, data] of this.telemetryCache.entries()) {
      if (key.startsWith("device:") && key.includes(":module:")) {
        telemetry.push({ key, ...data });
      }
    }
    return telemetry;
  }

  /**
   * Get heartbeat cache (for CacheWatchdog)
   * @returns {Map} Heartbeat cache
   */
  getHeartbeatCache() {
    return this.heartbeatCache;
  }

  /**
   * Stop state cache
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("  Stopping StateCache...");

    // Clear all caches
    this.metadataCache.clear();
    this.telemetryCache.clear();
    this.heartbeatCache.clear();

    console.log("  StateCache stopped");
  }
}

module.exports = new StateCache();
