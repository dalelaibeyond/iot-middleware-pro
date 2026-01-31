/**
 * Simple MQTT listener to capture devies_init_req messages from V6800 device
 */

const mqtt = require("mqtt");
const V6800Parser = require("../src/modules/parsers/V6800Parser");
const config = require("../config/default.json");

console.log("Starting simple MQTT listener for V6800 devies_init_req messages");
console.log("=============================================================");
console.log("Please send a devies_init_req message from your V6800 device");
console.log("The parsed output will be displayed below\n");

// Initialize parser
const parser = V6800Parser;
parser
  .initialize(config)
  .then(() => {
    console.log("✅ V6800Parser initialized");
  })
  .catch((err) => {
    console.error("❌ Failed to initialize V6800Parser:", err);
  });

// Connect to MQTT broker
const mqttConfig = config.mqtt;
const options = {
  ...mqttConfig.options,
  clientId: "iot-middleware-test-listener",
};

const client = mqtt.connect(mqttConfig.brokerUrl, options);

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker");

  // Subscribe to V6800 topics
  const topic = "V6800Upload/+/+";
  client.subscribe(topic, (err) => {
    if (err) {
      console.error(`❌ Failed to subscribe to ${topic}:`, err.message);
    } else {
      console.log(`✅ Subscribed to: ${topic}`);
      console.log("\nWaiting for devies_init_req message from device...\n");
    }
  });
});

client.on("message", (topic, message) => {
  console.log("\n=== Received Message ===");
  console.log("Topic:", topic);
  console.log("Message:", message.toString());
  console.log("========================\n");

  // Parse the message
  const result = parser.parse(topic, message.toString());

  if (result) {
    console.log("✅ Successfully parsed message:");
    console.log("- Device Type:", result.deviceType);
    console.log("- Device ID:", result.deviceId);
    console.log("- Message Type:", result.messageType);
    console.log("- Message ID:", result.messageId);

    if (result.ip) console.log("- IP:", result.ip);
    if (result.mac) console.log("- MAC:", result.mac);

    if (result.data && result.data.length > 0) {
      console.log("- Data:");
      result.data.forEach((item, index) => {
        console.log(`  Module ${index + 1}:`);
        console.log(`    Module Index: ${item.moduleIndex}`);
        console.log(`    Module ID: ${item.moduleId}`);
        console.log(`    U Total: ${item.uTotal}`);
        if (item.fwVer) console.log(`    Firmware Version: ${item.fwVer}`);
      });
    }

    console.log("\nFull SIF Output:");
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("❌ Failed to parse message");
  }

  console.log("\nWaiting for next message...\n");
});

client.on("error", (error) => {
  console.error("❌ MQTT error:", error.message);
});

client.on("close", () => {
  console.log("❌ MQTT connection closed");
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  client.end(() => {
    console.log("✅ Disconnected from MQTT broker");
    process.exit(0);
  });
});
