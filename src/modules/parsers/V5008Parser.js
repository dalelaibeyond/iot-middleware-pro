/**
 * V5008Parser - Parser for V5008 binary protocol messages
 *
 * Implements V5008 binary parser specification.
 * Converts raw binary data to SIF (Standard Intermediate Format).
 *
 * V5008 Protocol:
 * - Single-module devices
 * - Binary format with specific header structure
 * - Supports telemetry, RFID, door, heartbeat, device info, module info, and command response messages
 */

class V5008Parser {
  constructor() {
    this.config = null;
  }

  /**
   * Initialize parser
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("V5008Parser initialized");
  }

  /**
   * Parse V5008 binary message
   * @param {Buffer} buffer - Raw binary message
   * @param {Object} metadata - Message metadata (deviceId, messageType, topic, etc.)
   * @returns {Object|null} SIF (Standard Intermediate Format) or null if parse fails
   */
  parse(buffer, metadata) {


        //TEMP-DEBUG
        console.log("Topic:", metadata.topic);
        console.log("[V5008Parser] V5008 message:", buffer.toString('hex').toUpperCase());

    try {
      if (!Buffer.isBuffer(buffer)) {
        console.error("V5008Parser: Invalid input, expected Buffer");
        return null;
      }

      if (buffer.length < 1) {
        console.error("V5008Parser: Buffer too short");
        return null;
      }

      // Determine message type using topic suffix and header byte
      const messageType = this.getMessageType(buffer, metadata);

      // Parse message based on type
      const data = this.parsePayload(buffer, messageType, metadata);

      // Construct SIF (Standard Intermediate Format)
      const sif = {
        meta: {
          deviceId: metadata.deviceId,
          deviceType: "V5008",
          messageType: messageType,
          topic: metadata.topic,
          rawHex: buffer.toString("hex").toUpperCase(),
        },
        deviceType: "V5008",
        messageType: messageType,
        data: data,
      };

      //TEMP-DEBUG
      console.log("[V5008Parser] Parsed SIF:\n");
      console.log(sif);

      return sif;
    } catch (error) {
      console.error(
        `V5008Parser error for device ${metadata.deviceId}:`,
        error.message,
      );
      return null; // Return null on error (do not throw)
    }
  }

  /**
   * Get message type from buffer using topic suffix and header byte
   * @param {Buffer} buffer - Raw binary message
   * @param {Object} metadata - Message metadata
   * @returns {string} Message type identifier
   */
  getMessageType(buffer, metadata) {
    const firstByte = buffer.readUInt8(0);
    const topic = metadata.topic || "";

    // Priority 1: Topic suffix check
    if (topic.endsWith("/LabelState")) {
      return "RFID_SNAPSHOT";
    } else if (topic.endsWith("/TemHum")) {
      return "TEMP_HUM";
    } else if (topic.endsWith("/Noise")) {
      return "NOISE_LEVEL";
    }

    // Priority 2: Header byte check
    if (firstByte === 0xba) {
      return "DOOR_STATE";
    } else if (firstByte === 0xcc || firstByte === 0xcb) {
      return "HEARTBEAT";
    } else if (firstByte === 0xef) {
      // Check extended header
      if (buffer.length >= 2) {
        const secondByte = buffer.readUInt8(1);
        if (secondByte === 0x01) {
          return "DEVICE_INFO";
        } else if (secondByte === 0x02) {
          return "MODULE_INFO";
        }
      }
    } else if (firstByte === 0xbb) {
      return "RFID_SNAPSHOT";
    } else if (firstByte === 0xaa && buffer.length >= 7) {
      // Check command response (Header AA, Command Code at index 6)
      const cmdCode = buffer.readUInt8(6);
      if (cmdCode === 0xe4 || cmdCode === 0xe1 || cmdCode === 0xe2) {
        if (cmdCode === 0xe4) {
          return "QRY_CLR_RESP";
        } else if (cmdCode === 0xe1) {
          return "SET_CLR_RESP";
        } else if (cmdCode === 0xe2) {
          return "CLN_ALM_RESP";
        }
      }
    }

    // Default: unknown
    return "UNKNOWN";
  }

