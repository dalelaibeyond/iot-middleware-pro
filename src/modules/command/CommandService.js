/**
 * CommandService - Outbound Commands (Sync/Control)
 *
 * Handles outbound commands to devices via MQTT.
 * Listens for command.request events and publishes to appropriate topics.
 * Translates internal system intents into device-specific raw protocols.
 */

const mqtt = require("mqtt");
const eventBus = require("../../core/EventBus");

class CommandService {
  constructor() {
    this.config = null;
    this.client = null;
    this.isConnected = false;
    this.mqttConfig = null;
  }

  /**
   * Initialize command service
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  CommandService initialized");
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

    // Store mqttConfig as instance property for use in handleCommandRequest
    this.mqttConfig = mqttConfig;

    console.log(
      `  Connecting to MQTT broker for commands: ${mqttConfig.brokerUrl}`,
    );

    // Use unique client ID to avoid conflicts with MqttSubscriber
    const options = {
      ...mqttConfig.options,
      clientId: "iot-middleware-cmd",
    };

    this.client = mqtt.connect(mqttConfig.brokerUrl, options);

    this.client.on("connect", () => {
      this.isConnected = true;
      console.log("  CommandService MQTT connected");
    });

    this.client.on("error", (error) => {
      console.error("CommandService MQTT error:", error.message);
      eventBus.emitError(error, "CommandService");
    });

    this.client.on("close", () => {
      this.isConnected = false;
      console.log("  CommandService MQTT connection closed");
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

    console.log("  CommandService started");
  }

  /**
   * Handle command request event
   * @param {Object} command - Command request payload
   */
  handleCommandRequest(command) {
    try {
      // Validate required fields
      if (!command.deviceId) {
        throw new Error("Missing required field: deviceId");
      }
      if (!command.deviceType) {
        throw new Error("Missing required field: deviceType");
      }
      if (!command.messageType) {
        throw new Error("Missing required field: messageType");
      }

      const { deviceId, deviceType, messageType, payload = {} } = command;

      console.log(
        `Command request: ${messageType} for device ${deviceId} (${deviceType})`,
      );

      // Validate required parameters based on command type
      this.validateCommandParameters(messageType, payload);

      let mqttPayload;
      let topic;

      // Route based on device type
      if (deviceType === "V5008") {
        // Special handling for QRY_DEV_MOD_INFO - trigger QRY_DEVICE_INFO and QRY_MODULE_INFO sequentially
        if (messageType === "QRY_DEV_MOD_INFO") {
          console.log(
            `QRY_DEV_MOD_INFO for V5008 - triggering QRY_DEVICE_INFO and QRY_MODULE_INFO sequentially`,
          );
          
          // Send QRY_DEVICE_INFO first
          const deviceInfoPayload = this.buildV5008Command("QRY_DEVICE_INFO", payload);
          const deviceInfoTopic = `V5008Download/${deviceId}`;
          
          this.client.publish(
            deviceInfoTopic,
            deviceInfoPayload,
            { qos: 1 },
            (err) => {
              if (err) {
                console.error(
                  `Failed to publish QRY_DEVICE_INFO to ${deviceInfoTopic}:`,
                  err.message,
                );
                eventBus.emitError(err, "CommandService");
              } else {
                console.log(`QRY_DEVICE_INFO published to ${deviceInfoTopic}`);
              }
            },
          );

          // Then send QRY_MODULE_INFO
          const moduleInfoPayload = this.buildV5008Command("QRY_MODULE_INFO", payload);
          const moduleInfoTopic = `V5008Download/${deviceId}`;
          
          this.client.publish(
            moduleInfoTopic,
            moduleInfoPayload,
            { qos: 1 },
            (err) => {
              if (err) {
                console.error(
                  `Failed to publish QRY_MODULE_INFO to ${moduleInfoTopic}:`,
                  err.message,
                );
                eventBus.emitError(err, "CommandService");
              } else {
                console.log(`QRY_MODULE_INFO published to ${moduleInfoTopic}`);
              }
            },
          );

          return; // Exit early as both commands have been sent
        }

        mqttPayload = this.buildV5008Command(messageType, payload);
        topic = `V5008Download/${deviceId}`;
      } else if (deviceType === "V6800") {
        mqttPayload = this.buildV6800Command(messageType, payload, deviceId);
        topic = `V6800Download/${deviceId}`;
      } else {
        console.error(`Unknown device type: ${deviceType}`);
        eventBus.emitError(
          new Error(`Unknown device type: ${deviceType}`),
          "CommandService",
        );
        return;
      }

      // Log the outbound command for audit purposes
      console.log(`Publishing command to topic: ${topic}`);
      if (deviceType === "V5008") {
        console.log(`Hex payload:`, mqttPayload.toString("hex").toUpperCase());
      } else {
        console.log(`JSON payload:`, mqttPayload);
      }

      // Publish to appropriate topic
      this.client.publish(
        topic,
        deviceType === "V5008" ? mqttPayload : JSON.stringify(mqttPayload),
        { qos: 1 },
        (err) => {
          if (err) {
            console.error(
              `Failed to publish command to ${topic}:`,
              err.message,
            );
            eventBus.emitError(err, "CommandService");
          } else {
            console.log(`Command published to ${topic}`);
          }
        },
      );
    } catch (error) {
      console.error("CommandService error:", error.message);
      eventBus.emitError(error, "CommandService");
    }
  }

