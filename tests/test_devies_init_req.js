/**
 * Test for devies_init_req message parsing (with typo)
 *
 * This test verifies that the V6800Parser correctly handles the devies_init_req
 * message type which contains a typo in the device's actual message format.
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");

// Test the specific issue reported
const testMessage = {
  gateway_sn: "2105101125",
  msg_type: "devies_init_req", // Note: This is the typo from the device
  uuid_number: 1528492292,
  gateway_ip: "192.168.100.100",
  gateway_mac: "08:80:7D:79:4B:45",
  data: [
    {
      module_index: 4,
      module_sn: "3468672873",
      module_u_num: 12,
      module_sw_version: "2209191506",
    },
  ],
};

const topic = "V6800Upload/2105101125/devies_init_req";
const result = V6800Parser.parse(topic, testMessage);

console.log("Test: devies_init_req message parsing (with typo)");
console.log("==============================================");
console.log("Input msg_type:", testMessage.msg_type);
console.log("Result messageType:", result.messageType);
console.log("");

if (result.messageType === "DEV_MOD_INFO") {
  console.log(
    "✅ SUCCESS: devies_init_req (with typo) is correctly mapped to DEV_MOD_INFO",
  );
} else {
  console.log("❌ FAILURE: devies_init_req was mapped to", result.messageType);
}

console.log("");
console.log("Full SIF output:");
console.log(JSON.stringify(result, null, 2));

// Additional verification
console.log("");
console.log("Verification:");
console.log("- deviceType:", result.deviceType === "V6800" ? "✅" : "❌");
console.log("- deviceId:", result.deviceId === "2105101125" ? "✅" : "❌");
console.log("- messageId:", result.messageId === "1528492292" ? "✅" : "❌");
console.log("- ip:", result.ip === "192.168.100.100" ? "✅" : "❌");
console.log("- mac:", result.mac === "08:80:7D:79:4B:45" ? "✅" : "❌");
console.log(
  "- data length:",
  result.data && result.data.length === 1 ? "✅" : "❌",
);
console.log("- moduleIndex:", result.data[0].moduleIndex === 4 ? "✅" : "❌");
console.log(
  "- moduleId:",
  result.data[0].moduleId === "3468672873" ? "✅" : "❌",
);
console.log("- uTotal:", result.data[0].uTotal === 12 ? "✅" : "❌");
console.log("- fwVer:", result.data[0].fwVer === "2209191506" ? "✅" : "❌");
