/**
 * Test script to verify config loading from ./config/
 */

const config = require("config");

console.log("Testing config loading from ./config/\n");

try {
  // Test 1: Load entire config
  console.log("✓ Config loaded successfully");

  // Test 2: Get app name
  const appName = config.get("app.name");
  console.log(`✓ App name: ${appName}`);

  // Test 3: Get app version
  const appVersion = config.get("app.version");
  console.log(`✓ App version: ${appVersion}`);

  // Test 4: Get MQTT config
  const mqttBroker = config.get("mqtt.brokerUrl");
  console.log(`✓ MQTT broker: ${mqttBroker}`);

  // Test 5: Get database config
  const dbHost = config.get("modules.database.connection.host");
  console.log(`✓ Database host: ${dbHost}`);

  // Test 6: Get storage module config
  const storageEnabled = config.get("modules.storage.enabled");
  const storageBatchSize = config.get("modules.storage.batchSize");
  console.log(`✓ Storage enabled: ${storageEnabled}, batch size: ${storageBatchSize}`);

  // Test 7: Get API server config
  const apiPort = config.get("modules.apiServer.port");
  console.log(`✓ API server port: ${apiPort}`);

  // Test 8: Get normalizer config
  const normalizerCacheType = config.get("modules.normalizer.cacheType");
  const heartbeatTimeout = config.get("modules.normalizer.heartbeatTimeout");
  console.log(`✓ Normalizer cache type: ${normalizerCacheType}, heartbeat timeout: ${heartbeatTimeout}ms`);

  console.log("\n✅ All config tests passed!");
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Config test failed: ${error.message}`);
  process.exit(1);
}
