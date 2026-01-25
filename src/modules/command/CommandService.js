/**
 * CommandService - Outbound Commands (Sync/Control)
 *
 * Handles outbound commands to devices via MQTT.
 * Listens for command.request events and publishes to appropriate topics.
 */

const mqtt = require("mqtt");
const eventBus = require("../../core/EventBus");

class CommandService {
  constructor() {
    this.config = null;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize command service
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("CommandService initialized");
  }

  /**
   * Start command service
   * @returns {Promise<void>}
   */
  async start() {
    if (this.client) {
      console.warn("CommandService already started");
      return;
    }

    const mqttConfig = require("config").get("mqtt");

    console.log(
      `Connecting to MQTT broker for commands: ${mqttConfig.brokerUrl}`,
    );

    this.client = mqtt.connect(mqttConfig.brokerUrl, mqttConfig.options);

    this.client.on("connect", () => {
      this.isConnected = true;
      console.log("CommandService MQTT connected");
    });

    this.client.on("error", (error) => {
      console.error("CommandService MQTT error:", error.message);
      eventBus.emitError(error, "CommandService");
    });

    this.client.on("close", () => {
      this.isConnected = false;
      console.log("CommandService MQTT connection closed");
    });

    this.client.on("reconnect", () => {
      console.log("CommandService MQTT reconnecting...");
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("CommandService MQTT connection timeout"));
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

    // Subscribe to command requests
    eventBus.onCommandRequest((command) => {
      this.handleCommandRequest(command);
    });

    console.log("CommandService started");
  }

  /**
   * Handle command request event
   * @param {Object} command - Command request payload
   */
  handleCommandRequest(command) {
    try {
      const { deviceId, messageType, payload } = command;

      console.log(`Command request: ${messageType} for device ${deviceId}`);

      // Determine format: V6800 (JSON) or V5008 (Hex)
      // For now, we'll assume V6800 format for JSON commands
      // V5008 would need binary encoding

      const mqttPayload = this.buildPayload(messageType, payload);

      // Publish to download topic
      const downloadTopic = `${mqttConfig.downloadTopic}/${deviceId}`;

      this.client.publish(
        downloadTopic,
        JSON.stringify(mqttPayload),
        { qos: 1 },
        (err) => {
          if (err) {
            console.error(
              `Failed to publish command to ${downloadTopic}:`,
              err.message,
            );
            eventBus.emitError(err, "CommandService");
          } else {
            console.log(`Command published to ${downloadTopic}`);
          }
        },
      );
    } catch (error) {
      console.error("CommandService error:", error.message);
      eventBus.emitError(error, "CommandService");
    }
  }

  /**
   * Build command payload based on message type
   * @param {string} messageType - Message type
   * @param {Object} payload - Command payload
   * @returns {Object} MQTT payload
   */
  buildPayload(messageType, payload) {
    const msgTypeMap = {
      QRY_RFID_SNAPSHOT: "u_state_req",
      CLN_ALARM: "u_clr_alarm",
      SET_COLOR: "u_set_color",
      REBOOT: "u_reboot",
    };

    const msgType = msgTypeMap[messageType] || messageType;

    return {
      msg_type: msgType,
      ...payload,
    };
  }

  /**
   * Send a command directly (for API usage)
   * @param {string} deviceId - Device ID
   * @param {string} messageType - Message type
   * @param {Object} payload - Command payload
   * @returns {Promise<void>}
   */
  async sendCommand(deviceId, messageType, payload = {}) {
    const command = {
      deviceId,
      messageType,
      payload,
      timestamp: new Date(),
    };

    return this.handleCommandRequest(command);
  }

  /**
   * Stop command service
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("Stopping CommandService...");

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
    eventBus.removeAllListeners("command.request");

    console.log("CommandService stopped");
  }

  /**
   * Check if connected to MQTT broker
   * @returns {boolean} Connection status
   */
  isReady() {
    return this.isConnected;
  }
}

module.exports = new CommandService();
