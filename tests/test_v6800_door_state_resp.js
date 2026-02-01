/**
 * Test for V6800 door state response message parsing and normalization
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");
const UnifyNormalizer = require("../src/modules/normalizer/UnifyNormalizer");
const EventBus = require("../src/core/EventBus");

// Mock the EventBus for testing
const mockEventBus = {
  emitDataNormalized: (data) => {
    console.log("✅ SUO Emitted:", JSON.stringify(data, null, 2));
  },
  emitError: (error, source) => {
    console.error("❌ Error from", source, ":", error.message);
  },
};

// Replace the real EventBus with our mock
const originalEmitDataNormalized = EventBus.emitDataNormalized;
EventBus.emitDataNormalized = mockEventBus.emitDataNormalized;

async function testDoorStateResp() {
  console.log("Testing V6800 door state response message...\n");

  // Sample door state response message from the log
  const topic = "V6800Upload/2105101125/Init";
  const rawMessage = {
    msg_type: "door_state_resp",
    code: 200,
    host_gateway_port_index: 1,
    extend_module_sn: "0304555999",
    new_state: 1,
    uuid_number: 755052881,
  };

  // Step 1: Parse the message with V6800Parser
  console.log("Step 1: Parsing with V6800Parser");
  const sif = V6800Parser.parse(topic, rawMessage);

  if (!sif) {
    console.error("❌ Failed to parse message");
    return;
  }

  console.log("✅ Parsed SIF:", JSON.stringify(sif, null, 2));

  // Step 2: Normalize the SIF with UnifyNormalizer
  console.log("\nStep 2: Normalizing with UnifyNormalizer");
  UnifyNormalizer.normalize(sif);

  console.log("\n✅ Test completed successfully!");

  // Restore the original EventBus
  EventBus.emitDataNormalized = originalEmitDataNormalized;
}

// Run the test
testDoorStateResp().catch(console.error);