  /**
   * Parse message payload based on message type
   * @param {Buffer} buffer - Raw binary message
   * @param {string} messageType - Message type
   * @param {Object} metadata - Message metadata
   * @returns {Array} Parsed data array
   */
  parsePayload(buffer, messageType, metadata) {
    switch (messageType) {
      case "HEARTBEAT":
        return this.parseHeartbeat(buffer);
      case "RFID_SNAPSHOT":
        return this.parseRfidSnapshot(buffer);
      case "TEMP_HUM":
        return this.parseTempHum(buffer);
      case "NOISE_LEVEL":
        return this.parseNoiseLevel(buffer);
      case "DOOR_STATE":
        return this.parseDoorState(buffer);
      case "DEVICE_INFO":
        return this.parseDeviceInfo(buffer);
      case "MODULE_INFO":
        return this.parseModuleInfo(buffer);
      case "QRY_CLR_RESP":
        return this.parseQryClrResp(buffer);
      case "SET_CLR_RESP":
        return this.parseSetClrResp(buffer);
      case "CLN_ALM_RESP":
        return this.parseClnAlmResp(buffer);
      default:
        console.warn(`Unknown message type: ${messageType}`);
        return [];
    }
  }

  /**
   * Parse header bytes for common fields
   * @param {Buffer} buffer - Raw binary message
   * @returns {Object} Header information
   */
  parseHeader(buffer) {
    const deviceId = this.parseDeviceId(buffer);
    const messageId = this.parseMessageId(buffer);
    return { deviceId, messageId };
  }

  /**
   * Parse device ID from buffer
   * @param {Buffer} buffer - Raw binary message
   * @returns {string} Device ID
   */
  parseDeviceId(buffer) {
    // Check for Header AA (command response) or extract from topic
    if (buffer.length >= 5 && buffer.readUInt8(0) === 0xaa) {
      // Header AA: Bytes [1-4] -> DeviceId
      return buffer.toString("hex", 1, 4).toUpperCase();
    }
    // Extract from topic (handled in metadata)
    return "";
  }

  /**
   * Parse message ID from buffer (last 4 bytes)
   * @param {Buffer} buffer - Raw binary message
   * @returns {string} Message ID
   */
  parseMessageId(buffer) {
    if (buffer.length >= 4) {
      const last4Bytes = buffer.slice(-4);
      return last4Bytes.toString("hex").toUpperCase();
    }
    return "";
  }

  /**
   * Algorithm A: Signed Sensor Values (Temp/Noise)
   * Used for fields: temp, hum, noise
   * Binary Input: [IntegerByte, FractionByte]
   * @param {number} integerByte - Integer part of value
   * @param {number} fractionByte - Fraction part of value
   * @returns {number} Parsed float value
   */
  parseSignedFloat(integerByte, fractionByte) {
    // 1. Check Sign Bit (Two's Complement)
    let signedInt =
      integerByte & 0x80 ? (0xff - integerByte + 1) * -1 : integerByte;

    // 2. Combine with Fraction
    // Note: Fraction adds magnitude to the signed base
    let value = signedInt + Math.sign(signedInt || 1) * (fractionByte / 100);

    return Number(value.toFixed(2));
  }

  /**
   * Algorithm B: Dynamic originalReq Length
   * Used for QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP
   * @param {Buffer} buffer - Raw binary message
   * @param {number} cmdCode - Command code byte
   * @returns {Object} Parsed originalReq information
   */
  parseOriginalReq(buffer, cmdCode) {
    // Header (AA) is at index 0. Command Code is at index 6.
    let reqLength;

    if (cmdCode === 0xe4) {
      reqLength = 2; // Fixed length for Query Color
    } else {
      // Variable length: Total - Overhead (Header+Id+Result+MsgId)
      // Overhead = 10 bytes (Header:1 + DevId:4 + Result:1 + MsgId:4)
      reqLength = buffer.length - 10;
    }

    // Read reqLength bytes starting at index 6 -> originalReq
    const reqBuffer = buffer.slice(6, 6 + reqLength);

    // 3. Extract Module Index (Byte 1 of the command)
    // Example: E4 01 (Query Mod 1) -> 01
    const moduleIndex = reqBuffer.readUInt8(1);

    // 4. Return both Hex String and Index
    return {
      originalReq: reqBuffer.toString("hex").toUpperCase(),
      moduleIndex,
    };
  }

