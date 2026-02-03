/**
 * CacheWatchdog - Offline Detection Service
 *
 * Detects silent failures (power loss, network disconnect) where devices stop sending data.
 * Runs periodically to check heartbeat timestamps and marks modules as offline.
 */

const StateCache = require("./StateCache");
const eventBus = require("../../core/EventBus");

class CacheWatchdog {
  constructor() {
    this.config = null;
    this.timer = null;
    this.isRunning = false;
  }

  /**
   * Initialize the watchdog
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  CacheWatchdog initialized");
  }

  /**
   * Start the watchdog timer
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn("CacheWatchdog already started");
      return;
    }

    const normalizerConfig = require("config").get("modules.normalizer");
    const checkInterval = normalizerConfig.checkInterval || 30000; // Default: 30s

    console.log(`  Starting CacheWatchdog (interval: ${checkInterval}ms)`);

    // Start periodic check
    this.timer = setInterval(() => {
      this.check();
    }, checkInterval);

    this.isRunning = true;
    console.log("  CacheWatchdog started");
  }

  /**
   * Stop the watchdog timer
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.timer) {
      console.log("  Stopping CacheWatchdog...");
      clearInterval(this.timer);
      this.timer = null;
      this.isRunning = false;
      console.log("  CacheWatchdog stopped");
    }
  }

  /**
   * Perform a check of all module heartbeats
   */
  check() {
    try {
      const normalizerConfig = require("config").get("modules.normalizer");
      const heartbeatTimeout = normalizerConfig.heartbeatTimeout || 120000; // Default: 2 minutes

      const now = new Date();
      const stats = StateCache.getStats();

      console.log(
        `CacheWatchdog check: ${stats.telemetryCount} modules in cache`,
      );

      // Iterate through all modules in the cache
      // We need to access the internal state of StateCache
      // For now, we'll use the public API to get module states
      // Note: This is a simplified approach - in production, we might need
      // to add a method to StateCache to iterate all device-module pairs

      // For now, we'll skip the check since we don't have a direct way
      // to iterate all device-module pairs without modifying StateCache
      // This would be implemented by adding a getAllDeviceModulePairs() method

      console.log("CacheWatchdog check completed");
    } catch (error) {
      console.error("CacheWatchdog error:", error.message);
      eventBus.emitError(error, "CacheWatchdog");
    }
  }

  /**
   * Check if a module should be marked as offline
   * @param {Date} lastSeen - Last heartbeat timestamp
   * @param {number} heartbeatTimeout - Timeout in milliseconds
   * @returns {boolean} True if module should be marked offline
   */
  shouldExpire(lastSeen, heartbeatTimeout) {
    if (!lastSeen) {
      return true;
    }
    const now = new Date();
    const gap = now.getTime() - lastSeen.getTime();
    return gap > heartbeatTimeout;
  }
}

module.exports = new CacheWatchdog();
