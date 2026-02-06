/**
 * Test script to verify data transformation is working correctly
 */

// Simulate the data transformation logic from endpoints.ts
function toCamelCase(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item));
  }

  const result = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Convert snake_case to camelCase
      let camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

      // Apply specific field name mappings for dashboard compatibility
      const fieldMappings = {
        device_id: "deviceId",
        device_type: "deviceType",
        device_ip: "ip",
        device_mac: "mac",
        device_fwVer: "fwVer",
        device_mask: "mask",
        device_gwIp: "gwIp",
        modules: "activeModules",
      };

      if (fieldMappings[key]) {
        camelKey = fieldMappings[key];
      }

      result[camelKey] = toCamelCase(obj[key]);
    }
  }
  return result;
}

// Test data from middleware (snake_case)
const middlewareData = [
  {
    "id": 1,
    "device_id": "2437871205",
    "device_type": "V5008",
    "device_fwVer": "2509101151",
    "device_mask": "255.255.0.0",
    "device_gwIp": "192.168.0.1",
    "device_ip": "192.168.0.211",
    "device_mac": "80:82:91:4E:F6:65",
    "modules": [
      {
        "moduleIndex": 1,
        "moduleId": "3963041727",
        "uTotal": 6
      }
    ],
    "parse_at": "2026-02-03T10:05:09.985Z",
    "update_at": "2026-02-03T10:05:09.985Z"
  }
];

console.log("Original data (snake_case):");
console.log(JSON.stringify(middlewareData, null, 2));

console.log("\nTransformed data (camelCase):");
const transformedData = toCamelCase(middlewareData);
console.log(JSON.stringify(transformedData, null, 2));

console.log("\nField name mapping:");
console.log("device_id → deviceId:", transformedData[0].deviceId);
console.log("device_type → deviceType:", transformedData[0].deviceType);
console.log("device_ip → ip:", transformedData[0].ip);
console.log("device_mac → mac:", transformedData[0].mac);
console.log("device_fwVer → fwVer:", transformedData[0].fwVer);
console.log("modules → activeModules:", transformedData[0].activeModules);
console.log("activeModules[0].moduleIndex:", transformedData[0].activeModules?.[0]?.moduleIndex);

// Test validation
console.log("\nValidation test:");
console.log("Has deviceId?", !!transformedData[0].deviceId);
console.log("Has deviceType?", !!transformedData[0].deviceType);
console.log("Has ip?", !!transformedData[0].ip);
console.log("Has activeModules array?", Array.isArray(transformedData[0].activeModules));
console.log("activeModules length?", transformedData[0].activeModules?.length);
