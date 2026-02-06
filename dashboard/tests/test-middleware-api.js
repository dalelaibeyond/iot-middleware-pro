/**
 * Test script to verify middleware API connectivity
 * This simulates the dashboard's behavior to check if data is retrieved from middleware
 */

import axios from "axios";

// API Base URL
const API_BASE_URL = "http://localhost:3000/api";
const DASHBOARD_URL = "http://localhost:5173/api";

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(60));
  log(title, colors.cyan);
  console.log("=".repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

async function testHealthEndpoint() {
  logSection("1. Testing Health Endpoint");
  
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    
    if (response.status === 200) {
      logSuccess(`Health endpoint working (Status: ${response.status})`);
      logInfo(`Middleware status: ${response.data.status}`);
      logInfo(`Uptime: ${response.data.uptime?.toFixed(2)}s`);
      logInfo(`Database: ${response.data.db}`);
      logInfo(`MQTT: ${response.data.mqtt}`);
      return true;
    } else {
      logError(`Unexpected status code: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Health endpoint failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function testDevicesEndpoint() {
  logSection("2. Testing Devices Endpoint (Device List)");
  
  try {
    const response = await axios.get(`${API_BASE_URL}/devices`);
    
    if (response.status === 200) {
      const devices = response.data;
      logSuccess(`Devices endpoint working (Status: ${response.status})`);
      logInfo(`Number of devices found: ${devices.length}`);
      
      if (devices.length === 0) {
        logWarning("No devices found in the database!");
      } else {
        logInfo("\nDevice List:");
        devices.forEach((device, index) => {
          console.log(`\n  Device ${index + 1}:`);
          console.log(`    - Device ID: ${device.device_id || device.deviceId}`);
          console.log(`    - Device Type: ${device.device_type || device.deviceType}`);
          console.log(`    - IP Address: ${device.device_ip || device.ip}`);
          console.log(`    - MAC Address: ${device.device_mac || device.mac}`);
          console.log(`    - Firmware: ${device.device_fwVer || device.fwVer}`);
          console.log(`    - Subnet Mask: ${device.device_mask || device.mask}`);
          console.log(`    - Gateway IP: ${device.device_gwIp || device.gwIp}`);
          console.log(`    - Active Modules: ${(device.modules || device.activeModules)?.length || 0}`);
          
          const modulesList = device.modules || device.activeModules;
          if (modulesList && modulesList.length > 0) {
            modulesList.forEach((module, modIdx) => {
              console.log(`      Module ${modIdx + 1}:`);
              console.log(`        - Module Index: ${module.moduleIndex}`);
              console.log(`        - Module ID: ${module.moduleId}`);
              console.log(`        - U-Total: ${module.uTotal}`);
              console.log(`        - Firmware: ${module.fwVer}`);
            });
          }
        });
      }
      
      return devices;
    } else {
      logError(`Unexpected status code: ${response.status}`);
      return [];
    }
  } catch (error) {
    logError(`Devices endpoint failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

async function testModulesEndpoint(deviceId) {
  logSection(`3. Testing Modules Endpoint for Device ${deviceId}`);
  
  try {
    const response = await axios.get(`${API_BASE_URL}/devices/${deviceId}/modules`);
    
    if (response.status === 200) {
      const modules = response.data;
      logSuccess(`Modules endpoint working (Status: ${response.status})`);
      logInfo(`Number of modules found: ${modules.length}`);
      
      if (modules.length === 0) {
        logWarning("No modules found for this device!");
        logWarning("This means the middleware cache doesn't have module state data.");
        logWarning("The dashboard won't be able to display module list.");
      } else {
        logInfo("\nModule List:");
        modules.forEach((module, index) => {
          console.log(`\n  Module ${index + 1}:`);
          console.log(`    - Device ID: ${module.device_id || module.deviceId}`);
          console.log(`    - Device Type: ${module.device_type || module.deviceType}`);
          console.log(`    - Module Index: ${module.moduleIndex}`);
          console.log(`    - Module ID: ${module.moduleId}`);
          console.log(`    - Online: ${module.isOnline}`);
          console.log(`    - Door State: ${module.doorState}`);
          console.log(`    - RFID Sensors: ${module.rfid_snapshot?.length || 0}`);
          console.log(`    - Temp/Hum Sensors: ${module.temp_hum?.length || 0}`);
          console.log(`    - Noise Sensors: ${module.noise_level?.length || 0}`);
        });
      }
      
      return modules;
    } else {
      logError(`Unexpected status code: ${response.status}`);
      return [];
    }
  } catch (error) {
    logError(`Modules endpoint failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

async function testRackStateEndpoint(deviceId, moduleIndex) {
  logSection(`4. Testing Rack State Endpoint for Device ${deviceId}, Module ${moduleIndex}`);
  
  try {
    const response = await axios.get(
      `${API_BASE_URL}/devices/${deviceId}/modules/${moduleIndex}/state`
    );
    
    if (response.status === 200) {
      const rackState = response.data;
      logSuccess(`Rack state endpoint working (Status: ${response.status})`);
      logInfo(`Device ID: ${rackState.deviceId}`);
      logInfo(`Device Type: ${rackState.deviceType}`);
      logInfo(`Module Index: ${rackState.moduleIndex}`);
      logInfo(`Module ID: ${rackState.moduleId}`);
      logInfo(`Online: ${rackState.isOnline}`);
      logInfo(`Door State: ${rackState.doorState}`);
      logInfo(`Last Seen (Heartbeat): ${rackState.lastSeen_hb}`);
      logInfo(`RFID Sensors: ${rackState.rfid_snapshot?.length || 0}`);
      logInfo(`Temp/Hum Sensors: ${rackState.temp_hum?.length || 0}`);
      logInfo(`Noise Sensors: ${rackState.noise_level?.length || 0}`);
      
      return rackState;
    } else {
      logError(`Unexpected status code: ${response.status}`);
      return null;
    }
  } catch (error) {
    logError(`Rack state endpoint failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

async function testDashboardProxy() {
  logSection("5. Testing Dashboard Proxy (via Vite)");
  
  try {
    const response = await axios.get(`${DASHBOARD_URL}/devices`, {
      timeout: 5000,
    });
    
    if (response.status === 200) {
      const devices = response.data;
      logSuccess(`Dashboard proxy working (Status: ${response.status})`);
      logInfo(`Number of devices found via proxy: ${devices.length}`);
      return true;
    } else {
      logError(`Unexpected status code: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Dashboard proxy failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data)}`);
    } else if (error.code === "ECONNREFUSED") {
      logError("Dashboard is not running on port 5173");
    }
    return false;
  }
}

async function testConfigEndpoint() {
  logSection("6. Testing Config Endpoint");
  
  try {
    const response = await axios.get(`${API_BASE_URL}/config`);
    
    if (response.status === 200) {
      logSuccess(`Config endpoint working (Status: ${response.status})`);
      logInfo(`App Name: ${response.data.app?.name}`);
      logInfo(`App Version: ${response.data.app?.version}`);
      logInfo(`MQTT Broker: ${response.data.mqtt?.brokerUrl}`);
      logInfo(`API Server Port: ${response.data.modules?.apiServer?.port}`);
      logInfo(`WebSocket Server Port: ${response.data.modules?.webSocketServer?.port}`);
      return true;
    } else {
      logError(`Unexpected status code: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Config endpoint failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  log("IoT Middleware API Test", colors.cyan);
  log("Simulating Dashboard API Calls", colors.cyan);
  console.log("=".repeat(60));
  
  const results = {
    health: false,
    devices: false,
    modules: false,
    rackState: false,
    dashboardProxy: false,
    config: false,
  };
  
  // Test 1: Health Endpoint
  results.health = await testHealthEndpoint();
  
  // Test 2: Devices Endpoint (for device list)
  const devices = await testDevicesEndpoint();
  results.devices = devices.length > 0;
  
  // Test 3: Modules Endpoint (for module list)
  if (devices.length > 0) {
    const firstDevice = devices[0];
    const deviceId = firstDevice.device_id || firstDevice.deviceId;
    const modules = await testModulesEndpoint(deviceId);
    results.modules = modules.length > 0;
    
    // Test 4: Rack State Endpoint
    if (modules.length > 0) {
      const firstModule = modules[0];
      const rackState = await testRackStateEndpoint(
        firstModule.deviceId || deviceId,
        firstModule.moduleIndex
      );
      results.rackState = rackState !== null;
    }
  }
  
  // Test 5: Dashboard Proxy
  results.dashboardProxy = await testDashboardProxy();
  
  // Test 6: Config Endpoint
  results.config = await testConfigEndpoint();
  
  // Summary
  logSection("Test Summary");
  
  const allPassed = Object.values(results).every((result) => result);
  
  console.log("\nResults:");
  console.log(`  Health Endpoint:         ${results.health ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Devices Endpoint:        ${results.devices ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Modules Endpoint:        ${results.modules ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Rack State Endpoint:     ${results.rackState ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Dashboard Proxy:         ${results.dashboardProxy ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Config Endpoint:         ${results.config ? "✅ PASS" : "❌ FAIL"}`);
  
  console.log("\n" + "=".repeat(60));
  
  if (allPassed) {
    log("🎉 All API tests passed! The middleware is working correctly.", colors.green);
    log("   If the dashboard still shows no data, check the dashboard's frontend code.", colors.green);
  } else {
    log("❌ Some API tests failed. Check the errors above for details.", colors.red);
    
    if (!results.devices) {
      log("\n💡 TROUBLESHOOTING TIPS:", colors.yellow);
      log("   1. Check if the middleware server is running on port 3000", colors.yellow);
      log("   2. Verify the database has device data", colors.yellow);
      log("   3. Check middleware logs for errors", colors.yellow);
      log("   4. Ensure MQTT is connected and receiving data", colors.yellow);
    }
    
    if (!results.dashboardProxy) {
      log("\n💡 DASHBOARD PROXY TROUBLESHOOTING:", colors.yellow);
      log("   1. Check if the dashboard is running on port 5173", colors.yellow);
      log("   2. Verify Vite proxy configuration in vite.config.ts", colors.yellow);
      log("   3. Ensure the middleware is running on port 3000", colors.yellow);
    }
  }
  
  console.log("=".repeat(60) + "\n");
}

// Run the tests
main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
