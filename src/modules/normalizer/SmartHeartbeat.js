/**
 * SmartHeartbeat - Automated Data Repair & Warmup Strategy
 *
 * Transforms HEARTBEAT from a simple status update into a Health & Consistency Check.
 * Checks StateCache for missing/stale data and emits query commands to warm the cache.
 *
 * Configurable via modules.normalizer.smartHeartbeat in config/default.json
 * - enabled: true/false (when false, acts as pass-through/no-op)
 * - staggerDelay: ms between command emissions
 * - stalenessThresholds: minutes before data considered stale
 */

class SmartHeartbeat {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = config;

    // Check if enabled (default: true for backward compatibility)
    this.enabled = config.enabled !== false;

    // Configurable delays (in ms) between command emissions
    this.staggerDelay = config.staggerDelay || 500;

    // Staleness thresholds (in minutes)
    this.stalenessThresholds = config.stalenessThresholds || {
      tempHum: 5, // 5 minutes for temp/humidity
      rfid: 60, // 60 minutes for RFID snapshot
    };

    if (!this.enabled) {
      console.log("[SmartHeartbeat] Disabled - acting as pass-through");
    }
  }

  /**
   * Check cache state for all modules in a heartbeat and trigger repairs
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type (V5008 or V6800)
   * @param {Array} modules - Modules from heartbeat (each with moduleIndex, moduleId)
   * @param {Object} stateCache - StateCache instance
   */
  checkAndRepair(deviceId, deviceType, modules, stateCache) {
    // If disabled, do nothing (pass-through)
    if (!this.enabled) {
      return;
    }

    if (!modules || !Array.isArray(modules)) {
      return;
    }

    // Collect all missing items across all modules
    const allMissingItems = [];

    modules.forEach((module) => {
      const moduleIndex = module.moduleIndex;

      // Get current cache snapshot for this module
      const cacheSnapshot = stateCache.getTelemetry(deviceId, moduleIndex);

      // Check for missing telemetry data only
      // Note: Device/module metadata (ip, mac, fwVer) is handled by UnifyNormalizer self-healing
      const missingItems = this._checkModule(
        deviceId,
        deviceType,
        moduleIndex,
        cacheSnapshot,
      );

      allMissingItems.push(...missingItems);
    });

    // Emit all commands with staggered delays
    if (allMissingItems.length > 0) {
      this._emitStaggered(allMissingItems);
    }
  }

  /**
   * Check a single module for missing/stale telemetry data
   * Note: Device/module metadata (ip, mac, fwVer) is handled by UnifyNormalizer self-healing
   * This method only checks telemetry: tempHum, RFID, doorState
   *
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type
   * @param {number} moduleIndex - Module index
   * @param {Object} cacheSnapshot - Current cache state for the module
   * @returns {Array} Array of missing item descriptors
   */
  _checkModule(deviceId, deviceType, moduleIndex, cacheSnapshot) {
    const missingItems = [];

    // If no cache entry exists yet, we need telemetry data
    // Note: QRY_MODULE_INFO for fwVer is handled by UnifyNormalizer self-healing
    if (!cacheSnapshot) {
      missingItems.push({
        deviceId,
        deviceType,
        moduleIndex,
        messageType: "QRY_TEMP_HUM",
        reason: "No cache entry",
      });
      missingItems.push({
        deviceId,
        deviceType,
        moduleIndex,
        messageType: "QRY_RFID_SNAPSHOT",
        reason: "No cache entry",
      });
      missingItems.push({
        deviceId,
        deviceType,
        moduleIndex,
        messageType: "QRY_DOOR_STATE",
        reason: "No cache entry",
      });
      return missingItems;
    }

    // 1. Check Env Sensors (tempHum)
    // Empty array OR lastSeenTh > 5 mins old
    const needsTempHum = this._needsRefresh(
      cacheSnapshot.tempHum,
      cacheSnapshot.lastSeenTh,
      this.stalenessThresholds.tempHum,
    );
    if (needsTempHum) {
      missingItems.push({
        deviceId,
        deviceType,
        moduleIndex,
        messageType: "QRY_TEMP_HUM",
        reason: `Empty or stale (lastSeen: ${cacheSnapshot.lastSeenTh || "never"})`,
      });
    }

    // 2. Check RFID Tags
    // Empty array OR lastSeenRfid > 60 mins old
    const needsRfid = this._needsRefresh(
      cacheSnapshot.rfidSnapshot,
      cacheSnapshot.lastSeenRfid,
      this.stalenessThresholds.rfid,
    );
    if (needsRfid) {
      missingItems.push({
        deviceId,
        deviceType,
        moduleIndex,
        messageType: "QRY_RFID_SNAPSHOT",
        reason: `Empty or stale (lastSeen: ${cacheSnapshot.lastSeenRfid || "never"})`,
      });
    }

    // 3. Check Door State
    // doorState or door1State is null/undefined
    const doorState = cacheSnapshot.doorState ?? cacheSnapshot.door1State;
    if (doorState === null || doorState === undefined) {
      missingItems.push({
        deviceId,
        deviceType,
        moduleIndex,
        messageType: "QRY_DOOR_STATE",
        reason: "Missing doorState",
      });
    }

    return missingItems;
  }

  /**
   * Check if a cached value needs refresh based on staleness
   * @param {Array} dataArray - The cached data array
   * @param {string} lastSeen - ISO timestamp of last update
   * @param {number} thresholdMinutes - Staleness threshold in minutes
   * @returns {boolean} True if refresh is needed
   */
  _needsRefresh(dataArray, lastSeen, thresholdMinutes) {
    // Empty array (length 0 or undefined)
    if (!dataArray || dataArray.length === 0) {
      return true;
    }

    // No timestamp recorded
    if (!lastSeen) {
      return true;
    }

    // Check if lastSeen is older than threshold
    const lastSeenTime = new Date(lastSeen).getTime();
    const now = Date.now();
    const thresholdMs = thresholdMinutes * 60 * 1000;

    return now - lastSeenTime > thresholdMs;
  }

  /**
   * Emit commands with staggered delays to prevent bus congestion
   * @param {Array} items - Array of missing item descriptors
   */
  _emitStaggered(items) {
    items.forEach((item, index) => {
      setTimeout(() => {
        const { deviceId, deviceType, moduleIndex, messageType, reason } = item;

        // Build command payload
        const command = {
          deviceId,
          deviceType,
          messageType,
        };

        // Add moduleIndex to payload for module-level queries
        if (moduleIndex !== null) {
          command.payload = { moduleIndex };
        }

        // Log with module info for debugging
        const moduleInfo =
          moduleIndex !== null ? ` [moduleIndex: ${moduleIndex}]` : "";
        //console.log(`[SmartHeartbeat] Emitting ${messageType}${moduleInfo} - ${reason}`);

        this.eventBus.emitCommandRequest(command);
      }, index * this.staggerDelay);
    });
  }
}

module.exports = SmartHeartbeat;
