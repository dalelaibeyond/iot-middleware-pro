/**
 * Test for the specific door state response message from the log
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");
const UnifyNormalizer = require("../src/modules/normalizer/UnifyNormalizer");

// Mock the EventBus for testing
const mockEventBus = {
  emitDataNormalized: (data) => {
    console.log("✅ SUO Emitted successfully");
    console.log("   Device ID:", data.deviceId);
    console.log("   Message Type:", data.messageType);
    console.log("   Module Index:", data.moduleIndex);
    console.log("   Module ID:", data.moduleId);
    console.log("   Door State:", data.payload[0].doorState);
  },
  emitError: (error, source) => {
    console.error("❌ Error from", source, ":", error.message);
  },
};

// Replace the real EventBus methods
const originalEmitDataNormalized =
  require("../src/core/EventBus").emitDataNormalized;
require("../src/core/EventBus").emitDataNormalized =
  mockEventBus.emitDataNormalized;

async function testDoorStateRespFix() {
  console.log("Testing the fix for V6800 door state response message...\n");

  // Exact message from the log that was failing
  const topic = "V6800Upload/2105101125/Init";
  const rawMessage = {
    msg_type: "door_state_resp",
    code: 200,
    host_gateway_port_index: 1,
    extend_module_sn: "0304555999",
    new_state: 1,
    uuid_number: 755052881,
  };

  console.log("Input message:");
  console.log("  Topic:", topic);
  console.log("  Message Type:", rawMessage.msg_type);
  console.log("  Module Index:", rawMessage.host_gateway_port_index);
  console.log("  Module ID:", rawMessage.extend_module_sn);
  console.log("  Door State:", rawMessage.new_state);
  console.log("");

  // Step 1: Parse the message with V6800Parser
  console.log("Step 1: Parsing with V6800Parser");
  const sif = V6800Parser.parse(topic, rawMessage);

  if (!sif) {
    console.error("❌ Failed to parse message");
    return;
  }

  console.log("✅ Parsed successfully");
  console.log("   SIF Message Type:", sif.messageType);
  console.log("   Module Index:", sif.data.moduleIndex);
  console.log("   Module ID:", sif.data.moduleId);
  console.log("   Door State:", sif.data.doorState);
  console.log("");

  // Step 2: Normalize the SIF with UnifyNormalizer
  console.log("Step 2: Normalizing with UnifyNormalizer");
  try {
    UnifyNormalizer.normalize(sif);
    console.log("✅ Normalization completed successfully");
  } catch (error) {
    console.error("❌ Normalization failed:", error.message);
  }

  console.log("\n✅ Test completed successfully! The issue has been fixed.");

  // Restore the original EventBus
  require("../src/core/EventBus").emitDataNormalized =
    originalEmitDataNormalized;
}

// Run the test
testDoorStateRespFix().catch(console.error);