  /**
   * Algorithm C: Parsing originalReq (Header AA)
   * Goal: Extract the Module Index from the echoed command
   * @param {Buffer} buffer - Raw binary message
   * @returns {Object} Parsed originalReq information
   */
  parseOriginalReqHeaderAA(buffer) {
    // 1. Determine Req Length (Algorithm B)
    // 2. Extract Buffer slice for originalReq
    const reqLength = buffer.length - 10; // Total - Overhead
    const reqBuffer = buffer.slice(6, 6 + reqLength);

    // 3. Extract Module Index (Byte 1 of the command)
    const moduleIndex = reqBuffer.readUInt8(1);

    // 4. Return both Hex String and Index
    return {
      originalReq: reqBuffer.toString("hex").toUpperCase(),
      moduleIndex,
    };
  }

  /**
   * Parse HEARTBEAT message
   * Header: 0xCC or 0xCB
   * Schema: Header(1) + [ModAddr(1) + ModId(4) + Total(1)] × 10 + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed heartbeat data
   */
  parseHeartbeat(buffer) {
    const data = [];
    const slotCount = 10;

    for (let i = 0; i < slotCount; i++) {
      const offset = 1 + i * 6; // Skip header byte

      if (offset + 6 > buffer.length) {
        break;
      }

      const modAddr = buffer.readUInt8(offset);
      const modId = buffer.slice(offset + 1, offset + 5).toString("hex").toUpperCase();
      const modIdValue = buffer.readUInt32BE(offset + 1);
      const total = buffer.readUInt8(offset + 5);

      // Filter out slots where ModId == 0 or ModAddr > 5
      if (modIdValue === 0 || modAddr > 5) {
        continue;
      }

      data.push({
        moduleIndex: modAddr + 1, // Convert to 1-based
        moduleId: modId,
        uTotal: total,
      });
    }

    return data;
  }

  /**
   * Parse RFID_SNAPSHOT message
   * Header: 0xBB
   * Schema: Header(1) + ModAddr(1) + ModId(4) + Res(1) + Total(1) + Count(1) + [uPos(1) + Alarm(1) + TagId(4)] × Count + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed RFID snapshot data
   */
  parseRfidSnapshot(buffer) {
    const data = [];

    // Read header
    const modAddr = buffer.readUInt8(1);
    const modId = buffer.slice(2, 6).toString("hex").toUpperCase();
    const res = buffer.readUInt8(6);
    const total = buffer.readUInt8(7);
    const count = buffer.readUInt8(8);

    const slotSize = 6; // uPos(1) + Alarm(1) + TagId(4)
    const dataOffset = 9;
    const msgIdOffset = dataOffset + slotSize * count;

    for (let i = 0; i < count; i++) {
      const offset = dataOffset + i * slotSize;

      if (offset + slotSize > buffer.length) {
        break;
      }

      const uPos = buffer.readUInt8(offset);
      const alarm = buffer.readUInt8(offset + 1);
      const tagId = buffer
        .slice(offset + 2, offset + 6)
        .toString("hex")
        .toUpperCase();

      data.push({
        moduleIndex: modAddr + 1,
        moduleId: modId,
        uTotal: total,
        uIndex: uPos,
        isAlarm: alarm === 0x01,
        tagId: tagId,
      });
    }

    return data;
  }

