/**
 * Test for POST /api/commands endpoint
 * Tests the implementation against the API specification
 */

const request = require("supertest");
const express = require("express");

// Mock modules
const mockEventBus = {
  emit: (event, data) => {
    console.log(`Mock EventBus.emit called with event: ${event}`);
    console.log("Event data:", JSON.stringify(data, null, 2));
  },
};

// Mock StateCache and Database
const mockStateCache = {};
const mockDatabase = {};

// Create a minimal app for testing
const app = express();
app.use(express.json());

// Import and setup the ApiServer routes
const ApiServer = require("../src/modules/output/ApiServer");

// Override the app in ApiServer with our test app
ApiServer.app = app;

// Setup the routes
ApiServer.setupRoutes();

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
    expectedResponsePattern: { status: "sent", commandId: expect.any(String) },
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
    expectedResponsePattern: { status: "sent", commandId: expect.any(String) },
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
    expectedResponsePattern: { error: expect.any(String) },
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
    expectedResponsePattern: { error: expect.any(String) },
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
    expectedResponsePattern: { error: expect.any(String) },
  },
];

async function runTests() {
  console.log("Testing POST /api/commands endpoint...\n");

  for (const testCase of testCases) {
    console.log(`--- Test: ${testCase.name} ---`);

    try {
      const response = await request(app)
        .post("/api/commands")
        .send(testCase.requestBody);

      console.log(`Status Code: ${response.status}`);
      console.log("Response Body:", JSON.stringify(response.body, null, 2));

      if (response.status === testCase.expectedStatus) {
        console.log("✅ Status code matches expected");
      } else {
        console.log(
          `❌ Status code mismatch. Expected: ${testCase.expectedStatus}, Got: ${response.status}`,
        );
      }

      // Check response structure
      if (testCase.expectedStatus === 202) {
        if (response.body.status === "sent" && response.body.commandId) {
          console.log("✅ Response structure matches expected");
        } else {
          console.log("❌ Response structure mismatch");
        }
      } else {
        if (response.body.error) {
          console.log("✅ Error response structure matches expected");
        } else {
          console.log("❌ Error response structure mismatch");
        }
      }
    } catch (error) {
      console.error("Test error:", error.message);
    }

    console.log("");
  }

  console.log("=== Tests completed ===");
}

// Run tests
runTests();
