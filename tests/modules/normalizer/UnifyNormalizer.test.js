/**
 * Unit tests for UnifyNormalizer
 * Tests proper flattening, V6800 RFID sync trigger, metadata merge, and SUO structure
 */

// Mock EventBus at the module level
jest.mock("../../../src/core/EventBus", () => {
  const mockEventBus = {
    emittedData: [],
    emittedCommands: [],
    emittedErrors: [],
    listeners: {},

    on(event, handler) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(handler);
    },

    emitDataNormalized(suo) {
      this.emittedData.push(suo);
    },

    emitCommandRequest(cmd) {
      this.emittedCommands.push(cmd);
    },

    emitError(error, source) {
      this.emittedErrors.push({ error, source });
    },

    removeAllListeners(event) {
      delete this.listeners[event];
    },

    reset() {
      this.emittedData = [];
      this.emittedCommands = [];
      this.emittedErrors = [];
      this.listeners = {};
    },
  };

  return mockEventBus;
});

// Import the mocked EventBus
const eventBus = require("../../../src/core/EventBus");

// Mock StateCache
class MockStateCache {
  constructor() {
    this.cache = {};
  }

  // Generate cache key
  getCacheKey(deviceId, moduleIndex = null) {
    if (moduleIndex !== null) {
      return `device:${deviceId}:module:${moduleIndex}`;
    }
    return `device:${deviceId}:info`;
  }

  // Get telemetry from cache
  getTelemetry(deviceId, moduleIndex) {
    const key = this.getCacheKey(deviceId, moduleIndex);
    return this.cache[key]?.telemetry || null;
  }

  // Get metadata from cache
  getMetadata(deviceId) {
    const key = this.getCacheKey(deviceId);
    return this.cache[key]?.metadata || null;
  }

  // Get RFID snapshot from cache
  getRfidSnapshot(deviceId, moduleIndex) {
    const telemetry = this.getTelemetry(deviceId, moduleIndex);
    return telemetry?.rfid_snapshot || null;
  }

  // Set telemetry in cache
  setTelemetry(deviceId, moduleIndex, telemetry) {
    const key = this.getCacheKey(deviceId, moduleIndex);
    if (!this.cache[key]) {
      this.cache[key] = {};
    }
    this.cache[key].telemetry = telemetry;
  }

  // Update telemetry field
  updateTelemetryField(deviceId, moduleIndex, field, value, timestampField) {
    const telemetry = this.getTelemetry(deviceId, moduleIndex) || {};
    telemetry[field] = value;
    telemetry[timestampField] = new Date().toISOString();
    this.setTelemetry(deviceId, moduleIndex, telemetry);
  }

  // Update heartbeat
  updateHeartbeat(deviceId, moduleIndex, moduleId, uTotal) {
    const telemetry = this.getTelemetry(deviceId, moduleIndex) || {};
    telemetry.moduleId = moduleId;
    telemetry.uTotal = uTotal;
    telemetry.lastSeen_hb = new Date().toISOString();
    this.setTelemetry(deviceId, moduleIndex, telemetry);
  }