  /**
   * Parse TEMP_HUM message
   * Topic: .../TemHum
   * Schema: ModAddr(1) + ModId(4) + [Addr(1) + T_Int(1) + T_Frac(1) + H_Int(1) + H_Frac(1)] × 6 + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed temperature/humidity data
   */
  parseTempHum(buffer) {
    const data = [];
    const slotCount = 6;

    for (let i = 0; i < slotCount; i++) {
      const offset = 1 + i * 7; // Skip header byte

      if (offset + 7 > buffer.length) {
        break;
      }

      const modAddr = buffer.readUInt8(offset);
      const modId = buffer.slice(offset + 1, offset + 5).toString("hex").toUpperCase();
      const addr = buffer.readUInt8(offset + 5);

      // If Addr === 0, skip (no sensor)
      if (addr === 0) {
        continue;
      }

      const tInt = buffer.readUInt8(offset + 6);
      const tFrac = buffer.readUInt8(offset + 7);
      const hInt = buffer.readUInt8(offset + 8);
      const hFrac = buffer.readUInt8(offset + 9);

      const temp = this.parseSignedFloat(tInt, tFrac);
      const hum = this.parseSignedFloat(hInt, hFrac);

      data.push({
        moduleIndex: modAddr + 1,
        moduleId: modId,
        thIndex: addr,
        temp: temp,
        hum: hum,
      });
    }

    return data;
  }

  /**
   * Parse NOISE_LEVEL message
   * Topic: .../Noise
   * Schema: ModAddr(1) + ModId(4) + [Addr(1) + N_Int(1) + N_Frac(1)] × 3 + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed noise level data
   */
  parseNoiseLevel(buffer) {
    const data = [];
    const slotCount = 3;

    for (let i = 0; i < slotCount; i++) {
      const offset = 1 + i * 7; // Skip header byte

      if (offset + 7 > buffer.length) {
        break;
      }

      const modAddr = buffer.readUInt8(offset);
      const modId = buffer.slice(offset + 1, offset + 5).toString("hex").toUpperCase();
      const addr = buffer.readUInt8(offset + 5);

      // If Addr === 0, skip (no sensor)
      if (addr === 0) {
        continue;
      }

      const nInt = buffer.readUInt8(offset + 6);
      const nFrac = buffer.readUInt8(offset + 7);

      const noise = this.parseSignedFloat(nInt, nFrac);

      data.push({
        moduleIndex: modAddr + 1,
        moduleId: modId,
        nsIndex: addr,
        noise: noise,
      });
    }

    return data;
  }

  /**
   * Parse DOOR_STATE message
   * Header: 0xBA
   * Schema: Header(1) + ModAddr(1) + ModId(4) + State(1) + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed door state data
   */
  parseDoorState(buffer) {
    const modAddr = buffer.readUInt8(1);
    const modId = buffer.slice(2, 6).toString("hex").toUpperCase();
    const doorState = buffer.readUInt8(6);

    return [
      {
        moduleIndex: modAddr + 1,
        moduleId: modId,
        doorState: doorState,
      },
    ];
  }

  /**
   * Parse DEVICE_INFO message
   * Header: 0xEF01
   * Schema: Header(2) + Model(2) + Fw(4) + IP(4) + Mask(4) + Gw(4) + Mac(6) + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed device info data
   */
  parseDeviceInfo(buffer) {
    const model = buffer.slice(2, 4).toString("hex").toUpperCase();
    const fw = buffer.readUInt32BE(6);
    const ip = this.parseIp(buffer, 10);
    const mask = this.parseIp(buffer, 14);
    const gwIp = this.parseIp(buffer, 18);
    const mac = this.parseMac(buffer, 22);

    return [
      {
        model: model,
        fwVer: fw.toString(),
        ip: ip,
        mask: mask,
        gwIp: gwIp,
        mac: mac,
      },
    ];
  }

  /**
   * Parse IP address from buffer
   * @param {Buffer} buffer - Raw binary message
   * @param {number} offset - Offset in buffer
   * @returns {string} Dot-notation IP address
   */
  parseIp(buffer, offset) {
    const bytes = buffer.slice(offset, offset + 4);
    return Array.from(bytes).join(".");
  }

