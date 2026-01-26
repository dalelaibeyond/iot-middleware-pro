/**
 * Unit tests for StorageService
 * Tests MySQL batching, pivoting logic, and message type routing
 */

// Mock EventBus at the module level
jest.mock("../../../src/core/EventBus", () => {
  const mockEventBus = {
    listeners: {},
    emittedErrors: [],

    on(event, handler) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(handler);
    },

    emitError(error, source) {
      this.emittedErrors.push({ error, source });
    },

    removeAllListeners(event) {
      delete this.listeners[event];
    },

    reset() {
      this.emittedErrors = [];
      this.listeners = {};
    },
  };

  return mockEventBus;
});

// Mock Database at the module level
jest.mock("../../../src/core/Database", () => {
  const mockDatabase = {
    insertedData: new Map(),
    upsertedData: [],

    async batchInsert(table, data) {
      if (!this.insertedData.has(table)) {
        this.insertedData.set(table, []);
      }
      this.insertedData.get(table).push(...data);
      return data.length;
    },

    async upsert(table, data, uniqueKey) {
      this.upsertedData.push({ table, data, uniqueKey });
      return 1;
    },

    reset() {
      this.insertedData.clear();
      this.upsertedData = [];
    },

    getInsertedData(table) {
      return this.insertedData.get(table) || [];
    },
  };

  return mockDatabase;
});

// Mock StateCache at the module level
jest.mock("../../../src/modules/normalizer/StateCache", () => {
  const mockStateCache = {
    heartbeats: [],

    updateHeartbeat(deviceId, moduleIndex, moduleId, uTotal) {
      this.heartbeats.push({ deviceId, moduleIndex, moduleId, uTotal });
    },

    reset() {
      this.heartbeats = [];
    },
  };

  return mockStateCache;
});

// Import the mocked modules
const eventBus = require("../../../src/core/EventBus");
const database = require("../../../src/core/Database");
const StateCache = require("../../../src/modules/normalizer/StateCache");

