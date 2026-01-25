/**
 * MqttRelay - Output module for relaying data via MQTT
 *
 * Publishes normalized data to an MQTT topic for downstream consumers.
 */

const mqtt = require("mqtt");
const eventBus = require("../../core/EventBus");

class MqttRelay {
  constructor() {
    this.config = null;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize MQTT relay
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("MqttRelay initialized");
  }

  /**
   * Start MQTT relay
   * @returns {Promise<void>}
   */
  async start() {
    if (this.client) {
      console.warn("MqttRelay already started");
      return;
    }

    const mqttConfig = require("config").get("mqtt");

    console.log(`Connecting to MQTT broker for relay: ${mqttConfig.brokerUrl}`);

    this.client = mqtt.connect(mqttConfig.brokerUrl, mqttConfig.options);

    this.client.on("connect", () => {
      this.isConnected = true;
      console.log("MqttRelay MQTT connected");
    });

    this.client.on("error", (error) => {
      console.error("MqttRelay MQTT error:", error.message);
      eventBus.emitError(error, "MqttRelay");
    });

    this.client.on("close", () => {
      this.isConnected = false;
      console.log("MqttRelay MQTT connection closed");
    });

    this.client.on("reconnect", () => {
      console.log("MqttRelay MQTT reconnecting...");
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MqttRelay MQTT connection timeout"));
      }, mqttConfig.options.connectTimeout || 30000);

      this.client.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Subscribe to normalized data
    eventBus.onDataNormalized((suo) => {
      this.handleData(suo);
    });

    console.log("MqttRelay started");
  }

  /**
   * Handle normalized data
   * @param {Object} suo - Standard Unified Object
   */
  handleData(suo) {
    try {
      // Check if this message type should be relayed
      if (this.config.filters && this.config.filters.length > 0) {
        if (!this.config.filters.includes(suo.messageType)) {
          return; // Skip this message type
        }
      }

      // Publish to relay topic
      const topic = this.config.topic || "IoTOutput";
      const payload = JSON.stringify(suo);

      this.client.publish(topic, payload, { qos: 0 }, (err) => {
        if (err) {
          console.error(`Failed to publish to ${topic}:`, err.message);
          eventBus.emitError(err, "MqttRelay");
        }
      });
    } catch (error) {
      console.error("MqttRelay error:", error.message);
      eventBus.emitError(error, "MqttRelay");
    }
  }

  /**
   * Stop MQTT relay
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping MqttRelay...");

    if (this.client) {
      await new Promise((resolve) => {
        this.client.end(false, {}, () => {
          resolve();
        });
      });

      this.client = null;
      this.isConnected = false;
    }

    // Unsubscribe from events
    eventBus.removeAllListeners("data.normalized");

    console.log("MqttRelay stopped");
  }

  /**
   * Check if connected to MQTT broker
   * @returns {boolean} Connection status
   */
  isReady() {
    return this.isConnected;
  }
}

module.exports = new MqttRelay();