  // Merge metadata with change detection
  mergeMetadata(deviceId, incomingMetadata) {
    const key = this.getCacheKey(deviceId);
    if (!this.cache[key]) {
      this.cache[key] = {};
    }
    const cached = this.cache[key].metadata || {};
    const changes = [];

    // Detect device-level changes
    if (incomingMetadata.ip && cached.ip !== incomingMetadata.ip) {
      changes.push(`IP changed from ${cached.ip} to ${incomingMetadata.ip}`);
    }
    if (incomingMetadata.fwVer && cached.fwVer !== incomingMetadata.fwVer) {
      changes.push(`Firmware changed from ${cached.fwVer} to ${incomingMetadata.fwVer}`);
    }

    // Detect module changes
    if (incomingMetadata.activeModules) {
      const cachedModules = cached.activeModules || [];
      const incomingModules = incomingMetadata.activeModules;

      incomingModules.forEach((incoming) => {
        const cached = cachedModules.find((m) => m.moduleIndex === incoming.moduleIndex);
        if (!cached) {
          changes.push(`Module ${incoming.moduleIndex} added: ${incoming.moduleId}`);
        } else if (cached.moduleId !== incoming.moduleId) {
          changes.push(`Module ${incoming.moduleIndex} replaced: ${cached.moduleId} -> ${incoming.moduleId}`);
        } else if (cached.fwVer !== incoming.fwVer) {
          changes.push(`Module ${incoming.moduleIndex} firmware changed: ${cached.fwVer} -> ${incoming.fwVer}`);
        } else if (cached.uTotal !== incoming.uTotal) {
          changes.push(`Module ${incoming.moduleIndex} uTotal changed: ${cached.uTotal} -> ${incoming.uTotal}`);
        }
      });

      cachedModules.forEach((cached) => {
        const incoming = incomingModules.find((m) => m.moduleIndex === cached.moduleIndex);
        if (!incoming) {
          changes.push(`Module ${cached.moduleIndex} removed: ${cached.moduleId}`);
        }
      });
    }

    // Merge metadata
    this.cache[key].metadata = {
      ...cached,
      ...incomingMetadata,
      activeModules: incomingMetadata.activeModules || cached.activeModules,
    };

    return changes;
  }

  reset() {
    this.cache = {};
  }
}