describe("StorageService", () => {
  let storageService;

  beforeEach(() => {
    // Reset all mocks
    eventBus.reset();
    database.reset();
    StateCache.reset();

    // Import StorageService (which will use mocked dependencies)
    const StorageServiceClass = require("../../../src/modules/storage/StorageService");
    storageService = StorageServiceClass;
    storageService.config = {
      batchSize: 100,
      flushInterval: 1000,
      filters: [],
    };
    storageService.batchBuffer.clear();
  });

  afterEach(() => {
    // Clean up after each test
    eventBus.removeAllListeners();
    database.reset();
    StateCache.reset();
    if (storageService.flushTimer) {
      clearInterval(storageService.flushTimer);
    }
  });

  describe("HEARTBEAT Handler", () => {
    test("should buffer heartbeat data and update cache", () => {
      const suo = {
        deviceId: "device001",
        deviceType: "V5008",
        messageType: "HEARTBEAT",
        messageId: "msg001",
        payload: [
          { moduleIndex: 1, moduleId: "MOD001", uTotal: 10 },
          { moduleIndex: 2, moduleId: "MOD002", uTotal: 20 },
        ],
      };

      storageService.handleHeartbeat(suo);

      // Assert: Cache should be updated
      expect(StateCache.heartbeats).toHaveLength(2);
      expect(StateCache.heartbeats[0]).toEqual({
        deviceId: "device001",
        moduleIndex: 1,
        moduleId: "MOD001",
        uTotal: 10,
      });

      // Assert: Data should be buffered
      const buffered = storageService.batchBuffer.get("iot_heartbeat");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].device_id).toBe("device001");
      expect(JSON.parse(buffered[0].modules)).toHaveLength(2);
    });
  });

  describe("RFID_SNAPSHOT Handler", () => {
    test("should buffer RFID snapshot as JSON", () => {
      const suo = {
        deviceId: "device002",
        deviceType: "V5008",
        messageType: "RFID_SNAPSHOT",
        messageId: "msg002",
        payload: [
          { moduleIndex: 1, sensorIndex: 1, tagId: "TAG001", isAlarm: false },
          { moduleIndex: 1, sensorIndex: 2, tagId: "TAG002", isAlarm: false },
        ],
      };

      storageService.handleRfidSnapshot(suo);

      // Assert: Data should be buffered
      const buffered = storageService.batchBuffer.get("iot_rfid_snapshot");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].device_id).toBe("device002");
      expect(buffered[0].module_index).toBe(1);
      const snapshot = JSON.parse(buffered[0].rfid_snapshot);
      expect(snapshot).toHaveLength(2);
    });
  });

  describe("RFID_EVENT Handler", () => {
    test("should buffer each RFID event as separate row", () => {
      const suo = {
        deviceId: "device003",
        deviceType: "V5008",
        messageType: "RFID_EVENT",
        messageId: "msg003",
        payload: [
          { moduleIndex: 1, sensorIndex: 1, tagId: "TAG001", action: "ATTACHED", alarm: false },
          { moduleIndex: 1, sensorIndex: 2, tagId: "TAG002", action: "DETACHED", alarm: false },
        ],
      };

      storageService.handleRfidEvent(suo);

      // Assert: Each event should be buffered separately
      const buffered = storageService.batchBuffer.get("iot_rfid_event");
      expect(buffered).toHaveLength(2);
      expect(buffered[0].tag_id).toBe("TAG001");
      expect(buffered[0].action).toBe("ATTACHED");
      expect(buffered[1].tag_id).toBe("TAG002");
      expect(buffered[1].action).toBe("DETACHED");
    });
  });

  describe("TEMP_HUM Handler (Pivoting)", () => {
    test("should pivot sensorIndex 10-15 to temp_indexXX and hum_indexXX", () => {
      const suo = {
        deviceId: "device004",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg004",
        payload: [
          { moduleIndex: 1, sensorIndex: 10, temp: 25.5, hum: 60 },
          { moduleIndex: 1, sensorIndex: 11, temp: 26.0, hum: 65 },
          { moduleIndex: 1, sensorIndex: 12, temp: 26.5, hum: 70 },
        ],
      };

      storageService.handleTempHum(suo);

      // Assert: Data should be pivoted
      const buffered = storageService.batchBuffer.get("iot_temp_hum");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].device_id).toBe("device004");
      expect(buffered[0].module_index).toBe(1);
      expect(buffered[0].temp_index10).toBe(25.5);
      expect(buffered[0].hum_index10).toBe(60);
      expect(buffered[0].temp_index11).toBe(26.0);
      expect(buffered[0].hum_index11).toBe(65);
      expect(buffered[0].temp_index12).toBe(26.5);
      expect(buffered[0].hum_index12).toBe(70);
    });

    test("should group by module index", () => {
      const suo = {
        deviceId: "device005",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg005",
        payload: [
          { moduleIndex: 1, sensorIndex: 10, temp: 25.5, hum: 60 },
          { moduleIndex: 2, sensorIndex: 10, temp: 26.0, hum: 65 },
        ],
      };

      storageService.handleTempHum(suo);

      // Assert: Should create one row per module
      const buffered = storageService.batchBuffer.get("iot_temp_hum");
      expect(buffered).toHaveLength(2);
      expect(buffered[0].module_index).toBe(1);
      expect(buffered[1].module_index).toBe(2);
    });

    test("should only include columns for present indices", () => {
      const suo = {
        deviceId: "device006",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg006",
        payload: [
          { moduleIndex: 1, sensorIndex: 10, temp: 25.5, hum: 60 },
          { moduleIndex: 1, sensorIndex: 15, temp: 26.0, hum: 65 },
        ],
      };

      storageService.handleTempHum(suo);

      // Assert: Should only include temp_index10 and temp_index15
      const buffered = storageService.batchBuffer.get("iot_temp_hum");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].temp_index10).toBe(25.5);
      expect(buffered[0].hum_index10).toBe(60);
      expect(buffered[0].temp_index15).toBe(26.0);
      expect(buffered[0].hum_index15).toBe(65);
      expect(buffered[0].temp_index11).toBeUndefined();
      expect(buffered[0].hum_index11).toBeUndefined();
    });
  });

  describe("NOISE_LEVEL Handler (Pivoting)", () => {
    test("should pivot sensorIndex 16-18 to noise_indexXX", () => {
      const suo = {
        deviceId: "device007",
        deviceType: "V5008",
        messageType: "NOISE_LEVEL",
        messageId: "msg007",
        payload: [
          { moduleIndex: 1, sensorIndex: 16, noiseLevel: 45 },
          { moduleIndex: 1, sensorIndex: 17, noiseLevel: 50 },
          { moduleIndex: 1, sensorIndex: 18, noiseLevel: 55 },
        ],
      };

      storageService.handleNoiseLevel(suo);

      // Assert: Data should be pivoted
      const buffered = storageService.batchBuffer.get("iot_noise_level");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].device_id).toBe("device007");
      expect(buffered[0].module_index).toBe(1);
      expect(buffered[0].noise_index16).toBe(45);
      expect(buffered[0].noise_index17).toBe(50);
      expect(buffered[0].noise_index18).toBe(55);
    });

    test("should group by module index", () => {
      const suo = {
        deviceId: "device008",
        deviceType: "V5008",
        messageType: "NOISE_LEVEL",
        messageId: "msg008",
        payload: [
          { moduleIndex: 1, sensorIndex: 16, noiseLevel: 45 },
          { moduleIndex: 2, sensorIndex: 16, noiseLevel: 50 },
        ],
      };

      storageService.handleNoiseLevel(suo);

      // Assert: Should create one row per module
      const buffered = storageService.batchBuffer.get("iot_noise_level");
      expect(buffered).toHaveLength(2);
      expect(buffered[0].module_index).toBe(1);
      expect(buffered[1].module_index).toBe(2);
    });

    test("should only include columns for present indices", () => {
      const suo = {
        deviceId: "device009",
        deviceType: "V5008",
        messageType: "NOISE_LEVEL",
        messageId: "msg009",
        payload: [
          { moduleIndex: 1, sensorIndex: 16, noiseLevel: 45 },
          { moduleIndex: 1, sensorIndex: 18, noiseLevel: 55 },
        ],
      };

      storageService.handleNoiseLevel(suo);

      // Assert: Should only include noise_index16 and noise_index18
      const buffered = storageService.batchBuffer.get("iot_noise_level");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].noise_index16).toBe(45);
      expect(buffered[0].noise_index18).toBe(55);
      expect(buffered[0].noise_index17).toBeUndefined();
    });
  });

  describe("DOOR_STATE Handler", () => {
    test("should buffer door state from first payload item", () => {
      const suo = {
        deviceId: "device010",
        deviceType: "V5008",
        messageType: "DOOR_STATE",
        messageId: "msg010",
        payload: [
          { moduleIndex: 1, doorState: 1, door1State: 0, door2State: 1 },
        ],
      };

      storageService.handleDoorState(suo);

      // Assert: Data should be buffered
      const buffered = storageService.batchBuffer.get("iot_door_event");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].device_id).toBe("device010");
      expect(buffered[0].module_index).toBe(1);
      expect(buffered[0].doorState).toBe(1);
      expect(buffered[0].door1State).toBe(0);
      expect(buffered[0].door2State).toBe(1);
    });
  });

  describe("DEVICE_METADATA Handler", () => {
    test("should upsert metadata to database", () => {
      const suo = {
        deviceId: "device011",
        deviceType: "V5008",
        messageType: "DEVICE_METADATA",
        messageId: "msg011",
        payload: [
          {
            deviceType: "V5008",
            deviceFwVer: "1.0",
            deviceMask: "255.255.255.0",
            deviceGwIp: "192.168.1.1",
            deviceIp: "192.168.1.100",
            deviceMac: "00:11:22:33:44:55",
            modules: [
              { moduleIndex: 1, fwVer: "1.0", moduleId: "MOD001", uTotal: 10 },
            ],
          },
        ],
      };

      storageService.handleDeviceMetadata(suo);

      // Assert: Should call upsert
      expect(database.upsertedData).toHaveLength(1);
      expect(database.upsertedData[0].table).toBe("iot_meta_data");
      expect(database.upsertedData[0].data.device_id).toBe("device011");
      expect(database.upsertedData[0].uniqueKey).toBe("device_id");
    });
  });

  describe("QRY_CLR_RESP Handler", () => {
    test("should buffer command result with color map", () => {
      const suo = {
        deviceId: "device012",
        deviceType: "V5008",
        messageType: "QRY_CLR_RESP",
        messageId: "msg012",
        payload: [
          {
            cmd: "QRY_CLR",
            result: "SUCCESS",
            originalReq: '{"uIndex": 10}',
            colorMap: { 10: 1, 11: 2 },
          },
        ],
      };

      storageService.handleCmdResult(suo);

      // Assert: Data should be buffered
      const buffered = storageService.batchBuffer.get("iot_cmd_result");
      expect(buffered).toHaveLength(1);
      expect(buffered[0].device_id).toBe("device012");
      expect(buffered[0].cmd).toBe("QRY_CLR");
      expect(buffered[0].result).toBe("SUCCESS");
      expect(buffered[0].original_req).toBe('{"uIndex": 10}');
      expect(JSON.parse(buffered[0].color_map)).toEqual({ 10: 1, 11: 2 });
    });
  });

  describe("META_CHANGED_EVENT Handler", () => {
    test("should buffer each event description as separate row", () => {
      const suo = {
        deviceId: "device013",
        deviceType: "V5008",
        messageType: "META_CHANGED_EVENT",
        messageId: "msg013",
        payload: [
          { eventDesc: "IP changed from 192.168.1.100 to 192.168.1.101" },
          { eventDesc: "Firmware changed from 1.0 to 2.0" },
        ],
      };

      storageService.handleMetaChangedEvent(suo);

      // Assert: Each event should be buffered separately
      const buffered = storageService.batchBuffer.get("iot_topchange_event");
      expect(buffered).toHaveLength(2);
      expect(buffered[0].device_id).toBe("device013");
      expect(buffered[0].device_type).toBe("V5008");
      expect(buffered[0].event_desc).toContain("IP changed");
      expect(buffered[1].event_desc).toContain("Firmware changed");
    });
  });

  describe("Batching and Flushing", () => {
    test("should flush when batch size is reached", async () => {
      storageService.config.batchSize = 3;

      // Add 3 items
      for (let i = 0; i < 3; i++) {
        storageService.addToBatch("test_table", { id: i });
      }

      // Check if batch is full
      const totalBuffered = Array.from(storageService.batchBuffer.values()).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );

      if (totalBuffered >= storageService.config.batchSize) {
        await storageService.flush();
      }

      // Assert: Data should be flushed to mock database
      const inserted = database.getInsertedData("test_table");
      expect(inserted).toHaveLength(3);
      expect(storageService.batchBuffer.size).toBe(0);
    });

    test("should clear buffer after flush", async () => {
      storageService.addToBatch("test_table", { id: 1 });
      storageService.addToBatch("test_table", { id: 2 });

      await storageService.flush();

      // Assert: Buffer should be cleared
      expect(storageService.batchBuffer.size).toBe(0);
    });

    test("should handle empty buffer gracefully", async () => {
      await storageService.flush();

      // Assert: Should not throw error
      expect(storageService.batchBuffer.size).toBe(0);
    });
  });

  describe("Message Type Filtering", () => {
    test("should skip message types not in filters", () => {
      storageService.config.filters = ["HEARTBEAT", "TEMP_HUM"];

      const suo = {
        deviceId: "device014",
        deviceType: "V5008",
        messageType: "DOOR_STATE",
        messageId: "msg014",
        payload: [{ moduleIndex: 1, doorState: 1 }],
      };

      storageService.handleData(suo);

      // Assert: Should not buffer DOOR_STATE
      const buffered = storageService.batchBuffer.get("iot_door_event");
      expect(buffered).toBeUndefined();
    });

    test("should process message types in filters", () => {
      storageService.config.filters = ["HEARTBEAT", "TEMP_HUM"];

      const suo = {
        deviceId: "device015",
        deviceType: "V5008",
        messageType: "TEMP_HUM",
        messageId: "msg015",
        payload: [{ moduleIndex: 1, sensorIndex: 10, temp: 25.5, hum: 60 }],
      };

      storageService.handleData(suo);

      // Assert: Should buffer TEMP_HUM
      const buffered = storageService.batchBuffer.get("iot_temp_hum");
      expect(buffered).toBeDefined();
      expect(buffered).toHaveLength(1);
    });

    test("should process all message types when filters is empty", () => {
      storageService.config.filters = [];

      const suo = {
        deviceId: "device016",
        deviceType: "V5008",
        messageType: "DOOR_STATE",
        messageId: "msg016",
        payload: [{ moduleIndex: 1, doorState: 1 }],
      };

      storageService.handleData(suo);

      // Assert: Should buffer DOOR_STATE
      const buffered = storageService.batchBuffer.get("iot_door_event");
      expect(buffered).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    test("should emit error event on exception", () => {
      const originalHandleHeartbeat = storageService.handleHeartbeat;
      storageService.handleHeartbeat = () => {
        throw new Error("Test error");
      };

      const suo = {
        deviceId: "device017",
        deviceType: "V5008",
        messageType: "HEARTBEAT",
        messageId: "msg017",
        payload: [{ moduleIndex: 1, moduleId: "MOD001", uTotal: 10 }],
      };

      storageService.handleData(suo);

      // Assert: Should emit error event
      expect(eventBus.emittedErrors).toHaveLength(1);
      expect(eventBus.emittedErrors[0].source).toBe("StorageService");
      expect(eventBus.emittedErrors[0].error.message).toBe("Test error");

      // Restore original method
      storageService.handleHeartbeat = originalHandleHeartbeat;
    });
  });

  describe("Unknown Message Type", () => {
    test("should log warning for unknown message type", () => {
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      const suo = {
        deviceId: "device018",
        deviceType: "V5008",
        messageType: "UNKNOWN_TYPE",
        messageId: "msg018",
        payload: [],
      };

      storageService.handleData(suo);

      // Assert: Should log warning
      expect(consoleWarnSpy).toHaveBeenCalledWith("Unknown message type: UNKNOWN_TYPE");

      consoleWarnSpy.mockRestore();
    });
  });
});
