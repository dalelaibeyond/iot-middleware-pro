/**
 * Simple Test for CommandService Implementation
 * Tests both V5008 and V6800 command building
 */

// Mock modules before requiring CommandService
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

const mockMqtt = {
  connect: () => mockMqttClient,
};

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

// Mock config module
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "config") {
    return {
      get: () => mockConfig.mqtt,
    };
  }
  return originalRequire.apply(this, arguments);
};

const CommandService = require("../src/modules/command/CommandService");

// Test commands
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

// Error test cases
const errorTestCases = [
  {
    name: "Missing deviceId",
    command: {
      deviceType: "V5008",
      messageType: "QRY_RFID_SNAPSHOT",
      payload: { moduleIndex: 1 },
    },
    expectedError: "Missing required field: deviceId",
  },
  {
    name: "Unknown device type",
    command: {
      deviceId: "2437871205",
      deviceType: "UNKNOWN",
      messageType: "QRY_RFID_SNAPSHOT",
      payload: { moduleIndex: 1 },
    },
    expectedError: null, // Should not throw but log error
  },
  {
    name: "Missing required parameters",
    command: {
      deviceId: "2437871205",
      deviceType: "V5008",
      messageType: "SET_COLOR",
      payload: {
        moduleIndex: 1,
        // Missing sensorIndex and colorCode
      },
    },
    expectedError:
      "Missing required parameters: moduleIndex, sensorIndex, and colorCode",
  },
];

async function runTests() {
  try {
    console.log("Initializing CommandService...");

    // Initialize and start CommandService
    await CommandService.initialize({});
    await CommandService.start();

    console.log("\n=== Running CommandService Tests ===\n");

    // Run successful command tests
    testCommands.forEach((test) => {
      console.log(`--- Test: ${test.name} ---`);
      CommandService.handleCommandRequest(test.command);
      console.log("");
    });

    // Run error test cases
    console.log("\n=== Running Error Test Cases ===\n");

    errorTestCases.forEach((test) => {
      console.log(`--- Error Test: ${test.name} ---`);
      try {
        CommandService.handleCommandRequest(test.command);
        if (test.expectedError) {
          console.log(
            `ERROR: Expected error "${test.expectedError}" but none was thrown`,
          );
        } else {
          console.log("Test passed (no error expected)");
        }
      } catch (error) {
        if (test.expectedError && error.message.includes(test.expectedError)) {
          console.log(`Test passed: Caught expected error "${error.message}"`);
        } else {
          console.log(`ERROR: Unexpected error "${error.message}"`);
        }
      }
      console.log("");
    });

    console.log("=== Tests completed ===\n");

    await CommandService.stop();
  } catch (error) {
    console.error("Test error:", error);
  }
}

// Run tests
runTests();
