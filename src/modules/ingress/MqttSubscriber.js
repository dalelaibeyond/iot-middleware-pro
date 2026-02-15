/**
 * MqttSubscriber - Ingress module for MQTT message subscription
 *
 * Subscribes to MQTT topics for V5008 and V6800 device data.
 * Emits 'mqtt.message' events for each received message.
 */

const mqtt = require("mqtt");
const eventBus = require("../../core/EventBus");
const config = require("config");
const logger = require("../../core/Logger");

class MqttSubscriber {
  constructor() {
    this.client = null;
    this.config = null;
    this.isConnected = false;
  }

  /**
   * Initialize the MQTT subscriber
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  MqttSubscriber initialized");
  }

  /**
   * Start the MQTT subscriber and connect to broker
   * @returns {Promise<void>}
   */
  async start() {
    if (this.client) {
      console.warn("MqttSubscriber already started");
      return;
    }

    const mqttConfig = require("config").get("mqtt");

    console.log(`  Connecting to MQTT broker: ${mqttConfig.brokerUrl}`);

    // Use unique client ID to avoid conflicts with CommandService
    const options = {
      ...mqttConfig.options,
      clientId: "iot-middleware-sub",
    };

    this.client = mqtt.connect(mqttConfig.brokerUrl, options);

    this.client.on("connect", () => {
      this.isConnected = true;
      console.log("  MQTT connected");

      // Subscribe to topics
      const topics = Object.values(mqttConfig.topics);
      topics.forEach((topic) => {
        this.client.subscribe(topic, (err) => {
          if (err) {
            console.error(`Failed to subscribe to ${topic}:`, err.message);
          } else {
            console.log(`Subscribed to: ${topic}`);
          }
        });
      });
    });

    this.client.on("message", (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on("error", (error) => {
      console.error("MQTT error:", error.message);
      eventBus.emitError(error, "MqttSubscriber");
    });

    this.client.on("close", () => {
      this.isConnected = false;
      console.log("  MQTT connection closed");
    });

    this.client.on("reconnect", () => {
      console.log("MQTT reconnecting...");
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MQTT connection timeout"));
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

    console.log("  MqttSubscriber started");
  }

  /**
   * Handle incoming MQTT message
   * @param {string} topic - The topic the message was received on
   * @param {Buffer} message - The message payload
   */
  handleMessage(topic, message) {
    try {
      // Extract device information from topic
      // Expected format: V5008Upload/{deviceId}/{messageType}
      //                   V6800Upload/{deviceId}/{messageType}
      const topicParts = topic.split("/");
      const protocol = topicParts[0]; // V5008Upload or V6800Upload
      const deviceId = topicParts[1];
      const messageType = topicParts[2];

      // Determine device type from protocol
      const deviceType = protocol === "V5008Upload" ? "V5008" : "V6800";

      // Debug: Log raw message
      try {
        const debugConfig = config.get("debug");
        if (debugConfig && debugConfig.logRawMessage) {
          if (deviceType === "V5008") {
            logger.debug(
              "------------RAW message received(V5008)---------------",
              {
                deviceType,
                topic,
                hex: message.toString("hex").toUpperCase(),
              },
            );
          } else {
            // V6800
            logger.debug("------------RAW message received(V6800)---------------",JSON.parse(message.toString()) );
            //console.log(JSON.parse(message.toString()));
            //   {
            //     deviceType,
            //     topic,
            //     json: message.toString(),
            //   },
            // );
          }
        }
      } catch (e) {
        // Debug config not available, skip
      }

      // Parse message based on device type
      let payload;
      if (deviceType === "V5008") {
        // V5008 sends binary data
        payload = message;
      } else {
        // V6800 sends JSON data
        const messageString = message.toString();

        try {
          payload = JSON.parse(messageString);
        } catch (parseError) {
          console.error(
            `[MqttSubscriber] Failed to parse JSON from ${topic}:`,
            parseError.message,
          );
          eventBus.emitError(parseError, "MqttSubscriber");
          return;
        }
      }

      // Emit mqtt.message event
      const mqttMessage = {
        topic,
        deviceId,
        deviceType,
        messageType,
        payload,
        timestamp: new Date(),
      };

      eventBus.emitMqttMessage(mqttMessage);
    } catch (error) {
      console.error(
        `[MqttSubscriber] Error handling message from ${topic}:`,
        error.message,
      );
      eventBus.emitError(error, "MqttSubscriber");
    }
  }

  /**
   * Stop the MQTT subscriber and disconnect from broker
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.client) {
      console.log("  Stopping MqttSubscriber...");

      await new Promise((resolve) => {
        this.client.end(false, {}, () => {
          resolve();
        });
      });

      this.client = null;
      this.isConnected = false;
      console.log("  MqttSubscriber stopped");
    }
  }

  /**
   * Check if connected to MQTT broker
   * @returns {boolean} Connection status
   */
  isReady() {
    return this.isConnected;
  }
}

module.exports = new MqttSubscriber();
