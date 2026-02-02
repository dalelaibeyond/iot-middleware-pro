/**
 * ParserManager - Router for device-specific parsers
 *
 * Routes incoming MQTT messages to the appropriate parser based on device type.
 * Emits parsed SIF (Standard Intermediate Format) data.
 */

const eventBus = require("../../core/EventBus");
const V5008Parser = require("./V5008Parser");
const V6800Parser = require("./V6800Parser");

class ParserManager {
  constructor() {
    this.parsers = {
      V5008: V5008Parser,
      V6800: V6800Parser,
    };
    this.config = null;
  }

  /**
   * Initialize the parser manager
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;

    // Initialize all parsers
    for (const [deviceType, parser] of Object.entries(this.parsers)) {
      await parser.initialize(config);
    }

    // Subscribe to MQTT messages
    eventBus.onMqttMessage((mqttMessage) => {
      this.handleMessage(mqttMessage);
    });

    console.log("  ParserManager initialized");
  }

  /**
   * Start the parser manager
   * @returns {Promise<void>}
   */
  async start() {
    console.log("ParserManager started");
  }

  /**
   * Handle incoming MQTT message
   * @param {Object} mqttMessage - The MQTT message from EventBus
   */
  handleMessage(mqttMessage) {
    try {
      const { deviceId, deviceType, messageType, payload, timestamp, topic } =
        mqttMessage;

      // Get the appropriate parser for this device type
      const parser = this.parsers[deviceType];

      if (!parser) {
        console.error(`No parser found for device type: ${deviceType}`);
        eventBus.emitError(
          new Error(`No parser for device type: ${deviceType}`),
          "ParserManager",
        );
        return;
      }

      // Parse the message
      let sif;
      if (deviceType === "V5008") {
        // V5008 uses binary payload
        sif = parser.parse(payload, {
          deviceId,
          messageType,
          timestamp,
          topic,
        });
      } else {
        // V6800 uses JSON payload
        // Debug logging for V6800 messages
        //console.log("[ParserManager] V6800 Device ID:", deviceId);
        //console.log("[ParserManager] V6800 Topic:", topic);
        //console.log("[ParserManager] V6800 Payload type:", typeof payload);
        console.log("#######[ParserManager] V6800 topic:", topic);
        console.log("#######[ParserManager] V6800 raw:\n", payload);

        sif = parser.parse(topic, payload);
      }

      if (!sif) {
        console.warn(
          `Failed to parse message from device ${deviceId} (type: ${deviceType})`,
        );
        return;
      }

      // Emit parsed SIF for normalizer
      // Note: We'll emit this to a different event or pass directly to normalizer
      // For now, we'll use a custom event
      eventBus.emit("data.parsed", sif);
    } catch (error) {
      console.error(`ParserManager error:`, error.message);
      eventBus.emitError(error, "ParserManager");
    }
  }

  /**
   * Stop the parser manager
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping ParserManager...");

    // Unsubscribe from events
    eventBus.removeAllListeners("mqtt.message");

    console.log("ParserManager stopped");
  }

  /**
   * Register a custom parser for a device type
   * @param {string} deviceType - The device type identifier
   * @param {Object} parser - The parser instance
   */
  registerParser(deviceType, parser) {
    this.parsers[deviceType] = parser;
    console.log(`Registered custom parser for device type: ${deviceType}`);
  }

  /**
   * Get a parser for a specific device type
   * @param {string} deviceType - The device type identifier
   * @returns {Object|null} The parser instance or null
   */
  getParser(deviceType) {
    return this.parsers[deviceType] || null;
  }
}

module.exports = new ParserManager();
