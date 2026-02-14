/**
 * EventBus - Central event emitter for the IoT Middleware Pro system
 *
 * Events:
 * - mqtt.message: Emitted when a new MQTT message is received
 * - data.normalized: Emitted when data has been normalized to SUO format
 * - command.request: Emitted when a command needs to be sent to a device
 * - error: Emitted when an error occurs in any module
 */

const EventEmitter = require("events");
const config = require("config");
const logger = require("./Logger");

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase default limit for multiple subscribers
  }

  /**
   * Emit an MQTT message event
   * @param {Object} payload - The MQTT message payload
   */
  emitMqttMessage(payload) {
    this.emit("mqtt.message", payload);
  }

  /**
   * Emit a normalized data event
   * @param {Object} suo - The Standard Unified Object
   */
  emitDataNormalized(suo) {
    // Debug: Log SUO
    try {
      const debugConfig = config.get("debug");
      if (debugConfig && debugConfig.logSuo && suo) {
        logger.debug("SUO normalized", suo);
      }
    } catch (e) {
      // Debug config not available, skip
    }
    this.emit("data.normalized", suo);
  }

  /**
   * Emit a command request event
   * @param {Object} command - The command payload
   */
  emitCommandRequest(command) {
    this.emit("command.request", command);
  }

  /**
   * Emit an error event
   * @param {Error} error - The error object
   * @param {string} source - The source of the error
   */
  emitError(error, source) {
    this.emit("error", { error, source, timestamp: new Date() });
  }

  /**
   * Subscribe to MQTT messages
   * @param {Function} handler - The event handler
   */
  onMqttMessage(handler) {
    this.on("mqtt.message", handler);
  }

  /**
   * Subscribe to normalized data
   * @param {Function} handler - The event handler
   */
  onDataNormalized(handler) {
    this.on("data.normalized", handler);
  }

  /**
   * Subscribe to command requests
   * @param {Function} handler - The event handler
   */
  onCommandRequest(handler) {
    this.on("command.request", handler);
  }

  /**
   * Subscribe to errors
   * @param {Function} handler - The event handler
   */
  onError(handler) {
    this.on("error", handler);
  }
}

// Singleton instance
const eventBus = new EventBus();

module.exports = eventBus;
