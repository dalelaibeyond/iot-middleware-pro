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
        lastSeen_info: new Date().toISOString(),
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

    // Module-level change detection
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
    cached.lastSeen_info = new Date().toISOString();

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
   * Get full metadata from cache
   * @param {string} deviceId - Device ID
   * @returns {Object|null} Cached metadata or null
   */
  getMetadata(deviceId) {
    const cacheKey = `device:${deviceId}:info`;
    return this.metadataCache.get(cacheKey) || null;
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
   * @param {number} moduleIndex - Module index
   * @param {string} field - Field name (temp_hum, noise_level, rfid_snapshot, doorState)
   * @param {*} value - Field value
   * @param {string} timestampField - Timestamp field name (lastSeen_th, lastSeen_ns, etc.)
   */
  updateTelemetryField(deviceId, moduleIndex, field, value, timestampField) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    let telemetry = this.telemetryCache.get(cacheKey);

    if (!telemetry) {
      telemetry = {
        deviceId,
        deviceType: null,
        moduleIndex,
        moduleId: null,
        isOnline: false,
        lastSeen_hb: null,
        temp_hum: [],
        lastSeen_th: null,
        noise_level: [],
        lastSeen_ns: null,
        rfid_snapshot: [],
        lastSeen_rfid: null,
        doorState: null,
        door1State: null,
        door2State: null,
        lastSeen_door: null,
      };
    }

    telemetry[field] = value;
    telemetry[timestampField] = new Date().toISOString();

    this.telemetryCache.set(cacheKey, telemetry);
  }

  /**
   * Get RFID snapshot from cache
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Array} Cached snapshot (empty array if not found)
   */
  getRfidSnapshot(deviceId, moduleIndex) {
    const telemetry = this.getTelemetry(deviceId, moduleIndex);
    return telemetry ? telemetry.rfid_snapshot || [] : [];
  }

  /**
   * Update heartbeat timestamp and online status
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @param {string} moduleId - Module ID
   * @param {number} uTotal - Total U count
   */
  updateHeartbeat(deviceId, moduleIndex, moduleId, uTotal) {
    const cacheKey = `device:${deviceId}:module:${moduleIndex}`;
    let telemetry = this.telemetryCache.get(cacheKey);

    if (!telemetry) {
      telemetry = {
        deviceId,
        deviceType: null,
        moduleIndex,
        moduleId,
        isOnline: true,
        lastSeen_hb: new Date().toISOString(),
        temp_hum: [],
        lastSeen_th: null,
        noise_level: [],
        lastSeen_ns: null,
        rfid_snapshot: [],
        lastSeen_rfid: null,
        doorState: null,
        door1State: null,
        door2State: null,
        lastSeen_door: null,
      };
    } else {
      telemetry.isOnline = true;
      telemetry.lastSeen_hb = new Date().toISOString();
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
