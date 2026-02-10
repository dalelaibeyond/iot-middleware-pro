/**
 * Test script for Metadata Merge & Repair Logic
 * Verifies Section 3.3 and 3.4 implementation
 */

const StateCache = require('../src/modules/normalizer/StateCache');
const UnifyNormalizer = require('../src/modules/normalizer/UnifyNormalizer');
const EventBus = require('../src/core/EventBus');

// Track emitted events
const emittedEvents = [];
const commandRequests = [];

// Mock event tracking
EventBus.onDataNormalized((suo) => {
  emittedEvents.push({ type: 'data.normalized', suo });
});

EventBus.onCommandRequest((cmd) => {
  commandRequests.push(cmd);
  console.log('[TEST] Command request emitted:', cmd.messageType, 'for device', cmd.deviceId);
});

// Test results
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✓', message);
    testsPassed++;
  } else {
    console.error('  ✗', message);
    testsFailed++;
  }
}

function testSection(name, fn) {
  console.log(`\n=== ${name} ===`);
  try {
    fn();
  } catch (error) {
    console.error('  ✗ Test threw exception:', error.message);
    testsFailed++;
  }
}

console.log('================================================================================');
console.log('METADATA MERGE & REPAIR LOGIC TESTS');
console.log('================================================================================');

// Initialize modules
StateCache.initialize({});
UnifyNormalizer.initialize({});

// ================================================================================
// TEST 1: reconcileMetadata - Add new modules
// ================================================================================
testSection('TEST 1: reconcileMetadata - Add new modules', () => {
  // Clear cache
  StateCache.clearDevice('device001');
  emittedEvents.length = 0;

  // First heartbeat with 2 modules
  const changes1 = StateCache.reconcileMetadata('device001', [
    { moduleIndex: 1, moduleId: '1001', uTotal: 10 },
    { moduleIndex: 2, moduleId: '1002', uTotal: 20 },
  ]);

  assert(changes1.length === 2, 'Should detect 2 changes (2 modules added)');
  assert(changes1[0].includes('added'), 'First change should be "added"');
  
  const metadata1 = StateCache.getMetadata('device001');
  assert(metadata1.activeModules.length === 2, 'Cache should have 2 modules');
  assert(metadata1.activeModules[0].moduleId === '1001', 'Module 1 should have correct ID');
  assert(metadata1.activeModules[0].uTotal === 10, 'Module 1 should have correct uTotal');
});

// ================================================================================
// TEST 2: reconcileMetadata - Update existing modules
// ================================================================================
testSection('TEST 2: reconcileMetadata - Update existing modules', () => {
  // Second heartbeat with updated uTotal for module 1
  const changes2 = StateCache.reconcileMetadata('device001', [
    { moduleIndex: 1, moduleId: '1001', uTotal: 15 },  // uTotal changed
    { moduleIndex: 2, moduleId: '1002', uTotal: 20 },  // No change
  ]);

  assert(changes2.length === 1, 'Should detect 1 change (uTotal changed)');
  assert(changes2[0].includes('U-Total changed'), 'Change should be U-Total change');
  
  const metadata2 = StateCache.getMetadata('device001');
  assert(metadata2.activeModules[0].uTotal === 15, 'Module 1 should have updated uTotal');
  assert(metadata2.activeModules[1].uTotal === 20, 'Module 2 should retain uTotal');
});

// ================================================================================
// TEST 3: reconcileMetadata - Remove modules (Zero Module case)
// ================================================================================
testSection('TEST 3: reconcileMetadata - Remove modules (Zero Module case)', () => {
  // Third heartbeat with only 1 module (module 2 removed)
  const changes3 = StateCache.reconcileMetadata('device001', [
    { moduleIndex: 1, moduleId: '1001', uTotal: 15 },
  ]);

  assert(changes3.length === 1, 'Should detect 1 change (module removed)');
  assert(changes3[0].includes('removed'), 'Change should be "removed"');
  
  const metadata3 = StateCache.getMetadata('device001');
  assert(metadata3.activeModules.length === 1, 'Cache should have 1 module');
  assert(metadata3.activeModules[0].moduleIndex === 1, 'Remaining module should be index 1');
});

// ================================================================================
// TEST 4: reconcileMetadata - Empty heartbeat (all modules removed)
// ================================================================================
testSection('TEST 4: reconcileMetadata - Empty heartbeat (all modules removed)', () => {
  // Fourth heartbeat with no modules
  const changes4 = StateCache.reconcileMetadata('device001', []);

  assert(changes4.length === 1, 'Should detect 1 change (last module removed)');
  
  const metadata4 = StateCache.getMetadata('device001');
  assert(metadata4.activeModules.length === 0, 'Cache should have 0 modules');
});

// ================================================================================
// TEST 5: preserve fwVer during reconciliation
// ================================================================================
testSection('TEST 5: preserve fwVer during reconciliation', () => {
  StateCache.clearDevice('device002');
  
  // First, set up metadata with fwVer from MODULE_INFO
  StateCache.mergeMetadata('device002', {
    deviceType: 'V5008',
    activeModules: [
      { moduleIndex: 1, moduleId: '2001', fwVer: '1.2.3', uTotal: 10 },
    ],
  });

  // Now reconcile with heartbeat (no fwVer)
  StateCache.reconcileMetadata('device002', [
    { moduleIndex: 1, moduleId: '2001', uTotal: 12 },  // uTotal changed, no fwVer
  ]);

  const metadata = StateCache.getMetadata('device002');
  assert(metadata.activeModules[0].fwVer === '1.2.3', 'fwVer should be preserved');
  assert(metadata.activeModules[0].uTotal === 12, 'uTotal should be updated');
});

