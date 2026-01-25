/**
 * StateCache - Dual-Purpose Cache for Logic and API
 *
 * Provides in-memory caching for:
 * - Device metadata
 * - RFID snapshots
 * - Module states
 * - Online/offline status
 *
 * Used by UnifyNormalizer for state management and by ApiServer for read-only access.
 */

class StateCache {
  constructor() {
    // Device metadata cache: { deviceId: { ...metadata } }
    this.metadataCache = new Map();

    // RFID snapshot cache: { deviceId: { moduleIndex: [ ...snapshot ] } }
    this.rfidSnapshotCache = new Map();

    // Module state cache: { deviceId: { moduleIndex: { ...state } } }
    this.moduleStateCache = new Map();

    // Heartbeat timestamps: { deviceId: { moduleIndex: timestamp } }
    this.heartbeatCache = new Map();

    // Online status: { deviceId: { moduleIndex: { isOnline, lastSeen } } }
    this.onlineStatusCache = new Map();
  }

  /**
   * Initialize the state cache
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("StateCache initialized");
  }

  /**
   * Start the state cache
   * @returns {Promise<void>}
   */
  async start() {
    console.log("StateCache started");
  }

  /**
   * Merge partial metadata into cache
   * @param {string} deviceId - Device ID
   * @param {Array} payload - Partial metadata payload
   */
  mergeMetadata(deviceId, payload) {
    if (!this.metadataCache.has(deviceId)) {
      this.metadataCache.set(deviceId, {});
    }

    const cached = this.metadataCache.get(deviceId);

    // Merge payload into cached metadata
    payload.forEach((item) => {
      Object.assign(cached, item);

      // Handle modules array
      if (item.modules && Array.isArray(item.modules)) {
        cached.modules = cached.modules || [];
        item.modules.forEach((module) => {
          const existingIndex = cached.modules.findIndex(
            (m) => m.moduleIndex === module.moduleIndex,
          );
          if (existingIndex >= 0) {
            Object.assign(cached.modules[existingIndex], module);
          } else {
            cached.modules.push(module);
          }
        });
      }
    });

    // Update timestamp
    cached.update_at = new Date();
  }

  /**
   * Get full metadata from cache
   * @param {string} deviceId - Device ID
   * @returns {Object|null} Cached metadata or null
   */
  getMetadata(deviceId) {
    return this.metadataCache.get(deviceId) || null;
  }

  /**
   * Set RFID snapshot in cache
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @param {Array} snapshot - RFID snapshot array
   */
  setRfidSnapshot(deviceId, moduleIndex, snapshot) {
    if (!this.rfidSnapshotCache.has(deviceId)) {
      this.rfidSnapshotCache.set(deviceId, {});
    }

    const deviceSnapshots = this.rfidSnapshotCache.get(deviceId);
    deviceSnapshots[moduleIndex] = snapshot;
  }

  /**
   * Get RFID snapshot from cache
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Array|null} Cached snapshot or null
   */
  getRfidSnapshot(deviceId, moduleIndex) {
    const deviceSnapshots = this.rfidSnapshotCache.get(deviceId);
    if (deviceSnapshots && deviceSnapshots[moduleIndex]) {
      return deviceSnapshots[moduleIndex];
    }
    return null;
  }

  /**
   * Update module state
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @param {Object} state - Module state
   */
  updateModuleState(deviceId, moduleIndex, state) {
    if (!this.moduleStateCache.has(deviceId)) {
      this.moduleStateCache.set(deviceId, {});
    }

    const deviceStates = this.moduleStateCache.get(deviceId);
    deviceStates[moduleIndex] = {
      ...deviceStates[moduleIndex],
      ...state,
      timestamp: new Date(),
    };
  }

  /**
   * Get module state
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Object|null} Module state or null
   */
  getModuleState(deviceId, moduleIndex) {
    const deviceStates = this.moduleStateCache.get(deviceId);
    if (deviceStates && deviceStates[moduleIndex]) {
      return deviceStates[moduleIndex];
    }
    return null;
  }

  /**
   * Update heartbeat timestamp
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   */
  updateHeartbeat(deviceId, moduleIndex) {
    if (!this.heartbeatCache.has(deviceId)) {
      this.heartbeatCache.set(deviceId, {});
    }

    const deviceHeartbeats = this.heartbeatCache.get(deviceId);
    deviceHeartbeats[moduleIndex] = new Date();

    // Update online status
    this.updateOnlineStatus(deviceId, moduleIndex, true);
  }

  /**
   * Get last heartbeat timestamp
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Date|null} Last heartbeat timestamp or null
   */
  getLastHeartbeat(deviceId, moduleIndex) {
    const deviceHeartbeats = this.heartbeatCache.get(deviceId);
    if (deviceHeartbeats && deviceHeartbeats[moduleIndex]) {
      return deviceHeartbeats[moduleIndex];
    }
    return null;
  }

  /**
   * Update online status
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @param {boolean} isOnline - Online status
   */
  updateOnlineStatus(deviceId, moduleIndex, isOnline) {
    if (!this.onlineStatusCache.has(deviceId)) {
      this.onlineStatusCache.set(deviceId, {});
    }

    const deviceStatus = this.onlineStatusCache.get(deviceId);
    deviceStatus[moduleIndex] = {
      isOnline,
      lastSeen: new Date(),
    };
  }

  /**
   * Get online status
   * @param {string} deviceId - Device ID
   * @param {number} moduleIndex - Module index
   * @returns {Object|null} Online status or null
   */
  getOnlineStatus(deviceId, moduleIndex) {
    const deviceStatus = this.onlineStatusCache.get(deviceId);
    if (deviceStatus && deviceStatus[moduleIndex]) {
      return deviceStatus[moduleIndex];
    }
    return null;
  }

  /**
   * Get all modules for a device
   * @param {string} deviceId - Device ID
   * @returns {Array} Array of module states
   */
  getAllModules(deviceId) {
    const deviceStates = this.moduleStateCache.get(deviceId);
    if (deviceStates) {
      return Object.entries(deviceStates).map(([moduleIndex, state]) => ({
        moduleIndex: parseInt(moduleIndex),
        ...state,
      }));
    }
    return [];
  }

  /**
   * Clear cache for a device
   * @param {string} deviceId - Device ID
   */
  clearDevice(deviceId) {
    this.metadataCache.delete(deviceId);
    this.rfidSnapshotCache.delete(deviceId);
    this.moduleStateCache.delete(deviceId);
    this.heartbeatCache.delete(deviceId);
    this.onlineStatusCache.delete(deviceId);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      metadataCount: this.metadataCache.size,
      rfidSnapshotCount: this.rfidSnapshotCache.size,
      moduleStateCount: this.moduleStateCache.size,
      heartbeatCount: this.heartbeatCache.size,
      onlineStatusCount: this.onlineStatusCache.size,
    };
  }

  /**
   * Stop the state cache
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping StateCache...");

    // Clear all caches
    this.metadataCache.clear();
    this.rfidSnapshotCache.clear();
    this.moduleStateCache.clear();
    this.heartbeatCache.clear();
    this.onlineStatusCache.clear();

    console.log("StateCache stopped");
  }
}

module.exports = new StateCache();
