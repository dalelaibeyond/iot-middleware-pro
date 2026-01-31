/**
 * V6800Parser - Parser for V6800 JSON protocol messages
 *
 * Implements V6800 JSON parser specification (openspec/specs/03-V6800-parser.md).
 * Converts JSON data to SIF (Standard Intermediate Format).
 *
 * V6800 Protocol:
 * - Multi-module devices
 * - JSON format with standardized structure
 * - Supports 12 message types: HEARTBEAT, RFID_SNAPSHOT, RFID_EVENT, TEMP_HUM,
 *   QRY_TEMP_HUM_RESP, DOOR_STATE, QRY_DOOR_STATE_RESP, DEV_MOD_INFO,
 *   UTOTAL_CHANGED, QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP
 */

class V6800Parser {
  constructor() {
    this.config = null;

    // Message type mapping from raw msg_type to SIF messageType
    this.messageTypeMap = {
      heart_beat_req: "HEARTBEAT",
      u_state_resp: "RFID_SNAPSHOT",
      u_state_changed_notify_req: "RFID_EVENT",
      temper_humidity_exception_nofity_req: "TEMP_HUM",
      temper_humidity_resp: "QRY_TEMP_HUM_RESP",
      door_state_changed_notify_req: "DOOR_STATE",
      door_state_resp: "QRY_DOOR_STATE_RESP",
      devies_init_req: "DEV_MOD_INFO",
      u_color: "QRY_CLR_RESP",
      set_module_property_result_req: "SET_CLR_RESP",
      clear_u_warning: "CLN_ALM_RESP",
      devices_changed_req: "UTOTAL_CHANGED",
    };
  }

  /**
   * Initialize the parser
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("V6800Parser initialized");
  }

  /**
   * Parse V6800 JSON message
   * @param {string} topic - MQTT topic
   * @param {String|Object} message - Raw JSON message (string or object)
   * @returns {Object|null} SIF (Standard Intermediate Format) or null if parse fails
   */
  parse(topic, message) {
    try {
      // DEBUG: Entry point - message before parsing
      console.log("=== V6800 PARSER START ===");
      console.log("[V6800Parser] DEBUG - Entry point - Received topic:", topic);
      console.log(
        "[V6800Parser] DEBUG - Entry point - Message type:",
        typeof message,
      );
      console.log(
        "[V6800Parser] DEBUG - Entry point - Timestamp:",
        new Date().toISOString(),
      );

      if (typeof message === "string") {
        console.log(
          "[V6800Parser] DEBUG - Entry point - Raw message string:",
          message,
        );
      } else if (typeof message === "object") {
        console.log(
          "[V6800Parser] DEBUG - Entry point - Message object keys:",
          Object.keys(message),
        );
      }
      console.log("=== END V6800 PARSER ENTRY ===");

      // Parse JSON if message is a string
      let json;
      if (typeof message === "string") {
        // Check if the message looks like a topic name instead of JSON
        if (message.startsWith("V6800Upload")) {
          console.error(
            "V6800Parser: Received topic name instead of JSON payload:",
            message,
          );
          console.error(
            "This suggests an issue with message handling in MqttSubscriber",
          );
          return null;
        }

        try {
          json = JSON.parse(message);
        } catch (parseError) {
          console.error(
            "V6800Parser: Failed to parse JSON:",
            parseError.message,
          );
          console.error("V6800Parser: Raw message content:", message);
          return null;
        }
      } else if (typeof message === "object" && message !== null) {
        json = message;
      } else {
        console.error(
          "V6800Parser: Invalid input, expected string or object, got:",
          typeof message,
        );
        return null;
      }

      // Extract message type
      console.log("=== V6800 PARSER MESSAGE TYPE ===");
      console.log(
        "[V6800Parser] DEBUG - Full JSON object:",
        JSON.stringify(json, null, 2),
      );

      const rawType = json.msg_type;

      console.log("[V6800Parser] DEBUG - rawType:", rawType);
      console.log(
        "[V6800Parser] DEBUG - messageTypeMap entry:",
        this.messageTypeMap[rawType],
      );

      let messageType = this.messageTypeMap[rawType] || "UNKNOWN";
      console.log("=== END V6800 PARSER MESSAGE TYPE ===");

      // Additional defensive check - if msg_type is undefined, check if it might be in a different field
      if (!rawType && json.msg_type !== undefined) {
        console.log(
          "[V6800Parser] WARNING - msg_type is undefined, checking alternative fields...",
        );
        // Check common alternative field names that might contain the message type
        const alternatives = ["message_type", "type", "messageType", "cmd"];
        for (const alt of alternatives) {
          if (json[alt] !== undefined) {
            console.log(
              `[V6800Parser] Found message type in alternative field: ${alt} = ${json[alt]}`,
            );
            rawType = json[alt];
            messageType = this.messageTypeMap[rawType] || "UNKNOWN";
            break;
          }
        }
      }

      console.log("=== V6800 PARSER FINAL MESSAGE TYPE ===");
      console.log("[V6800Parser] DEBUG - final messageType:", messageType);
      console.log("=== END V6800 PARSER FINAL MESSAGE TYPE ===");

      // Extract common envelope fields
      const deviceId = this.extractDeviceId(json);
      const messageId = this.extractMessageId(json);
      const ip = json.gateway_ip || null;
      const mac = json.gateway_mac || null;

      // Build SIF envelope
      const sif = {
        deviceType: "V6800",
        deviceId: deviceId,
        messageType: messageType,
        messageId: messageId,
        meta: {
          topic: topic,
          rawType: rawType,
        },
      };

      // Add optional fields if present
      if (ip) sif.ip = ip;
      if (mac) sif.mac = mac;

      // Parse payload based on message type
      const data = this.parsePayload(json, messageType);

      // Add data array to SIF
      if (data !== null && data !== undefined) {
        sif.data = data;
      }

      //TEMP-DEBUG
      //console.log("=== V6800 PARSER RESULT ===");
      console.log("[V6800Parser] Parsed SIF result:\n", sif);
      //console.log(JSON.stringify(sif, null, 2));
      //console.log("=== END V6800 PARSER RESULT ===");

      return sif;
    } catch (error) {
      console.error("=== V6800 PARSER ERROR ===");
      console.error(`V6800Parser error:`, error.message);
      console.error("=== END V6800 PARSER ERROR ===");
      return null;
    }
  }

