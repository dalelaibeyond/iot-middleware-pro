/**
 * ApiServer - Dashboard Backend (REST API)
 *
 * Provides REST API endpoints for dashboard integration and device control.
 * Serves read-only state from StateCache and handles control commands.
 *
 * API Groups:
 * - Group S: System API (always available)
 * - Group A: Management API (hot path from cache)
 * - Group E: History API (cold path from DB, conditional)
 */

const express = require("express");
const eventBus = require("../../core/EventBus");
const StateCache = require("../normalizer/StateCache");
const database = require("../../core/Database");

class ApiServer {
  constructor() {
    this.config = null;
    this.app = express();
    this.server = null;
  }

  /**
   * Initialize API server
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    this.setupMiddleware();
    this.setupRoutes();
    console.log("  ApiServer initialized");
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware (adjust as needed for your frontend)
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      console.log(`CORS: Request from ${origin} for ${req.method} ${req.url}`);

      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      );
      res.header("Access-Control-Allow-Credentials", "true");

      if (req.method === "OPTIONS") {
        console.log("CORS: Preflight request");
        return res.status(200).send();
      }
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // =========================================================================
    // Group S: System API (Always Load)
    // =========================================================================
    this.setupSystemRoutes();

    // =========================================================================
    // Group A: Management API (Conditional)
    // =========================================================================
    const managementEnabled = this.config.features?.management !== false;
    if (managementEnabled) {
      this.setupManagementRoutes();
    }

    // =========================================================================
    // Group E: History API (Conditional - requires storage)
    // =========================================================================
    const globalConfig = require("config");
    const storageEnabled = globalConfig.get("modules.storage.enabled");
    const historyRequested = this.config.features?.history !== false;

    if (historyRequested && storageEnabled) {
      this.setupHistoryRoutes();
    } else if (historyRequested && !storageEnabled) {
      // 501 Handler for when history is requested but storage is disabled
      this.app.use("/api/history", (req, res) =>
        res.status(501).json({ error: "Storage module disabled" }),
      );
    }

    // =========================================================================
    // Error Handlers
    // =========================================================================
    this.setupErrorHandlers();
  }

  /**
   * Group S: System Routes
   */
  setupSystemRoutes() {
    // Health check endpoint
    this.app.get("/api/health", (req, res) => {
      const db = database.getConnection();
      const dbStatus = db ? "connected" : "disconnected";

      res.json({
        status: "ok",
        uptime: process.uptime(),
        memory: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        },
        db: dbStatus,
        mqtt: "connected", // TODO: Get actual MQTT status
      });
    });

