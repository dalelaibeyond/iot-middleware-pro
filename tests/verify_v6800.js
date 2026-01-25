/**
 * V6800Parser Verification Test
 *
 * This script verifies the V6800Parser implementation against the SIF Contract
 * defined in openspec/specs/03-V6800-parser.md
 *
 * Test cases are based on the JSON examples in the spec.
 */

const V6800Parser = require("../src/modules/parsers/V6800Parser");

// Test cases based on spec examples
const testCases = [
  {
    name: "HEARTBEAT (heart_beat_req)",
    topic: "V6800Upload/2105101125/heart_beat_req",
    message: {
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
    },
  },
  {
    name: "RFID_SNAPSHOT (u_state_resp)",
    topic: "V6800Upload/2105101125/u_state_resp",
    message: {
      gateway_sn: "2105101125",
      msg_type: "u_state_resp",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "0304555999",
          data: [
            {
              u_index: 3,
              tag_code: "21B03311",
              warning: 0,
            },
          ],
        },
      ],
    },
  },
  {
    name: "RFID_EVENT (u_state_changed_notify_req)",
    topic: "V6800Upload/2105101125/u_state_changed_notify_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "u_state_changed_notify_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 4,
          module_sn: "3468672873",
          data: [
            {
              u_index: 11,
              tag_code: "21AF16B1",
              warning: 0,
              new_state: 0,
              old_state: 1,
            },
          ],
        },
      ],
    },
  },
  {
    name: "TEMP_HUM (temper_humidity_exception_nofity_req)",
    topic: "V6800Upload/2105101125/temper_humidity_exception_nofity_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "temper_humidity_exception_nofity_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "1616797188",
          data: [
            {
              temper_position: 10,
              temper_swot: 32.1,
              hygrometer_swot: 51.1,
            },
          ],
        },
      ],
    },
  },
  {
    name: "QRY_TEMP_HUM_RESP (temper_humidity_resp)",
    topic: "V6800Upload/2105101125/temper_humidity_resp",
    message: {
      gateway_sn: "2105101125",
      msg_type: "temper_humidity_resp",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "1616797188",
          data: [
            {
              temper_position: 10,
              temper_swot: 32.1,
              hygrometer_swot: 51.1,
            },
          ],
        },
      ],
    },
  },
  {
    name: "DOOR_STATE - Single Door (door_state_changed_notify_req)",
    topic: "V6800Upload/2105101125/door_state_changed_notify_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "door_state_changed_notify_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "0304555999",
          new_state: 1,
        },
      ],
    },
  },
  {
    name: "DOOR_STATE - Dual Door (door_state_changed_notify_req)",
    topic: "V6800Upload/2105101125/door_state_changed_notify_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "door_state_changed_notify_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "0304555999",
          new_state1: 1,
          new_state2: 1,
        },
      ],
    },
  },
  {
    name: "QRY_DOOR_STATE_RESP (door_state_resp)",
    topic: "V6800Upload/2105101125/door_state_resp",
    message: {
      gateway_sn: "2105101125",
      msg_type: "door_state_resp",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "0304555999",
          new_state: 1,
        },
      ],
    },
  },
  {
    name: "DEV_MOD_INFO (devies_init_req)",
    topic: "V6800Upload/2105101125/devies_init_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "devies_init_req",
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
    },
  },
  {
    name: "UTOTAL_CHANGED (devices_changed_req)",
    topic: "V6800Upload/2105101125/devices_changed_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "devices_changed_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 4,
          module_sn: "3468672873",
          module_u_num: 12,
          module_sw_version: "2209191506",
        },
      ],
    },
  },
  {
    name: "QRY_CLR_RESP (u_color)",
    topic: "V6800Upload/2105101125/u_color",
    message: {
      gateway_sn: "2105101125",
      msg_type: "u_color",
      uuid_number: 755052881,
      data: [
        {
          module_index: 3,
          module_sn: "3468672873",
          module_u_num: 12,
          data: [
            {
              u_index: 1,
              color: "red",
              code: 1,
            },
          ],
        },
      ],
    },
  },
  {
    name: "SET_CLR_RESP (set_module_property_result_req)",
    topic: "V6800Upload/2105101125/set_module_property_result_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "set_module_property_result_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 2,
          module_sn: "3468672873",
          result: "success",
        },
      ],
    },
  },
  {
    name: "CLN_ALM_RESP (clear_u_warning)",
    topic: "V6800Upload/2105101125/clear_u_warning",
    message: {
      gateway_sn: "2105101125",
      msg_type: "clear_u_warning",
      uuid_number: 755052881,
      data: [
        {
          module_index: 4,
          module_sn: "3074309747",
          module_u_num: 18,
          result: true,
        },
      ],
    },
  },
];