  /**
   * Extract device ID from JSON
   * @param {Object} json - Parsed JSON message
   * @returns {string} Device ID
   */
  extractDeviceId(json) {
    // Special case: heart_beat_req with module_type="mt_gw" uses module_sn
    if (json.msg_type === "heart_beat_req" && json.module_type === "mt_gw") {
      return json.module_sn ? String(json.module_sn) : "";
    }
    // Default: use gateway_sn
    return json.gateway_sn ? String(json.gateway_sn) : "";
  }

  /**
   * Extract message ID from JSON
   * @param {Object} json - Parsed JSON message
   * @returns {string} Message ID
   */
  extractMessageId(json) {
    if (json.uuid_number !== undefined && json.uuid_number !== null) {
      return String(json.uuid_number);
    }
    return "";
  }

  /**
   * Parse message payload based on message type
   * @param {Object} json - Parsed JSON message
   * @param {string} messageType - SIF message type
   * @returns {Array|Object|null} Parsed data
   */
  parsePayload(json, messageType) {
    switch (messageType) {
      case "HEARTBEAT":
        return this.parseHeartbeat(json);
      case "RFID_SNAPSHOT":
        return this.parseRfidSnapshot(json);
      case "RFID_EVENT":
        return this.parseRfidEvent(json);
      case "TEMP_HUM":
        return this.parseTempHum(json);
      case "QRY_TEMP_HUM_RESP":
        return this.parseTempHum(json);
      case "DOOR_STATE":
        return this.parseDoorStateEvent(json);
      case "QRY_DOOR_STATE_RESP":
        return this.parseDoorStateQuery(json);
      case "DEV_MOD_INFO":
        return this.parseDevModInfo(json);
      case "UTOTAL_CHANGED":
        return this.parseUtotalChanged(json);
      case "QRY_CLR_RESP":
        return this.parseQryClrResp(json);
      case "SET_CLR_RESP":
        return this.parseSetClrResp(json);
      case "CLN_ALM_RESP":
        return this.parseClnAlmResp(json);
      default:
        // Unknown message type - preserve raw payload
        console.log("=== V6800 PARSER UNKNOWN MESSAGE TYPE ===");
        console.log("[V6800Parser] DEBUG - Unknown message type detected!");
        console.log("[V6800Parser] DEBUG - rawType:", rawType);
        console.log(
          "[V6800Parser] DEBUG - Available message types:",
          Object.keys(this.messageTypeMap),
        );
        console.log("=== END V6800 PARSER UNKNOWN MESSAGE TYPE ===");
        return json;
    }
  }

