/**
 * Test CommandService Implementation
 * Tests both V5008 and V6800 command building
 */

const CommandService = require("../src/modules/command/CommandService");

// Mock EventBus
const mockEventBus = {
  onCommandRequest: (callback) => {
    // Store callback for testing
    mockEventBus.commandCallback = callback;
  },
  emitError: (error, source) => {
    console.error(`Mock error from ${source}:`, error.message);
  },
  removeAllListeners: () => {},
};

// Mock MQTT client
const mockMqttClient = {
  publish: (topic, payload, options, callback) => {
    console.log(`Mock MQTT publish to ${topic}`);
    console.log(
      `Payload:`,
      Buffer.isBuffer(payload) ? payload : JSON.stringify(payload),
    );
    if (callback) callback(null);
  },
  on: (event, callback) => {
    if (event === "connect") {
      setTimeout(callback, 100); // Simulate connection
    }
  },
  once: (event, callback) => {
    if (event === "connect") {
      setTimeout(callback, 100); // Simulate connection
    }
  },
  end: () => {},
};

// Mock MQTT connection
const mockMqtt = {
  connect: () => mockMqttClient,
};

// Mock config
const mockConfig = {
  mqtt: {
    brokerUrl: "mqtt://localhost:1883",
    options: {
      connectTimeout: 30000,
    },
  },
};

// Setup mocks
require.cache[require.resolve("../src/core/EventBus")].exports = mockEventBus;
require.cache[require.resolve("mqtt")].exports = mockMqtt;
jest.mock("config", () => ({
  get: () => mockConfig.mqtt,
}));

describe("CommandService", () => {
  let commandService;

  beforeAll(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Get fresh instance
    delete require.cache[
      require.resolve("../src/modules/command/CommandService")
    ];
    CommandService = require("../src/modules/command/CommandService");
    commandService = CommandService;

    await commandService.initialize({});
    await commandService.start();
  });

  afterAll(async () => {
    await commandService.stop();
  });

  describe("V5008 Commands", () => {
    test("QRY_RFID_SNAPSHOT should create correct binary buffer", () => {
      const command = {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "QRY_RFID_SNAPSHOT",
        payload: { moduleIndex: 1 },
      };

      commandService.handleCommandRequest(command);
      // Expected: Buffer.from([0xE9, 0x01, 0x01])
    });

    test("SET_COLOR should create correct binary buffer for single LED", () => {
      const command = {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
          colorCode: 1,
        },
      };

      commandService.handleCommandRequest(command);
      // Expected: Buffer.from([0xE1, 0x01, 0x0A, 0x01])
    });

    test("SET_COLOR should create correct binary buffer for multiple LEDs", () => {
      const command = {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          leds: [
            { sensorIndex: 10, colorCode: 1 },
            { sensorIndex: 11, colorCode: 2 },
          ],
        },
      };

      commandService.handleCommandRequest(command);
      // Expected: Buffer.from([0xE1, 0x01, 0x0A, 0x01, 0x01, 0x0B, 0x02])
    });

    test("CLN_ALARM should create correct binary buffer", () => {
      const command = {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "CLN_ALARM",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
        },
      };

      commandService.handleCommandRequest(command);
      // Expected: Buffer.from([0xE2, 0x01, 0x0A])
    });
  });

  describe("V6800 Commands", () => {
    test("QRY_RFID_SNAPSHOT should create correct JSON structure", () => {
      const command = {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "QRY_RFID_SNAPSHOT",
        payload: {
          moduleIndex: 1,
          extendModuleSn: "0304555999",
        },
      };

      commandService.handleCommandRequest(command);
      // Expected JSON with msg_type: "u_state_req"
    });

    test("SET_COLOR should create correct JSON structure", () => {
      const command = {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
          colorCode: 1,
        },
      };

      commandService.handleCommandRequest(command);
      // Expected JSON with msg_type: "set_module_property_req"
    });

    test("CLN_ALARM should create correct JSON structure", () => {
      const command = {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "CLN_ALARM",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
        },
      };

      commandService.handleCommandRequest(command);
      // Expected JSON with msg_type: "clear_u_warning"
    });

    test("QRY_TEMP_HUM should create correct JSON structure", () => {
      const command = {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "QRY_TEMP_HUM",
        payload: {
          moduleIndex: 1,
        },
      };

      commandService.handleCommandRequest(command);
      // Expected JSON with msg_type: "temper_humidity_req"
    });
  });

  describe("Error Handling", () => {
    test("Should throw error for missing deviceId", () => {
      const command = {
        deviceType: "V5008",
        messageType: "QRY_RFID_SNAPSHOT",
        payload: { moduleIndex: 1 },
      };

      expect(() => {
        commandService.handleCommandRequest(command);
      }).toThrow("Missing required field: deviceId");
    });

    test("Should throw error for unknown device type", () => {
      const command = {
        deviceId: "2437871205",
        deviceType: "UNKNOWN",
        messageType: "QRY_RFID_SNAPSHOT",
        payload: { moduleIndex: 1 },
      };

      // Should not throw but log error
      commandService.handleCommandRequest(command);
    });

    test("Should throw error for missing required parameters", () => {
      const command = {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          // Missing sensorIndex and colorCode
        },
      };

      expect(() => {
        commandService.handleCommandRequest(command);
      }).toThrow(
        "Missing required parameters: moduleIndex, sensorIndex, and colorCode",
      );
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log("Running CommandService tests...");

  // Simple test runner
  const testCommands = [
    // V5008 tests
    {
      name: "V5008 QRY_RFID_SNAPSHOT",
      command: {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "QRY_RFID_SNAPSHOT",
        payload: { moduleIndex: 1 },
      },
    },
    {
      name: "V5008 SET_COLOR (single LED)",
      command: {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
          colorCode: 1,
        },
      },
    },
    {
      name: "V5008 SET_COLOR (multiple LEDs)",
      command: {
        deviceId: "2437871205",
        deviceType: "V5008",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          leds: [
            { sensorIndex: 10, colorCode: 1 },
            { sensorIndex: 11, colorCode: 2 },
          ],
        },
      },
    },
    // V6800 tests
    {
      name: "V6800 QRY_RFID_SNAPSHOT",
      command: {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "QRY_RFID_SNAPSHOT",
        payload: {
          moduleIndex: 1,
          extendModuleSn: "0304555999",
        },
      },
    },
    {
      name: "V6800 SET_COLOR",
      command: {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "SET_COLOR",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
          colorCode: 1,
        },
      },
    },
    {
      name: "V6800 CLN_ALARM",
      command: {
        deviceId: "2105101125",
        deviceType: "V6800",
        messageType: "CLN_ALARM",
        payload: {
          moduleIndex: 1,
          sensorIndex: 10,
        },
      },
    },
  ];

  async function runTests() {
    try {
      // Initialize and start CommandService
      await commandService.initialize({});
      await commandService.start();

      console.log("\n=== Running CommandService Tests ===\n");

      testCommands.forEach((test) => {
        console.log(`--- Test: ${test.name} ---`);
        commandService.handleCommandRequest(test.command);
        console.log("");
      });

      console.log("=== Tests completed ===\n");

      await commandService.stop();
    } catch (error) {
      console.error("Test error:", error);
    }
  }

  runTests();
}