// Additional edge case tests
const edgeCases = [
  {
    name: "Unknown message type",
    topic: "V6800Upload/2105101125/unknown_type",
    message: {
      gateway_sn: "2105101125",
      msg_type: "unknown_type",
      uuid_number: 123456789,
      data: [],
    },
  },
  {
    name: "Invalid JSON (null)",
    topic: "V6800Upload/2105101125/test",
    message: null,
  },
  {
    name: "RFID tag filtering (empty tag_code)",
    topic: "V6800Upload/2105101125/u_state_resp",
    message: {
      gateway_sn: "2105101125",
      msg_type: "u_state_resp",
      uuid_number: 755052881,
      data: [
        {
          module_index: 1,
          module_sn: "0304555999",
          data: [
            {
              u_index: 3,
              tag_code: "",
              warning: 0,
            },
          ],
        },
      ],
    },
  },
  {
    name: "HEARTBEAT with gateway module (module_type=mt_gw)",
    topic: "V6800Upload/2105101125/heart_beat_req",
    message: {
      module_type: "mt_gw",
      msg_type: "heart_beat_req",
      uuid_number: 755052881,
      module_sn: "2105101125",
      data: [
        {
          module_index: 4,
          module_sn: "3468672873",
          module_u_num: 12,
        },
      ],
    },
  },
  {
    name: "Module field alias (host_gateway_port_index)",
    topic: "V6800Upload/2105101125/heart_beat_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "heart_beat_req",
      uuid_number: 755052881,
      data: [
        {
          host_gateway_port_index: 4,
          module_sn: "3468672873",
          module_u_num: 12,
        },
      ],
    },
  },
  {
    name: "Module field alias (extend_module_sn)",
    topic: "V6800Upload/2105101125/heart_beat_req",
    message: {
      gateway_sn: "2105101125",
      msg_type: "heart_beat_req",
      uuid_number: 755052881,
      data: [
        {
          module_index: 4,
          extend_module_sn: "3468672873",
          module_u_num: 12,
        },
      ],
    },
  },
];

/**
 * Verify SIF envelope fields
 * @param {Object} sif - SIF object to verify
 * @param {string} testName - Test case name
 */
function verifyEnvelope(sif, testName) {
  const errors = [];

  if (!sif.deviceType || sif.deviceType !== "V6800") {
    errors.push("deviceType is missing or not 'V6800'");
  }

  if (!sif.deviceId || typeof sif.deviceId !== "string") {
    errors.push("deviceId is missing or not a string");
  }

  if (!sif.messageType || typeof sif.messageType !== "string") {
    errors.push("messageType is missing or not a string");
  }

  if (!sif.messageId || typeof sif.messageId !== "string") {
    errors.push("messageId is missing or not a string");
  }

  if (!sif.meta || typeof sif.meta !== "object") {
    errors.push("meta is missing or not an object");
  } else {
    if (!sif.meta.topic) {
      errors.push("meta.topic is missing");
    }
    if (!sif.meta.rawType) {
      errors.push("meta.rawType is missing");
    }
  }

  return errors;
}

/**
 * Run a single test case
 * @param {Object} testCase - Test case object
 */
function runTestCase(testCase) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`TEST: ${testCase.name}`);
  console.log(`${"=".repeat(80)}`);

  console.log("\nInput:");
  console.log(`  Topic: ${testCase.topic}`);
  console.log(`  Message:`, JSON.stringify(testCase.message, null, 2));

  // Parse the message
  const sif = V6800Parser.parse(testCase.topic, testCase.message);

  console.log("\nOutput SIF:");
  if (sif === null) {
    console.log("  null (parse failed)");
  } else {
    console.log(JSON.stringify(sif, null, 2));

    // Verify envelope
    const errors = verifyEnvelope(sif, testCase.name);
    if (errors.length > 0) {
      console.log("\n❌ Envelope Verification FAILED:");
      errors.forEach((err) => console.log(`  - ${err}`));
    } else {
      console.log("\n✅ Envelope Verification PASSED");
    }
  }
}

/**
 * Run all test cases
 */
function runAllTests() {
  console.log("\n" + "=".repeat(80));
  console.log("V6800Parser Verification Test Suite");
  console.log("=".repeat(80));

  console.log(`\nTotal test cases: ${testCases.length + edgeCases.length}`);
  console.log(`  - Standard cases: ${testCases.length}`);
  console.log(`  - Edge cases: ${edgeCases.length}`);

  let passed = 0;
  let failed = 0;

  // Run standard test cases
  console.log("\n" + "-".repeat(80));
  console.log("STANDARD TEST CASES");
  console.log("-".repeat(80));

  testCases.forEach((testCase, index) => {
    runTestCase(testCase);

    // Simple pass/fail check (non-null output with valid envelope)
    const sif = V6800Parser.parse(testCase.topic, testCase.message);
    const errors = verifyEnvelope(sif, testCase.name);
    if (sif !== null && errors.length === 0) {
      passed++;
    } else {
      failed++;
    }
  });

  // Run edge case tests
  console.log("\n" + "-".repeat(80));
  console.log("EDGE CASE TESTS");
  console.log("-".repeat(80));

  edgeCases.forEach((testCase, index) => {
    runTestCase(testCase);

    // Edge cases have different expectations
    if (testCase.name === "Invalid JSON (null)") {
      // Should return null
      const sif = V6800Parser.parse(testCase.topic, testCase.message);
      if (sif === null) {
        passed++;
      } else {
        failed++;
      }
    } else {
      const sif = V6800Parser.parse(testCase.topic, testCase.message);
      const errors = verifyEnvelope(sif, testCase.name);
      if (sif !== null && errors.length === 0) {
        passed++;
      } else {
        failed++;
      }
    }
  });

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total: ${testCases.length + edgeCases.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(
    `Success Rate: ${((passed / (testCases.length + edgeCases.length)) * 100).toFixed(1)}%`,
  );
  console.log("=".repeat(80));
}

// Run all tests
runAllTests();