    // System configuration endpoint
    this.app.get("/api/config", (req, res) => {
      const config = require("config");
      const appConfig = config.util.toObject();

      // Redact passwords/secrets
      if (appConfig.database && appConfig.database.connection) {
        appConfig.database.connection.password = "***REDACTED***";
      }
      if (appConfig.mqtt && appConfig.mqtt.options) {
        appConfig.mqtt.options.password = "***REDACTED***";
      }

      res.json(appConfig);
    });
  }

  /**
   * Group A: Management Routes (Hot Path from Cache)
   */
  setupManagementRoutes() {
    // GET /api/live/topology - List all active Devices & Modules
    this.app.get("/api/live/topology", async (req, res) => {
      try {
        // 1. Query DB for known devices (if storage enabled)
        const globalConfig = require("config");
        const storageEnabled = globalConfig.get("modules.storage.enabled");
        let dbDevices = [];

        if (storageEnabled) {
          try {
            dbDevices = await database.select("iot_meta_data");
          } catch (dbError) {
            console.error("[ApiServer] Error fetching devices from DB:", dbError.message);
          }
        }

        // 2. Query Cache for live status
        const cacheDevices = [];
        const processedDeviceIds = new Set();

        // Get all device metadata from cache
        const allMetadata = StateCache.getAllMetadata();
        const allTelemetry = StateCache.getAllTelemetry();

        for (const metadata of allMetadata) {
          const deviceId = metadata.deviceId;
          processedDeviceIds.add(deviceId);

          // Get all modules for this device from cache
          const modules = [];
          for (const telem of allTelemetry) {
            if (telem.key.startsWith(`device:${deviceId}:module:`)) {
              modules.push({
                moduleIndex: telem.moduleIndex,
                moduleId: telem.moduleId,
                uTotal: telem.uTotal,
                fwVer: telem.fwVer,
                isOnline: telem.isOnline,
                lastSeenHb: telem.lastSeen_hb,
              });
            }
          }

          // Also include modules from metadata that might not have telemetry yet
          if (metadata.activeModules) {
            metadata.activeModules.forEach((mod) => {
              const existingMod = modules.find(
                (m) => m.moduleIndex === mod.moduleIndex
              );
              if (!existingMod) {
                modules.push({
                  moduleIndex: mod.moduleIndex,
                  moduleId: mod.moduleId,
                  uTotal: mod.uTotal,
                  fwVer: mod.fwVer,
                  isOnline: false,
                  lastSeenHb: null,
                });
              }
            });
          }

          cacheDevices.push({
            deviceId: metadata.deviceId,
            deviceType: metadata.deviceType,
            ip: metadata.ip,
            mac: metadata.mac,
            fwVer: metadata.fwVer,
            mask: metadata.mask,
            gwIp: metadata.gwIp,
            isOnline: true,
            lastSeenInfo: metadata.lastSeen_info,
            modules: modules.sort((a, b) => a.moduleIndex - b.moduleIndex),
          });
        }

        // 3. Merge: Add DB devices not in cache (mark as offline)
        for (const dbDevice of dbDevices) {
          if (!processedDeviceIds.has(dbDevice.device_id)) {
            cacheDevices.push({
              deviceId: dbDevice.device_id,
              deviceType: dbDevice.device_type,
              ip: dbDevice.device_ip,
              mac: dbDevice.device_mac,
              fwVer: dbDevice.device_fwVer,
              mask: dbDevice.device_mask,
              gwIp: dbDevice.device_gwIp,
              isOnline: false,
              lastSeenInfo: dbDevice.last_seen_info,
              modules: dbDevice.modules || [],
            });
          }
        }

        // 4. Return full list
        res.json(cacheDevices);
      } catch (error) {
        console.error("[ApiServer] Error fetching topology:", error.message);
        res.status(500).json({ error: "Failed to fetch topology" });
      }
    });

    // GET /api/live/devices/:id/modules/:idx - Get Full Snapshot (UOS)
    this.app.get("/api/live/devices/:deviceId/modules/:moduleIndex", (req, res) => {
      try {
        const { deviceId, moduleIndex } = req.params;
        const state = StateCache.getTelemetry(
          deviceId,
          parseInt(moduleIndex),
        );

        if (!state) {
          return res.status(404).json({ error: "Module state not found" });
        }

        // Include deviceId and moduleIndex in response for dashboard validation
        res.json({
          ...state,
          deviceId,
          moduleIndex: parseInt(moduleIndex),
        });
      } catch (error) {
        console.error("[ApiServer] Error fetching module state:", error.message);
        res.status(500).json({ error: "Failed to fetch module state" });
      }
    });

    // POST /api/commands - Send Control Command
    this.app.post("/api/commands", async (req, res) => {
      try {
        const { deviceId, deviceType, messageType, payload } = req.body;

        // Validate required fields
        if (!deviceId || !deviceType || !messageType) {
          return res.status(400).json({
            error: "Missing required fields: deviceId, deviceType, messageType",
          });
        }

        // Generate a unique command ID for tracking
        const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Construct the internal command event
        const commandEvent = {
          deviceId,
          deviceType,
          messageType,
          payload: payload || {},
          timestamp: new Date(),
          commandId,
        };

        // Emit to the internal nervous system
        eventBus.emit("command.request", commandEvent);

        // Return 202 Accepted with command ID as per specification
        res.status(202).json({
          status: "sent",
          commandId,
        });
      } catch (error) {
        console.error("[ApiServer] Error sending command:", error.message);
        res.status(500).json({ error: "Failed to send command" });
      }
    });
  }

  /**
   * Group E: History Routes (Cold Path from DB)
   */
  setupHistoryRoutes() {
    // GET /api/history/events - List RFID/Door events
    this.app.get("/api/history/events", async (req, res) => {
      try {
        const { deviceId, moduleIndex, eventType, limit = 100, offset = 0 } = req.query;
        const db = database.getConnection();

        let results = [];

        if (!eventType || eventType === "rfid") {
          const rfidQuery = db("iot_rfid_event")
            .select("*")
            .orderBy("parse_at", "desc")
            .limit(parseInt(limit))
            .offset(parseInt(offset));

          if (deviceId) rfidQuery.where("device_id", deviceId);
          if (moduleIndex) rfidQuery.where("module_index", parseInt(moduleIndex));

          const rfidEvents = await rfidQuery;
          results.push(...rfidEvents.map(e => ({ ...e, eventType: "rfid" })));
        }

        if (!eventType || eventType === "door") {
          const doorQuery = db("iot_door_event")
            .select("*")
            .orderBy("parse_at", "desc")
            .limit(parseInt(limit))
            .offset(parseInt(offset));

          if (deviceId) doorQuery.where("device_id", deviceId);
          if (moduleIndex) doorQuery.where("module_index", parseInt(moduleIndex));

          const doorEvents = await doorQuery;
          results.push(...doorEvents.map(e => ({ ...e, eventType: "door" })));
        }

        // Sort by timestamp desc
        results.sort((a, b) => new Date(b.parse_at) - new Date(a.parse_at));

        res.json(results.slice(0, parseInt(limit)));
      } catch (error) {
        console.error("[ApiServer] Error fetching events:", error.message);
        res.status(500).json({ error: "Failed to fetch events" });
      }
    });

    // GET /api/history/telemetry - List Env Data
    this.app.get("/api/history/telemetry", async (req, res) => {
      try {
        const { deviceId, moduleIndex, type, startTime, endTime, limit = 100 } = req.query;
        const db = database.getConnection();

        let results = [];

        if (!type || type === "temp_hum") {
          const thQuery = db("iot_temp_hum")
            .select("*")
            .orderBy("parse_at", "desc")
            .limit(parseInt(limit));

          if (deviceId) thQuery.where("device_id", deviceId);
          if (moduleIndex) thQuery.where("module_index", parseInt(moduleIndex));
          if (startTime) thQuery.where("parse_at", ">=", new Date(startTime));
          if (endTime) thQuery.where("parse_at", "<=", new Date(endTime));

          const thData = await thQuery;
          results.push(...thData.map(d => ({ ...d, telemetryType: "temp_hum" })));
        }

        if (!type || type === "noise") {
          const noiseQuery = db("iot_noise_level")
            .select("*")
            .orderBy("parse_at", "desc")
            .limit(parseInt(limit));

          if (deviceId) noiseQuery.where("device_id", deviceId);
          if (moduleIndex) noiseQuery.where("module_index", parseInt(moduleIndex));
          if (startTime) noiseQuery.where("parse_at", ">=", new Date(startTime));
          if (endTime) noiseQuery.where("parse_at", "<=", new Date(endTime));

          const noiseData = await noiseQuery;
          results.push(...noiseData.map(d => ({ ...d, telemetryType: "noise" })));
        }

        // Sort by timestamp desc
        results.sort((a, b) => new Date(b.parse_at) - new Date(a.parse_at));

        res.json(results.slice(0, parseInt(limit)));
      } catch (error) {
        console.error("[ApiServer] Error fetching telemetry:", error.message);
        res.status(500).json({ error: "Failed to fetch telemetry" });
      }
    });

    // GET /api/history/audit - List Config Changes
    this.app.get("/api/history/audit", async (req, res) => {
      try {
        const { deviceId, limit = 100, offset = 0 } = req.query;
        const db = database.getConnection();

        const query = db("iot_topchange_event")
          .select("*")
          .orderBy("parse_at", "desc")
          .limit(parseInt(limit))
          .offset(parseInt(offset));

        if (deviceId) query.where("device_id", deviceId);

        const events = await query;
        res.json(events);
      } catch (error) {
        console.error("[ApiServer] Error fetching audit events:", error.message);
        res.status(500).json({ error: "Failed to fetch audit events" });
      }
    });

    // GET /api/history/devices - List devices in the DB
    this.app.get("/api/history/devices", async (req, res) => {
      try {
        const { limit = 100, offset = 0 } = req.query;
        const db = database.getConnection();

        const devices = await db("iot_meta_data")
          .select("*")
          .limit(parseInt(limit))
          .offset(parseInt(offset));

        res.json(devices);
      } catch (error) {
        console.error("[ApiServer] Error fetching devices:", error.message);
        res.status(500).json({ error: "Failed to fetch devices" });
      }
    });
  }

  /**
   * Error Handlers
   */
  setupErrorHandlers() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: "Not found" });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error("[ApiServer] API error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    });
  }

  /**
   * Start API server
   * @returns {Promise<void>}
   */
  async start() {
    const port = this.config.port || 3000;
    const host = this.config.host || "0.0.0.0";

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, () => {
        console.log(`  ApiServer listening on http://${host}:${port}`);
        resolve();
      });

      this.server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(`Port ${port} is already in use`);
        } else {
          console.error("ApiServer error:", error.message);
        }
        reject(error);
      });
    });
  }

  /**
   * Stop API server
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("  Stopping ApiServer...");

    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });

      this.server = null;
    }

    console.log("  ApiServer stopped");
  }
}

module.exports = new ApiServer();
