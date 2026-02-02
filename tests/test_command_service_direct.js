/**
 * Direct Test for CommandService Implementation
 * Tests both V5008 and V6800 command building
 */

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

function runTests() {
  try {
    console.log("Testing CommandService implementation...\n");

    // Test V5008 binary command builder
    console.log("=== Testing V5008 Binary Commands ===\n");

    testCommands
      .filter((cmd) => cmd.command.deviceType === "V5008")
      .forEach((test) => {
        console.log(`--- Test: ${test.name} ---`);
        try {
          const result = CommandService.buildV5008Command(
            test.command.messageType,
            test.command.payload,
          );
          console.log("Success! Binary buffer:", result);
          console.log(
            "Hex values:",
            Array.from(result)
              .map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0"))
              .join(" "),
          );
        } catch (error) {
          console.log("Error:", error.message);
        }
        console.log("");
      });

    // Test V6800 JSON command builder
    console.log("\n=== Testing V6800 JSON Commands ===\n");

    testCommands
      .filter((cmd) => cmd.command.deviceType === "V6800")
      .forEach((test) => {
        console.log(`--- Test: ${test.name} ---`);
        try {
          const result = CommandService.buildV6800Command(
            test.command.messageType,
            test.command.payload,
            test.command.deviceId,
          );
          console.log(
            "Success! JSON payload:",
            JSON.stringify(result, null, 2),
          );
        } catch (error) {
          console.log("Error:", error.message);
        }
        console.log("");
      });

    // Test parameter validation
    console.log("\n=== Testing Parameter Validation ===\n");

    errorTestCases.forEach((test) => {
      console.log(`--- Error Test: ${test.name} ---`);
      try {
        CommandService.validateCommandParameters(
          test.command.messageType,
          test.command.payload,
        );
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
  } catch (error) {
    console.error("Test error:", error);
  }
}

// Run tests
runTests();