  /**
   * Parse HEARTBEAT message (heart_beat_req)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed heartbeat data
   */
  parseHeartbeat(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item) => {
        const moduleIndex = this.extractModuleIndex(item);
        const moduleId = this.extractModuleId(item);
        const uTotal = item.module_u_num !== undefined ? item.module_u_num : 0;

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          uTotal: uTotal,
        });
      });
    }

    return data;
  }

  /**
   * Parse RFID_SNAPSHOT message (u_state_resp)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed RFID snapshot data
   */
  parseRfidSnapshot(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((moduleItem) => {
        const moduleIndex = this.extractModuleIndex(moduleItem);
        const moduleId = this.extractModuleId(moduleItem);

        const rfidData = [];

        if (moduleItem.data && Array.isArray(moduleItem.data)) {
          moduleItem.data.forEach((rfidItem) => {
            const tagId = rfidItem.tag_code;

            // Filter out RFID items with null/empty tag_code
            if (
              !tagId ||
              tagId === "" ||
              tagId === null ||
              tagId === undefined
            ) {
              return;
            }

            const uIndex =
              rfidItem.u_index !== undefined ? rfidItem.u_index : 0;
            const isAlarm = rfidItem.warning === 1;

            rfidData.push({
              uIndex: uIndex,
              tagId: String(tagId),
              isAlarm: isAlarm,
            });
          });
        }

        if (rfidData.length > 0) {
          data.push({
            moduleIndex: moduleIndex,
            moduleId: moduleId,
            data: rfidData,
          });
        }
      });
    }

    return data;
  }

  /**
   * Parse RFID_EVENT message (u_state_changed_notify_req)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed RFID event data
   */
  parseRfidEvent(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((moduleItem) => {
        const moduleIndex = this.extractModuleIndex(moduleItem);
        const moduleId = this.extractModuleId(moduleItem);

        const rfidData = [];

        if (moduleItem.data && Array.isArray(moduleItem.data)) {
          moduleItem.data.forEach((rfidItem) => {
            const tagId = rfidItem.tag_code;

            // Filter out RFID items with null/empty tag_code
            if (
              !tagId ||
              tagId === "" ||
              tagId === null ||
              tagId === undefined
            ) {
              return;
            }

            const uIndex =
              rfidItem.u_index !== undefined ? rfidItem.u_index : 0;
            const isAlarm = rfidItem.warning === 1;
            const action = this.parseRfidAction(
              rfidItem.new_state,
              rfidItem.old_state,
            );

            rfidData.push({
              uIndex: uIndex,
              tagId: String(tagId),
              isAlarm: isAlarm,
              action: action,
            });
          });
        }

        if (rfidData.length > 0) {
          data.push({
            moduleIndex: moduleIndex,
            moduleId: moduleId,
            data: rfidData,
          });
        }
      });
    }

    return data;
  }

  /**
   * Parse RFID action from new_state and old_state
   * @param {number} newState - New state value
   * @param {number} oldState - Old state value
   * @returns {string} Action: "ATTACHED" or "DETACHED"
   */
  parseRfidAction(newState, oldState) {
    // 1/0 -> ATTACHED, 0/1 -> DETACHED
    if (newState === 1 && oldState === 0) {
      return "ATTACHED";
    } else if (newState === 0 && oldState === 1) {
      return "DETACHED";
    }
    // Default fallback
    return newState === 1 ? "ATTACHED" : "DETACHED";
  }

  /**
   * Parse TEMP_HUM message (temper_humidity_exception_nofity_req or temper_humidity_resp)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed temperature/humidity data
   */
  parseTempHum(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((moduleItem) => {
        const moduleIndex = this.extractModuleIndex(moduleItem);
        const moduleId = this.extractModuleId(moduleItem);

        const thData = [];

        if (moduleItem.data && Array.isArray(moduleItem.data)) {
          moduleItem.data.forEach((thItem) => {
            const thIndex =
              thItem.temper_position !== undefined ? thItem.temper_position : 0;
            const temp =
              thItem.temper_swot !== undefined
                ? thItem.temper_swot === 0
                  ? null
                  : thItem.temper_swot
                : null;
            const hum =
              thItem.hygrometer_swot !== undefined
                ? thItem.hygrometer_swot === 0
                  ? null
                  : thItem.hygrometer_swot
                : null;

            thData.push({
              thIndex: thIndex,
              temp: temp,
              hum: hum,
            });
          });
        }

        if (thData.length > 0) {
          data.push({
            moduleIndex: moduleIndex,
            moduleId: moduleId,
            data: thData,
          });
        }
      });
    }

    return data;
  }

  /**
   * Parse DOOR_STATE event message (door_state_changed_notify_req)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed door state data
   */
  parseDoorStateEvent(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item) => {
        const moduleIndex = this.extractModuleIndex(item);
        const moduleId = this.extractModuleId(item);

        const doorData = {};

        // Check for dual door (new_state1 and new_state2)
        if (item.new_state1 !== undefined || item.new_state2 !== undefined) {
          if (item.new_state1 !== undefined) {
            doorData.door1State = item.new_state1;
          }
          if (item.new_state2 !== undefined) {
            doorData.door2State = item.new_state2;
          }
        } else if (item.new_state !== undefined) {
          // Single door
          doorData.doorState = item.new_state;
        }

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          ...doorData,
        });
      });
    }

    return data;
  }

  /**
   * Parse QRY_DOOR_STATE_RESP message (door_state_resp)
   * @param {Object} json - Parsed JSON message
   * @returns {Object} Parsed door state query response
   */
  parseDoorStateQuery(json) {
    const result = {
      moduleIndex: 0,
      moduleId: "",
    };

    // Extract module info from data array (first item)
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      const item = json.data[0];
      result.moduleIndex = this.extractModuleIndex(item);
      result.moduleId = this.extractModuleId(item);

      // Check for dual door
      if (item.new_state1 !== undefined || item.new_state2 !== undefined) {
        if (item.new_state1 !== undefined) {
          result.door1State = item.new_state1;
        }
        if (item.new_state2 !== undefined) {
          result.door2State = item.new_state2;
        }
      } else if (item.new_state !== undefined) {
        // Single door
        result.doorState = item.new_state;
      }
    }

    return result;
  }

  /**
   * Parse DEV_MOD_INFO message (devies_init_req)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed device module info data
   */
  parseDevModInfo(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item) => {
        const moduleIndex = this.extractModuleIndex(item);
        const moduleId = this.extractModuleId(item);
        const uTotal = item.module_u_num !== undefined ? item.module_u_num : 0;
        const fwVer =
          item.module_sw_version !== undefined
            ? String(item.module_sw_version)
            : "";

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          uTotal: uTotal,
          fwVer: fwVer,
        });
      });
    }

    return data;
  }

  /**
   * Parse UTOTAL_CHANGED message (devices_changed_req)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed utotal changed data
   */
  parseUtotalChanged(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item) => {
        const moduleIndex = this.extractModuleIndex(item);
        const moduleId = this.extractModuleId(item);
        const uTotal = item.module_u_num !== undefined ? item.module_u_num : 0;
        const fwVer =
          item.module_sw_version !== undefined
            ? String(item.module_sw_version)
            : "";

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          uTotal: uTotal,
          fwVer: fwVer,
        });
      });
    }

    return data;
  }

  /**
   * Parse QRY_CLR_RESP message (u_color)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed query color response data
   */
  parseQryClrResp(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((moduleItem) => {
        const moduleIndex = this.extractModuleIndex(moduleItem);
        const moduleId = this.extractModuleId(moduleItem);
        const uTotal =
          moduleItem.module_u_num !== undefined ? moduleItem.module_u_num : 0;

        const colorData = [];

        if (moduleItem.data && Array.isArray(moduleItem.data)) {
          moduleItem.data.forEach((colorItem) => {
            const uIndex =
              colorItem.u_index !== undefined ? colorItem.u_index : 0;
            const colorName =
              colorItem.color !== undefined ? String(colorItem.color) : "";
            const colorCode = colorItem.code !== undefined ? colorItem.code : 0;

            colorData.push({
              uIndex: uIndex,
              colorName: colorName,
              colorCode: colorCode,
            });
          });
        }

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          uTotal: uTotal,
          data: colorData,
        });
      });
    }

    return data;
  }

  /**
   * Parse SET_CLR_RESP message (set_module_property_result_req)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed set color response data
   */
  parseSetClrResp(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item) => {
        const moduleIndex = this.extractModuleIndex(item);
        const moduleId = this.extractModuleId(item);
        const result = item.result !== undefined ? String(item.result) : "";

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          result: result,
        });
      });
    }

    return data;
  }

  /**
   * Parse CLN_ALM_RESP message (clear_u_warning)
   * @param {Object} json - Parsed JSON message
   * @returns {Array} Parsed clear alarm response data
   */
  parseClnAlmResp(json) {
    const data = [];

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach((item) => {
        const moduleIndex = this.extractModuleIndex(item);
        const moduleId = this.extractModuleId(item);
        const uTotal = item.module_u_num !== undefined ? item.module_u_num : 0;
        const result = item.result !== undefined ? Boolean(item.result) : false;

        data.push({
          moduleIndex: moduleIndex,
          moduleId: moduleId,
          uTotal: uTotal,
          result: result,
        });
      });
    }

    return data;
  }

  /**
   * Extract module index from item
   * Supports aliases: module_index, host_gateway_port_index
   * @param {Object} item - Module data item
   * @returns {number} Module index
   */
  extractModuleIndex(item) {
    if (item.module_index !== undefined) {
      return item.module_index;
    }
    if (item.host_gateway_port_index !== undefined) {
      return item.host_gateway_port_index;
    }
    return 0;
  }

  /**
   * Extract module ID from item
   * Supports aliases: module_sn, extend_module_sn
   * @param {Object} item - Module data item
   * @returns {string} Module ID
   */
  extractModuleId(item) {
    if (item.module_sn !== undefined) {
      return String(item.module_sn);
    }
    if (item.extend_module_sn !== undefined) {
      return String(item.extend_module_sn);
    }
    return "";
  }
}

module.exports = new V6800Parser();