  /**
   * Validate command parameters based on message type
   * @param {string} messageType - Message type
   * @param {Object} payload - Command payload
   */
  validateCommandParameters(messageType, payload) {
    switch (messageType) {
      case "QRY_RFID_SNAPSHOT":
      case "QRY_TEMP_HUM":
      case "QRY_DOOR_STATE":
      case "QRY_NOISE_LEVEL":
      case "QRY_COLOR":
        if (payload.moduleIndex === undefined) {
          throw new Error(
            `Missing required parameter: moduleIndex for ${messageType}`,
          );
        }
        break;
      case "CLN_ALARM":
        if (
          payload.moduleIndex === undefined ||
          payload.sensorIndex === undefined
        ) {
          throw new Error(
            `Missing required parameters: moduleIndex and sensorIndex for ${messageType}`,
          );
        }
        break;
      case "SET_COLOR":
        if (payload.moduleIndex === undefined) {
          throw new Error(
            `Missing required parameter: moduleIndex for ${messageType}`,
          );
        }
        // Check for colorMap format (new) or single sensorIndex/colorCode (legacy)
        if (!payload.colorMap) {
          if (payload.sensorIndex === undefined || payload.colorCode === undefined) {
            throw new Error(
              `Missing required parameters: either colorMap array or sensorIndex and colorCode for ${messageType}`,
            );
          }
        }
        break;
    }
  }

  /**
   * Build V5008 binary command
   * @param {string} messageType - Message type
   * @param {Object} payload - Command payload
   * @returns {Buffer} Binary payload
   */
  buildV5008Command(messageType, payload) {
    const { moduleIndex, sensorIndex, colorCode } = payload;

    switch (messageType) {
      case "QRY_RFID_SNAPSHOT":
        return Buffer.from([0xe9, 0x01, moduleIndex]);
      case "QRY_TEMP_HUM":
        return Buffer.from([0xe9, 0x02, moduleIndex]);
      case "QRY_DOOR_STATE":
        return Buffer.from([0xe9, 0x03, moduleIndex]);
      case "QRY_NOISE_LEVEL":
        return Buffer.from([0xe9, 0x04, moduleIndex]);
      case "QRY_DEVICE_INFO":
        return Buffer.from([0xef, 0x01, 0x00]);
      case "QRY_MODULE_INFO":
        return Buffer.from([0xef, 0x02, 0x00]);
      case "QRY_COLOR":
        return Buffer.from([0xe4, moduleIndex]);
      case "CLN_ALARM":
        return Buffer.from([0xe2, moduleIndex, sensorIndex]);
      case "SET_COLOR":
        // Handle single LED
        if (Array.isArray(payload.leds)) {
          // Multiple LEDs case
          const bufferArray = [0xe1];
          payload.leds.forEach((led) => {
            bufferArray.push(moduleIndex, led.sensorIndex, led.colorCode);
          });
          return Buffer.from(bufferArray);
        } else {
          // Single LED case
          return Buffer.from([0xe1, moduleIndex, sensorIndex, colorCode]);
        }
      default:
        throw new Error(`Unsupported message type for V5008: ${messageType}`);
    }
  }

