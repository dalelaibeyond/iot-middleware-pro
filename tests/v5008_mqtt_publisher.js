/**
 * V5008 MQTT Publisher Test Script
 *
 * Simulates V5008 device publishing binary (hex) messages to MQTT broker.
 * Allows manual testing of middleware's message handling.
 */

const mqtt = require("mqtt");
const readline = require("readline");

// Get MQTT config
const config = require("config");
const mqttConfig = config.get("mqtt");

// Create unique client ID
const clientId = "v5008-test-" + Math.floor(Math.random() * 10000);

console.log("========================================");
console.log("  V5008 MQTT Publisher");
console.log("========================================");
console.log("");
console.log(`Broker URL: ${mqttConfig.brokerUrl}`);
console.log(`Client ID: ${clientId}`);
console.log("");

// Create MQTT client with options
const options = {
  clientId: clientId,
  clean: true,
  connectTimeout: mqttConfig.options.connectTimeout || 30000,
  reconnectPeriod: mqttConfig.options.reconnectPeriod || 5000,
};

console.log("Connecting to MQTT broker...");
const client = mqtt.connect(mqttConfig.brokerUrl, options);

// Connection established
client.on("connect", () => {
  console.log("✓ Connected to MQTT broker");
  console.log(`  Client ID: ${clientId}`);
  console.log("");
  console.log("Ready to publish messages.");
  console.log("Enter topic and hex message (e.g., V5008Upload/device123/heartbeat)");
  console.log("Format: V5008Upload/{deviceId}/{messageType}");
  console.log("");
  console.log("Common message types:");
  console.log("  heartbeat - Device heartbeat (e.g., 0102030405060708090A)");
  console.log("  TemHum - Temperature/humidity data");
  console.log("  Noise - Noise level data");
  console.log("  LabelState - RFID snapshot");
  console.log("  OpeAck - Door state");
  console.log("  OpeAck - Device/module info response");
  console.log("  OpeAck - Clear alarm response");
  console.log("  OpeAck - Set color response");
  console.log("");
  console.log("NOTE: V5008 devices send binary data directly to MQTT broker.");
  console.log("IMPORTANT: V5008 protocol requires EVEN-LENGTH hex strings.");
  console.log("  Hex strings must have an even number of characters.");
  console.log("  Example: '0102030405060708090A' (16 chars, even)");
  console.log("  Example: '0102030405060708090A00' (18 chars, even)");
  console.log("");
  console.log("Enter 'quit' or press Ctrl+C to exit.");
  console.log("");
});

// Message published successfully
client.on("packetsend", (packet) => {
  if (packet.cmd === "publish") {
    console.log(`✓ Message published to: ${packet.topic}`);
    console.log(`  Message ID: ${packet.mid}`);
    console.log(`  QoS: ${packet.qos}`);
    console.log("");
  }
});

// Error occurred
client.on("error", (err) => {
  console.error("✗ MQTT Error:", err.message);
  console.error("  Code:", err.code);
  console.error("");
});

// Connection closed
client.on("close", () => {
  console.log("✗ Connection closed");
  console.log("");
});

// Reconnect attempt
client.on("reconnect", () => {
  console.log("⚠ Reconnecting to MQTT broker...");
  console.log("");
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Parse user input and publish message
 * @param {string} input - User input string
 */
function handleInput(input) {
  const trimmed = input.trim();

  // Check for quit command
  if (trimmed.toLowerCase() === "quit") {
    console.log("");
    console.log("Disconnecting from MQTT broker...");
    client.end();
    rl.close();
    process.exit(0);
    return;
  }

  // Parse topic and message
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    console.log("Invalid input. Format: <topic> <hex_message>");
    console.log("Example: V5008Upload/device123/heartbeat 0102030405060708090A");
    return;
  }

  const topic = parts[0];
  const hexMessage = parts[1];

  // Validate topic format
  if (!topic.startsWith("V5008Upload/")) {
    console.log("Error: Topic must start with 'V5008Upload/'");
    return;
  }

  // Validate hex message
  if (!/^[0-9A-Fa-f]+$/.test(hexMessage)) {
    console.log("Error: Message must be valid hex (0-9, A-F)");
    return;
  }

  // Convert hex string to Buffer
  let buffer;
  try {
    // Parse hex string directly (no padding needed)
    buffer = Buffer.from(hexMessage, "hex");
  } catch (error) {
    console.error("Error converting hex to Buffer:", error.message);
    return;
  }

  console.log(`Publishing to topic: ${topic}`);
  console.log(`Hex message: ${hexMessage}`);
  console.log(`Buffer length: ${buffer.length} bytes`);

  // Publish message
  client.publish(topic, buffer, { qos: 0 }, (err) => {
    if (err) {
      console.error("✗ Failed to publish:", err.message);
    } else {
      console.log("✓ Message queued for publishing");
    }
    console.log("");
  });
}

// Handle user input
rl.on("line", (input) => {
  handleInput(input);
});

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("");
  console.log("========================================");
  console.log("  Exiting...");
  console.log("========================================");
  client.end();
  rl.close();
  process.exit(0);
});

// Wait for connection before accepting input
client.once("connect", () => {
  rl.prompt();
});