describe("UnifyNormalizer", () => {
  let mockStateCache;

  beforeEach(() => {
    // Reset EventBus mock
    eventBus.reset();

    // Create fresh StateCache mock for each test
    mockStateCache = new MockStateCache();

    // Replace the singleton's StateCache with mock
    const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
    normalizer.stateCache = mockStateCache;
    normalizer.config = {};
  });

  afterEach(() => {
    // Clean up after each test
    eventBus.removeAllListeners();
    mockStateCache.reset();
  });

  describe("V5008 RFID Snapshot Diffing", () => {
    test("should detect ATTACHED event when new tag appears", () => {
      // Setup: Previous snapshot has 1 tag
      mockStateCache.setTelemetry("device001", 1, {
        rfid_snapshot: [
          { sensorIndex: 1, tagId: "TAG001", isAlarm: false },
        ],
      });

      // Act: New snapshot has 2 tags
      const sif = {
        deviceId: "device001",
        deviceType: "V5008",
        messageType: "RFID_SNAPSHOT",
        messageId: "msg001",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { uIndex: 1, tagId: "TAG001", isAlarm: false },
              { uIndex: 2, tagId: "TAG002", isAlarm: false },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleRfidSnapshot(sif);

      // Assert: Should emit RFID_EVENT for ATTACHED
      const events = eventBus.emittedData.filter((suo) => suo.messageType === "RFID_EVENT");
      expect(events.length).toBeGreaterThan(0);

      const attachedEvent = events.find((e) => e.payload[0].action === "ATTACHED");
      expect(attachedEvent).toBeDefined();
      expect(attachedEvent.payload[0].tagId).toBe("TAG002");
      expect(attachedEvent.payload[0].sensorIndex).toBe(2);
    });

    test("should detect DETACHED event when tag disappears", () => {
      // Setup: Previous snapshot has 2 tags
      mockStateCache.setTelemetry("device001", 1, {
        rfid_snapshot: [
          { sensorIndex: 1, tagId: "TAG001", isAlarm: false },
          { sensorIndex: 2, tagId: "TAG002", isAlarm: false },
        ],
      });

      // Act: New snapshot has 1 tag
      const sif = {
        deviceId: "device001",
        deviceType: "V5008",
        messageType: "RFID_SNAPSHOT",
        messageId: "msg001",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { uIndex: 1, tagId: "TAG001", isAlarm: false },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleRfidSnapshot(sif);

      // Assert: Should emit RFID_EVENT for DETACHED
      const events = eventBus.emittedData.filter((suo) => suo.messageType === "RFID_EVENT");
      expect(events.length).toBeGreaterThan(0);

      const detachedEvent = events.find((e) => e.payload[0].action === "DETACHED");
      expect(detachedEvent).toBeDefined();
      expect(detachedEvent.payload[0].tagId).toBe("TAG002");
      expect(detachedEvent.payload[0].sensorIndex).toBe(2);
    });

    test("should detect ALARM_ON and ALARM_OFF events", () => {
      // Setup: Previous snapshot has tag without alarm
      mockStateCache.setTelemetry("device001", 1, {
        rfid_snapshot: [
          { sensorIndex: 1, tagId: "TAG001", isAlarm: false },
        ],
      });

      // Act: New snapshot has tag with alarm
      const sif = {
        deviceId: "device001",
        deviceType: "V5008",
        messageType: "RFID_SNAPSHOT",
        messageId: "msg001",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { uIndex: 1, tagId: "TAG001", isAlarm: true },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleRfidSnapshot(sif);

      // Assert: Should emit RFID_EVENT for ALARM_ON
      const events = eventBus.emittedData.filter((suo) => suo.messageType === "RFID_EVENT");
      expect(events.length).toBeGreaterThan(0);

      const alarmEvent = events.find((e) => e.payload[0].action === "ALARM_ON");
      expect(alarmEvent).toBeDefined();
      expect(alarmEvent.payload[0].tagId).toBe("TAG001");
      expect(alarmEvent.payload[0].isAlarm).toBe(true);
    });
  });

  describe("V6800 RFID Sync Trigger", () => {
    test("should emit command request for V6800 RFID_EVENT", () => {
      // Act: V6800 sends RFID_EVENT
      const sif = {
        deviceId: "device002",
        deviceType: "V6800",
        messageType: "RFID_EVENT",
        messageId: "msg002",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { uIndex: 1, tagId: "TAG001", action: "ATTACHED", isAlarm: false },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleRfidEvent(sif);

      // Assert: Should emit command request
      expect(eventBus.emittedCommands.length).toBe(1);
      expect(eventBus.emittedCommands[0].messageType).toBe("QRY_RFID_SNAPSHOT");
      expect(eventBus.emittedCommands[0].deviceId).toBe("device002");

      // Assert: Should NOT emit SUO
      const suos = eventBus.emittedData.filter((suo) => suo.messageType === "RFID_EVENT");
      expect(suos.length).toBe(0);

      // Assert: Should NOT update cache
      const cache = mockStateCache.getTelemetry("device002", 1);
      expect(cache).toBeNull();
    });
  });

  describe("Heartbeat Metadata Updates", () => {
    test("should merge activeModules from HEARTBEAT", () => {
      // Act: V5008 sends HEARTBEAT
      const sif = {
        deviceId: "device003",
        deviceType: "V5008",
        messageType: "HEARTBEAT",
        messageId: "msg003",
        data: [
          { moduleIndex: 1, moduleId: "MOD001", uTotal: 10, fwVer: "1.0" },
          { moduleIndex: 2, moduleId: "MOD002", uTotal: 20, fwVer: "1.1" },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleHeartbeat(sif);

      // Assert: Metadata should be merged
      const metadata = mockStateCache.getMetadata("device003");
      expect(metadata).toBeDefined();
      expect(metadata.activeModules).toHaveLength(2);
      expect(metadata.activeModules[0].moduleId).toBe("MOD001");
      expect(metadata.activeModules[1].moduleId).toBe("MOD002");
    });

    test("should filter out invalid modules where moduleId == 0", () => {
      // Act: V5008 sends HEARTBEAT with invalid module
      const sif = {
        deviceId: "device004",
        deviceType: "V5008",
        messageType: "HEARTBEAT",
        messageId: "msg004",
        data: [
          { moduleIndex: 1, moduleId: "MOD001", uTotal: 10 },
          { moduleIndex: 2, moduleId: "0", uTotal: 20 }, // Invalid
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleHeartbeat(sif);

      // Assert: Only valid modules should be merged
      const metadata = mockStateCache.getMetadata("device004");
      expect(metadata.activeModules).toHaveLength(1);
      expect(metadata.activeModules[0].moduleId).toBe("MOD001");
    });
  });

  describe("Field Standardization", () => {
    test("should map thIndex to sensorIndex for TEMP_HUM", () => {
      const sif = {
        deviceId: "device005",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg005",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { thIndex: 1, temp: 25.5, hum: 60 },
              { thIndex: 2, temp: 26.0, hum: 65 },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleTempHum(sif);

      const suos = eventBus.emittedData;
      expect(suos.length).toBe(1);
      expect(suos[0].payload[0].sensorIndex).toBe(1);
      expect(suos[0].payload[1].sensorIndex).toBe(2);
    });

    test("should map nsIndex to sensorIndex for NOISE_LEVEL", () => {
      const sif = {
        deviceId: "device006",
        deviceType: "V5008",
        messageType: "NOISE_LEVEL",
        messageId: "msg006",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { nsIndex: 1, noise: 45 },
              { nsIndex: 2, noise: 50 },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleNoiseLevel(sif);

      const suos = eventBus.emittedData;
      expect(suos.length).toBe(1);
      expect(suos[0].payload[0].sensorIndex).toBe(1);
      expect(suos[0].payload[1].sensorIndex).toBe(2);
    });

    test("should map uIndex to sensorIndex for RFID", () => {
      const sif = {
        deviceId: "device007",
        deviceType: "V5008",
        messageType: "RFID_SNAPSHOT",
        messageId: "msg007",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { uIndex: 1, tagId: "TAG001", isAlarm: false },
              { uIndex: 2, tagId: "TAG002", isAlarm: false },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleRfidSnapshot(sif);

      const suos = eventBus.emittedData;
      const snapshotSuo = suos.find((suo) => suo.messageType === "RFID_SNAPSHOT");
      expect(snapshotSuo).toBeDefined();
      expect(snapshotSuo.payload[0].sensorIndex).toBe(1);
      expect(snapshotSuo.payload[1].sensorIndex).toBe(2);
    });
  });

  describe("Metadata Change Detection", () => {
    test("should detect IP change and emit META_CHANGED_EVENT", () => {
      // Setup: Cache has old IP
      mockStateCache.mergeMetadata("device008", {
        deviceType: "V5008",
        ip: "192.168.1.100",
        activeModules: [],
      });

      // Act: New metadata has different IP
      const sif = {
        deviceId: "device008",
        deviceType: "V5008",
        messageType: "DEVICE_INFO",
        messageId: "msg008",
        ip: "192.168.1.101",
        data: [],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleMetadata(sif);

      // Assert: Should emit META_CHANGED_EVENT
      const metaEvents = eventBus.emittedData.filter((suo) => suo.messageType === "META_CHANGED_EVENT");
      expect(metaEvents.length).toBe(1);
      expect(metaEvents[0].payload[0].description).toContain("IP changed");
    });

    test("should detect firmware change and emit META_CHANGED_EVENT", () => {
      // Setup: Cache has old firmware
      mockStateCache.mergeMetadata("device009", {
        deviceType: "V5008",
        fwVer: "1.0",
        activeModules: [],
      });

      // Act: New metadata has different firmware
      const sif = {
        deviceId: "device009",
        deviceType: "V5008",
        messageType: "DEVICE_INFO",
        messageId: "msg009",
        fwVer: "2.0",
        data: [],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleMetadata(sif);

      // Assert: Should emit META_CHANGED_EVENT
      const metaEvents = eventBus.emittedData.filter((suo) => suo.messageType === "META_CHANGED_EVENT");
      expect(metaEvents.length).toBe(1);
      expect(metaEvents[0].payload[0].description).toContain("Firmware changed");
    });

    test("should detect module addition and emit META_CHANGED_EVENT", () => {
      // Setup: Cache has 1 module
      mockStateCache.mergeMetadata("device010", {
        deviceType: "V5008",
        activeModules: [
          { moduleIndex: 1, moduleId: "MOD001", fwVer: "1.0", uTotal: 10 },
        ],
      });

      // Act: New metadata has 2 modules
      const sif = {
        deviceId: "device010",
        deviceType: "V5008",
        messageType: "MODULE_INFO",
        messageId: "msg010",
        data: [
          { moduleIndex: 1, moduleId: "MOD001", fwVer: "1.0", uTotal: 10 },
          { moduleIndex: 2, moduleId: "MOD002", fwVer: "1.1", uTotal: 20 },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleMetadata(sif);

      // Assert: Should emit META_CHANGED_EVENT
      const metaEvents = eventBus.emittedData.filter((suo) => suo.messageType === "META_CHANGED_EVENT");
      expect(metaEvents.length).toBe(1);
      expect(metaEvents[0].payload[0].description).toContain("Module 2 added");
    });
  });

  describe("Telemetry Flattening", () => {
    test("should split multi-module TEMP_HUM into separate SUOs", () => {
      const sif = {
        deviceId: "device011",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg011",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { thIndex: 1, temp: 25.5, hum: 60 },
            ],
          },
          {
            moduleIndex: 2,
            moduleId: "MOD002",
            data: [
              { thIndex: 1, temp: 26.0, hum: 65 },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleTempHum(sif);

      const suos = eventBus.emittedData.filter((suo) => suo.messageType === "TEMP_HUM");
      expect(suos.length).toBe(2);
      expect(suos[0].moduleIndex).toBe(1);
      expect(suos[1].moduleIndex).toBe(2);
    });

    test("should split multi-module NOISE_LEVEL into separate SUOs", () => {
      const sif = {
        deviceId: "device012",
        deviceType: "V5008",
        messageType: "NOISE_LEVEL",
        messageId: "msg012",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { nsIndex: 1, noise: 45 },
            ],
          },
          {
            moduleIndex: 2,
            moduleId: "MOD002",
            data: [
              { nsIndex: 1, noise: 50 },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleNoiseLevel(sif);

      const suos = eventBus.emittedData.filter((suo) => suo.messageType === "NOISE_LEVEL");
      expect(suos.length).toBe(2);
      expect(suos[0].moduleIndex).toBe(1);
      expect(suos[1].moduleIndex).toBe(2);
    });
  });

  describe("SUO Structure", () => {
    test("should create SUO with proper structure for telemetry", () => {
      const sif = {
        deviceId: "device013",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg013",
        data: [
          {
            moduleIndex: 1,
            moduleId: "MOD001",
            data: [
              { thIndex: 1, temp: 25.5, hum: 60 },
            ],
          },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleTempHum(sif);

      const suo = eventBus.emittedData[0];
      expect(suo).toHaveProperty("deviceId");
      expect(suo).toHaveProperty("deviceType");
      expect(suo).toHaveProperty("messageType");
      expect(suo).toHaveProperty("messageId");
      expect(suo).toHaveProperty("moduleIndex");
      expect(suo).toHaveProperty("moduleId");
      expect(suo).toHaveProperty("payload");
      expect(Array.isArray(suo.payload)).toBe(true);
    });

    test("should create SUO with proper structure for metadata", () => {
      // Setup: Cache has metadata
      mockStateCache.mergeMetadata("device014", {
        deviceType: "V5008",
        ip: "192.168.1.100",
        mac: "00:11:22:33:44:55",
        fwVer: "1.0",
        mask: "255.255.255.0",
        gwIp: "192.168.1.1",
        activeModules: [
          { moduleIndex: 1, moduleId: "MOD001", fwVer: "1.0", uTotal: 10 },
        ],
      });

      const sif = {
        deviceId: "device014",
        deviceType: "V5008",
        messageType: "HEARTBEAT",
        messageId: "msg014",
        data: [
          { moduleIndex: 1, moduleId: "MOD001", uTotal: 10 },
        ],
      };

      const normalizer = require("../../../src/modules/normalizer/UnifyNormalizer");
      normalizer.handleHeartbeat(sif);

      const metadataSuo = eventBus.emittedData.find((suo) => suo.messageType === "DEVICE_METADATA");
      expect(metadataSuo).toBeDefined();
      expect(metadataSuo).toHaveProperty("ip");
      expect(metadataSuo).toHaveProperty("mac");
      expect(metadataSuo).toHaveProperty("fwVer");
      expect(metadataSuo).toHaveProperty("mask");
      expect(metadataSuo).toHaveProperty("gwIp");
      expect(metadataSuo).toHaveProperty("payload");
      expect(Array.isArray(metadataSuo.payload)).toBe(true);
    });
  });
});