  /**
   * Parse MAC address from buffer
   * @param {Buffer} buffer - Raw binary message
   * @param {number} offset - Offset in buffer
   * @returns {string} Hex String with colons
   */
  parseMac(buffer, offset) {
    const bytes = buffer.slice(offset, offset + 6);
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(":");
  }

  /**
   * Parse MODULE_INFO message
   * Header: 0xEF02
   * Schema: Header(2) + [ModAddr(1) + Fw(4)] × N + MsgId(4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed module info data
   */
  parseModuleInfo(buffer) {
    const data = [];
    const n = (buffer.length - 6) / 5; // N = (Buffer.length - 6) / 5

    for (let i = 0; i < n; i++) {
      const offset = 2 + i * 5;

      if (offset + 5 > buffer.length) {
        break;
      }

      const modAddr = buffer.readUInt8(offset);
      const fw = buffer.readUInt32BE(offset + 1);

      data.push({
        moduleIndex: modAddr + 1,
        fwVer: fw.toString(),
      });
    }

    return data;
  }

  /**
   * Parse QRY_CLR_RESP message
   * Header: 0xAA, Command Code: 0xE4
   * Schema: Header(1) + DeviceId(4) + Result(1) + OriginalReq(Var) + [ColorCode × N] + MsgId(4)
   * N = Buffer.length - 12 (Header:1 + DevId:4 + Result:1 + Req:2 + MsgId:4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed command response data
   */
  parseQryClrResp(buffer) {
    const deviceId = buffer.slice(1, 5).toString("hex").toUpperCase();
    const result = buffer.readUInt8(6);
    const originalReq = this.parseOriginalReq(buffer, 0xe4);
    const n = (buffer.length - 12) / 1;

    const data = [];
    for (let i = 0; i < n; i++) {
      const offset = 7 + i;
      const colorCode = buffer.readUInt8(offset);
      data.push(colorCode);
    }

    return [
      {
        result: result === 0xa1 ? "Success" : "Failure",
        originalReq: originalReq.originalReq,
        moduleIndex: originalReq.moduleIndex,
        colorCode: data,
      },
    ];
  }

  /**
   * Parse SET_CLR_RESP message
   * Header: 0xAA, Command Code: 0xE1
   * Schema: Header(1) + DeviceId(4) + Result(1) + OriginalReq(Var) + MsgId(4)
   * Var = Buffer.length - 10 (Header:1 + DevId:4 + Result:1 + MsgId:4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed command response data
   */
  parseSetClrResp(buffer) {
    const deviceId = buffer.slice(1, 5).toString("hex").toUpperCase();
    const result = buffer.readUInt8(6);
    const originalReq = this.parseOriginalReq(buffer, 0xe1);

    return [
      {
        result: result === 0xa1 ? "Success" : "Failure",
        originalReq: originalReq.originalReq,
        moduleIndex: originalReq.moduleIndex,
      },
    ];
  }

  /**
   * Parse CLN_ALM_RESP message
   * Header: 0xAA, Command Code: 0xE2
   * Schema: Header(1) + DeviceId(4) + Result(1) + OriginalReq(Var) + MsgId(4)
   * Var = Buffer.length - 10 (Header:1 + DevId:4 + Result:1 + MsgId:4)
   * @param {Buffer} buffer - Raw binary message
   * @returns {Array} Parsed command response data
   */
  parseClnAlmResp(buffer) {
    const deviceId = buffer.slice(1, 5).toString("hex").toUpperCase();
    const result = buffer.readUInt8(6);
    const originalReq = this.parseOriginalReq(buffer, 0xe2);

    return [
      {
        result: result === 0xa1 ? "Success" : "Failure",
        originalReq: originalReq.originalReq,
        moduleIndex: originalReq.moduleIndex,
      },
    ];
  }
}

module.exports = new V5008Parser();
