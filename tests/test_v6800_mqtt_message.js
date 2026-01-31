/**
 * Test to reproduce the V6800Parser error
 *
 * This test simulates the issue where the V6800Parser receives a topic name
 * instead of the JSON payload, causing a JSON parsing error.
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");

// Test case 1: Normal operation (should work)
console.log("Test 1: Normal operation with valid JSON");
console.log("===========================================");

const validMessage = {
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
const result1 = V6800Parser.parse(topic, validMessage);

if (result1) {
  console.log("✅ SUCCESS: Valid JSON parsed correctly");
  console.log("Device ID:", result1.deviceId);
  console.log("Message Type:", result1.messageType);
} else {
  console.log("❌ FAILURE: Valid JSON failed to parse");
}

console.log("\n");

// Test case 2: Reproduce the error (topic name as message)
console.log("Test 2: Reproducing the error (topic as message)");
console.log("==================================================");

const topicAsMessage = "V6800Upload/2105101125/heart_beat_req";
const result2 = V6800Parser.parse(topic, topicAsMessage);

if (result2) {
  console.log(
    "❌ UNEXPECTED: Topic as message was parsed (this shouldn't happen)",
  );
} else {
  console.log(
    "✅ EXPECTED: Topic as message failed to parse (reproducing the issue)",
  );
}

console.log("\n");

// Test case 3: Test with stringified JSON (should work)
console.log("Test 3: Stringified JSON (should work)");
console.log("========================================");

const jsonString = JSON.stringify(validMessage);
const result3 = V6800Parser.parse(topic, jsonString);

if (result3) {
  console.log("✅ SUCCESS: Stringified JSON parsed correctly");
  console.log("Device ID:", result3.deviceId);
  console.log("Message Type:", result3.messageType);
} else {
  console.log("❌ FAILURE: Stringified JSON failed to parse");
}

console.log("\n");

// Test case 4: Test with partial topic string (reproducing the exact error)
console.log("Test 4: Partial topic string (reproducing exact error)");
console.log("========================================================");

const partialTopic = "V6800Upload/2105101125/heart_beat_req";
const result4 = V6800Parser.parse(topic, partialTopic);

if (result4) {
  console.log(
    "❌ UNEXPECTED: Partial topic was parsed (this shouldn't happen)",
  );
} else {
  console.log(
    "✅ EXPECTED: Partial topic failed to parse (reproducing the exact error)",
  );
}