  /**
   * Build V6800 JSON command
   * @param {string} messageType - Message type
   * @param {Object} payload - Command payload
   * @param {string} deviceId - Device ID
   * @returns {Object} JSON payload
   */
  buildV6800Command(messageType, payload, deviceId) {
    const { moduleIndex, sensorIndex, colorCode } = payload;

    switch (messageType) {
      case "QRY_RFID_SNAPSHOT":
        return {
          msg_type: "u_state_req",
          gateway_sn: deviceId,
          data: [
            {
              extend_module_sn: payload.moduleId || null,
              host_gateway_port_index: moduleIndex,
              u_index_list: null,
            },
          ],
        };
      case "QRY_TEMP_HUM":
        return {
          msg_type: "temper_humidity_req",
          gateway_sn: deviceId,
          extend_module_sn: null,
          data: [moduleIndex],
        };
      case "QRY_DOOR_STATE":
        return {
          msg_type: "door_state_req",
          gateway_sn: deviceId,
          extend_module_sn: payload.extendModuleSn || null,
          host_gateway_port_index: moduleIndex,
        };
      case "QRY_DEV_MOD_INFO":
        return {
          msg_type: "get_devies_init_req",
          code: 200,
        };
      case "QRY_COLOR":
        return {
          msg_type: "get_u_color",
          code: 1346589,
          data: [moduleIndex],
        };
      case "CLN_ALARM":
        return {
          msg_type: "clear_u_warning",
          gateway_id: deviceId,
          code: 123456,
          data: [
            {
              index: moduleIndex,
              warning_data: Array.isArray(sensorIndex)
                ? sensorIndex
                : [sensorIndex],
            },
          ],
        };
      case "SET_COLOR":
        // Build u_color_data from colorMap (new format) or fallback to legacy formats
        let uColorData;
        if (Array.isArray(payload.colorMap)) {
          uColorData = payload.colorMap.map((item) => ({
            u_index: item.sensorIndex,
            color_code: item.colorCode,
          }));
        } else if (Array.isArray(payload.leds)) {
          uColorData = payload.leds.map((led) => ({
            u_index: led.sensorIndex,
            color_code: led.colorCode,
          }));
        } else {
          uColorData = [
            {
              u_index: sensorIndex,
              color_code: colorCode,
            },
          ];
        }
        return {
          msg_type: "set_module_property_req",
          gateway_sn: deviceId,
          set_property_type: 8001,
          data: [
            {
              host_gateway_port_index: moduleIndex,
              extend_module_sn: payload.extendModuleSn || null,
              module_type: 2,
              u_color_data: uColorData,
            },
          ],
        };
      default:
        throw new Error(`Unsupported message type for V6800: ${messageType}`);
    }
  }

  /**
   * Send a command directly (for API usage)
   * @param {string} deviceId - Device ID
   * @param {string} deviceType - Device type ("V5008" or "V6800")
   * @param {string} messageType - Message type
   * @param {Object} payload - Command payload
   * @returns {Promise<void>}
   */
  async sendCommand(deviceId, deviceType, messageType, payload = {}) {
    const command = {
      deviceId,
      deviceType,
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
    console.log("  Stopping CommandService...");

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

    console.log("  CommandService stopped");
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
