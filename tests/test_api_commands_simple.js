/**
 * Simple Test for POST /api/commands endpoint
 * Tests the implementation against the API specification without external dependencies
 */

const http = require("http");

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
  },
];

function makeRequest(port, path, method, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: "localhost",
      port: port,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: body,
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log("Testing POST /api/commands endpoint...");
  console.log("Note: This test requires ApiServer to be running on port 3000");
  console.log("Start the server with: npm run dev\n");

  const port = 3000;

  for (const testCase of testCases) {
    console.log(`--- Test: ${testCase.name} ---`);

    try {
      const response = await makeRequest(
        port,
        "/api/commands",
        "POST",
        testCase.requestBody,
      );

      console.log(`Status Code: ${response.status}`);
      console.log("Response Body:", response.body);

      if (response.status === testCase.expectedStatus) {
        console.log("✅ Status code matches expected");
      } else {
        console.log(
          `❌ Status code mismatch. Expected: ${testCase.expectedStatus}, Got: ${response.status}`,
        );
      }

      // Check response structure
      if (testCase.expectedStatus === 202) {
        try {
          const responseBody = JSON.parse(response.body);
          if (responseBody.status === "sent" && responseBody.commandId) {
            console.log("✅ Response structure matches expected");
          } else {
            console.log("❌ Response structure mismatch");
          }
        } catch (e) {
          console.log("❌ Invalid JSON response");
        }
      } else {
        try {
          const responseBody = JSON.parse(response.body);
          if (responseBody.error) {
            console.log("✅ Error response structure matches expected");
          } else {
            console.log("❌ Error response structure mismatch");
          }
        } catch (e) {
          console.log("❌ Invalid JSON response");
        }
      }
    } catch (error) {
      console.error("Test error:", error.message);
      console.log(
        "❌ Could not connect to server. Make sure the server is running.",
      );
    }

    console.log("");
  }

  console.log("=== Tests completed ===");
}

// Run tests
runTests();
