/**
 * MQTT Connection Test Script
 *
 * Tests MQTT broker connectivity and subscription behavior
 * Simulates the connection pattern used by the application
 */

const mqtt = require("mqtt");
const config = require("config");

// Get MQTT config
const mqttConfig = config.get("mqtt");
const brokerUrl = mqttConfig.brokerUrl;
const clientId = "iot-middleware-test-" + Math.floor(Math.random() * 10000);

console.log("========================================");
console.log("  MQTT Connection Test");
console.log("========================================");
console.log("");
console.log(`Broker URL: ${brokerUrl}`);
console.log(`Client ID: ${clientId}`);
console.log("");

// Create MQTT client with options
const options = {
  clientId: clientId,
  clean: true,
  connectTimeout: mqttConfig.options.connectTimeout || 30000,
  reconnectPeriod: mqttConfig.options.reconnectPeriod || 5000,
  qos: 0, // Use QoS 0 to avoid issues
};

console.log("Connecting to MQTT broker...");
const client = mqtt.connect(brokerUrl, options);

// Track connection state
let connectionCount = 0;
let subscriptionCount = 0;
let disconnectCount = 0;
let messageCount = 0;

// Connection established
client.on("connect", () => {
  connectionCount++;
  console.log(`✓ Connected to MQTT broker (Connection #${connectionCount})`);
  console.log(`  Client ID: ${clientId}`);
  console.log("");

  // Subscribe to topics after connection
  setTimeout(() => {
    console.log("Subscribing to topics...");
    const topics = [
      { topic: mqttConfig.topics.v5008, qos: 0 },
      { topic: mqttConfig.topics.v6800, qos: 0 },
    ];

    topics.forEach((t) => {
      client.subscribe(t.topic, { qos: t.qos }, (err) => {
        if (err) {
          console.error(`  ✗ Failed to subscribe to ${t.topic}:`, err.message);
        } else {
          subscriptionCount++;
          console.log(`  ✓ Subscribed to ${t.topic} (QoS: ${t.qos})`);
        }
      });
    });

    console.log(`Total subscriptions: ${subscriptionCount}`);
    console.log("");
  }, 1000);
});

// Connection closed
client.on("close", () => {
  disconnectCount++;
  console.log(`✗ Connection closed (Disconnect #${disconnectCount})`);
  console.log("");
});

// Reconnect attempt
client.on("reconnect", () => {
  console.log("⚠ Reconnecting to MQTT broker...");
  console.log("");
});

// Error occurred
client.on("error", (err) => {
  console.error("✗ MQTT Error:", err.message);
  console.error("  Code:", err.code);
  console.error("  Stack:", err.stack);
  console.log("");
});

// Message received
client.on("message", (topic, message) => {
  messageCount++;
  printMessage(topic, message, messageCount);
});

/**
 * Print received message details
 * @param {string} topic - MQTT topic
 * @param {Buffer} message - Message payload
 * @param {number} count - Message count
 */
function printMessage(topic, message, count) {
  console.log("========================================");
  console.log(`📨 Message #${count}`);
  console.log("========================================");
  console.log(`Topic: ${topic}`);
  console.log(`Payload Length: ${message.length} bytes`);
  
  try {
    // Try to parse as JSON
    const payload = JSON.parse(message.toString());
    console.log("Payload (JSON):");
    console.log(JSON.stringify(payload, null, 2));
  } catch (e) {
    // Not JSON, print as string
    console.log("Payload (Raw):");
    console.log(message.toString());
  }
  
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("");
  console.log("========================================");
  console.log("  Test Statistics");
  console.log("========================================");
  console.log(`Connections: ${connectionCount}`);
  console.log(`Subscriptions: ${subscriptionCount}`);
  console.log(`Disconnects: ${disconnectCount}`);
  console.log(`Messages received: ${messageCount}`);
  console.log("");
  console.log("Disconnecting from MQTT broker...");
  client.end();
  console.log("Test completed");
  process.exit(0);
});

// Run test for 30 seconds then exit
setTimeout(() => {
  console.log("");
  console.log("========================================");
  console.log("  Test Statistics");
  console.log("========================================");
  console.log(`Connections: ${connectionCount}`);
  console.log(`Subscriptions: ${subscriptionCount}`);
  console.log(`Disconnects: ${disconnectCount}`);
  console.log(`Messages received: ${messageCount}`);
  console.log("");
  console.log("Disconnecting from MQTT broker...");
  client.end();
  console.log("Test completed");
  process.exit(0);
}, 30000);