// ================================================================================
// TEST 6: isDeviceInfoMissing - Detect missing ip/mac
// ================================================================================
testSection('TEST 6: isDeviceInfoMissing - Detect missing ip/mac', () => {
  StateCache.clearDevice('device003');
  
  // New device with no metadata
  assert(StateCache.isDeviceInfoMissing('device003') === true, 'New device should be missing info');
  
  // Add ip only
  StateCache.mergeMetadata('device003', {
    deviceType: 'V5008',
    ip: '192.168.1.100',
  });
  assert(StateCache.isDeviceInfoMissing('device003') === true, 'Device with only ip should still be missing info');
  
  // Add mac
  StateCache.mergeMetadata('device003', {
    deviceType: 'V5008',
    mac: '00:11:22:33:44:55',
  });
  assert(StateCache.isDeviceInfoMissing('device003') === false, 'Device with ip and mac should not be missing info');
});

// ================================================================================
// TEST 7: getModulesMissingFwVer - Detect modules without fwVer
// ================================================================================
testSection('TEST 7: getModulesMissingFwVer - Detect modules without fwVer', () => {
  StateCache.clearDevice('device004');
  
  // Set up modules with and without fwVer
  StateCache.mergeMetadata('device004', {
    deviceType: 'V5008',
    activeModules: [
      { moduleIndex: 1, moduleId: '4001', fwVer: '1.0.0', uTotal: 10 },
      { moduleIndex: 2, moduleId: '4002', uTotal: 20 },  // No fwVer
      { moduleIndex: 3, moduleId: '4003', fwVer: null, uTotal: 30 },  // null fwVer
    ],
  });

  const missing = StateCache.getModulesMissingFwVer('device004');
  assert(missing.length === 2, 'Should find 2 modules missing fwVer');
  assert(missing[0].moduleIndex === 2, 'First missing should be module 2');
  assert(missing[1].moduleIndex === 3, 'Second missing should be module 3');
});

// ================================================================================
// TEST 8: detectMetadataChanges - Device level changes
// ================================================================================
testSection('TEST 8: detectMetadataChanges - Device level changes', () => {
  StateCache.clearDevice('device005');
  
  // Initial state
  StateCache.mergeMetadata('device005', {
    deviceType: 'V5008',
    ip: '192.168.1.100',
    fwVer: '1.0.0',
  });

  // Detect IP change
  const ipChanges = UnifyNormalizer.detectMetadataChanges('device005', {
    ip: '192.168.1.200',
  });
  assert(ipChanges.length === 1, 'Should detect IP change');
  assert(ipChanges[0].includes('IP changed'), 'Change should mention IP');

  // Detect firmware change
  const fwChanges = UnifyNormalizer.detectMetadataChanges('device005', {
    fwVer: '2.0.0',
  });
  assert(fwChanges.length === 1, 'Should detect firmware change');
  assert(fwChanges[0].includes('Firmware changed'), 'Change should mention Firmware');
});

// ================================================================================
// TEST 9: detectMetadataChanges - Module level changes
// ================================================================================
testSection('TEST 9: detectMetadataChanges - Module level changes', () => {
  StateCache.clearDevice('device006');
  
  // Initial state with 2 modules
  StateCache.mergeMetadata('device006', {
    deviceType: 'V5008',
    activeModules: [
      { moduleIndex: 1, moduleId: '6001', fwVer: '1.0.0', uTotal: 10 },
    ],
  });

  // Detect new module added
  const addChanges = UnifyNormalizer.detectMetadataChanges('device006', {
    activeModules: [
      { moduleIndex: 1, moduleId: '6001', fwVer: '1.0.0', uTotal: 10 },
      { moduleIndex: 2, moduleId: '6002', fwVer: '2.0.0', uTotal: 20 },
    ],
  });
  assert(addChanges.length === 1, 'Should detect new module');
  assert(addChanges[0].includes('added'), 'Change should mention "added"');

  // Detect module ID change (replacement)
  const replaceChanges = UnifyNormalizer.detectMetadataChanges('device006', {
    activeModules: [
      { moduleIndex: 1, moduleId: '6999', fwVer: '1.0.0', uTotal: 10 },  // ID changed
    ],
  });
  assert(replaceChanges.length === 1, 'Should detect module replacement');
  assert(replaceChanges[0].includes('replaced'), 'Change should mention "replaced"');

  // Detect fwVer and uTotal changes
  const modChanges = UnifyNormalizer.detectMetadataChanges('device006', {
    activeModules: [
      { moduleIndex: 1, moduleId: '6001', fwVer: '1.5.0', uTotal: 15 },  // Both changed
    ],
  });
  assert(modChanges.length === 2, 'Should detect 2 changes (fwVer and uTotal)');
});

// ================================================================================
// Summary
// ================================================================================
console.log('\n================================================================================');
console.log('TEST SUMMARY');
console.log('================================================================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
console.log('================================================================================');

process.exit(testsFailed > 0 ? 1 : 0);
