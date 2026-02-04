/**
 * ApiServer - Dashboard Backend (REST API)
 *
 * Provides REST API endpoints for dashboard integration and device control.
 * Serves read-only state from StateCache and handles control commands.
 */

const express = require("express");
const eventBus = require("../../core/EventBus");
const StateCache = require("../normalizer/StateCache");
const database = require("../../core/Database");
const CommandService = require("../command/CommandService");

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

    // Device list endpoint (sidebar)
    this.app.get("/api/devices", async (req, res) => {
      try {
        const devices = await database.select("iot_meta_data");
        res.json(devices);
      } catch (error) {
        console.error("Error fetching devices:", error.message);
        res.status(500).json({ error: "Failed to fetch devices" });
      }
    });

    // Module state endpoint (detail view)
    this.app.get(
      "/api/devices/:deviceId/modules/:moduleIndex/state",
      (req, res) => {
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
          console.error("Error fetching module state:", error.message);
          res.status(500).json({ error: "Failed to fetch module state" });
        }
      },
    );

    // All modules for a device
    this.app.get("/api/devices/:deviceId/modules", (req, res) => {
      try {
        const { deviceId } = req.params;
        const modules = StateCache.getAllModules(deviceId);
        res.json(modules);
      } catch (error) {
        console.error("Error fetching modules:", error.message);
        res.status(500).json({ error: "Failed to fetch modules" });
      }
    });

    // UOS endpoint - Get telemetry for a specific module
    this.app.get("/api/uos/:deviceId/:moduleIndex", (req, res) => {
      try {
        const { deviceId, moduleIndex } = req.params;
        const telemetry = StateCache.getTelemetry(
          deviceId,
          parseInt(moduleIndex),
        );

        if (!telemetry) {
          return res.status(404).json({ error: "Module telemetry not found" });
        }

        // Include deviceId and moduleIndex in response for dashboard validation
        res.json({
          ...telemetry,
          deviceId,
          moduleIndex: parseInt(moduleIndex),
        });
      } catch (error) {
        console.error("Error fetching UOS telemetry:", error.message);
        res.status(500).json({ error: "Failed to fetch UOS telemetry" });
      }
    });

    // META endpoint - Get device metadata
    this.app.get("/api/meta/:deviceId", (req, res) => {
      try {
        const { deviceId } = req.params;
        const metadata = StateCache.getMetadata(deviceId);

        if (!metadata) {
          return res.status(404).json({ error: "Device metadata not found" });
        }

        res.json(metadata);
      } catch (error) {
        console.error("Error fetching META metadata:", error.message);
        res.status(500).json({ error: "Failed to fetch META metadata" });
      }
    });

    // Control commands endpoint
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
        console.error("Error sending command:", error.message);
        res.status(500).json({ error: "Failed to send command" });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: "Not found" });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error("API error:", err.message);
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
