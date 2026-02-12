/**
 * SmartHeartbeat - Automated Data Repair & Warmup Strategy
 *
 * Transforms HEARTBEAT from a simple status update into a Health & Consistency Check.
 * Checks StateCache for missing/stale data and emits query commands to warm the cache.
 */

class SmartHeartbeat {
  constructor(eventBus) {
    this.eventBus = eventBus;
    // Configurable delays (in ms) between command emissions
    this.staggerDelay = 500;
    // Staleness thresholds (in minutes)
    this.stalenessThresholds = {
      tempHum: 5,    // 5 minutes for temp/humidity
      rfid: 60,      // 60 minutes for RFID snapshot
    };
  }

  /**
   * Check cache state for all modules in a heartbeat and trigger repairs
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type (V5008 or V6800)
   * @param {Array} modules - Modules from heartbeat (each with moduleIndex, moduleId)
   * @param {Object} stateCache - StateCache instance
   */
  checkAndRepair(deviceId, deviceType, modules, stateCache) {
    if (!modules || !Array.isArray(modules)) {
      return;
    }

    // Get device metadata once (used for both module-level and device-level checks)
    const deviceMetadata = stateCache.getMetadata(deviceId);

    // Collect all missing items across all modules
    const allMissingItems = [];

    modules.forEach((module) => {
      const moduleIndex = module.moduleIndex;
      
      // Get current cache snapshot for this module
      const cacheSnapshot = stateCache.getTelemetry(deviceId, moduleIndex);

      // Check for missing items
      const missingItems = this._checkModule(
        deviceId,
        deviceType,
        moduleIndex,
        cacheSnapshot,
        deviceMetadata
      );

      allMissingItems.push(...missingItems);
    });

    // Also check device-level metadata (only once per heartbeat, not per module)
    if (this._isDeviceMetadataMissing(deviceType, deviceMetadata)) {
      const cmdMessageType = deviceType === "V6800" ? "QRY_DEV_MOD_INFO" : "QRY_DEVICE_INFO";
      allMissingItems.push({
        deviceId,
        deviceType,
        moduleIndex: null, // Device-level query
        messageType: cmdMessageType,
        reason: "Missing device ip/mac/fwVer",
      });
    }

    // Emit all commands with staggered delays
    if (allMissingItems.length > 0) {
      console.log(
        `[SmartHeartbeat] Device ${deviceId}: ${allMissingItems.length} items need repair, emitting with stagger`
      );
      this._emitStaggered(allMissingItems);
    }
  }

  /**
   * Check a single module for missing/stale data
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type
   * @param {number} moduleIndex - Module index
   * @param {Object} cacheSnapshot - Current cache state for the module
   * @param {Object} deviceMetadata - Device metadata from cache
   * @returns {Array} Array of missing item descriptors
   */
  _checkModule(deviceId, deviceType, moduleIndex, cacheSnapshot, deviceMetadata) {
    const missingItems = [];

    // If no cache entry exists yet, we need all data
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
      // V5008: Also need module info if no cache
      if (deviceType === "V5008") {
        missingItems.push({
          deviceId,
          deviceType,
          moduleIndex,
          messageType: "QRY_MODULE_INFO",
          reason: "No cache entry",
        });
      }
      return missingItems;
    }

    // 1. Check Metadata (V5008 only) - fwVer at module level
    if (deviceType === "V5008") {
      const moduleMetadata = deviceMetadata?.activeModules?.find(
        (m) => m.moduleIndex === moduleIndex
      );
      if (!moduleMetadata?.fwVer) {
        missingItems.push({
          deviceId,
          deviceType,
          moduleIndex,
          messageType: "QRY_MODULE_INFO",
          reason: "Missing fwVer",
        });
      }
    }

    // 2. Check Env Sensors (tempHum)
    // Empty array OR lastSeenTh > 5 mins old
    const needsTempHum = this._needsRefresh(
      cacheSnapshot.tempHum,
      cacheSnapshot.lastSeenTh,
      this.stalenessThresholds.tempHum
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

    // 3. Check RFID Tags
    // Empty array OR lastSeenRfid > 60 mins old
    const needsRfid = this._needsRefresh(
      cacheSnapshot.rfidSnapshot,
      cacheSnapshot.lastSeenRfid,
      this.stalenessThresholds.rfid
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

    // 4. Check Door State
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
   * Check if device-level metadata is missing
   * @param {string} deviceType - Device type
   * @param {Object} deviceMetadata - Device metadata from cache
   * @returns {boolean} True if device metadata needs refresh
   */
  _isDeviceMetadataMissing(deviceType, deviceMetadata) {
    if (!deviceMetadata) {
      return true;
    }
    // Check ip or fwVer at device level
    return !deviceMetadata.ip || !deviceMetadata.fwVer;
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
        
        console.log(
          `[SmartHeartbeat] Emitting ${messageType} for device ${deviceId}, module ${moduleIndex} (${reason})`
        );

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

        this.eventBus.emitCommandRequest(command);
      }, index * this.staggerDelay);
    });
  }
}

module.exports = SmartHeartbeat;
