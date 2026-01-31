/**
 * Test script to process real devies_init_req message from V6800 device
 *
 * This script will:
 * 1. Start the MQTT subscriber
 * 2. Listen for messages from V6800 devices
 * 3. Process any devies_init_req messages and display the parsed output
 * 4. Show detailed logs for debugging
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");
const MqttSubscriber = require("../src/modules/ingress/MqttSubscriber");

// Load configuration
const config = require("../config/default.json");

console.log("Starting V6800 devies_init_req message listener");
console.log("=============================================");
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

// Initialize MQTT subscriber
const subscriber = MqttSubscriber;

subscriber
  .initialize(config)
  .then(() => {
    console.log("✅ MQTT Subscriber initialized");

    // Subscribe to V6800 topics
    subscriber.subscribe("V6800Upload/+/+", (topic, message) => {
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

    console.log("✅ Subscribed to V6800Upload/+/+");
    console.log("\nWaiting for devies_init_req message from device...");
  })
  .catch((err) => {
    console.error("❌ Failed to initialize MQTT Subscriber:", err);
  });

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  subscriber
    .disconnect()
    .then(() => {
      console.log("✅ Disconnected from MQTT broker");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Error disconnecting:", err);
      process.exit(1);
    });
});
