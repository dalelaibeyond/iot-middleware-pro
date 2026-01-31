/**
 * Test to directly test the MqttSubscriber's handleMessage method
 *
 * This test directly calls the MqttSubscriber.handleMessage method with
 * different types of messages to identify where the issue occurs.
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");

// Test message
const testMessage = {
  gateway_sn: "2105101125",
  msg_type: "heart_beat_req",
  uuid_number: 755052881,
  data: [
    {
      module_index: 4,
      module_sn: "3468672873",
      module_u_num: 12,
    },
  ],
};

const topic = "V6800Upload/2105101125/heart_beat_req";

console.log("Testing MqttSubscriber.handleMessage directly");
console.log("===========================================");

// Import the modules we need
const EventBus = require("../src/core/EventBus");
const MqttSubscriber = require("../src/modules/ingress/MqttSubscriber");
const ParserManager = require("../src/modules/parsers/ParserManager");

// Set up event listeners
EventBus.on("data.parsed", (sif) => {
  console.log("\n✅ Successfully parsed message:");
  console.log("  Device Type:", sif.deviceType);
  console.log("  Device ID:", sif.deviceId);
  console.log("  Message Type:", sif.messageType);
  console.log("  Message ID:", sif.messageId);
});

EventBus.on("error", (error, module) => {
  console.error(`\n❌ Error in ${module}:`, error.message);
});

// Initialize modules
async function runTest() {
  try {
    // Initialize modules
    await MqttSubscriber.initialize({});
    await ParserManager.initialize({});
    await ParserManager.start();

    console.log("Modules initialized");

    // Test 1: Valid JSON string as Buffer
    console.log("\nTest 1: Valid JSON string as Buffer");
    console.log("-------------------------------------");
    const jsonBuffer = Buffer.from(JSON.stringify(testMessage));
    MqttSubscriber.handleMessage(topic, jsonBuffer);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test 2: Empty Buffer
    console.log("\nTest 2: Empty Buffer");
    console.log("---------------------");
    const emptyBuffer = Buffer.from("");
    MqttSubscriber.handleMessage(topic, emptyBuffer);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test 3: Buffer with topic name
    console.log("\nTest 3: Buffer with topic name");
    console.log("------------------------------");
    const topicBuffer = Buffer.from(topic);
    MqttSubscriber.handleMessage(topic, topicBuffer);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("\nTest completed");
  } catch (error) {
    console.error("Test error:", error);
  }
}

runTest();
