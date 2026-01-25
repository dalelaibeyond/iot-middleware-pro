/**
 * ModuleManager - Lifecycle manager for all system modules
 *
 * Handles initialization, startup, and shutdown of all modules.
 * Ensures proper dependency order and graceful shutdown.
 */

const config = require("config");

class ModuleManager {
  constructor() {
    this.modules = new Map();
    this.isInitialized = false;
  }

  /**
   * Register a module
   * @param {string} name - The module name
   * @param {Object} module - The module instance with initialize, start, stop methods
   */
  register(name, module) {
    if (this.modules.has(name)) {
      throw new Error(`Module ${name} is already registered`);
    }
    this.modules.set(name, module);
  }

  /**
   * Get a registered module
   * @param {string} name - The module name
   * @returns {Object|null} The module instance or null
   */
  get(name) {
    return this.modules.get(name) || null;
  }

  /**
   * Initialize all registered modules
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn("ModuleManager already initialized");
      return;
    }

    console.log("Initializing modules...");

    // Initialize in dependency order
    const initOrder = [
      "database",
      "eventBus",
      "mqttSubscriber",
      "parserManager",
      "normalizer",
      "storage",
      "command",
      "mqttRelay",
      "webhook",
      "apiServer",
      "webSocketServer",
      "cacheWatchdog",
    ];

    for (const moduleName of initOrder) {
      const module = this.modules.get(moduleName);
      if (module && typeof module.initialize === "function") {
        const moduleConfig = config.get(`modules.${moduleName}`);

        // Skip if module is disabled
        if (moduleConfig && moduleConfig.enabled === false) {
          console.log(`  [SKIPPED] ${moduleName} (disabled in config)`);
          continue;
        }

        try {
          console.log(`  [INIT] ${moduleName}...`);
          await module.initialize(moduleConfig);
          console.log(`  [OK] ${moduleName}`);
        } catch (error) {
          console.error(`  [FAILED] ${moduleName}:`, error.message);
          throw error;
        }
      }
    }

    this.isInitialized = true;
    console.log("All modules initialized");
  }

  /**
   * Start all registered modules
   * @returns {Promise<void>}
   */
  async start() {
    console.log("Starting modules...");

    for (const [name, module] of this.modules.entries()) {
      if (typeof module.start === "function") {
        const moduleConfig = config.get(`modules.${name}`);

        // Skip if module is disabled
        if (moduleConfig && moduleConfig.enabled === false) {
          continue;
        }

        try {
          console.log(`  [START] ${name}...`);
          await module.start();
          console.log(`  [OK] ${name}`);
        } catch (error) {
          console.error(`  [FAILED] ${name}:`, error.message);
          throw error;
        }
      }
    }

    console.log("All modules started");
  }

  /**
   * Stop all registered modules in reverse order
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping modules...");

    const stopOrder = Array.from(this.modules.keys()).reverse();

    for (const name of stopOrder) {
      const module = this.modules.get(name);
      if (typeof module.stop === "function") {
        try {
          console.log(`  [STOP] ${name}...`);
          await module.stop();
          console.log(`  [OK] ${name}`);
        } catch (error) {
          console.error(`  [FAILED] ${name}:`, error.message);
          // Continue stopping other modules even if one fails
        }
      }
    }

    this.isInitialized = false;
    console.log("All modules stopped");
  }

  /**
   * Get status of all modules
   * @returns {Object} Module status information
   */
  getStatus() {
    const status = {
      initialized: this.isInitialized,
      modules: {},
    };

    for (const [name, module] of this.modules.entries()) {
      status.modules[name] = {
        registered: true,
        hasInitialize: typeof module.initialize === "function",
        hasStart: typeof module.start === "function",
        hasStop: typeof module.stop === "function",
      };
    }

    return status;
  }
}

// Singleton instance
const moduleManager = new ModuleManager();

module.exports = moduleManager;
