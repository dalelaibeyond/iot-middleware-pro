/**
 * Test to simulate the actual MQTT message flow
 *
 * This test simulates how messages flow from MQTT to the V6800Parser
 * to identify where the issue occurs.
 */

const mqtt = require("mqtt");
const config = require("config");
const MqttSubscriber = require("../src/modules/ingress/MqttSubscriber");
const ParserManager = require("../src/modules/parsers/ParserManager");
const EventBus = require("../src/core/EventBus");

// Get MQTT config
const mqttConfig = config.get("mqtt");

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

console.log("Testing MQTT Message Flow");
console.log("========================");

// Create a test publisher
const publisherClientId = "test-publisher-" + Math.floor(Math.random() * 10000);
const publisher = mqtt.connect(mqttConfig.brokerUrl, {
  clientId: publisherClientId,
  clean: true,
});

publisher.on("connect", () => {
  console.log("✓ Publisher connected to MQTT broker");

  // Publish a test message
  console.log("Publishing test message to:", topic);
  console.log("Message payload:", JSON.stringify(testMessage));

  publisher.publish(topic, JSON.stringify(testMessage), { qos: 0 }, (err) => {
    if (err) {
      console.error("✗ Failed to publish message:", err.message);
    } else {
      console.log("✓ Message published successfully");
    }

    // Wait a bit then disconnect
    setTimeout(() => {
      publisher.end();
      console.log("Publisher disconnected");
    }, 1000);
  });
});

publisher.on("error", (err) => {
  console.error("✗ Publisher error:", err.message);
});

// Set up event listener to capture parsed messages
EventBus.on("data.parsed", (sif) => {
  console.log("\n✅ Successfully parsed message:");
  console.log("  Device Type:", sif.deviceType);
  console.log("  Device ID:", sif.deviceId);
  console.log("  Message Type:", sif.messageType);
  console.log("  Message ID:", sif.messageId);

  // Exit after receiving the parsed message
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// Set up error listener
EventBus.on("error", (error, module) => {
  console.error(`\n❌ Error in ${module}:`, error.message);

  // Exit after receiving an error
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

console.log("Event listeners set up");
console.log("Waiting for message to be processed...");
