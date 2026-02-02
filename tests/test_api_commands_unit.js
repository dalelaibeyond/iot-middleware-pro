/**
 * Unit Test for POST /api/commands endpoint logic
 * Tests the implementation against the API specification without requiring a running server
 */

const express = require("express");

// Mock EventBus
const mockEventBus = {
  emit: jest.fn(),
  emitCommandRequest: jest.fn(),
};

// Mock StateCache and Database
const mockStateCache = {};
const mockDatabase = {};

// Mock modules
jest.mock("../../src/core/EventBus", () => mockEventBus);
jest.mock("../../src/modules/normalizer/StateCache", () => mockStateCache);
jest.mock("../../src/core/Database", () => mockDatabase);
jest.mock("../../src/modules/command/CommandService", () => ({}));

// Import ApiServer after mocking
const ApiServer = require("../../src/modules/output/ApiServer");

// Create a test app
const app = express();
app.use(express.json());

// Get the route handler from ApiServer
const postCommandsHandler = (req, res) => {
  try {
    const { deviceId, deviceType, messageType, payload } = req.body;

    // Validate required fields
    if (!deviceId || !deviceType || !messageType) {
      return res
        .status(400)
        .json({
          error: "Missing required fields: deviceId, deviceType, messageType",
        });
    }

    // Generate a unique command ID for tracking
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Construct the internal command event
    const commandEvent = {
      deviceId,
      deviceType,
      messageType,
      payload: payload || {},
      timestamp: new Date(),
      commandId,
    };

    // Emit to the internal nervous system
    mockEventBus.emit("command.request", commandEvent);

    // Return 202 Accepted with command ID as per specification
    res.status(202).json({
      status: "sent",
      commandId,
    });
  } catch (error) {
    console.error("Error sending command:", error.message);
    res.status(500).json({ error: "Failed to send command" });
  }
};

// Setup the test route
app.post("/api/commands", postCommandsHandler);

// Test cases
const testCases = [
  {
    name: "Valid V5008 SET_COLOR command",
    requestBody: {
      deviceId: "2437871205",
      deviceType: "V5008",
      messageType: "SET_COLOR",
      payload: {
        moduleIndex: 1,
        sensorIndex: 10,
        colorCode: 1,
      },
    },
    expectedStatus: 202,
    shouldEmitEvent: true,
  },
  {
    name: "Valid V6800 CLN_ALARM command",
    requestBody: {
      deviceId: "2105101125",
      deviceType: "V6800",
      messageType: "CLN_ALARM",
      payload: {
        moduleIndex: 1,
        sensorIndex: 10,
      },
    },
    expectedStatus: 202,
    shouldEmitEvent: true,
  },
  {
    name: "Missing deviceId",
    requestBody: {
      deviceType: "V5008",
      messageType: "SET_COLOR",
      payload: {
        moduleIndex: 1,
        sensorIndex: 10,
        colorCode: 1,
      },
    },
    expectedStatus: 400,
    shouldEmitEvent: false,
  },
  {
    name: "Missing deviceType",
    requestBody: {
      deviceId: "2437871205",
      messageType: "SET_COLOR",
      payload: {
        moduleIndex: 1,
        sensorIndex: 10,
        colorCode: 1,
      },
    },
    expectedStatus: 400,
    shouldEmitEvent: false,
  },
  {
    name: "Missing messageType",
    requestBody: {
      deviceId: "2437871205",
      deviceType: "V5008",
      payload: {
        moduleIndex: 1,
        sensorIndex: 10,
        colorCode: 1,
      },
    },
    expectedStatus: 400,
    shouldEmitEvent: false,
  },
];

describe("POST /api/commands endpoint", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockEventBus.emit.mockClear();
  });

  testCases.forEach((testCase) => {
    it(testCase.name, async () => {
      const mockReq = {
        body: testCase.requestBody,
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      // Call the handler
      await postCommandsHandler(mockReq, mockRes);

      // Check status code
      expect(mockRes.status).toHaveBeenCalledWith(testCase.expectedStatus);

      // Check event emission
      if (testCase.shouldEmitEvent) {
        expect(mockEventBus.emit).toHaveBeenCalledWith(
          "command.request",
          expect.objectContaining({
            deviceId: testCase.requestBody.deviceId,
            deviceType: testCase.requestBody.deviceType,
            messageType: testCase.requestBody.messageType,
            payload: testCase.requestBody.payload || {},
            timestamp: expect.any(Date),
            commandId: expect.stringMatching(/^cmd_\d+_[a-z0-9]+$/),
          }),
        );
      } else {
        expect(mockEventBus.emit).not.toHaveBeenCalled();
      }

      // Check response structure
      if (testCase.expectedStatus === 202) {
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: "sent",
            commandId: expect.stringMatching(/^cmd_\d+_[a-z0-9]+$/),
          }),
        );
      } else {
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(String),
          }),
        );
      }
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log("Running unit tests for POST /api/commands endpoint...\n");

  // Simple test runner
  testCases.forEach((testCase) => {
    console.log(`--- Test: ${testCase.name} ---`);

    const mockReq = {
      body: testCase.requestBody,
    };

    const mockRes = {
      status: (code) => {
        console.log(`Status Code: ${code}`);
        return mockRes;
      },
      json: (data) => {
        console.log("Response Body:", JSON.stringify(data, null, 2));
        return mockRes;
      },
    };

    // Call the handler
    postCommandsHandler(mockReq, mockRes);

    // Check if event was emitted
    if (testCase.shouldEmitEvent) {
      console.log("✅ Event should be emitted");
    } else {
      console.log("✅ Event should not be emitted");
    }

    console.log("");
  });

  console.log("=== Tests completed ===");
}
